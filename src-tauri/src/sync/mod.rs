mod local;
mod opendal;

use std::{path::Path, sync::LazyLock as Lazy};

use ::opendal::{services, Operator};
use local::LocalUploader;
use tokio::sync::Mutex;

use crate::{
    db::{
        settings::{StorageConfig, StorageProvider},
        Config, CONFIG,
    },
    error::Result,
};

pub static CURRENT_OPERATOR: Lazy<Mutex<Option<Box<dyn MyOperation + Send + Sync>>>> =
    Lazy::new(|| Mutex::new(None));

// call this before using any operation
pub async fn init_operator() -> Result<()> {
    let mut op = CURRENT_OPERATOR.lock().await;
    if op.is_none() {
        let lock = CONFIG.lock();
        let new_operator = lock.settings.storage.build_operator()?;
        *op = Some(new_operator);
    }
    Ok(())
}

#[async_trait::async_trait]
pub trait MyOperation {
    async fn list_archive(&self, game_id: u32) -> Result<Vec<String>>;
    async fn upload_archive(
        &self,
        game_id: u32,
        archive_filename: String,
        backup_dir: &Path,
    ) -> Result<()>;
    async fn delete_archive(&self, game_id: u32, archive_filename: String) -> Result<()>;
    async fn pull_archive(
        &self,
        game_id: u32,
        archive_filename: String,
        backup_dir: &Path,
    ) -> Result<()>;
    async fn rename_archive(
        &self,
        game_id: u32,
        archive_filename: String,
        new_archive_filename: String,
    ) -> Result<()>;
    async fn upload_config(&self) -> Result<()>;
    async fn get_remote_config(&self) -> Result<Option<Config>>;
    /// Only upload config if remote config is older than local config
    ///
    /// # Returns
    ///
    /// bool indicates whether config really uploaded
    async fn upload_config_safe(&self) -> Result<bool> {
        let remote_config = self.get_remote_config().await?;
        let config = CONFIG.lock().clone();
        if let Some(remote_config) = remote_config {
            if remote_config.last_updated >= config.last_updated {
                println!(
                    "Remote config is newer ({} >= {}), not uploading",
                    remote_config.last_updated, config.last_updated
                );
                return Ok(false);
            }
        }
        self.upload_config().await?;
        Ok(true)
    }
}

impl StorageConfig {
    pub fn build_operator(&self) -> Result<Box<dyn MyOperation + Send + Sync>> {
        match self.provider {
            StorageProvider::Local => Ok(Box::new(LocalUploader::new(self.local.clone().into())?)),
            StorageProvider::WebDav => {
                let config = &self.webdav;
                let operator = Operator::new(
                    services::Webdav::default()
                        .endpoint(&config.endpoint)
                        .username(&config.username)
                        .password(config.password.as_deref().unwrap_or_default())
                        .root(&config.root_path),
                )?
                .finish();
                Ok(Box::new(operator))
            }
            StorageProvider::S3 => {
                let config = &self.s3;
                let operator = Operator::new(
                    services::S3::default()
                        .bucket(&config.bucket)
                        .access_key_id(&config.access_key)
                        .secret_access_key(&config.secret_key),
                )?
                .finish();
                Ok(Box::new(operator))
            }
        }
    }
}
