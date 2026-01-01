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
    withdraw: 'Withdraw'
  },
  game: {
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
      confirmSave: 'Save'
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
    orDrag: 'or drag executable file here'
  },
  plugin: {},
  settings: {
    self: 'Settings',
    tabs: {
      storageSync: 'Storage & Sync',
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
      localStorage: 'Local Storage'
    },
    compression: {
      self: 'Archive',
      algorithm: 'Archive Format',
      level: 'Compression Level'
    },
    config: {
      self: 'Config',
      autoSyncInterval: 'Config Auto Sync Interval',
      autoSyncIntervalDesc: 'Config Only, not saves',
      inSecs: 'In seconds',
      manualSync: 'Manual Syncing',
      forceOp: 'Forced Operation'
    },
    appearance: {
      theme: 'Theme (WIP)'
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
  WIP: 'Wait in progress...',
  loading: 'Loading...',
  hint: {
    supportVar: 'support template like {var_name}',
    remoteNotConfigured: 'Remote provider is not configured',
    selectSaveArchive: 'Select save archive file/folder',
    noPathPleaseAdd: 'No path, please add one by clicking the button above',
    doubleClickToEdit: 'Double click to edit the path',
    loadImageFailed: 'Failed to load image: ',
    isRunning: ' is running',
    exitAbnormally: ' exited abnormally',
    failToStart: ' failed to start: ',
    deleteGameAndRemote: 'Delete game and all archives in remote successfully: ',
    deleteGameSuccess: 'Delete game successfully: ',
    deleteGameFailed: 'Delete game failed',
    deleteArchiveFailed: 'Delete related archives failed: ',
    deleteGameFailedConfirm: 'Still delete local game?',
    noSavePaths: 'No save paths defined',
    archiving: 'Archiving: ',
    uploading: 'Uploading: ',
    downloading: 'Downloading: ',
    syncSuccess: 'Sync Success',
    syncFailed: 'Sync Failed: ',
    failToGetSaveList: 'Failed to get save list: ',
    uploadSuccess: 'Upload Success: ',
    uploadFailed: 'Upload Failed: ',
    downloadSuccess: 'Download Success: ',
    downloadFailed: 'Download Failed: ',
    reverting: 'Reverting: ',
    revertFailed: 'Revert Failed: ',
    revertSuccess: 'Revert Success: ',
    deletingRemoteArchive: 'Deleting remote archive: ',
    deletingLocalArchive: 'Deleting local archive: ',
    deleting: 'Deleting: ',
    deleteSuccess: 'Delete Success: ',
    deleteFailed: 'Delete Failed: ',
    renaming: 'Rename: ',
    renameSuccess: 'Rename Success',
    renameFailed: 'Rename Failed: ',
    archiveExists: 'Archive already exists',
    appliedNewConfig: 'Applied remote configuration',
    restorePreviousConfigSuccess: 'Restored previous configuration',
    failToLoadLocalConfig: 'Failed to load local configuration',
    configUploadSuccess: 'Config upload successfully',
    configAutoUploadSuccess: 'Config auto upload successfully',
    configUploadFailed: 'Config upload failed',
    configAutoUploadFailed: 'Config auto upload failed',
    localIsTheNewest: 'Local config is the newest!',
    checkRemoteConfigFailed: 'Failed to check remote config',
    saveConfigFailed: 'Failed to save config'
  }
}

export type RawDictionary = typeof dict
