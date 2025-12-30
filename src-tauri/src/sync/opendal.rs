use std::path::Path;

use crate::db::{Config, CONFIG};
use futures::{AsyncWriteExt, TryStreamExt as _};
use opendal::Operator;
use tokio::fs;
use tokio_util::compat::TokioAsyncReadCompatExt;

use crate::error::Result;

#[async_trait::async_trait]
impl super::MyOperation for Operator {
    async fn list_archive(&self, game_id: u32) -> Result<Vec<String>> {
        let path = format!("{}/", game_id);
        let mut lister = self.lister_with(&path).recursive(false).await?;
        let mut archives = vec![];
        let d = lister.try_next().await?;
        // empty dir
        if d.is_none() {
            return Ok(archives);
        }
        debug_assert_eq!(d.unwrap().path(), path);
        while let Some(e) = lister.try_next().await? {
            archives.push(e.path().strip_prefix(&path).unwrap_or(e.path()).to_string());
        }
        Ok(archives)
    }

    async fn upload_archive(
        &self,
        game_id: u32,
        archive_filename: String,
        backup_dir: &Path,
    ) -> Result<()> {
        // create game dir first, otherwise the upload will fail 409
        self.create_dir(&format!("{}/", game_id)).await?;

        let remote_path = format!("{}/{}", game_id, archive_filename);
        let uploader = self
            .writer_with(&remote_path)
            .chunk(4 * 1024 * 1024)
            .concurrent(8)
            .await?;
        let mut writer = uploader.into_futures_async_write();
        let archive_path = backup_dir.join(game_id.to_string()).join(archive_filename);
        let file = fs::File::open(archive_path).await?;
        futures::io::copy(file.compat(), &mut writer).await?;
        writer.close().await?;
        Ok(())
    }

    async fn delete_archive(&self, game_id: u32, archive_filename: String) -> Result<()> {
        let remote_path = format!("{}/{}", game_id, archive_filename);
        let mut deleter = self.deleter().await?;
        deleter.delete(remote_path).await?;
        Ok(())
    }

    async fn pull_archive(
        &self,
        game_id: u32,
        archive_filename: String,
        backup_dir: &Path,
    ) -> Result<()> {
        let remote_path = format!("{}/{}", game_id, archive_filename);
        let downloader = self
            .reader_with(&remote_path)
            .chunk(4 * 1024 * 1024)
            .concurrent(8)
            .await?;
        let archive_path = backup_dir.join(game_id.to_string()).join(archive_filename);
        let file = fs::File::create(archive_path).await?;
        futures::io::copy(
            downloader.into_futures_async_read(..).await?,
            &mut file.compat(),
        )
        .await?;
        Ok(())
    }

    async fn rename_archive(
        &self,
        game_id: u32,
        archive_filename: String,
        new_archive_filename: String,
    ) -> Result<()> {
        let remote_path = format!("{}/{}", game_id, archive_filename);
        let new_remote_path = format!("{}/{}", game_id, new_archive_filename);
        self.rename(&remote_path, &new_remote_path).await?;
        Ok(())
    }

    async fn upload_config(&self) -> Result<()> {
        let remote_path = "config.toml";
        let mut uploader = self
            .writer_with(remote_path)
            .chunk(4 * 1024 * 1024)
            .concurrent(8)
            .await?;
        let config_str = toml::to_string(&*CONFIG.lock()).unwrap();
        uploader.write(config_str).await?;
        Ok(())
    }

    async fn get_remote_config(&self) -> Result<Option<Config>> {
        let remote_path = "config.toml";
        let reader = match self
            .reader_with(remote_path)
            .chunk(4 * 1024 * 1024)
            .concurrent(8)
            .await
        {
            Ok(r) => r,
            Err(e) if e.kind() == opendal::ErrorKind::NotFound => return Ok(None),
            Err(e) => return Err(e.into()),
        };
        let buf = reader.read(..).await?;
        let new_config: Config = toml::from_slice(&buf.to_bytes())?;
        Ok(Some(new_config))
    }
}
