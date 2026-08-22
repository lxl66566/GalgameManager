export const dict = {
  game: {
    backupButtonHint: 'Backup saves and push to remote',
    clickToAdd: 'Click to add',
    context: {
      copyName: 'Copy Game Name',
      openDir: 'Open Game Directory'
    },
    edit: {
      addedTime: 'Added Time',
      addTitle: 'Add Game',
      cancel: 'Cancel',
      clickToSelectImage: 'Click to select image',
      confirmSave: 'Save',
      deleteGame: 'Delete Game',
      editTitle: 'Edit Game',
      exePath: 'Executable Path',
      exePathPlaceholder: 'Select executable file',
      gameName: 'Game Name',
      imageUrl: 'Image Url',
      imageUrlPlaceholder: 'https://... or C:/...',
      lastPlayedTime: 'Last Played Time',
      savePath: 'Save Path',
      searchFailed: 'Search Failed',
      searchFailedMsg: 'Error fetching VNDB cover',
      searchNotFound: 'Cover Not Found',
      searchNotFoundMsg: 'No related game cover found on VNDB',
      useTime: 'Use Time'
    },
    editGame: 'Edit Game Settings',
    lastPlayedLabel: 'Last played: ',
    openSyncModal: 'Open Sync Panel',
    orDrag: 'or drag executable file here',
    playing: 'playing',
    self: 'Games',
    sessionDuration: 'Played for {{duration}}',
    sortType: {
      id: 'Default',
      lastPlayed: 'Last Played',
      name: 'Name',
      playTime: 'Play Time'
    },
    sync: {
      archiveNum: 'Archives',
      deleteLocalArchive: 'Delete Local Archive',
      deleteRemoteArchive: 'Delete Remote Archive',
      download: 'Download to local',
      local: 'Lo',
      noArchive: 'No archive',
      recoverArchive: 'Recover Archive',
      remote: 'Re',
      self: 'Manage Archives',
      status: {
        LocalOnly: 'Local Only',
        RemoteOnly: 'Remote Only',
        Synced: 'Synced'
      },
      statusLong: {
        LocalOnly: 'Local Only',
        RemoteOnly: 'Remote Only',
        Synced: 'Synced'
      },
      upload: 'Upload to remote'
    },
    totalPlayTime: 'Total play time'
  },
  hint: {
    appliedNewConfig: 'Applied remote configuration',
    archiveExists: 'Archive already exists',
    archiveFailed: 'Archive failed: ',
    archiving: 'Archiving: ',
    checkingRemoteConfig: 'Checking remote config...',
    checkRemoteConfigFailed: 'Failed to check remote config',
    configAutoUploadFailed: 'Config auto upload failed',
    configAutoUploadSuccess: 'Config auto upload successfully',
    configUploadConflict: 'Remote config is newer, cannot perform auto upload',
    configUploadFailed: 'Config upload failed',
    configUploadSuccess: 'Config upload successfully',
    copiedGameName: 'Copied game name',
    copyGameNameFailed: 'Failed to copy game name: ',
    deleteArchiveFailed: 'Delete related archives failed: ',
    deleteFailed: 'Delete Failed: ',
    deleteGameAndRemote: 'Delete game and all archives in remote successfully: ',
    deleteGameFailed: 'Delete game failed',
    deleteGameFailedConfirm: 'Still delete local game?',
    deleteGameSuccess: 'Delete game successfully: ',
    deleteSuccess: 'Delete Success: ',
    deleting: 'Deleting: ',
    deletingLocalArchive: 'Deleting local archive: ',
    deletingRemoteArchive: 'Deleting remote archive: ',
    doubleClickToEdit: 'Double click to edit the path',
    downloadFailed: 'Download Failed: ',
    downloading: 'Downloading: ',
    downloadSuccess: 'Download Success: ',
    dragFileHere: 'Drag executable file here to add game',
    duplicateGameId: 'CRITICAL: Duplicate game id detected!',
    exePathNotAbsolute:
      'Resolved executable path is not absolute, which may cause launch failure',
    exitAbnormally: ' exited abnormally',
    failToGetSaveList: 'Failed to get save list: ',
    failToLoadLocalConfig: 'Failed to load local configuration',
    failToStart: ' failed to start: ',
    forceUpdatedConfig: 'Force updated config from remote.',
    isRunning: ' is running',
    loadImageFailed: 'Failed to load image: ',
    localIsTheNewest: 'Local config is the newest!',
    noPathPleaseAdd: 'No path, please add one by clicking the button above',
    noSavePaths: 'No save paths defined',
    openDirFailed: 'Failed to open game directory',
    partialPathNotExist: 'Partial path does not exist on this device',
    pathNotExist: 'Path does not exist on this device',
    remoteConfigNotFound: 'Remote config not found',
    remoteNotConfigured: 'Remote provider is not configured',
    renameFailed: 'Rename Failed: ',
    renameRemoteFailedRollback:
      'Remote sync failed; local filename was restored. Error: ',
    renameRemoteRollbackFailed:
      'Critical: remote rename failed and local rollback failed. Please check the files manually. Remote: ',
    renameSuccess: 'Rename Success',
    renaming: 'Rename: ',
    resolveExeFailed: 'Failed to resolve game path (possibly an undefined variable)',
    restorePreviousConfigFailed: 'Failed to restore previous configuration',
    restorePreviousConfigSuccess: 'Restored previous configuration',
    retryError: 'An error occurred, retrying',
    revertFailed: 'Revert Failed: ',
    reverting: 'Reverting: ',
    revertSuccess: 'Revert Success: ',
    saveConfigFailed: 'Failed to save config',
    selectImageFailed: 'Failed to select image',
    selectSaveArchive: 'Select save archive file/folder',
    supportVar: 'support template like {var_name}',
    syncFailed: 'Sync Failed: ',
    syncSuccess: 'Sync Success',
    unknownVar: 'Unknown variable(s): ',
    uploadFailed: 'Upload Failed: ',
    uploading: 'Uploading: ',
    uploadSuccess: 'Upload Success: '
  },
  plugin: {
    addPlugin: 'Add Plugin',
    arch: 'Architecture',
    archAuto: 'Auto Detect',
    author: 'Author',
    autoAdd: 'Auto add to new games',
    autoUpload: {
      description: 'Automatically archive and upload game saves when the game exits',
      maxKept: 'Max Kept',
      maxKeptDesc:
        'Max number of saves to keep per game; oldest are evicted when exceeded (0 = unlimited)',
      name: 'Auto Upload Saves',
      retentionScope: 'Retention Scope',
      scopeBoth: 'Both',
      scopeLocal: 'Local Only',
      scopeRemote: 'Remote Only'
    },
    collapse: 'Collapse',
    configEmpty: 'No configuration needed',
    currentDir: 'Working Directory',
    currentDirDesc:
      'Working directory for the program. If the command contains a relative path, it will be resolved from this directory',
    currentDirPlaceholder: 'Defaults to game dir if empty',
    defaultConfig: 'Default Config',
    defaultConfigDesc: 'Default configuration values for new plugin instances on games',
    disabled: 'Disabled',
    enabled: 'Enabled',
    execute: {
      addEnv: 'Add Variable',
      afterGameStart: 'After Game Start',
      beforeGameStart: 'Before Game Start',
      cmd: 'Command',
      cmdPlaceholder: 'e.g. echo "Hello World"',
      description: 'Execute external CLI commands',
      env: 'Environment Variables',
      exitSignal: 'Exit Signal',
      exitSignalDesc:
        'Sends a signal to the spawned process by the plugin when the game exits',
      exitSignalDescWin: 'Whether to terminate the spawned process when the game exits',
      exitSignalNone: 'None',
      exitSignalTerminate: 'TerminateProcess',
      gameExit: 'On Game Exit',
      name: 'Execute Command',
      on: 'Execute On',
      passExePath: 'Insert Executable Path',
      passExePathDesc: 'Insert game executable into {} in cmd'
    },
    expand: 'Expand',
    gameWrapper: {
      addEnv: 'Add Variable',
      cmd: 'Command',
      cmdPlaceholder: 'e.g. wrapper.exe "{}"',
      description: 'Replace the game launch command with a custom one',
      env: 'Environment Variables',
      name: 'Game Wrapper'
    },
    links: 'Links',
    localeEmulator: {
      cmd: 'Command',
      cmdPlaceholder: 'e.g. your_path/LEProc.exe "{}"',
      description: 'Run the game through Locale Emulator',
      name: 'Locale Emulator'
    },
    metaConfig: 'Meta Config',
    moveDown: 'Move Down',
    moveUp: 'Move Up',
    needBraces: 'Command must contain {} placeholder',
    noPlugins: 'No plugins registered',
    noPluginsAdded: 'No plugins added to this game',
    pluginConfig: 'Plugin Config',
    pluginSection: 'Plugins',
    removePlugin: 'Remove',
    title: 'Plugins',
    translator: {
      cmd: 'Command',
      cmdPlaceholder: 'e.g. your_translator.exe',
      description: 'Run translation tool on game start',
      exitForce: 'Force Close',
      exitGraceful: 'Close',
      exitNone: "Don't close",
      name: 'Translator',
      onGameExit: 'On Game Exit',
      onGameExitDesc: 'Whether to close the translator when the game exits'
    },
    unavailableOnPlatform: 'Platform inactive',
    version: 'Version',
    voiceSpeedup: {
      description: 'Accelerate game audio playback',
      mmdevapiWarn:
        "MMDevAPI provider is unsupported on Linux/Wine. Use 'dsound' instead.",
      name: 'SPEED UP!',
      provider: 'Provider',
      speed: 'Speed Multiplier'
    },
    voiceZerointerrupt: {
      description: 'Prevent voice interruption in games (dsound games only)',
      name: 'ZeroInterrupt'
    },
    wine: {
      addDllOverride: 'Add Override',
      addEnv: 'Add Variable',
      arch: 'WINEARCH',
      archDesc:
        'Architecture of the Wine prefix (mainly used when creating a new prefix)',
      description: 'Run Windows games through Wine on Linux',
      dllOverrides: 'WINEDLLOVERRIDES',
      dllOverridesDesc:
        'Override which implementation Wine loads for each DLL (native, builtin, disabled, ...)',
      esync: 'WINEESYNC',
      esyncDesc:
        'Enables esync (sets WINEESYNC=1). Requires a compatible kernel and ulimit setup.',
      extraEnv: 'Extra Environment Variables',
      fsync: 'WINEFSYNC',
      fsyncDesc:
        'Enables fsync (sets WINEFSYNC=1). Requires a compatible kernel with futex2.',
      killWineserver: 'wineserver -k on Exit',
      killWineserverDesc:
        'Run `wineserver -k` after the game exits to tear down the prefix',
      locale: 'LC_ALL',
      localeDesc:
        'Sets the LC_ALL env var. Leave empty to skip it (uses the system locale). Example: ja_JP.UTF-8',
      localePlaceholder: 'ja_JP.UTF-8',
      name: 'Wine',
      prefix: 'WINEPREFIX',
      prefixDesc:
        'Sets the WINEPREFIX env var. Leave empty to skip it (Wine then uses its default ~/.wine). Supports ~ and {variables}',
      prefixPlaceholder: '~/.wine'
    },
    wineRequired: 'This plugin requires the Wine plugin to be enabled on Linux.'
  },
  settings: {
    appearance: {
      extractCoverColor: 'Extract Cover Color',
      extractCoverColorDesc:
        "Use each game's cover dominant color for statistics charts. Falls back to a deterministic palette when off.",
      statistics: {
        self: 'Statistics'
      },
      theme: 'Theme',
      themeDark: 'Dark',
      themeLight: 'Light',
      themeSystem: 'System Default',
      timeDisplay: {
        absoluteFormat: 'Absolute Pattern',
        absoluteFormatDesc: 'dayjs format string, e.g. "YYYY-MM-DD HH:mm"',
        absoluteFormatPlaceholder: 'YYYY-MM-DD HH:mm',
        format: 'Timestamp Format',
        formatAbsolute: 'Absolute',
        formatRelative: 'Relative',
        language: 'Timestamp Language',
        languageAuto: 'Follow UI language',
        languageDesc: 'Override the language used for "last played" timestamps',
        preview: 'Preview',
        self: 'Time Display'
      }
    },
    compression: {
      algorithm: 'Archive Format',
      level: 'Compression Level',
      self: 'Archive'
    },
    config: {
      autoSyncInterval: 'Config Auto Sync Interval',
      autoSyncIntervalDesc: 'Upload config only, not saves',
      autoSyncIntervalPlaceholder: 'seconds, 0 to disable',
      forceOp: 'Forced Operation',
      inSecs: 'In seconds',
      manualSync: 'Manual Syncing',
      self: 'Config'
    },
    device: {
      addVariable: 'Add Variable',
      deviceIdentity: 'Device Identity',
      deviceName: 'Device Name',
      deviceNameAlias: 'Friendly name for this machine',
      editVariableName: 'Edit Variable Name',
      editVariableValue: 'Edit Variable Value',
      loadingInfo: 'Loading device info...',
      notFound: 'Device not found.',
      noVariablesDefined: 'No variables defined.',
      removeVariable: 'Remove Variable',
      uuid: 'UUID',
      uuidDesc: 'Unique ID for sync identification',
      variableAlreadyExists: 'Variable already exists: ',
      variables: 'Variables',
      variablesDesc:
        'Define variables for current device. This will be inserted into template paths.'
    },
    launch: {
      clearDailyStat: 'Clear Daily Playtime Data',
      clearDailyStatDesc: 'Delete all game daily playtime records.',
      dailyStat: 'Daily Playtime Statistics',
      dailyStatCleared: 'Cleared all game daily playtime records.',
      dailyStatDesc: 'Track daily playtime and show the chart in the statistics page.',
      precisionMode: 'Precision Mode',
      precisionModeDesc: 'Only count time spent in foreground when window is focused.',
      timestat: 'Time Stat'
    },
    self: 'Settings',
    storage: {
      Endpoint: 'Endpoint',
      ioTimeout: 'Transfer Timeout',
      ioTimeoutDesc:
        'Timeout for data transfer operations (upload / download), in seconds',
      localPath: 'Local Dir Path',
      localStorage: 'Local Storage',
      none: '(Not set)',
      nonIoTimeout: 'Operation Timeout',
      nonIoTimeoutDesc: 'Timeout for remote operations (list / delete), in seconds',
      Password: 'Password',
      provider: 'Provider',
      Root: 'Root',
      s3AccessKey: 'Access Key',
      s3Bucket: 'Bucket Name',
      s3EndpointDesc: 'Leave empty for AWS',
      s3Region: 'Region',
      s3SecretKey: 'Secret Key',
      self: 'Storage backend',
      Username: 'Username'
    },
    tabs: {
      appearance: 'Appearance',
      device: 'Device',
      general: 'General',
      launch: 'Launch'
    }
  },
  sidebar: {
    game: 'Game',
    plugin: 'Plugin',
    settings: 'Settings',
    statistics: 'Statistics'
  },
  stats: {
    backToCurrent: 'Now',
    granularity: {
      month: 'Month',
      week: 'Week',
      year: 'Year'
    },
    jumpToDate: 'Pick a date to jump to its period',
    nextPeriod: 'Next period',
    noDataCurrent: () =>
      'No playtime data in this period. Start playing a game to see your statistics!',
    noDataInScope: 'No playtime in this period',
    noDataPast: 'No play records',
    perGameTitle: 'Per-game playtime',
    periodPlaytime: {
      current: {
        month: "This month's playtime",
        week: "This week's playtime",
        year: "This year's playtime"
      },
      other: {
        month: "That month's playtime",
        week: "That week's playtime",
        year: "That year's playtime"
      }
    },
    prevPeriod: 'Previous period',
    self: 'Statistics'
  },
  time: {
    daysAgo: '{{n}}d ago',
    hoursAgo: '{{n}}h ago',
    justNow: 'Just now',
    minutesAgo: '{{n}}m ago',
    monthsAgo: '{{n}}mo ago',
    never: 'Never',
    yearsAgo: '{{n}}y ago'
  },
  ui: {
    addFile: 'Add File',
    addFolder: 'Add Folder',
    browse: 'Browse',
    cancel: 'Cancel',
    clear: 'Clear',
    close: 'Close',
    confirm: 'Confirm',
    delete: 'Delete',
    interface: 'Interface',
    keyAlreadyExists: 'Key already exists',
    keyCannotBeEmpty: 'Key cannot be empty',
    loadFailed: 'Load Failed',
    loading: 'Loading...',
    none: 'None',
    pull: 'Pull',
    push: 'Push',
    rename: 'Rename',
    save: 'Save',
    select: 'Select',
    syncing: 'Syncing...',
    tabs: 'Tabs',
    WIP: 'Wait in progress...',
    withdraw: 'Withdraw'
  },
  unit: {
    hour: 'hour',
    hourShort: 'h',
    minute: 'minute',
    minuteShort: 'm',
    second: 'second',
    secondShort: 's'
  }
}

export type RawDictionary = typeof dict
