use crate::error::{Error, Result};
use std::sync::LazyLock as Lazy;

// TODO: fallback hash
pub static DEVICE_UID: Lazy<String> =
    Lazy::new(|| get_current_device_uid().unwrap_or_else(|_| "Unknown".to_string()));

pub fn get_current_device_uid() -> Result<String> {
    machine_uid::get().map_err(|e| Error::Device(format!("cannot get machine id: {e}")))
}
