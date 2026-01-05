use std::{io, path::Path};

use crate::archive::ArchiveInfo;

pub fn list_dir_all(path: impl AsRef<Path>) -> io::Result<Vec<ArchiveInfo>> {
    let entries = std::fs::read_dir(path)?;
    let mut ret = vec![];
    for entry in entries {
        ret.push(ArchiveInfo::from(entry?));
    }
    Ok(ret)
}
