use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::{error::Result, exec::StartCtx};

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub enum ExecuteOn {
    #[default]
    BeforeGameStart,
    AfterGameStart,
    GameExit,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteMetadata {}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteConfig {
    pub on: ExecuteOn,
    pub ctx: StartCtx,
}

impl super::PluginAction for ExecuteConfig {
    type Metadata = ExecuteMetadata;
    fn get_metadata(&self) -> Option<Self::Metadata> {
        Some(ExecuteMetadata {})
    }
    fn before_game_start(&self) -> Result<()> {
        if !matches!(self.on, ExecuteOn::BeforeGameStart) {
            return Ok(());
        }
        self.ctx.spawn()?;
        Ok(())
    }
    fn on_game_start(&self, _ctx: &mut StartCtx) {}
    fn after_game_start(&self) -> Result<()> {
        if !matches!(self.on, ExecuteOn::AfterGameStart) {
            return Ok(());
        }
        self.ctx.spawn()?;
        Ok(())
    }
    fn after_game_exit(&self) -> Result<()> {
        if !matches!(self.on, ExecuteOn::GameExit) {
            return Ok(());
        }
        self.ctx.spawn()?;
        Ok(())
    }
}
