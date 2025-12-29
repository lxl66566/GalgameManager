mod local;
mod opendal;

use std::{path::Path, sync::LazyLock as Lazy};

use local::LocalUploader;

use crate::db::settings::StorageBackend;
use crate::db::CONFIG;
use crate::error::Result;
use ::opendal::{services, Operator};
use tokio::sync::Mutex;

pub static CURRENT_OPERATOR: Lazy<Mutex<Option<Box<dyn MyOperation + Send>>>> =
    Lazy::new(|| Mutex::new(None));

// call this before using any operation
pub async fn init_operator() -> Result<()> {
    let mut op = CURRENT_OPERATOR.lock().await;
    if op.is_none() {
        let lock = CONFIG.lock();
        let new_operator = lock.settings.storage.backend.build_operator()?;
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
}

impl StorageBackend {
    fn build_operator(&self) -> Result<Box<dyn MyOperation + Send>> {
        match self {
            StorageBackend::Local(path) => Ok(Box::new(LocalUploader::new(path.into())?)),
            StorageBackend::WebDav(config) => {
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
            StorageBackend::S3(config) => {
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
