# GalgameManager

[简体中文](../README.md) | English

A game launcher based on Tauri + SolidJS, primarily designed for managing and playing Galgame.

- Synchronize configurations and saves across devices
  - Currently supports local paths, WebDAV, and S3 as storage backends (if you need other backends, feel free to open an issue)
  - Efficient compression algorithm (squashfs + zstd, adjustable compression level)
  - Support for different paths on different devices via custom variables
  - Flexible save management and restoration
- A powerful plugin system to customize behavior and additional features for different games
- Precise playtime tracking (track only window focus time)
- Logging system (with diff support), daily snapshots to ensure user data safety
- Multi-language / light & dark theme support

## Screenshots

![Main Interface](../assets/main.png)
![Game Edit](../assets/edit.png)
![Save Management](../assets/sync.png)
![Plugin Management](../assets/plugin.png)

## Changelog

### v1.1.0

- Transaction rollback mechanism: If the game or a subsequent plugin fails to start, the effects caused by previous plugins (DLLs, registry entries) will be rolled back
- When adding or pasting a path, automatically resolve it into variables
- Input box checks whether a path or variable actually exists, and displays a warning if it does not
- DLL backup to prevent overwriting existing files during extraction
- UI fixes: inconsistent input box sizes, inconsistent gaps, flickering when switching tabs on the first screen, missing speed multiplier value display
- UI improvements: button appearance optimization, automatic line wrapping for overly long variable edits

### v1.0.1

- Fix: Image cannot be displayed when image cache misses
- Fix: Executing relative path command did not start searching from the working directory
- Fix: Plugin input text loses focus
- Fix: Frequent writing to disk when input
- Distinguish between plugin startup failure and game startup failure
- Performance optimization

### v1.0.0

- (Major update) **Plugin system support**: Plugins are a set of predefined features by developers; users can apply plugins to games and modify parameters to customize additional functionalities. Initial plugins:
  - Execute external commands
  - Auto-upload saves
  - Game launch wrapper
  - Locale Emulator
  - Translation tools
  - SPEED UP! (audio acceleration)
  - ZeroInterrupt (non-interrupting voice)
- VNDB image search support
- Customizable transfer timeout (IO timeout) and operation timeout (non-IO timeout)
- Right-click context menu to open game directory
- Fix: Preserve seconds and nanoseconds when changing game duration to prevent auto-upload failure due to precision loss

### v0.1.5

- Critical fix: Configuration sync logic correction
  - Related fixes: duplicate configuration writes on startup, unintended updates to last_updated timestamp
- Fix: Image caching failure
- UI improvement: Treat image loading failures as minor errors
- Sync optimization: Upload support with timeout and retry

### v0.1.4

- Fix: Variable editor unable to input continuously
- Fix: Auto-upload configuration invalid while game is running
- Fix: Show error message when attempting to run a locally non-existent game
- Fix: Remove 0KB local backup file on backup failure

### v0.1.3

- Fix: Logic and interaction when remote configuration does not exist during auto-upload
- Fix: First-time save pull failure on new device
- Fix: Auto-upload configuration not taking effect
- Logging system
- Display file sizes in sync interface
- Automatically convert backslashes when adding games
- Set interval to 0 to disable auto-upload configuration
- UI optimization: scroll bars, disable sidebar dragging
- Interaction improvement: Notify user if configuration upload fails on exit
- Logic optimization: Change snapshot to copy

### v0.1.2

- Fix: Game "playing" status lost after page switch
- Support for more precise playtime tracking (Windows only)
- Default to system language
- Game sorting support

### v0.1.1

- Critical fix: Some games dependent on current directory failed to launch
- Fix: Last played time not auto-updating in frontend
- Fix: Delete local & remote saves when removing a game; add confirmation dialog for game deletion
- Auto-restore window size/position; prevent multiple launches
- Daily automatic configuration backup
- Expanded i18n coverage
- Light/dark theme switching support

### v0.1.0

- Save backup and restoration, upload and download
- Playtime tracking based on start and end times; child process tracking on Windows
- Device variable editing and resolution
- Image downloading and local caching
- Configuration backup with scheduled upload and upload on exit
- Auto-fetch latest configuration on startup with undo support
- Minimize to system tray
- i18n
