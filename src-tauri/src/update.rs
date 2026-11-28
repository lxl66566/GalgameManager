//! App update check: asks GitHub for the latest release and compares it with
//! the running version. Check only — downloading and installing stay with the
//! user, via the release page.

use std::sync::LazyLock as Lazy;

use log::info;
use reqwest::header;
use semver::Version;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::{
    error::{Error, Result},
    http::HTTP_CLIENT,
};

/// GitHub API endpoint of the latest non-prerelease release, derived from
/// `Cargo.toml`'s `repository` so a fork keeps checking its own releases.
static LATEST_RELEASE_API: Lazy<String> = Lazy::new(|| {
    let repo = env!("CARGO_PKG_REPOSITORY").trim_start_matches("https://github.com/");
    format!("https://api.github.com/repos/{repo}/releases/latest")
});

/// The subset of GitHub's release payload the check reads.
#[derive(Debug, Deserialize)]
struct GithubRelease {
    tag_name: String,
    html_url: String,
}

/// Outcome of an update check.
#[derive(Debug, Serialize, TS)]
#[ts(export)]
// `rename_all` covers the variant names only; struct-variant fields need
// `rename_all_fields` to be camelCase on the wire too.
#[serde(
    tag = "type",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum UpdateStatus {
    /// The running version is the latest release.
    UpToDate { current: String },
    /// A newer release is published; `url` is its release page.
    Available {
        current: String,
        /// Release tag as published, e.g. `v1.5.0`.
        latest_version: String,
        url: String,
    },
}

/// Parse a release tag or `Cargo.toml` version (semver, optional leading `v`).
fn parse_version(s: &str) -> Result<Version> {
    let s = s.trim();
    // `strip_prefix`, not `trim_start_matches`: the latter would also eat a
    // second `v` and turn a malformed tag into a seemingly valid version.
    let bare = s.strip_prefix('v').unwrap_or(s);
    Version::parse(bare).map_err(|_| Error::InvalidVersion(s.to_string()))
}

/// Whether the release `tag` is newer than the running `current` version.
fn is_newer(current: &str, tag: &str) -> Result<bool> {
    Ok(parse_version(tag)? > parse_version(current)?)
}

/// Fetch the latest release and compare it with the running version.
pub async fn check_update() -> Result<UpdateStatus> {
    let api = LATEST_RELEASE_API.as_str();
    info!("[UpdateCheck] querying {api}");
    let release: GithubRelease = HTTP_CLIENT
        .get(api)
        .header(header::ACCEPT, "application/vnd.github+json")
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    let current = env!("CARGO_PKG_VERSION");
    info!(
        "[UpdateCheck] current {current}, latest release {}",
        release.tag_name
    );
    Ok(if is_newer(current, &release.tag_name)? {
        UpdateStatus::Available {
            current: current.to_string(),
            latest_version: release.tag_name,
            url: release.html_url,
        }
    } else {
        UpdateStatus::UpToDate {
            current: current.to_string(),
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tag_is_newer_only_when_version_is_greater() {
        assert!(is_newer("1.4.3", "v1.5.0").unwrap());
        assert!(!is_newer("1.4.3", "v1.4.3").unwrap());
        assert!(!is_newer("1.4.3", "v1.4.2").unwrap());
        // Missing `v` prefix and surrounding whitespace are tolerated.
        assert!(is_newer("1.4.3", " 1.5.0 ").unwrap());
    }

    #[test]
    fn prerelease_tags_follow_semver_ordering() {
        // Numeric identifiers compare numerically, not lexically.
        assert!(is_newer("1.5.0-beta.2", "v1.5.0-beta.10").unwrap());
        // A prerelease sorts below the release it precedes.
        assert!(is_newer("1.5.0-rc.1", "v1.5.0").unwrap());
        assert!(!is_newer("1.5.0", "v1.5.0-rc.1").unwrap());
    }

    #[test]
    fn unparseable_tag_is_an_error() {
        assert!(matches!(
            is_newer("1.4.3", "latest"),
            Err(Error::InvalidVersion(_))
        ));
    }

    #[test]
    fn wire_format_is_a_tagged_camel_case_union() {
        let status = UpdateStatus::Available {
            current: "1.4.3".to_string(),
            latest_version: "v1.5.0".to_string(),
            url: "https://github.com/lxl66566/GalgameManager/releases/tag/v1.5.0".to_string(),
        };
        assert_eq!(
            serde_json::to_value(&status).unwrap(),
            serde_json::json!({
                "type": "available",
                "current": "1.4.3",
                "latestVersion": "v1.5.0",
                "url": "https://github.com/lxl66566/GalgameManager/releases/tag/v1.5.0",
            })
        );
        assert_eq!(
            serde_json::to_value(UpdateStatus::UpToDate {
                current: "1.4.3".to_string()
            })
            .unwrap(),
            serde_json::json!({ "type": "upToDate", "current": "1.4.3" })
        );
    }
}
