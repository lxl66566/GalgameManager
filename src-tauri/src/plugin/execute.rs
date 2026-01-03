use serde::{Deserialize, Serialize};
use ts_rs::TS;

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteMetadata {}

#[derive(Debug, Clone, Default, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteConfig {}

impl super::PluginAction for ExecuteConfig {
    type Metadata = ExecuteMetadata;
    fn get_metadata(&self) -> Self::Metadata {
        ExecuteMetadata {}
    }
}
