use std::path::Path;

use crate::error::Result;
use futures::TryStreamExt as _;
use opendal::Operator;
use tokio::fs;
use tokio_util::compat::TokioAsyncReadCompatExt;

#[async_trait::async_trait]
impl super::MyOperation for Operator {
    async fn list_archive(&self, game_id: u32) -> Result<Vec<String>> {
        let path = format!("{}", game_id);
        let mut lister = self.lister_with(&path).recursive(true).await?;
        let mut archives = vec![];
        while let Some(e) = lister.try_next().await? {
            archives.push(e.path().to_string());
        }
        Ok(archives)
    }

    async fn upload_archive(
        &self,
        game_id: u32,
        archive_filename: String,
        backup_dir: &Path,
    ) -> Result<()> {
        let remote_path = format!("{}/{}", game_id, archive_filename);
        let uploader = self
            .writer_with(&remote_path)
            .chunk(4 * 1024 * 1024)
            .concurrent(8)
            .await?;
        let archive_path = backup_dir.join(game_id.to_string()).join(archive_filename);
        let file = fs::File::open(archive_path).await?;
        futures::io::copy(file.compat(), &mut uploader.into_futures_async_write()).await?;
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
}
