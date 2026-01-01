use std::{
    fs,
    path::{Path, PathBuf},
    sync::Arc,
};

use config_file2::{LoadConfigFile, StoreConfigFile};

use crate::{
    db::{Config, CONFIG},
    error::Result,
    utils::list_dir_all,
};

#[derive(Debug, Clone)]
pub struct LocalOperator(pub Arc<PathBuf>);

impl LocalOperator {
    pub fn new(path: PathBuf) -> Self {
        Self(Arc::new(path))
    }
}

#[async_trait::async_trait]
impl super::MyOperation for LocalOperator {
    async fn list_archive(&self, game_id: u32) -> Result<Vec<String>> {
        let remote_game_dir = self.0.join(game_id.to_string());
        if !remote_game_dir.exists() {
            return Ok(vec![]);
        }
        Ok(list_dir_all(remote_game_dir)?)
    }

    async fn upload_archive(
        &self,
        game_id: u32,
        archive_filename: &str,
        backup_dir: &Path,
    ) -> Result<()> {
        let game_src = backup_dir.join(game_id.to_string());
        let game_dst = self.0.join(game_id.to_string());
        fs::create_dir_all(&game_dst)?;
        dbg!(&game_src, &game_dst);
        fs::copy(
            game_src.join(archive_filename),
            game_dst.join(archive_filename),
        )?;
        Ok(())
    }

    async fn delete_archive(&self, game_id: u32, archive_filename: &str) -> Result<()> {
        let game_dst = self.0.join(game_id.to_string());
        fs::remove_file(game_dst.join(archive_filename))?;
        Ok(())
    }

    async fn delete_archive_all(&self, game_id: u32) -> Result<()> {
        let game_dst = self.0.join(game_id.to_string());
        fs::remove_dir_all(game_dst)?;
        Ok(())
    }

    async fn pull_archive(
        &self,
        game_id: u32,
        archive_filename: &str,
        backup_dir: &Path,
    ) -> Result<()> {
        let game_dst = self.0.join(game_id.to_string());
        let game_src = backup_dir.join(game_id.to_string());
        fs::create_dir_all(&game_src)?;
        fs::copy(
            game_dst.join(archive_filename),
            game_src.join(archive_filename),
        )?;
        Ok(())
    }

    async fn rename_archive(
        &self,
        game_id: u32,
        archive_filename: &str,
        new_archive_filename: &str,
    ) -> Result<()> {
        let game_dst = self.0.join(game_id.to_string());
        let game_src = game_dst.join(archive_filename);
        let new_game_src = game_dst.join(new_archive_filename);
        fs::rename(game_src, new_game_src)?;
        Ok(())
    }

    async fn upload_config(&self) -> Result<()> {
        let dst = self.0.join("config.toml");
        CONFIG.lock().store(&dst)?;
        println!("config stored to {:?}", dst);
        Ok(())
    }

    async fn get_remote_config(&self) -> Result<Option<Config>> {
        let src = self.0.join("config.toml");
        Ok(Config::load(src)?)
    }
}

#[cfg(test)]
mod tests {
    use super::{super::MyOperation, *};

    #[tokio::test]
    async fn test_local_operator() -> std::io::Result<()> {
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

        let op = LocalOperator::new(remote_path.clone());

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
}
