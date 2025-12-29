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
    compression::{CompressionOptions, Compressor, Zstd},
    kind::{self, Kind},
    FilesystemCompressor, FilesystemReader, FilesystemWriter, InnerNode, NodeHeader,
    DEFAULT_BLOCK_SIZE,
};
use pathdiff::diff_paths;
use walkdir::WalkDir;

pub(crate) struct SquashfsArchiver(pub(crate) u8);

impl SquashfsArchiver {
    /// 辅助函数：根据文件路径生成 NodeHeader
    /// 使用 symlink_metadata 以便正确处理符号链接
    fn create_header(path: &Path) -> io::Result<NodeHeader> {
        let metadata = fs::symlink_metadata(path)?;

        // 获取 mtime (Unix 时间戳)
        let mtime = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as u32)
            .unwrap_or(0);

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
                permissions: if metadata.is_dir() { 0o755 } else { 0o644 },
                uid: 1000,
                gid: 1000,
                mtime,
            })
        }
    }

    fn get_dest_from_fullpath(
        &self,
        fullpath: &Path,
        path_map: &HashMap<&OsStr, PathBuf>,
    ) -> io::Result<PathBuf> {
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
        let mut ret = path_map
            .get(first.as_os_str())
            .ok_or_else(|| {
                io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "Invalid path map: corresponding path on disk not found",
                )
            })?
            .clone();
        for c in components {
            ret.push(c);
        }
        Ok(ret)
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

        // 配置 zstd 压缩
        let zstd_options = Zstd {
            compression_level: self.0 as u32,
        };
        let compression_options = CompressionOptions::Zstd(zstd_options);
        let compressor = FilesystemCompressor::new(Compressor::Zstd, Some(compression_options))?;
        fs.set_compressor(compressor);

        // 遍历输入的顶层路径
        for root_path in paths {
            let root_path = root_path.as_ref();

            // 计算父目录，用于生成归档内的相对路径
            // 例如：输入 /a/b/data，parent 是 /a/b，归档内路径应为 /data/...
            let parent_dir = root_path.parent().ok_or_else(|| {
                io::Error::new(io::ErrorKind::InvalidInput, "Invalid path: no parent")
            })?;

            // 使用 WalkDir 递归遍历（包括目录本身）
            // 归档链接本身，而不是链接指向的内容
            for entry in WalkDir::new(root_path).follow_links(false) {
                let entry = entry.map_err(io::Error::other)?;
                let src_path = entry.path();

                // 计算归档内的路径： / + (src_path - parent_dir)
                // 例：src=/usr/bin/tool, parent=/usr, rel=bin/tool, archive=/bin/tool
                let relative_path = diff_paths(src_path, parent_dir).ok_or_else(|| {
                    io::Error::new(io::ErrorKind::InvalidData, "Path diff failed")
                })?;

                let header = Self::create_header(src_path)?;

                // 根据文件类型添加到 writer
                if entry.file_type().is_dir() {
                    fs.push_dir(&relative_path, header)?;
                } else if entry.file_type().is_symlink() {
                    let target = fs::read_link(src_path)?;
                    fs.push_symlink(&target, &relative_path, header)?;
                } else if entry.file_type().is_file() {
                    let file = File::open(src_path)?;
                    fs.push_file(file, &relative_path, header)?;
                }
                // 忽略其他类型（如 Socket, Block Device 等）
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
    ) -> io::Result<()> {
        let mut buf_reader = BufReader::new(reader);
        let fs = FilesystemReader::from_reader(&mut buf_reader)?;

        // 构建映射表：目标文件名 -> 完整目标路径
        // 假设：Archive 中的顶层目录名 与 targets 中的文件名一一对应
        let mut target_map: HashMap<&OsStr, PathBuf> = HashMap::new();
        for target in &targets {
            let target_path = target.as_ref();
            if let Some(name) = target_path.file_name() {
                target_map.insert(name, target_path.to_path_buf());
            }
        }

        // 遍历镜像中的所有节点
        for node in fs.files() {
            let path_in_image = &node.fullpath;
            // skip root dir
            if path_in_image == Path::new("/") {
                continue;
            }

            let dest_path = self.get_dest_from_fullpath(&node.fullpath, &target_map)?;

            // 处理不同类型的节点
            match &node.inner {
                InnerNode::File(file_info) => {
                    let mut reader = fs.file(file_info).reader();
                    let mut dest_file = File::create(&dest_path)?;
                    io::copy(&mut reader, &mut dest_file)?;

                    // 恢复 mtime
                    let mtime =
                        SystemTime::UNIX_EPOCH + Duration::from_secs(node.header.mtime as u64);
                    let _ = dest_file.set_modified(mtime);
                }
                InnerNode::Dir(_) => {
                    if !dest_path.exists() {
                        fs::create_dir_all(&dest_path)?;
                    }
                }
                InnerNode::Symlink(_link) => {
                    #[cfg(unix)]
                    {
                        if dest_path.is_symlink() || dest_path.exists() {
                            let _ = fs::remove_file(&dest_path);
                        }
                        std::os::unix::fs::symlink(&link.link, &dest_path)?;
                    }
                }
                _ => {} // 忽略字符设备等
            }

            // 恢复权限 (Unix only)
            #[cfg(unix)]
            if !dest_path.is_symlink() {
                let perms = fs::Permissions::from_mode(node.header.permissions as u32);
                let _ = fs::set_permissions(&dest_path, perms);
            }
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn test_get_dest_from_fullpath() {
        let path_map = HashMap::from([
            (OsStr::new("a"), PathBuf::from("/a")),
            (OsStr::new("b"), PathBuf::from("/2/b")),
            (OsStr::new("c.txt"), PathBuf::from("/c/c.txt")),
        ]);

        let fullpath = Path::new("/a/b/c");
        let dest_path = SquashfsArchiver(1)
            .get_dest_from_fullpath(fullpath, &path_map)
            .unwrap();
        assert_eq!(dest_path, PathBuf::from("/a/b/c"));

        let fullpath = Path::new("/b/c");
        let dest_path = SquashfsArchiver(1)
            .get_dest_from_fullpath(fullpath, &path_map)
            .unwrap();
        assert_eq!(dest_path, PathBuf::from("/2/b/c"));

        let fullpath = Path::new("/c.txt");
        let dest_path = SquashfsArchiver(1)
            .get_dest_from_fullpath(fullpath, &path_map)
            .unwrap();
        assert_eq!(dest_path, PathBuf::from("/c/c.txt"));
    }
}
