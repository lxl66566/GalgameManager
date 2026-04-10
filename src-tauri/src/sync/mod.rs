mod opendal;
use std::{
    path::{Path, PathBuf},
    time::Duration,
};

use ::opendal::{
    Operator,
    layers::{LoggingLayer, RetryLayer, TimeoutLayer},
    services,
};
use log::{info, warn};
pub use opendal::{LocalOperator, S3Operator, WebdavOperator};
use tauri::{AppHandle, Emitter as _};

use crate::{
    archive::ArchiveInfo,
    db::{
        CONFIG, CONFIG_FILENAME, Config, TimeCmp,
        device::{ResolveVar, VarMap},
        settings::{LocalConfig, S3Config, WebDavConfig},
    },
    error::{Error, Result},
    utils,
};

const IO_TIMEOUT: Duration = Duration::from_secs(60);
const NON_IO_TIMEOUT: Duration = Duration::from_secs(15);
const MAX_RETRY_DELAY: Duration = Duration::from_secs(5);
const RETRY_TIMES: usize = 3;

#[async_trait::async_trait]
pub trait MyOperation {
    fn inner(&self) -> &Operator;
    #[inline]
    fn chunkable(&self) -> bool {
        self.inner().chunkable()
    }
    #[inline]
    async fn list_archive(&self, game_id: u32) -> Result<Vec<ArchiveInfo>> {
        self.inner().list_archive(game_id).await
    }
    #[inline]
    async fn upload_archive(
        &self,
        game_id: u32,
        archive_filename: &str,
        backup_dir: &Path,
    ) -> Result<()> {
        self.inner()
            .upload_archive(game_id, archive_filename, backup_dir)
            .await
    }
    #[inline]
    async fn delete_archive(&self, game_id: u32, archive_filename: &str) -> Result<()> {
        self.inner().delete_archive(game_id, archive_filename).await
    }
    #[inline]
    async fn delete_archive_all(&self, game_id: u32) -> Result<()> {
        self.inner().delete_archive_all(game_id).await
    }
    #[inline]
    async fn pull_archive(
        &self,
        game_id: u32,
        archive_filename: &str,
        backup_dir: &Path,
    ) -> Result<()> {
        self.inner()
            .pull_archive(game_id, archive_filename, backup_dir)
            .await
    }
    #[inline]
    async fn rename_archive(
        &self,
        game_id: u32,
        archive_filename: &str,
        new_archive_filename: &str,
    ) -> Result<()> {
        self.inner()
            .rename_archive(game_id, archive_filename, new_archive_filename)
            .await
    }
    #[inline]
    async fn get_remote_config(&self) -> Result<Option<Config>> {
        self.inner().get_remote_config().await
    }

    #[cfg(feature = "config-daily-backup")]
    #[inline]
    async fn replicate_config(&self) -> Result<()> {
        self.inner().replicate_config().await
    }

    /// upload config to remote, do not check anything or print log. should not
    /// be used outside this mod.
    #[inline]
    async fn upload_config_inner(&self, filename: &str) -> Result<()> {
        self.inner().upload_config_inner(filename).await
    }

    /// upload config to remote
    ///
    /// # Parameters
    ///
    /// - safe=true: will not upload config if local is clean or remote config
    ///   is newer
    ///
    /// # Returns
    ///
    /// bool indicates whether config really uploaded. If unsafe, it'll always
    /// return true.
    async fn upload_config(&self, app: &AppHandle, safe: bool) -> Result<bool> {
        // Local Clean Check
        let local_config = CONFIG.lock().clone();
        let local_last_sync = local_config.last_sync.unwrap_or_default();
        if safe && local_config.last_updated <= local_last_sync {
            warn!(
                "Local clean (updated {} <= sync {}), skip upload",
                local_config.last_updated, local_last_sync
            );
            return Ok(false);
        }

        let remote_config = self.get_remote_config().await?;
        if let Some(remote_config) = remote_config {
            // Remote Newer Check
            if safe && remote_config.last_updated > local_last_sync {
                warn!(
                    "Conflict detected! Remote ({}) > Local Base Sync ({}). Please pull first.",
                    remote_config.last_updated, local_last_sync
                );
                return Ok(false);
            }

            // Games times check
            if safe {
                local_config.check_games_time_compare(&remote_config, TimeCmp::GreaterOrEqual)?;
            }

            info!("diff:\n{}", utils::diff(&remote_config, &local_config));
        } else {
            info!("remote config is null, uploading");
        }

        self.upload_config_inner(CONFIG_FILENAME).await?;
        info!("upload config success");
        // Update local last_sync
        {
            let mut locked_config = CONFIG.lock();
            locked_config.last_sync = Some(local_config.last_updated);
            locked_config.save_and_emit_no_update(app)?;
        }
        Ok(true)
    }

    /// Apply remote config to local config
    ///
    /// # Parameters
    ///
    /// - safe=true: will not apply config if local is dirty or remote config is
    ///   older
    ///
    /// # Returns
    ///
    /// - config, false: the old config if applied successfully
    /// - None, false: if check failed, not applied
    /// - None, true: if remote config is None
    async fn apply_remote_config(
        &self,
        app: &AppHandle,
        safe: bool,
    ) -> Result<(Option<Config>, bool)> {
        let remote_config_opt = self.get_remote_config().await?;
        // remote config is None, do nothing
        let Some(remote_config) = remote_config_opt else {
            return Ok((None, true));
        };

        let mut local_config = CONFIG.lock();
        let local_last_sync = local_config.last_sync.unwrap_or_default();

        // Local Clean Check
        if safe && local_config.last_updated > local_last_sync {
            warn!(
                "Local dirty (updated {} > sync {}), cannot overwrite. Please upload or revert first.",
                local_config.last_updated, local_last_sync
            );
            return Ok((None, false));
        }

        // Remote Newer Check
        if safe && remote_config.last_updated <= local_last_sync {
            warn!(
                "Remote not newer (remote {} <= sync {}), skip download.",
                remote_config.last_updated, local_last_sync
            );
            return Ok((None, false));
        }

        // Games times check
        if safe {
            local_config.check_games_time_compare(&remote_config, TimeCmp::LessOrEqual)?;
        }

        info!("Applying remote config...");

        let mut new_config = remote_config.clone();
        new_config.last_sync = Some(remote_config.last_updated);
        let old = std::mem::replace(&mut *local_config, new_config);
        local_config.save_and_emit_no_update(app)?;
        Ok((Some(old), false))
    }
}

pub trait BuildOperator {
    type CTX;
    fn get_operator(&self) -> Option<Box<dyn MyOperation + Send + Sync>>;
    /// Must ensure that `get_operator` is `Some` if `build_operator` is called
    fn build_operator(&self, ctx: &Self::CTX) -> Result<()>;
    fn remove_operator(&self);
    fn get_operator_or_init(&self, ctx: &Self::CTX) -> Result<Box<dyn MyOperation + Send + Sync>> {
        if let Some(op) = self.get_operator() {
            Ok(op)
        } else {
            self.build_operator(ctx)?;
            Ok(self.get_operator().unwrap())
        }
    }
}

impl BuildOperator for LocalConfig {
    type CTX = VarMap;
    fn get_operator(&self) -> Option<Box<dyn MyOperation + Send + Sync>> {
        self.operator
            .borrow()
            .as_ref()
            .map(|o| Box::new(o.clone()) as Box<dyn MyOperation + Send + Sync>)
    }
    fn build_operator(&self, ctx: &VarMap) -> Result<()> {
        let resolved = ctx.resolve_var(&self.path)?;
        let path = PathBuf::from(resolved);
        std::fs::create_dir_all(&path)?;
        let operator = Operator::new(
            services::Fs::default().root(path.as_os_str().to_str().ok_or(Error::InvalidPath)?),
        )?
        .layer(LoggingLayer::default())
        .finish();
        *self.operator.borrow_mut() = Some(LocalOperator(operator));
        Ok(())
    }
    fn remove_operator(&self) {
        *self.operator.borrow_mut() = None;
    }
}

impl BuildOperator for WebDavConfig {
    type CTX = AppHandle;
    fn get_operator(&self) -> Option<Box<dyn MyOperation + Send + Sync>> {
        self.operator
            .borrow()
            .as_ref()
            .map(|o| Box::new(o.clone()) as Box<dyn MyOperation + Send + Sync>)
    }
    fn build_operator(&self, ctx: &Self::CTX) -> Result<()> {
        let ctx = ctx.clone();
        let notify = move |err: &::opendal::Error, _dur: Duration| {
            log::warn!("webdav sync failed: {err}");
            ctx.emit("sync://failed", err.to_string()).unwrap();
        };

        let operator = Operator::new(
            services::Webdav::default()
                .endpoint(&self.endpoint)
                .username(&self.username)
                .password(self.password.as_deref().unwrap_or_default())
                .root(&self.root_path),
        )?
        .layer(
            TimeoutLayer::new()
                .with_io_timeout(IO_TIMEOUT)
                .with_timeout(NON_IO_TIMEOUT),
        )
        .layer(
            RetryLayer::new()
                .with_max_times(RETRY_TIMES)
                .with_max_delay(MAX_RETRY_DELAY)
                .with_jitter()
                .with_notify(notify),
        )
        .layer(LoggingLayer::default())
        .finish();
        *self.operator.borrow_mut() = Some(WebdavOperator(operator));
        Ok(())
    }

    fn remove_operator(&self) {
        *self.operator.borrow_mut() = None;
    }
}

impl BuildOperator for S3Config {
    type CTX = AppHandle;
    fn get_operator(&self) -> Option<Box<dyn MyOperation + Send + Sync>> {
        self.operator
            .borrow()
            .as_ref()
            .map(|o| Box::new(o.clone()) as Box<dyn MyOperation + Send + Sync>)
    }
    fn build_operator(&self, ctx: &Self::CTX) -> Result<()> {
        let ctx = ctx.clone();
        let notify = move |err: &::opendal::Error, _dur: Duration| {
            log::warn!("s3 sync failed: {err}");
            ctx.emit("sync://failed", err.to_string()).unwrap();
        };

        let operator = Operator::new(
            services::S3::default()
                .bucket(&self.bucket)
                .access_key_id(&self.access_key)
                .secret_access_key(&self.secret_key),
        )?
        .layer(
            TimeoutLayer::new()
                .with_io_timeout(IO_TIMEOUT)
                .with_timeout(NON_IO_TIMEOUT),
        )
        .layer(
            RetryLayer::new()
                .with_max_times(RETRY_TIMES)
                .with_max_delay(MAX_RETRY_DELAY)
                .with_jitter()
                .with_notify(notify),
        )
        .layer(LoggingLayer::default())
        .finish();
        *self.operator.borrow_mut() = Some(S3Operator(operator));
        Ok(())
    }

    fn remove_operator(&self) {
        *self.operator.borrow_mut() = None;
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use tempfile::tempdir;

    use super::*;

    #[tokio::test]
    async fn test_local_operator_basics() -> Result<()> {
        let game_id = 1;
        let archive_filename = "test.txt";

        // store the remote files
        let tmp_dir = tempfile::tempdir()?;
        let remote_path = tmp_dir.path().join("test");

        // store the local files
        let src_dir = tempfile::tempdir()?;
        let src_path = src_dir.path();
        let src_archive = src_path.join(game_id.to_string()).join(archive_filename);
        fs::create_dir(src_archive.parent().unwrap())?;
        fs::write(&src_archive, "test")?;

        let local_conf = LocalConfig {
            path: remote_path.to_string_lossy().to_string(),
            ..Default::default()
        };
        let op = local_conf.get_operator_or_init(&Default::default())?;

        // initial state
        let ls = op.list_archive(game_id).await.unwrap();
        assert_eq!(ls, Vec::<ArchiveInfo>::new());

        // upload
        op.upload_archive(game_id, archive_filename, src_path)
            .await
            .unwrap();
        let ls = op.list_archive(game_id).await.unwrap();
        assert_eq!(
            ls,
            vec![ArchiveInfo {
                name: archive_filename.to_string(),
                size: 4
            }]
        );

        // pull
        fs::remove_file(&src_archive)?;
        op.pull_archive(game_id, archive_filename, src_path)
            .await
            .unwrap();
        assert_eq!(fs::read_to_string(&src_archive)?, "test");

        op.delete_archive(game_id, archive_filename).await.unwrap();
        assert!(!remote_path.join("test").join("1").exists());

        Ok(())
    }

    async fn test_big_file(op: &(impl MyOperation + Send + Sync + ?Sized)) -> Result<()> {
        let game_id = 1;
        let archive_filename = "big_file.tar";

        let backup_dir = tempdir()?;
        let game_dir = backup_dir.path().join(game_id.to_string());
        fs::create_dir(&game_dir)?;
        let archive_path = game_dir.join(archive_filename);
        fs::write(&archive_path, [0; 20 * 1024 * 1024].as_ref())?;

        op.upload_archive(game_id, archive_filename, backup_dir.as_ref())
            .await
            .unwrap();
        let ls = op.list_archive(game_id).await.unwrap();
        dbg!(&ls);
        assert!(ls.iter().any(|s| s.name == archive_filename));

        fs::remove_file(&archive_path)?;
        op.pull_archive(game_id, archive_filename, backup_dir.as_ref())
            .await
            .unwrap();
        assert_eq!(fs::read(&archive_path)?, [0; 20 * 1024 * 1024].as_ref());

        Ok(())
    }

    #[tokio::test]
    async fn test_local_operator() -> Result<()> {
        let remote_dir = tempdir()?;
        let local_config = LocalConfig {
            path: remote_dir.path().to_string_lossy().to_string(),
            ..Default::default()
        };
        test_big_file(
            &*local_config
                .get_operator_or_init(&Default::default())
                .unwrap(),
        )
        .await
    }

    #[ignore = "please build a local webdav server yourself and run this test manually"]
    #[tokio::test]
    async fn test_webdav_operator() -> Result<()> {
        let op = Operator::new(
            services::Webdav::default()
                .endpoint("http://172.23.50.50:4918/webdav/")
                .username("webdav")
                .password("")
                .root("/test"),
        )?
        .finish();
        test_big_file(&op).await
    }
}
