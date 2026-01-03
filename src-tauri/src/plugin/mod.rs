mod execute;

pub use execute::ExecuteMetadata;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::{error::Result, exec::StartCtx};

pub trait PluginAction {
    type Metadata;
    fn get_metadata(&self) -> Self::Metadata;
    fn before_game_start(&self) -> Result<()> {
        Ok(())
    }
    fn on_game_start(&self, _ctx: &mut StartCtx) {}
    fn after_game_start(&self) -> Result<()> {
        Ok(())
    }
    fn game_exit(&self) -> Result<()> {
        Ok(())
    }
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct PluginMetadata {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub execute: Option<ExecuteMetadata>,
}
