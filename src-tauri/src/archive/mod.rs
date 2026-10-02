mod squashfs;
mod tar;

use std::{
    cmp::Reverse,
    collections::{HashMap, HashSet},
    fs, io,
    path::{Path, PathBuf},
};

use log::{error, info};
use serde::{Deserialize, Serialize};
use squashfs::SquashfsArchiver;
use tar::TarArchiver;
use ts_rs::TS;
use walkdir::WalkDir;

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
    #[must_use]
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
    #[must_use]
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

impl From<fs::DirEntry> for ArchiveInfo {
    fn from(value: fs::DirEntry) -> Self {
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
    /// Extract onto `targets` and report the coverage: what the archive
    /// actually contains under each target. The caller feeds it to
    /// [`prune_stale`] so a restore makes disk state match the archive
    /// exactly instead of just overlaying files.
    fn extract(
        &self,
        reader: impl io::Read + io::Seek + Send,
        targets: Vec<impl AsRef<Path>>,
    ) -> io::Result<ExtractCoverage>;
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
    ) -> io::Result<ExtractCoverage> {
        match self.algorithm {
            ArchiveAlgo::SquashfsZstd => SquashfsArchiver(self.level).extract(reader, targets),
            ArchiveAlgo::Tar => TarArchiver.extract(reader, targets),
        }
    }
}

// region prune

/// What an `Archive::extract` wrote: per extracted target root, the set of
/// (normalized) relative paths the archive contains.
///
/// The keep-set derives from archive contents, not from `save_paths` config,
/// so it stays self-consistent with any future archive-side filtering:
/// a future exclude feature must skip `cover()` for excluded paths, which
/// automatically keeps them out of the pruning set.
#[derive(Default)]
pub struct ExtractCoverage {
    /// target root -> normalized relative paths present in the archive
    roots: HashMap<PathBuf, HashSet<PathBuf>>,
}

impl ExtractCoverage {
    /// Record `rel` as present in the archive under `root`.
    /// Ancestors are inserted too: tar archives built elsewhere may omit
    /// explicit dir entries, and the ancestors guarantee a stale directory
    /// can only contain stale children (relied on by `prune_stale`).
    fn cover(&mut self, root: &Path, rel: &Path) {
        let set = self.roots.entry(root.to_path_buf()).or_default();
        let mut prefix = PathBuf::new();
        for comp in rel.components() {
            prefix.push(comp);
            set.insert(norm(&prefix));
        }
    }
}

/// Case-fold a relative path for keep-set lookups.
/// Windows filesystems match names case-insensitively while archive entries
/// keep their original case; without folding, a disk file whose case differs
/// from the archive entry would be pruned as stale and take the just-restored
/// content with it (extract writes through the existing inode).
#[cfg(windows)]
fn norm(path: &Path) -> PathBuf {
    path.iter()
        .map(|c| c.to_string_lossy().to_lowercase())
        .collect()
}

#[cfg(not(windows))]
fn norm(path: &Path) -> PathBuf {
    path.to_path_buf()
}

/// Delete entries under each covered root that the archive does not contain.
/// Runs only after a fully successful extract, so a failed restore never
/// deletes anything. Never crosses symlinks and never touches the roots
/// themselves or anything outside them (file targets have no children).
pub fn prune_stale(coverage: &ExtractCoverage) -> io::Result<()> {
    for (root, keep) in &coverage.roots {
        // WalkDir is preorder; collect first and delete after, otherwise
        // removing a directory mid-walk breaks iteration.
        let mut stale_files = Vec::new();
        let mut stale_dirs = Vec::new();
        for entry in WalkDir::new(root).follow_links(false).min_depth(1) {
            let entry = entry.map_err(io::Error::other)?;
            // WalkDir paths are always root-prefixed.
            let rel = entry.path().strip_prefix(root).map_err(io::Error::other)?;
            if keep.contains(&norm(rel)) {
                continue;
            }
            // file_type() describes the link itself, so symlinks (even to
            // dirs) land in stale_files and are unlinked, never followed.
            if entry.file_type().is_dir() {
                stale_dirs.push(entry.path().to_path_buf());
            } else {
                stale_files.push(entry.path().to_path_buf());
            }
        }

        for f in &stale_files {
            fs::remove_file(f)?;
        }
        // Deepest first; by the ancestors invariant every child of a stale
        // dir is stale too, so remove_dir_all cannot touch kept files.
        stale_dirs.sort_by_key(|d| Reverse(d.components().count()));
        for d in &stale_dirs {
            fs::remove_dir_all(d)?;
        }

        let total = stale_files.len() + stale_dirs.len();
        if total > 0 {
            info!("pruned {total} stale entries under {}", root.display());
        }
    }
    Ok(())
}

// region impl

// Filename format: YYYYMMDD_HHMMSS_{DeviceName}.{Ext}
pub fn archive_impl(
    device_name: &str,
    archive_conf: &ArchiveConfig,
    game_backup_dir: &Path,
    paths: &[String],
) -> Result<String> {
    let target_paths: Vec<PathBuf> = paths
        .iter()
        .map(|s| resolve_var(s).map(PathBuf::from))
        .collect::<Result<_>>()?;

    if !game_backup_dir.exists() {
        fs::create_dir_all(game_backup_dir)?;
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
        Ok(()) => Ok(filename),
        Err(e) => {
            error!("Failed to archive saves: {e}");
            if let Err(e) = fs::remove_file(&file_path) {
                error!("Failed to revert previous created archive file: {e}");
            }
            Err(e.into())
        },
    }
}

pub fn restore_impl(
    archive_conf: &ArchiveConfig,
    game_backup_dir: &Path,
    archive_filename: &str,
    paths: &[String],
) -> Result<()> {
    let target_paths: Vec<PathBuf> = paths
        .iter()
        .map(|s| resolve_var(s).map(PathBuf::from))
        .collect::<Result<_>>()?;

    let archive_path = game_backup_dir.join(archive_filename);

    if !archive_path.exists() {
        return Err(io::Error::new(io::ErrorKind::NotFound, "Archive not found").into());
    }

    let file = fs::File::open(&archive_path)?;

    info!(
        "restoring archive: from_path={}, to_paths={:?}",
        archive_path.display(),
        target_paths
    );

    let coverage = archive_conf.extract(file, target_paths)?;
    // Restore means "disk state == archive state": delete what the archive
    // does not contain. Only after a fully successful extract.
    prune_stale(&coverage)?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_archiver(archiver: &(impl Archive + Sized)) -> io::Result<()> {
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
        // empty dir: must survive restore, but stale disk content inside it
        // must still be pruned
        fs::create_dir(dir2_path.join("empty"))?;

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

        // stale state: present on disk, absent from the archive
        fs::create_dir_all(&target_dir)?;
        let stale_file = target_dir.join("stale.txt");
        fs::write(&stale_file, "old")?;
        let stale_dir = target_dir.join("junk/deep");
        fs::create_dir_all(&stale_dir)?;
        fs::write(stale_dir.join("old.bin"), "old")?;
        let stale_in_empty = target_dir.join("empty/stale.txt");
        fs::create_dir(stale_in_empty.parent().unwrap())?;
        fs::write(&stale_in_empty, "old")?;
        // sibling of the *file* target: outside every covered root, must survive
        let sibling = target_file.parent().unwrap().join("sibling.txt");
        fs::write(&sibling, "keep me")?;

        let mut reader = fs::File::open(&archive_file_path)?;
        let coverage = archiver.extract(&mut reader, targets).unwrap();
        prune_stale(&coverage)?;

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

        // pruning
        assert!(!stale_file.exists(), "Stale file should be pruned");
        assert!(!stale_dir.exists(), "Stale dir tree should be pruned");
        assert!(
            !stale_in_empty.exists(),
            "Stale file inside kept empty dir should be pruned"
        );
        assert!(
            target_dir.join("empty").exists(),
            "Empty dir from archive should be kept"
        );
        assert!(
            sibling.exists(),
            "Sibling of a file target is outside coverage and must survive"
        );

        Ok(())
    }

    #[test]
    fn test_tar_archiver() -> io::Result<()> {
        test_archiver(&TarArchiver)
    }

    #[test]
    fn test_squashfs_archiver() -> io::Result<()> {
        test_archiver(&SquashfsArchiver(1))
    }

    #[test]
    fn test_norm() {
        // Windows filesystems are case-insensitive while archives are not:
        // lookups must fold, or a case-mismatched disk file would be pruned
        // as stale and take the just-restored content with it.
        #[cfg(windows)]
        assert_eq!(norm(Path::new("A/b/C.txt")), PathBuf::from("a/b/c.txt"));
        #[cfg(not(windows))]
        assert_eq!(norm(Path::new("A/b/C.txt")), PathBuf::from("A/b/C.txt"));
    }
}
