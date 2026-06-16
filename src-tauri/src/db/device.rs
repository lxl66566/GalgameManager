use std::sync::LazyLock as Lazy;

use easy_strfmt::strfmt;
use indexmap::IndexMap;
use log::warn;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use ts_rs::TS;

use crate::error::{Error, Result};

pub type VarMap = IndexMap<String, String>;

pub static DEFAULT_DEVICE: Lazy<Device> = Lazy::new(Device::default);

pub static DEVICE_UID: Lazy<&'static str> = Lazy::new(|| {
    let uid = get_current_device_uid().unwrap_or_else(|e| {
        warn!("cannot get device uid, using fallback hash: {e}");
        fallback_device_uid()
    });
    Box::leak(uid.into_boxed_str())
});

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
pub struct Device {
    pub name: String,
    pub uid: String,
    pub variables: VarMap,
}

pub trait ResolveVar {
    fn resolve_var(&self, s: &str) -> Result<String>;
}

impl ResolveVar for VarMap {
    fn resolve_var(&self, s: &str) -> Result<String> {
        Ok(strfmt(s, self)?)
    }
}

fn get_current_device_uid() -> Result<String> {
    machine_uid::get().map_err(|e| Error::Device(format!("cannot get machine id: {e}")))
}

/// Build a stable device uid when `machine_uid` fails. It hashes the home
/// directory and the current username so each user/machine still gets a
/// reasonably unique, stable identifier instead of panicking at startup.
fn fallback_device_uid() -> String {
    let mut source = String::new();
    if let Some(home) = home::home_dir() {
        source.push_str(&home.to_string_lossy());
    }
    if let Ok(user) = std::env::var("USERNAME").or_else(|_| std::env::var("USER")) {
        source.push_str(&user);
    }
    let mut hasher = Sha256::new();
    hasher.update(source.as_bytes());
    hex::encode(hasher.finalize())
}
