use serde::{Serialize, Serializer};
use thiserror::Error;

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Error, Debug)]
pub enum Error {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Device error: {0}")]
    Device(String),

    #[error("Config error: {0}")]
    Config(#[from] config_file2::error::Error),

    #[error("Clone error")]
    Clone,

    #[error("Could not resolve var: {0}")]
    ResolveVar(#[from] strfmt::FmtError),

    #[error("Tauri Emit signal error")]
    Emit,

    #[error("Tauri error: {0}")]
    Tauri(#[from] tauri::Error),

    #[error("Archive error: {0}")]
    Archive(#[from] backhand::BackhandError),
}

impl Clone for Error {
    fn clone(&self) -> Self {
        match self {
            Error::Device(e) => Error::Device(e.clone()),
            _ => Self::Clone,
        }
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
