export const dict = {
  sidebar: {
    game: 'Game',
    plugin: 'Plugin',
    settings: 'Settings'
  },
  unit: {
    second: 'second',
    minute: 'minute',
    hour: 'hour'
  },
  ui: {
    browse: 'Browse',
    select: 'Select',
    clear: 'Clear',
    delete: 'Delete',
    cancel: 'Cancel',
    addFile: 'Add File',
    addFolder: 'Add Folder',
    rename: 'Rename',
    confirm: 'Confirm',
    save: 'Save',
    pull: 'Pull',
    push: 'Push',
    withdraw: 'Withdraw',
    WIP: 'Wait in progress...',
    loading: 'Loading...',
    interface: 'Interface',
    none: 'None'
  },
  game: {
    sortType: {
      id: 'Default',
      name: 'Name',
      lastPlayed: 'Last Played',
      playTime: 'Play Time'
    },
    edit: {
      editTitle: 'Edit Game',
      addTitle: 'Add Game',
      gameName: 'Game Name',
      exePath: 'Executable Path',
      savePath: 'Save Path',
      imageUrl: 'Image Url',
      addedTime: 'Added Time',
      useTime: 'Use Time',
      lastPlayedTime: 'Last Played Time',
      deleteGame: 'Delete Game',
      cancel: 'Cancel',
      confirmSave: 'Save',
      searchNotFound: 'Cover Not Found',
      searchNotFoundMsg: 'No related game cover found on VNDB',
      searchFailed: 'Search Failed',
      searchFailedMsg: 'Error fetching VNDB cover',
      clickToSelectImage: 'Click to select image',
      imageUrlPlaceholder: 'https://... or C:/...',
      exePathPlaceholder: 'Select executable file'
    },
    sync: {
      self: 'Manage Archives',
      archiveNum: 'Archives',
      noArchive: 'No archive',
      recoverArchive: 'Recover Archive',
      upload: 'Upload to remote',
      download: 'Download to local',
      deleteLocalArchive: 'Delete Local Archive',
      deleteRemoteArchive: 'Delete Remote Archive',
      local: 'Lo',
      remote: 'Re',
      status: {
        LocalOnly: 'Local Only',
        RemoteOnly: 'Remote Only',
        Synced: 'Synced'
      },
      statusLong: {
        LocalOnly: 'Local Only',
        RemoteOnly: 'Remote Only',
        Synced: 'Synced'
      }
    },
    editGame: 'Edit Game Settings',
    backupButtonHint: 'Backup saves and push to remote',
    openSyncModal: 'Open Sync Panel',
    clickToAdd: 'Click to add',
    self: 'Game',
    orDrag: 'or drag executable file here',
    context: {
      openDir: 'Open Game Directory'
    }
  },
  plugin: {
    title: 'Plugins',
    noPlugins: 'No plugins registered',
    enabled: 'Enabled',
    disabled: 'Disabled',
    metaConfig: 'Meta Config',
    defaultConfig: 'Default Config',
    defaultConfigDesc: 'Default configuration values for new plugin instances on games',
    version: 'Version',
    author: 'Author',
    links: 'Links',
    expand: 'Expand',
    collapse: 'Collapse',
    autoAdd: 'Auto add to new games',
    pluginSection: 'Plugins',
    addPlugin: 'Add Plugin',
    removePlugin: 'Remove',
    moveUp: 'Move Up',
    moveDown: 'Move Down',
    noPluginsAdded: 'No plugins added to this game',
    pluginConfig: 'Plugin Config',
    configEmpty: 'No configuration needed',
    arch: 'Architecture',
    archAuto: 'Auto Detect',
    currentDir: 'Working Directory',
    currentDirDesc:
      'Working directory for the program. If the command contains a relative path, it will be resolved from this directory',
    currentDirPlaceholder: 'Defaults to game dir if empty',
    needBraces: 'Command must contain {} placeholder',
    execute: {
      name: 'Execute Command',
      description: 'Execute external CLI commands',
      on: 'Execute On',
      cmd: 'Command',
      cmdPlaceholder: 'e.g. echo "Hello World"',
      env: 'Environment Variables',
      addEnv: 'Add Variable',
      beforeGameStart: 'Before Game Start',
      afterGameStart: 'After Game Start',
      gameExit: 'On Game Exit',
      passExePath: 'Insert Executable Path',
      passExePathDesc: 'Insert game executable into {} in cmd',
      exitSignal: 'Exit Signal',
      exitSignalDesc:
        'Sends a signal to the spawned process by the plugin when the game exits',
      exitSignalDescWin: 'Whether to terminate the spawned process when the game exits',
      exitSignalNone: 'None',
      exitSignalTerminate: 'TerminateProcess'
    },
    autoUpload: {
      name: 'Auto Upload Saves',
      description: 'Automatically archive and upload game saves when the game exits'
    },
    gameWrapper: {
      name: 'Game Wrapper',
      description: 'Replace the game launch command with a custom one',
      cmd: 'Command',
      cmdPlaceholder: 'e.g. wrapper.exe "{}"',
      env: 'Environment Variables',
      addEnv: 'Add Variable'
    },
    localeEmulator: {
      name: 'Locale Emulator',
      description: 'Run the game through Locale Emulator',
      cmd: 'Command',
      cmdPlaceholder: 'e.g. your_path/LEProc.exe "{}"'
    },
    translator: {
      name: 'Translator',
      description: 'Run translation tool on game start',
      cmd: 'Command',
      cmdPlaceholder: 'e.g. your_translator.exe',
      onGameExit: 'On Game Exit',
      onGameExitDesc: 'Whether to close the translator when the game exits',
      exitNone: "Don't close",
      exitGraceful: 'Close',
      exitForce: 'Force Close'
    },
    voiceSpeedup: {
      name: 'SPEED UP!',
      description: 'Accelerate game audio playback',
      speed: 'Speed Multiplier',
      provider: 'Provider'
    },
    voiceZerointerrupt: {
      name: 'ZeroInterrupt',
      description: 'Prevent voice interruption in games (dsound games only)'
    }
  },
  settings: {
    self: 'Settings',
    tabs: {
      general: 'General',
      launch: 'Launch',
      device: 'Device',
      appearance: 'Appearance'
    },
    storage: {
      self: 'Storage backend',
      none: '(Not set)',
      provider: 'Provider',
      Endpoint: 'Endpoint',
      Username: 'Username',
      Password: 'Password',
      Root: 'Root',
      localPath: 'Local Dir Path',
      localStorage: 'Local Storage',
      ioTimeout: 'Transfer Timeout',
      ioTimeoutDesc:
        'Timeout for data transfer operations (upload / download), in seconds',
      nonIoTimeout: 'Operation Timeout',
      nonIoTimeoutDesc: 'Timeout for remote operations (list / delete), in seconds'
    },
    compression: {
      self: 'Archive',
      algorithm: 'Archive Format',
      level: 'Compression Level'
    },
    config: {
      self: 'Config',
      autoSyncInterval: 'Config Auto Sync Interval',
      autoSyncIntervalDesc: 'Upload config only, not saves',
      autoSyncIntervalPlaceholder: 'seconds, 0 to disable',
      inSecs: 'In seconds',
      manualSync: 'Manual Syncing',
      forceOp: 'Forced Operation'
    },
    appearance: {
      theme: 'Theme'
    },
    launch: {
      timestat: 'Time Stat',
      precisionMode: 'Precision Mode',
      precisionModeDesc:
        'Only count time spent in foreground when window is focused. (Windows only)'
    },
    device: {
      deviceIdentity: 'Device Identity',
      deviceName: 'Device Name',
      deviceNameAlias: 'Friendly name for this machine',
      uuid: 'UUID',
      uuidDesc: 'Unique ID for sync identification',
      variables: 'Variables',
      variablesDesc:
        'Define variables for current device. This will be inserted into template paths.',
      addVariable: 'Add Variable',
      removeVariable: 'Remove Variable',
      editVariableName: 'Edit Variable Name',
      editVariableValue: 'Edit Variable Value',
      noVariablesDefined: 'No variables defined.',
      variableAlreadyExists: 'Variable already exists: '
    }
  },
  hint: {
    appliedNewConfig: 'Applied remote configuration',
    archiveExists: 'Archive already exists',
    archiveFailed: 'Archive failed: ',
    archiving: 'Archiving: ',
    checkRemoteConfigFailed: 'Failed to check remote config',
    configAutoUploadFailed: 'Config auto upload failed',
    configAutoUploadSuccess: 'Config auto upload successfully',
    configUploadFailed: 'Config upload failed',
    configUploadSuccess: 'Config upload successfully',
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
    remoteConfigNotFound: 'Remote config not found',
    remoteNotConfigured: 'Remote provider is not configured',
    renameFailed: 'Rename Failed: ',
    renameSuccess: 'Rename Success',
    renaming: 'Rename: ',
    restorePreviousConfigSuccess: 'Restored previous configuration',
    revertFailed: 'Revert Failed: ',
    reverting: 'Reverting: ',
    revertSuccess: 'Revert Success: ',
    saveConfigFailed: 'Failed to save config',
    selectSaveArchive: 'Select save archive file/folder',
    supportVar: 'support template like {var_name}',
    syncFailed: 'Sync Failed: ',
    syncSuccess: 'Sync Success',
    uploadFailed: 'Upload Failed: ',
    uploading: 'Uploading: ',
    uploadSuccess: 'Upload Success: ',
    duplicateGameId: 'CRITICAL: Duplicate game id detected!',
    retryError: 'An error occurred, retrying',
    openDirFailed: 'Failed to open game directory',
    exePathNotAbsolute:
      'Resolved executable path is not absolute, which may cause launch failure',
    pathNotExist: 'Path does not exist on this device',
    partialPathNotExist: 'Partial path does not exist on this device'
  }
}

export type RawDictionary = typeof dict
