mod squashfs;
mod tar;

use std::{
    fs, io,
    path::{Path, PathBuf},
};

use log::{error, info};
use serde::{Deserialize, Serialize};
use squashfs::SquashfsArchiver;
use tar::TarArchiver;
use ts_rs::TS;

use crate::{bindings::resolve_var, error::Result};

// region structure

#[derive(Debug, Serialize, Deserialize, Clone, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub enum ArchiveAlgo {
    SquashfsZstd,
    Tar,
}

impl ArchiveAlgo {
    pub fn ext(&self) -> &str {
        match self {
            ArchiveAlgo::SquashfsZstd => "squashfs",
            ArchiveAlgo::Tar => "tar",
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveConfig {
    pub algorithm: ArchiveAlgo,
    pub level: u8,
    // currently not used
    pub backup_before_restore: bool,
}

impl Default for ArchiveConfig {
    fn default() -> Self {
        Self {
            algorithm: ArchiveAlgo::SquashfsZstd,
            level: 3,
            backup_before_restore: true,
        }
    }
}

#[derive(Debug, PartialEq, Serialize, Deserialize, Clone, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveInfo {
    pub name: String,
    pub size: u64,
}

impl ArchiveInfo {
    /// Strip prefix from name
    #[inline]
    pub fn strip_prefix(mut self, prefix: &str) -> Self {
        self.name = self
            .name
            .strip_prefix(prefix)
            .unwrap_or(&self.name)
            .to_string();
        self
    }
}

impl From<opendal::Entry> for ArchiveInfo {
    fn from(value: opendal::Entry) -> Self {
        let (name, metadata) = value.into_parts();
        Self {
            name,
            size: metadata.content_length(),
        }
    }
}

impl From<std::fs::DirEntry> for ArchiveInfo {
    fn from(value: std::fs::DirEntry) -> Self {
        Self {
            name: value.file_name().to_string_lossy().to_string(),
            size: value.metadata().map(|m| m.len()).unwrap_or_default(),
        }
    }
}

// region interface

pub trait Archive {
    fn archive(
        &self,
        paths: Vec<impl AsRef<Path>>,
        writer: impl io::Write + io::Seek,
    ) -> io::Result<()>;
    fn extract(
        &self,
        reader: impl io::Read + io::Seek + Send,
        targets: Vec<impl AsRef<Path>>,
    ) -> io::Result<()>;
}

impl Archive for ArchiveConfig {
    fn archive(
        &self,
        paths: Vec<impl AsRef<Path>>,
        writer: impl io::Write + io::Seek,
    ) -> io::Result<()> {
        match self.algorithm {
            ArchiveAlgo::SquashfsZstd => SquashfsArchiver(self.level).archive(paths, writer),
            ArchiveAlgo::Tar => TarArchiver.archive(paths, writer),
        }
    }
    fn extract(
        &self,
        reader: impl io::Read + io::Seek + Send,
        targets: Vec<impl AsRef<Path>>,
    ) -> io::Result<()> {
        match self.algorithm {
            ArchiveAlgo::SquashfsZstd => SquashfsArchiver(self.level).extract(reader, targets),
            ArchiveAlgo::Tar => TarArchiver.extract(reader, targets),
        }
    }
}

// region impl

// 格式: YYYYMMDD_HHMMSS_{DeviceName}.{Ext}
pub fn archive_impl(
    device_name: &str,
    archive_conf: &ArchiveConfig,
    game_backup_dir: PathBuf,
    paths: Vec<String>,
) -> Result<String> {
    // 1. 解析路径
    let target_paths: Vec<PathBuf> = paths
        .iter()
        .map(|s| resolve_var(s).map(PathBuf::from))
        .collect::<Result<_>>()?;

    if !game_backup_dir.exists() {
        fs::create_dir_all(&game_backup_dir)?;
    }

    let now = chrono::Local::now();
    let timestamp = now.format("%Y%m%d_%H%M%S");

    let filename = format!(
        "{}_{}.{}",
        timestamp,
        device_name,
        archive_conf.algorithm.ext()
    );
    let file_path = game_backup_dir.join(&filename);

    let file = fs::File::create(&file_path)?;

    info!(
        "creating archive: from_paths={:?}, to_path={}",
        paths,
        file_path.display()
    );

    match archive_conf.archive(target_paths, file) {
        Ok(_) => Ok(filename),
        Err(e) => {
            error!("Failed to archive saves: {e}");
            if let Err(e) = fs::remove_file(&file_path) {
                error!("Failed to revert previous created archive file: {e}");
            }
            Err(e.into())
        }
    }
}

pub fn restore_impl(
    archive_conf: &ArchiveConfig,
    game_backup_dir: PathBuf,
    archive_filename: String,
    paths: Vec<String>,
) -> Result<()> {
    let target_paths: Vec<PathBuf> = paths
        .iter()
        .map(|s| resolve_var(s).map(PathBuf::from))
        .collect::<Result<_>>()?;

    let archive_path = game_backup_dir.join(&archive_filename);

    if !archive_path.exists() {
        return Err(io::Error::new(io::ErrorKind::NotFound, "Archive not found").into());
    }

    let file = fs::File::open(&archive_path)?;

    info!(
        "restoring archive: from_path={}, to_paths={:?}",
        archive_path.display(),
        target_paths
    );

    archive_conf.extract(file, target_paths)?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_archiver(archiver: impl Archive + Sized) -> io::Result<()> {
        // 1. Setup Source Environment
        let src_dir_1 = tempfile::tempdir()?;
        let src_path_1 = src_dir_1.path();
        let src_dir_2 = tempfile::tempdir()?;
        let src_path_2 = src_dir_2.path();

        let file1_path = src_path_1.join("file1.txt");
        fs::write(&file1_path, "1")?;
        let dir2_path = src_path_2.join("data");
        fs::create_dir(&dir2_path)?;
        let subfile_path = dir2_path.join("sub.txt");
        fs::write(&subfile_path, "sub")?;

        let paths_to_archive = vec![file1_path.clone(), dir2_path.clone()];
        println!("paths_to_archive: {paths_to_archive:?}");

        // Using a file for the archive content to simulate real IO
        let dst_dir_1 = tempfile::tempdir()?.keep(); // for debug
        let dst_path_1 = dst_dir_1.as_path();
        println!("archive dest dir: {dst_path_1:?}");
        let archive_file_path = dst_path_1.join("archive");
        let archive_file = fs::OpenOptions::new()
            .write(true)
            .read(true)
            .create(true)
            .truncate(true)
            .open(&archive_file_path)?;
        archiver.archive(paths_to_archive, &archive_file).unwrap();

        // 3. Prepare Restore Targets
        let dst_dir_2 = tempfile::tempdir()?;
        let dst_path_2 = dst_dir_2.path();
        let target_file = dst_path_2.join("file1.txt");
        let target_dir = dst_path_2.join("data");
        let targets = vec![target_file.clone(), target_dir.clone()];
        println!("restore targets: {targets:?}");

        let mut reader = fs::File::open(&archive_file_path)?;
        archiver.extract(&mut reader, targets).unwrap();

        assert!(target_file.exists(), "Target file should exist");
        let content = fs::read_to_string(&target_file)?;
        assert_eq!(content, "1");
        assert!(target_dir.exists(), "Target directory should exist");
        assert!(target_dir.is_dir());
        let target_subfile = target_dir.join("sub.txt");
        assert!(
            target_subfile.exists(),
            "Subfile inside target directory should exist"
        );
        let sub_content = fs::read_to_string(&target_subfile)?;
        assert_eq!(sub_content, "sub");

        Ok(())
    }

    #[test]
    fn test_tar_archiver() -> io::Result<()> {
        test_archiver(TarArchiver)
    }

    #[test]
    fn test_squashfs_archiver() -> io::Result<()> {
        test_archiver(SquashfsArchiver(1))
    }
}
