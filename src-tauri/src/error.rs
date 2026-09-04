use std::fmt;

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

    #[error("Network error: {0}")]
    Network(ReqwestDetailedError),

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

    #[error("Dead URL (previous 4xx client error): {0}")]
    DeadUrl(String),

    #[error("Background task join error: {0}")]
    JoinError(String),
}

impl Clone for Error {
    fn clone(&self) -> Self {
        // The underlying error types (io::Error, opendal::Error, etc.) don't
        // implement Clone, so a true deep clone is impossible. Instead we
        // flatten the full error chain (Display + every `source()`) into a
        // string so debugging info and the original context are never lost
        // (the previous impl used `to_string()` which only prints the
        // top-level message and silently drops every underlying cause).
        Error::Cloned(format_error_chain(self))
    }
}

impl Serialize for Error {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        serializer.serialize_str(&format_error_chain(self))
    }
}

/// Flatten an error and its entire `source()` chain into a single string.
///
/// Rust's default `to_string()` only prints the top-level error message and
/// drops the underlying causes. This walks the whole chain so Tauri consumers
/// (and logs) see the full "Caused by:" trail — for every error variant, not
/// just reqwest.
fn format_error_chain(err: &dyn std::error::Error) -> String {
    use std::fmt::Write;
    let mut s = err.to_string();
    let mut current = err.source();
    while let Some(source) = current {
        let _ = write!(s, "\n  Caused by: {source}");
        current = source.source();
    }
    s
}

/// A transparent wrapper around [`reqwest::Error`] with a human-readable
/// [`fmt::Display`]: it surfaces the HTTP status code (client vs server) or,
/// for transport errors, the error category plus the root cause buried in
/// reqwest's source chain — instead of reqwest's opaque default
/// "error sending request for url (...)".
///
/// The original [`reqwest::Error`] is kept in a public field so callers can
/// still match on it, e.g. `if let Error::Network(ReqwestDetailedError(e)) =
/// err` followed by `e.is_timeout()` to drive retry logic.
///
/// Note: `Error::Network` intentionally does *not* tag this field as
/// `#[source]`. The Display here already flattens the whole reqwest chain, so
/// marking it as a source would make `format_error_chain` (used by Clone /
/// Serialize) print the same information twice.
#[derive(Debug)]
pub struct ReqwestDetailedError(pub reqwest::Error);

impl fmt::Display for ReqwestDetailedError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let e = &self.0;

        // HTTP status errors produced by `Response::error_for_status()`: surface
        // the code and whether it's a client (4xx) or server (5xx) problem.
        if let Some(status) = e.status() {
            let class = if status.is_client_error() {
                "client"
            } else {
                "server"
            };
            let url = e.url().map_or("unknown", tauri::Url::as_str);
            return write!(
                f,
                "HTTP {} {} ({class} error) for <{url}>",
                status.as_u16(),
                status.canonical_reason().unwrap_or("Unknown"),
            );
        }

        // Transport / decoding errors: classify and expose the root cause.
        let kind = if e.is_timeout() {
            "timeout"
        } else if e.is_connect() {
            "connection failed"
        } else if e.is_request() {
            "request failed"
        } else if e.is_body() {
            "body error"
        } else if e.is_decode() {
            "decode error"
        } else if e.is_redirect() {
            "redirect error"
        } else if e.is_builder() {
            "builder error"
        } else {
            "request error"
        };

        // Drill down to the leaf cause (dns error, connection refused,
        // invalid certificate, ...); reqwest buries these in its source chain.
        let mut leaf: &dyn std::error::Error = e;
        while let Some(next) = leaf.source() {
            leaf = next;
        }
        let root = leaf.to_string();
        let root = if root.is_empty() {
            e.to_string()
        } else {
            root
        };

        match e.url() {
            Some(url) => write!(f, "{kind} for <{url}>: {root}"),
            None => write!(f, "{kind}: {root}"),
        }
    }
}

impl From<reqwest::Error> for Error {
    fn from(e: reqwest::Error) -> Self {
        Error::Network(ReqwestDetailedError(e))
    }
}
