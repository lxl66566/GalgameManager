#[cfg(unix)]
use std::os::unix::fs::{MetadataExt, PermissionsExt};
use std::{
    collections::HashMap,
    ffi::OsStr,
    fs::{self, File},
    io::{self, BufReader, BufWriter},
    path::{Component, Path, PathBuf},
    time::{Duration, SystemTime},
};

use backhand::{
    DEFAULT_BLOCK_SIZE, FilesystemCompressor, FilesystemReader, FilesystemWriter, InnerNode,
    NodeHeader,
    compression::{CompressionOptions, Compressor, Zstd},
    kind::{self, Kind},
};
use pathdiff::diff_paths;
use walkdir::WalkDir;

use super::ExtractCoverage;

pub(crate) struct SquashfsArchiver(pub(crate) u8);

impl SquashfsArchiver {
    /// Build a `NodeHeader` from a path. Uses `symlink_metadata` so symlinks
    /// are archived as links, not as their targets.
    fn create_header(path: &Path) -> io::Result<NodeHeader> {
        let metadata = fs::symlink_metadata(path)?;

        // File mtimes fit in u32 for all realistic dates (before 2106).
        #[allow(clippy::cast_possible_truncation)]
        let mtime = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
            .map_or(0, |d| d.as_secs() as u32);

        #[cfg(unix)]
        {
            Ok(NodeHeader {
                permissions: (metadata.mode() & 0o777) as u16,
                uid: metadata.uid(),
                gid: metadata.gid(),
                mtime,
            })
        }

        #[cfg(not(unix))]
        {
            Ok(NodeHeader {
                permissions: if metadata.is_dir() {
                    0o755
                } else {
                    0o644
                },
                uid: 1000,
                gid: 1000,
                mtime,
            })
        }
    }

    /// Map an archive entry path to (target root on disk, relative path under
    /// it). The archive stores each top-level input path under its file name,
    /// so the first component after `/` selects the target and the rest is
    /// the relative path.
    fn split_fullpath<'a>(
        fullpath: &Path,
        path_map: &'a HashMap<&OsStr, PathBuf>,
    ) -> io::Result<(&'a Path, PathBuf)> {
        let mut components = fullpath.components();
        let root_dir = components.next();
        if root_dir != Some(Component::RootDir) {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "Invalid file entry in squashfs: root dir not found",
            ));
        }
        let first = components.next().ok_or_else(|| {
            io::Error::new(
                io::ErrorKind::InvalidData,
                "Invalid file entry in squashfs: first component not found",
            )
        })?;
        let root = path_map
            .get(first.as_os_str())
            .ok_or_else(|| {
                io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "Invalid path map: corresponding path on disk not found",
                )
            })?
            .as_path();
        let rel = components.collect::<PathBuf>();
        Ok((root, rel))
    }
}

impl super::Archive for SquashfsArchiver {
    fn archive(
        &self,
        paths: Vec<impl AsRef<Path>>,
        writer: impl io::Write + io::Seek,
    ) -> io::Result<()> {
        let mut fs = FilesystemWriter::default();
        fs.set_current_time();
        fs.set_block_size(DEFAULT_BLOCK_SIZE);
        fs.set_only_root_id();
        fs.set_kind(Kind::from_const(kind::LE_V4_0).unwrap());

        let zstd_options = Zstd {
            compression_level: u32::from(self.0),
        };
        let compression_options = CompressionOptions::Zstd(zstd_options);
        let compressor = FilesystemCompressor::new(Compressor::Zstd, Some(compression_options))?;
        fs.set_compressor(compressor);

        for root_path in paths {
            let root_path = root_path.as_ref();

            // Paths in the archive are relative to the input's parent, so the
            // top-level dir name is preserved (/a/b/data -> /data/...).
            let parent_dir = root_path.parent().ok_or_else(|| {
                io::Error::new(io::ErrorKind::InvalidInput, "Invalid path: no parent")
            })?;

            // follow_links(false): archive symlinks themselves, not their targets
            for entry in WalkDir::new(root_path).follow_links(false) {
                let entry = entry.map_err(io::Error::other)?;
                let src_path = entry.path();

                let relative_path = diff_paths(src_path, parent_dir).ok_or_else(|| {
                    io::Error::new(io::ErrorKind::InvalidData, "Path diff failed")
                })?;

                let header = Self::create_header(src_path)?;

                if entry.file_type().is_dir() {
                    fs.push_dir(&relative_path, header)?;
                } else if entry.file_type().is_symlink() {
                    let target = fs::read_link(src_path)?;
                    fs.push_symlink(&target, &relative_path, header)?;
                } else if entry.file_type().is_file() {
                    let file = File::open(src_path)?;
                    fs.push_file(file, &relative_path, header)?;
                }
                // Ignore other entry types (sockets, block devices, ...)
            }
        }

        let mut output = BufWriter::new(writer);
        fs.write(&mut output)?;

        Ok(())
    }

    fn extract(
        &self,
        reader: impl io::Read + io::Seek + Send,
        targets: Vec<impl AsRef<Path>>,
    ) -> io::Result<ExtractCoverage> {
        let mut buf_reader = BufReader::new(reader);
        let fs = FilesystemReader::from_reader(&mut buf_reader)?;

        // Map target file name -> full target path; assumes the archive's
        // top-level dir names correspond one-to-one with target file names.
        let mut target_map: HashMap<&OsStr, PathBuf> = HashMap::new();
        for target in &targets {
            let target_path = target.as_ref();
            if let Some(name) = target_path.file_name() {
                target_map.insert(name, target_path.to_path_buf());
            }
        }

        let mut coverage = ExtractCoverage::default();
        for node in fs.files() {
            let path_in_image = &node.fullpath;
            // skip root dir
            if path_in_image == Path::new("/") {
                continue;
            }

            let (root, rel) = Self::split_fullpath(&node.fullpath, &target_map)?;
            coverage.cover(root, &rel);
            // join("") would append a trailing separator, which Windows
            // rejects on file creation
            let dest_path = if rel.as_os_str().is_empty() {
                root.to_path_buf()
            } else {
                root.join(&rel)
            };

            // Handle node types
            match &node.inner {
                InnerNode::File(file_info) => {
                    let mut reader = fs.file(file_info).reader();
                    let mut dest_file = File::create(&dest_path)?;
                    io::copy(&mut reader, &mut dest_file)?;

                    let mtime =
                        SystemTime::UNIX_EPOCH + Duration::from_secs(u64::from(node.header.mtime));
                    let _ = dest_file.set_modified(mtime);
                },
                InnerNode::Dir(_) if !dest_path.exists() => {
                    fs::create_dir_all(&dest_path)?;
                },
                #[allow(unused_variables)]
                InnerNode::Symlink(link) => {
                    #[cfg(unix)]
                    {
                        if dest_path.is_symlink() || dest_path.exists() {
                            let _ = fs::remove_file(&dest_path);
                        }
                        std::os::unix::fs::symlink(&link.link, &dest_path)?;
                    }
                },
                _ => {}, // ignore other node types (char devices, ...)
            }

            #[cfg(unix)]
            if !dest_path.is_symlink() {
                let perms = fs::Permissions::from_mode(u32::from(node.header.permissions));
                let _ = fs::set_permissions(&dest_path, perms);
            }
        }

        Ok(coverage)
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::*;

    #[test]
    fn test_split_fullpath() {
        let path_map = HashMap::from([
            (OsStr::new("a"), PathBuf::from("/a")),
            (OsStr::new("b"), PathBuf::from("/2/b")),
            (OsStr::new("c.txt"), PathBuf::from("/c/c.txt")),
        ]);

        let fullpath = Path::new("/a/b/c");
        let (root, rel) = SquashfsArchiver::split_fullpath(fullpath, &path_map).unwrap();
        assert_eq!((root, rel.as_path()), (Path::new("/a"), Path::new("b/c")));

        let fullpath = Path::new("/b/c");
        let (root, rel) = SquashfsArchiver::split_fullpath(fullpath, &path_map).unwrap();
        assert_eq!((root, rel.as_path()), (Path::new("/2/b"), Path::new("c")));

        // top-level entry maps onto the target itself: empty rel
        let fullpath = Path::new("/c.txt");
        let (root, rel) = SquashfsArchiver::split_fullpath(fullpath, &path_map).unwrap();
        assert_eq!(
            (root, rel.as_os_str().is_empty()),
            (Path::new("/c/c.txt"), true)
        );
    }
}
