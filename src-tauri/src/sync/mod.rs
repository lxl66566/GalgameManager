mod opendal;
use std::path::{Path, PathBuf};

use ::opendal::{services, Operator};
pub use opendal::{LocalOperator, S3Operator, WebdavOperator};

use crate::{
    db::{
        device::{ResolveVar, VarMap},
        settings::{LocalConfig, S3Config, WebDavConfig},
        Config, CONFIG,
    },
    error::{Error, Result},
};

#[async_trait::async_trait]
pub trait MyOperation {
    #[inline]
    fn chunkable(&self) -> bool {
        false
    }
    fn inner(&self) -> &Operator;
    #[inline]
    async fn list_archive(&self, game_id: u32) -> Result<Vec<String>> {
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
    async fn upload_config(&self, filename: &str) -> Result<()> {
        self.inner().upload_config(filename).await
    }
    #[inline]
    async fn get_remote_config(&self) -> Result<Option<Config>> {
        self.inner().get_remote_config().await
    }
    /// Only upload config if remote config is older than local config
    ///
    /// # Returns
    ///
    /// bool indicates whether config really uploaded
    async fn upload_config_safe(&self, filename: &str) -> Result<bool> {
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
        self.upload_config(filename).await?;
        Ok(true)
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
        .finish();
        *self.operator.borrow_mut() = Some(LocalOperator(operator));
        Ok(())
    }
    fn remove_operator(&self) {
        *self.operator.borrow_mut() = None;
    }
}

impl BuildOperator for WebDavConfig {
    type CTX = ();
    fn get_operator(&self) -> Option<Box<dyn MyOperation + Send + Sync>> {
        self.operator
            .borrow()
            .as_ref()
            .map(|o| Box::new(o.clone()) as Box<dyn MyOperation + Send + Sync>)
    }
    fn build_operator(&self, _ctx: &Self::CTX) -> Result<()> {
        let operator = Operator::new(
            services::Webdav::default()
                .endpoint(&self.endpoint)
                .username(&self.username)
                .password(self.password.as_deref().unwrap_or_default())
                .root(&self.root_path),
        )?
        .finish();
        *self.operator.borrow_mut() = Some(WebdavOperator(operator));
        Ok(())
    }

    fn remove_operator(&self) {
        *self.operator.borrow_mut() = None;
    }
}

impl BuildOperator for S3Config {
    type CTX = ();
    fn get_operator(&self) -> Option<Box<dyn MyOperation + Send + Sync>> {
        self.operator
            .borrow()
            .as_ref()
            .map(|o| Box::new(o.clone()) as Box<dyn MyOperation + Send + Sync>)
    }
    fn build_operator(&self, _ctx: &Self::CTX) -> Result<()> {
        let operator = Operator::new(
            services::S3::default()
                .bucket(&self.bucket)
                .access_key_id(&self.access_key)
                .secret_access_key(&self.secret_key),
        )?
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
        assert_eq!(ls, Vec::<String>::new());

        // upload
        op.upload_archive(game_id, archive_filename, src_path)
            .await
            .unwrap();
        let ls = op.list_archive(game_id).await.unwrap();
        assert_eq!(ls, vec![archive_filename]);

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
        assert!(ls.iter().any(|s| s == archive_filename));

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
