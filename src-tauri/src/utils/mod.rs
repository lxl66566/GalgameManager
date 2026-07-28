pub mod audio_speed_hack;
pub mod persist;
pub mod toast;

use std::{io, path::Path, time::Duration};

use similar::TextDiff;

use crate::{archive::ArchiveInfo, db::Config};

#[must_use]
pub fn format_time_delta(delta: chrono::TimeDelta) -> String {
    // .max(0) clamps negative durations before the u64 cast — sign loss is
    // impossible by construction.
    #[allow(clippy::cast_sign_loss)]
    let secs = delta.num_seconds().max(0) as u64;
    humantime::format_duration(Duration::from_secs(secs)).to_string()
}

pub fn list_dir_all(path: impl AsRef<Path>) -> io::Result<Vec<ArchiveInfo>> {
    let entries = std::fs::read_dir(path)?;
    let mut ret = vec![];
    for entry in entries {
        ret.push(ArchiveInfo::from(entry?));
    }
    Ok(ret)
}

pub fn diff(old_conf: &Config, new_conf: &Config) -> String {
    let old_str = toml::to_string(old_conf).unwrap();
    let new_str = toml::to_string(new_conf).unwrap();

    // 生成 diff
    TextDiff::from_lines(&old_str, &new_str)
        .unified_diff()
        .context_radius(2)
        .header("Old", "New")
        .to_string()
}
