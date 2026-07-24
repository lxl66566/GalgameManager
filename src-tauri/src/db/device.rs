use std::sync::LazyLock as Lazy;

use easy_strfmt::strfmt;
use indexmap::IndexMap;
use log::warn;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use struct_patch::Patch;
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

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS, Patch)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
#[serde(default)]
#[patch(no_diff)]
#[patch(attribute(derive(Debug, Default, Clone, Serialize, Deserialize, TS)))]
#[patch(attribute(ts(export)))]
#[patch(attribute(serde(rename_all = "camelCase", default)))]
pub struct Device {
    #[patch(attribute(serde(skip_serializing_if = "Option::is_none")))]
    #[patch(attribute(ts(optional)))]
    pub name: String,
    // `uid` is the list-patch address on `Config.devices` — skipping it here
    // matches `Game::id`: the frontend must not orphan a device by rewriting
    // its uid out from under an in-flight patch op.
    #[patch(skip)]
    pub uid: String,
    // `variables` is an IndexMap (insertion-ordered). Sent whole on patch —
    // the typical edit is one key, but the map is small and HashMap-style
    // fine-grained patches aren't supported by struct-patch.
    #[patch(attribute(serde(skip_serializing_if = "Option::is_none")))]
    #[patch(attribute(ts(optional)))]
    pub variables: VarMap,
}

pub trait ResolveVar {
    fn resolve_var(&self, s: &str) -> Result<String>;
}

impl ResolveVar for VarMap {
    fn resolve_var(&self, s: &str) -> Result<String> {
        let formatted = strfmt(s, self)?;
        Ok(expand_tilde(&formatted))
    }
}

/// Expand a leading `~` / `~/` to the user's home directory.
///
/// Applied *after* [`strfmt`] so that variables whose values contain `~`
/// (e.g. `{home}/games` → `~/games`) are also expanded. Only a leading
/// tilde is expanded; `~user` and tildes mid-string are left untouched.
fn expand_tilde(s: &str) -> String {
    let Some(home) = home::home_dir() else {
        return s.to_string();
    };
    if s == "~" {
        return home.to_string_lossy().into_owned();
    }
    if let Some(rest) = s.strip_prefix("~/") {
        let mut out = home.to_string_lossy().into_owned();
        out.push('/');
        out.push_str(rest);
        return out;
    }
    s.to_string()
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
