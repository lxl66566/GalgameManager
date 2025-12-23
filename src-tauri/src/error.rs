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
}

impl Clone for Error {
    fn clone(&self) -> Self {
        match self {
            Error::Device(e) => Error::Device(e.clone()),
            _ => Self::Clone,
        }
    }
}
