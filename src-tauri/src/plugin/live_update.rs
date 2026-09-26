//! Live plugin-config updates for running game sessions.
//!
//! A running session keeps its launch-time plugin snapshot: hooks already
//! ran, so config edits generally take effect on the *next* launch. Some
//! effects are mutable side channels that a plugin can still update in place
//! (e.g. VoiceSpeedup's persistent `SPEEDUP` env var); such plugins opt in
//! by implementing [`super::PluginHandler::on_live_update`].
//!
//! Wiring (see `bindings::patch_config`): collect under the config lock
//! *before* `Config::apply` (apply destroys the old values), then spawn the
//! dispatch after the lock is released so blocking platform work (e.g.
//! `wine regedit`) never stalls the save.

use indexmap::IndexMap;
use struct_patch::list::ListPatchOp;
use tauri::AppHandle;

use super::{PLUGIN_REGISTRY, wine};
use crate::{
    db::{Config, ConfigPatch},
    exec,
    plugin::{PluginConfig, PluginInstance, instance_config},
};

/// Context passed to [`super::PluginHandler::on_live_update`].
pub struct LiveUpdateCtx {
    pub app: AppHandle,
    pub game_id: u32,
    /// Wine prefix the session was launched with (snapshot from the
    /// pre-patch config); `None` when the game has no Wine plugin instance.
    /// Only meaningful under Wine — Windows handlers ignore it.
    pub wine_prefix: Option<String>,
    /// This plugin's instance configs before the patch, in list order.
    ///
    /// Plugin instances carry no stable id, so old/new cannot be paired
    /// per-instance (a reorder would silently mispair them). Each plugin
    /// instead defines its own aggregation over its whole group — e.g.
    /// VoiceSpeedup uses the last instance, matching how repeated
    /// `before_game_start` calls overwrite each other at launch.
    pub old: Vec<PluginConfig>,
    /// This plugin's instance configs after the patch, in list order.
    pub new: Vec<PluginConfig>,
}

/// One collected (game, plugin) diff. Opaque: only meaningful as input to
/// [`dispatch_live_updates`].
pub struct PendingLiveUpdate {
    game_id: u32,
    handler_key: &'static str,
    wine_prefix: Option<String>,
    old: Vec<PluginConfig>,
    new: Vec<PluginConfig>,
}

/// Detect plugin-config changes in `patch` that target a running session.
///
/// Must run **before** `Config::apply(patch)` — the old values are read from
/// `config`. `is_running` is injected to keep the diff logic testable
/// without a live game loop.
///
/// Skips:
/// - patches that don't touch the game's `plugins` (nothing can change),
/// - games that aren't running,
/// - plugin types disabled by the *pre-patch* metadatas — an approximation of the launch-time
///   state. A plugin already disabled at launch never created its persistent effects nor registered
///   their exit cleanup, so live-updating them would leak;
/// - groups whose serialized configs are unchanged (cheap whole-group compare, so unrelated edits —
///   e.g. a rename — don't wake any handler).
pub fn collect_live_updates(
    config: &Config,
    patch: &ConfigPatch,
    is_running: impl Fn(u32) -> bool,
) -> Vec<PendingLiveUpdate> {
    let mut pending = Vec::new();
    for op in &patch.games {
        let ListPatchOp::Modify { id, value } = op else {
            continue;
        };
        let Some(new_plugins) = value.plugins.as_ref() else {
            continue;
        };
        if !is_running(*id) {
            continue;
        }
        let Some(game) = config.games.iter().find(|g| g.id == *id) else {
            continue;
        };

        // Group the game's enabled instances per plugin type, old and new.
        // Metas are read pre-patch on purpose — see the doc comment above.
        let mut groups: IndexMap<&'static str, (Vec<PluginInstance>, Vec<PluginInstance>)> =
            IndexMap::new();
        for instance in &game.plugins {
            if config.plugin_metadatas.is_enabled(instance) {
                groups
                    .entry(instance.handler_key())
                    .or_default()
                    .0
                    .push(instance.clone());
            }
        }
        for instance in new_plugins {
            if config.plugin_metadatas.is_enabled(instance) {
                groups
                    .entry(instance.handler_key())
                    .or_default()
                    .1
                    .push(instance.clone());
            }
        }

        let wine_prefix = wine::wine_prefix_for_config(config, *id);
        for (key, (old, new)) in groups {
            if instances_equal(&old, &new) {
                continue;
            }
            pending.push(PendingLiveUpdate {
                game_id: *id,
                handler_key: key,
                wine_prefix: wine_prefix.clone(),
                old: old.iter().map(instance_config).collect(),
                new: new.iter().map(instance_config).collect(),
            });
        }
    }
    pending
}

fn instances_equal(a: &[PluginInstance], b: &[PluginInstance]) -> bool {
    match (serde_json::to_value(a), serde_json::to_value(b)) {
        (Ok(a), Ok(b)) => a == b,
        // Serializing these plain data types can't realistically fail; treat
        // an error as "changed" so the handler still gets a look.
        _ => false,
    }
}

/// Push collected updates into their (still-)running sessions.
///
/// Re-checks `is_game_running`: the session may have exited while the config
/// lock was held, and its exit cleanup already reclaimed everything this
/// update would write. Handler errors are logged and don't abort the
/// remaining updates; handlers surface their own user-facing feedback.
pub async fn dispatch_live_updates(app: AppHandle, pending: Vec<PendingLiveUpdate>) {
    for update in pending {
        if !exec::is_game_running(update.game_id) {
            continue;
        }
        let Some(handler) = PLUGIN_REGISTRY.get(update.handler_key) else {
            continue;
        };
        let game_id = update.game_id;
        let handler_key = update.handler_key;
        let ctx = LiveUpdateCtx {
            app: app.clone(),
            game_id,
            wine_prefix: update.wine_prefix,
            old: update.old,
            new: update.new,
        };
        if let Err(e) = handler.on_live_update(ctx).await {
            log::warn!("on_live_update failed for plugin '{handler_key}' on game {game_id}: {e}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        db::{Game, GamePatch},
        plugin::config::{VoiceSpeedupGameConfig, WineGameConfig},
    };

    fn speedup(speed: f32) -> PluginInstance {
        PluginInstance::VoiceSpeedup {
            config: VoiceSpeedupGameConfig {
                speed,
                ..VoiceSpeedupGameConfig::default()
            },
        }
    }

    fn wine(prefix: &str) -> PluginInstance {
        PluginInstance::Wine {
            config: WineGameConfig {
                prefix: prefix.into(),
                ..WineGameConfig::default()
            },
        }
    }

    fn config_with_plugins(plugins: Vec<PluginInstance>) -> Config {
        Config {
            games: vec![Game {
                id: 7,
                plugins,
                ..Game::default()
            }],
            ..Config::default()
        }
    }

    fn plugins_patch(plugins: Vec<PluginInstance>) -> ConfigPatch {
        ConfigPatch {
            games: vec![ListPatchOp::Modify {
                id: 7,
                value: GamePatch {
                    plugins: Some(plugins),
                    ..GamePatch::default()
                },
            }],
            ..ConfigPatch::default()
        }
    }

    fn effective_speeds(update: &PendingLiveUpdate) -> (Option<f32>, Option<f32>) {
        let pick = |group: &[PluginConfig]| {
            group.iter().rev().find_map(|c| match c {
                PluginConfig::VoiceSpeedup(config) => Some(config.speed),
                _ => None,
            })
        };
        (pick(&update.old), pick(&update.new))
    }

    #[test]
    fn dispatches_speed_change_for_running_game() {
        let config = config_with_plugins(vec![speedup(1.5)]);
        let pending = collect_live_updates(&config, &plugins_patch(vec![speedup(2.0)]), |_| true);
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].game_id, 7);
        assert_eq!(pending[0].handler_key, "voiceSpeedup");
        assert_eq!(effective_speeds(&pending[0]), (Some(1.5), Some(2.0)));
    }

    #[test]
    fn skips_not_running_game() {
        let config = config_with_plugins(vec![speedup(1.5)]);
        let pending = collect_live_updates(&config, &plugins_patch(vec![speedup(2.0)]), |_| false);
        assert!(pending.is_empty());
    }

    #[test]
    fn skips_patch_without_plugins() {
        let config = config_with_plugins(vec![speedup(1.5)]);
        let patch = ConfigPatch {
            games: vec![ListPatchOp::Modify {
                id: 7,
                value: GamePatch::default(),
            }],
            ..ConfigPatch::default()
        };
        let pending = collect_live_updates(&config, &patch, |_| true);
        assert!(pending.is_empty());
    }

    #[test]
    fn skips_unchanged_group() {
        let config = config_with_plugins(vec![speedup(1.5)]);
        let pending = collect_live_updates(&config, &plugins_patch(vec![speedup(1.5)]), |_| true);
        assert!(pending.is_empty());
    }

    #[test]
    fn skips_disabled_plugin() {
        let mut config = config_with_plugins(vec![speedup(1.5)]);
        config.plugin_metadatas.voice_speedup.enabled = false;
        let pending = collect_live_updates(&config, &plugins_patch(vec![speedup(2.0)]), |_| true);
        assert!(pending.is_empty());
    }

    #[test]
    fn groups_per_plugin_type() {
        let config = config_with_plugins(vec![speedup(1.5), wine("/p")]);
        let pending = collect_live_updates(
            &config,
            &plugins_patch(vec![wine("/q"), speedup(1.8)]),
            |_| true,
        );
        let keys: Vec<_> = pending.iter().map(|p| p.handler_key).collect();
        assert_eq!(keys.len(), 2);
        assert!(keys.contains(&"voiceSpeedup"));
        assert!(keys.contains(&"wine"));
    }

    #[test]
    fn skips_plugin_type_without_change() {
        let config = config_with_plugins(vec![speedup(1.5), wine("/p")]);
        let pending = collect_live_updates(
            &config,
            &plugins_patch(vec![wine("/p"), speedup(1.8)]),
            |_| true,
        );
        // Only the voiceSpeedup group changed; the identical wine group is
        // short-circuited.
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].handler_key, "voiceSpeedup");
    }

    #[test]
    fn snapshots_wine_prefix_from_pre_patch_config() {
        let config = config_with_plugins(vec![wine("/prefix"), speedup(1.5)]);
        let pending = collect_live_updates(
            &config,
            &plugins_patch(vec![wine("/prefix"), speedup(2.0)]),
            |_| true,
        );
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].wine_prefix.as_deref(), Some("/prefix"));
    }

    #[test]
    fn unknown_game_id_is_ignored() {
        let config = config_with_plugins(vec![speedup(1.5)]);
        let patch = ConfigPatch {
            games: vec![ListPatchOp::Modify {
                id: 999,
                value: GamePatch {
                    plugins: Some(vec![speedup(2.0)]),
                    ..GamePatch::default()
                },
            }],
            ..ConfigPatch::default()
        };
        let pending = collect_live_updates(&config, &patch, |_| true);
        assert!(pending.is_empty());
    }
}
