use std::{
    fs, io,
    path::{Path, PathBuf},
};

use tar::Builder;

pub(crate) struct TarArchiver;

impl super::Archive for TarArchiver {
    fn archive(
        &self,
        paths: Vec<impl AsRef<Path>>,
        writer: impl io::Write + io::Seek,
    ) -> io::Result<()> {
        let mut builder = Builder::new(writer);

        for path in paths {
            let path = path.as_ref();
            if path.file_name().is_none() {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "Path must have a filename",
                ));
            }

            if !path.exists() {
                return Err(io::Error::new(
                    io::ErrorKind::NotFound,
                    format!("Path not found: {:?}", path),
                ));
            }

            let metadata = fs::metadata(path)?;
            let name = path.file_name().unwrap();

            // SAFETY: We've already checked that the filename exists.
            if metadata.is_dir() {
                builder.append_dir_all(name, path)?;
            } else {
                builder.append_path_with_name(path, name)?;
            }
        }
        builder.finish()?;
        Ok(())
    }

    fn extract(
        &self,
        reader: impl io::Read + io::Seek + Send,
        targets: Vec<impl AsRef<Path>>,
    ) -> io::Result<()> {
        let mut archive = tar::Archive::new(reader);
        let entries = archive.entries()?;
        let mut targets_iter = targets.into_iter();

        // State to track the current top-level entry being processed.
        // (prefix_in_tar, target_path_on_disk)
        let mut current_mapping: Option<(PathBuf, PathBuf)> = None;

        for entry in entries {
            let mut entry = entry?;
            let entry_path = entry.path()?.into_owned();

            // Determine if the current entry is a child of the currently processing
            // top-level entry
            let is_child = if let Some((ref prefix, _)) = current_mapping {
                // Check if entry_path starts with prefix AND is not the prefix itself
                entry_path.starts_with(prefix) && entry_path != *prefix
            } else {
                false
            };

            if is_child {
                // It is a child file/dir of the current top-level directory
                if let Some((ref prefix, ref target)) = current_mapping {
                    // Calculate relative path: "dir/subdir/file" - "dir" = "subdir/file"
                    let relative = entry_path.strip_prefix(prefix).map_err(|e| {
                        io::Error::new(
                            io::ErrorKind::InvalidData,
                            format!("Path strip prefix error: {}", e),
                        )
                    })?;

                    // Construct destination: "/target/path" + "subdir/file"
                    let dest = target.join(relative);

                    // Ensure parent directory exists (unpack handles the file/dir itself)
                    if let Some(parent) = dest.parent() {
                        fs::create_dir_all(parent)?;
                    }

                    // Extract directly to location
                    entry.unpack(&dest)?;
                }
            } else {
                // It is a new top-level entry (either a file or a new directory root)
                let target = targets_iter.next().ok_or_else(|| {
                    io::Error::new(
                        io::ErrorKind::InvalidData,
                        "Archive contains more top-level entries than targets provided",
                    )
                })?;
                let target = target.as_ref().to_path_buf();

                // Update the current mapping
                // entry_path here is the name stored in tar (e.g., "dir_name" or "file.txt")
                current_mapping = Some((entry_path.clone(), target.clone()));

                // Ensure parent directory of the target exists
                if let Some(parent) = target.parent() {
                    fs::create_dir_all(parent)?;
                }

                // Extract the entry directly to the target path.
                // If entry is "dir/", unpacking to "/tmp/target" creates directory
                // "/tmp/target". If entry is "file.txt", unpacking to
                // "/tmp/target.txt" creates file "/tmp/target.txt".
                entry.unpack(&target)?;
            }
        }

        Ok(())
    }
}
