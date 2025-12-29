use std::io;
use std::path::Path;

pub fn list_dir_all(path: impl AsRef<Path>) -> io::Result<Vec<String>> {
    let entries = std::fs::read_dir(path)?;
    let mut ret = vec![];
    for entry in entries {
        let entry = entry?;
        ret.push(entry.file_name().to_string_lossy().to_string());
    }
    Ok(ret)
}
