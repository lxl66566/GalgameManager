use std::{collections::HashMap, sync::LazyLock as Lazy};

use serde::{Deserialize, Serialize};
use strfmt::strfmt;
use ts_rs::TS;

use crate::error::{Error, Result};

pub type VarMap = HashMap<String, String>;

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
