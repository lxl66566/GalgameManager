use serde::Serialize;
use specta::Type;
use thiserror::Error;

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Error, Debug, Serialize, Type)]
#[serde(tag = "type", content = "data")]
pub enum Error {
    #[error("IO error: {0}")]
    #[serde(skip)]
    Io(#[from] std::io::Error),

    #[error("Device error: {0}")]
    Device(String),

    #[error("Config error: {0}")]
    #[serde(skip)]
    Config(#[from] config_file2::error::Error),

    #[error("Clone error")]
    Clone,

    #[error("Could not resolve var: {0}")]
    #[serde(skip)]
    ResolveVar(#[from] strfmt::FmtError),
}

impl Clone for Error {
    fn clone(&self) -> Self {
        match self {
            Error::Device(e) => Error::Device(e.clone()),
            _ => Self::Clone,
        }
    }
}
