use std::{fs, path::PathBuf, sync::LazyLock as Lazy, time::Duration};

use base64::prelude::*;
use log::{debug, info};
use reqwest::{Client, header};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use ts_rs::TS;

use crate::error::Result;

pub static CACHE_DIR: Lazy<PathBuf> = Lazy::new(|| {
    let dir = home::home_dir()
        .expect("cannot find home dir on your OS!")
        .join(".cache")
        .join(env!("CARGO_PKG_NAME"));
    _ = fs::create_dir_all(&dir);
    dir
});

pub static IMAGE_CACHE_DIR: Lazy<PathBuf> = Lazy::new(|| {
    let dir = CACHE_DIR.join("images");
    _ = fs::create_dir_all(&dir);
    dir
});

static USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

pub static IMAGE_CLIENT: Lazy<Client> = Lazy::new(|| {
    let mut header_map = header::HeaderMap::with_capacity(1);
    header_map.insert(
        header::USER_AGENT,
        header::HeaderValue::from_static(USER_AGENT),
    );
    Client::builder()
        .connect_timeout(Duration::from_secs(3))
        .default_headers(header_map)
        .build()
        .unwrap()
});

#[derive(Clone, Debug, Default, Serialize, Deserialize, TS)]
#[ts(export)]
#[serde(rename_all = "camelCase")]
pub struct ImageData {
    pub base64: String,
    pub hash: String,
}

impl From<(bytes::Bytes, String)> for ImageData {
    fn from((bytes, hash): (bytes::Bytes, String)) -> Self {
        Self {
            base64: BASE64_STANDARD.encode(bytes),
            hash,
        }
    }
}

fn hash_image(bytes: &[u8]) -> String {
    let hash = Sha256::digest(bytes);
    hex::encode(hash)[..32].to_string()
}

pub async fn get_image(path_or_url: &str, hash: Option<&str>) -> Result<ImageData> {
    debug!("get image: {}, hash: {:?}", path_or_url, hash);
    if let Some(hash) = hash {
        let cache_path = IMAGE_CACHE_DIR.join(hash);
        if let Ok(bytes) = fs::read(&cache_path) {
            debug!("image cache hit: {}", cache_path.display());
            return Ok((bytes.into(), hash.to_string()).into());
        }
    }
    if !path_or_url.starts_with("http") {
        let bytes = fs::read(path_or_url)?;
        let hash = match hash {
            Some(hash) => hash.to_string(),
            None => hash_image(&bytes),
        };
        return Ok((bytes.into(), hash).into());
    }
    let bytes = download_image(path_or_url).await?;
    let hash = Sha256::digest(&bytes);
    let hash = hex::encode(hash)[..32].to_string();
    info!("downloaded image: {}, hash: {}", path_or_url, hash);
    fs::write(IMAGE_CACHE_DIR.join(&hash), &bytes)?;
    Ok((bytes, hash).into())
}

async fn download_image(url: &str) -> std::result::Result<bytes::Bytes, reqwest::Error> {
    IMAGE_CLIENT.get(url).send().await?.bytes().await
}
