mod execute;

pub use execute::{ExecuteConfig, ExecuteMetadata};
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::{error::Result, exec::StartCtx};

pub trait PluginAction {
    type Metadata;
    fn get_metadata(&self) -> Option<Self::Metadata>;
    fn before_game_start(&self) -> Result<()> {
        Ok(())
    }
    fn on_game_start(&self, _ctx: &mut StartCtx) {}
    fn after_game_start(&self) -> Result<()> {
        Ok(())
    }
    fn after_game_exit(&self) -> Result<()> {
        Ok(())
    }
}

/// modify this if new plugin added
#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct PluginMetadatas {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub execute: Option<ExecuteMetadata>,
}

/// modify this if new plugin added
#[derive(Debug, Clone, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub enum PluginConfig {
    Execute(ExecuteConfig),
}

impl PluginAction for PluginConfig {
    type Metadata = ();
    fn get_metadata(&self) -> Option<Self::Metadata> {
        unimplemented!("cannot call get_metadata on PluginConfig")
    }
    fn before_game_start(&self) -> Result<()> {
        match self {
            PluginConfig::Execute(config) => config.before_game_start(),
        }
    }
    fn on_game_start(&self, _ctx: &mut StartCtx) {}
    fn after_game_start(&self) -> Result<()> {
        match self {
            PluginConfig::Execute(config) => config.after_game_start(),
        }
    }
    fn after_game_exit(&self) -> Result<()> {
        match self {
            PluginConfig::Execute(config) => config.after_game_exit(),
        }
    }
}
