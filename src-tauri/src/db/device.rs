use std::{collections::HashMap, sync::LazyLock as Lazy};

use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::error::{Error, Result};

pub static DEFAULT_DEVICE: Lazy<Device> = Lazy::new(Device::default);

pub static DEVICE_UID: Lazy<&'static str> = Lazy::new(|| {
    get_current_device_uid()
        .map(|s| Box::leak(s.into_boxed_str()))
        // TODO: fallback hash
        .expect("cannot get device uid!")
});

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct Device {
    pub name: String,
    pub uid: String,
    pub variables: HashMap<String, String>,
}

fn get_current_device_uid() -> Result<String> {
    machine_uid::get().map_err(|e| Error::Device(format!("cannot get machine id: {e}")))
}
