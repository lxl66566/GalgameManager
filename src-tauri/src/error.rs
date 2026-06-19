use serde::{Serialize, Serializer};
use thiserror::Error;

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Error, Debug)]
pub enum Error {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Device error: {0}")]
    Device(String),

    #[error("Config operation error: {0}")]
    Config(#[from] config_file2::error::Error),

    #[error("Cloned error: {0}")]
    Cloned(String),

    #[error("Could not resolve var: {0}")]
    ResolveVar(#[from] easy_strfmt::Error),

    #[error("Tauri error: {0}")]
    Tauri(#[from] tauri::Error),

    #[error("Archive error: {0}")]
    Archive(#[from] backhand::BackhandError),

    #[error("Game id not found")]
    GameNotFound,

    #[error("Request error: {0}")]
    Request(#[from] reqwest::Error),

    #[error("Remote Operation Error: {0}")]
    RemoteOperation(#[from] opendal::Error),

    #[error("Launch error: executable not found")]
    Launch,

    #[error("Open error: {0}")]
    Open(#[from] opener::OpenError),

    #[cfg(target_os = "windows")]
    #[error("Windows API error: {0}")]
    WindowsApi(#[from] windows_result::Error),

    #[error("Broken config content: {0}")]
    BrokenConfig(#[from] toml::de::Error),

    #[error("Storage provider not set")]
    ProviderNotSet,

    #[error("Invalid path")]
    InvalidPath,

    #[error("Game time check failed: {0}")]
    GameTimeCheckFailed(String),

    #[error("Invalid launch command: {0}")]
    InvalidCommand(String),

    #[error("Internal error: Invalid channel: {0}")]
    InvalidChannel(&'static str),

    #[error("Plugin '{plugin}' command failed: {source}")]
    PluginCommand {
        plugin: &'static str,
        #[source]
        source: Box<Self>,
    },

    #[error("PE parse error: {0}")]
    PeParse(#[from] goblin::error::Error),
}

impl Clone for Error {
    fn clone(&self) -> Self {
        // The underlying error types (io::Error, reqwest::Error, etc.) don't
        // implement Clone, so a true deep clone is impossible. Instead we
        // preserve the full formatted error message so that debugging info and
        // the original error context are never lost (the previous impl collapsed
        // every variant into a useless "Clone error").
        Error::Cloned(self.to_string())
    }
}

impl Serialize for Error {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}
