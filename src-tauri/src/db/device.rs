use crate::error::{Error, Result};
use std::sync::LazyLock as Lazy;

pub static DEVICE_UID: Lazy<&'static str> = Lazy::new(|| {
    get_current_device_uid()
        .map(|s| Box::leak(s.into_boxed_str()))
        // TODO: fallback hash
        .expect("cannot get device uid!")
});

fn get_current_device_uid() -> Result<String> {
    machine_uid::get().map_err(|e| Error::Device(format!("cannot get machine id: {e}")))
}

#[tauri::command]
#[specta::specta]
pub fn device_id() -> &'static str {
    *DEVICE_UID
}
