use std::{path::PathBuf, sync::OnceLock};

use flexi_logger::{
    Age, Cleanup, Criterion, DeferredNow, Duplicate, FileSpec, Logger, LoggerHandle, Naming,
    Record, WriteMode,
};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

pub static LOG_HANDLE: OnceLock<LoggerHandle> = OnceLock::new();

#[derive(Debug, Default, Serialize, Deserialize, Clone, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub enum LogLevel {
    #[default]
    Info,
    Warn,
    Error,
    Debug,
    Trace,
}

impl From<LogLevel> for log::Level {
    fn from(val: LogLevel) -> Self {
        match val {
            LogLevel::Info => log::Level::Info,
            LogLevel::Warn => log::Level::Warn,
            LogLevel::Error => log::Level::Error,
            LogLevel::Debug => log::Level::Debug,
            LogLevel::Trace => log::Level::Trace,
        }
    }
}

fn my_log_format(
    w: &mut dyn std::io::Write,
    now: &mut DeferredNow,
    record: &Record,
) -> std::io::Result<()> {
    let target = record.target();
    // top level module
    let top_level_module = target.split("::").next().unwrap_or(target);

    write!(
        w,
        "[{time}] {level} [{module}] - {message}",
        time = now.format("%Y-%m-%d %H:%M:%S"), // 时间
        level = record.level(),                 // 等级
        module = top_level_module,              // 顶层模块名称
        message = record.args()                 // 日志内容
    )
}

pub fn init_logger(dir: PathBuf) -> Result<LoggerHandle, flexi_logger::FlexiLoggerError> {
    let handle = Logger::try_with_env_or_str("info")?
        .log_to_file(FileSpec::default().directory(dir).suppress_basename())
        .rotate(
            Criterion::Age(Age::Day),
            Naming::Timestamps,
            Cleanup::KeepLogAndCompressedFiles(5, 60),
        )
        .format(my_log_format)
        .duplicate_to_stderr(Duplicate::All)
        .write_mode(WriteMode::BufferAndFlush)
        .start()?;
    Ok(handle)
}
