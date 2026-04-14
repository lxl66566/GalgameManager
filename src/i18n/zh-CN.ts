import type { DeepPartial } from '.'
import type { RawDictionary } from './en-US'

// 使用 Partial<RawDictionary> 允许缺失字段
export const dict: DeepPartial<RawDictionary> = {
  sidebar: {
    game: '游戏',
    plugin: '插件',
    settings: '设置'
  },
  unit: {
    second: '秒',
    minute: '分钟',
    hour: '小时'
  },
  ui: {
    browse: '浏览',
    select: '选择',
    clear: '清除',
    delete: '删除',
    cancel: '取消',
    addFile: '添加文件',
    addFolder: '添加文件夹',
    rename: '重命名',
    confirm: '确定',
    save: '保存',
    pull: '下载',
    push: '上传',
    withdraw: '撤销',
    WIP: '开发中...',
    loading: '加载中...',
    interface: '界面',
    none: '无'
  },
  game: {
    sortType: {
      id: '默认',
      name: '名称',
      lastPlayed: '最近',
      playTime: '时长'
    },
    edit: {
      editTitle: '编辑游戏',
      addTitle: '添加新游戏',
      gameName: '游戏名称',
      exePath: '启动路径',
      savePath: '存档路径',
      imageUrl: '封面图片',
      addedTime: '添加时间',
      useTime: '游玩时长',
      lastPlayedTime: '最后游玩时间',
      deleteGame: '删除游戏',
      cancel: '取消',
      confirmSave: '保存更改',
      searchNotFound: '未找到封面',
      searchNotFoundMsg: '在 VNDB 未找到相关游戏封面',
      searchFailed: '搜索失败',
      searchFailedMsg: '获取 VNDB 封面出错',
      clickToSelectImage: '点击选择图片',
      imageUrlPlaceholder: 'https://... 或 C:/...',
      exePathPlaceholder: '选择可执行文件'
    },
    sync: {
      self: '存档管理',
      archiveNum: '个存档',
      noArchive: '暂无存档记录',
      recoverArchive: '恢复存档',
      upload: '上传到云端',
      download: '下载到本地',
      deleteLocalArchive: '删除本地存档',
      deleteRemoteArchive: '删除云端存档',
      local: '本',
      remote: '云',
      status: {
        LocalOnly: '仅本地',
        RemoteOnly: '仅云端',
        Synced: '已同步'
      },
      statusLong: {
        LocalOnly: '本地未上传',
        RemoteOnly: '云端未下载',
        Synced: '本地 & 云端'
      }
    },
    editGame: '编辑游戏',
    backupButtonHint: '备份存档并上传至远程',
    openSyncModal: '打开同步面板',
    clickToAdd: '点击添加',
    self: '游戏列表',
    orDrag: '或拖拽可执行文件至此',
    context: {
      openDir: '打开游戏目录'
    }
  },
  plugin: {
    title: '插件',
    noPlugins: '暂无已注册的插件',
    enabled: '已启用',
    disabled: '已禁用',
    metaConfig: '元配置',
    defaultConfig: '默认配置',
    defaultConfigDesc: '新游戏添加此插件时的默认配置值',
    version: '版本',
    author: '作者',
    links: '链接',
    expand: '展开',
    autoAdd: '自动添加到新游戏',
    collapse: '收起',
    pluginSection: '插件',
    addPlugin: '添加插件',
    removePlugin: '移除',
    moveUp: '上移',
    moveDown: '下移',
    noPluginsAdded: '未添加任何插件',
    pluginConfig: '插件配置',
    configEmpty: '无需配置',
    arch: '架构',
    archAuto: '自动检测',
    currentDir: '工作目录',
    currentDirDesc:
      '程序运行时的工作目录。命令中若以相对路径执行程序，则会从该目录开始查找程序',
    currentDirPlaceholder: '留空则使用游戏所在目录',
    needBraces: '命令必须包含 {} 占位符',
    execute: {
      name: '执行外部命令',
      description: '执行外部命令行程序',
      on: '执行时机',
      cmd: '命令',
      cmdPlaceholder: '例如 echo "Hello World"',
      env: '环境变量',
      addEnv: '添加环境变量',
      beforeGameStart: '游戏启动前',
      afterGameStart: '游戏启动后',
      gameExit: '游戏退出后',
      passExePath: '插入游戏路径',
      passExePathDesc: '将游戏路径作为参数，插入到命令中的 {} 占位符里',
      exitSignal: '退出信号',
      exitSignalDesc: '游戏退出后，发送信号给该插件启动的进程',
      exitSignalDescWin: '游戏退出后是否终止该外部进程',
      exitSignalNone: '无',
      exitSignalTerminate: '终止进程'
    },
    autoUpload: {
      name: '自动上传存档',
      description: '游戏退出时自动归档并上传存档'
    },
    gameWrapper: {
      name: '游戏启动包装',
      description: '用自定义命令替换游戏的启动方式',
      cmd: '命令',
      cmdPlaceholder: '例如 wrapper.exe "{}"',
      env: '环境变量',
      addEnv: '添加环境变量'
    },
    localeEmulator: {
      name: 'Locale Emulator',
      description: '通过转区启动游戏',
      cmd: '命令',
      cmdPlaceholder: '例如 your_path/LEProc.exe "{}"'
    },
    translator: {
      name: '翻译工具',
      description: '在游戏运行时启动翻译工具',
      cmd: '命令',
      cmdPlaceholder: '例如 your_translator.exe',
      onGameExit: '游戏退出后',
      onGameExitDesc: '游戏退出后是否关闭翻译工具？',
      exitNone: '不关闭',
      exitGraceful: '关闭',
      exitForce: '强制关闭'
    },
    voiceSpeedup: {
      name: 'SPEED UP!',
      description: '加速游戏音频播放',
      speed: '加速倍率',
      provider: '注入方式'
    },
    voiceZerointerrupt: {
      name: 'ZeroInterrupt',
      description: '阻止游戏打断语音（仅限 dsound 游戏）'
    }
  },
  settings: {
    self: '设置',
    tabs: {
      general: '通用',
      launch: '启动',
      device: '设备',
      appearance: '外观'
    },
    storage: {
      self: '云存储',
      none: '（未设置）',
      provider: '服务提供方',
      Endpoint: 'URL',
      Username: '用户名',
      Password: '密码',
      Root: '根目录',
      localPath: '本地文件夹路径',
      localStorage: '本地备份',
      ioTimeout: '传输超时',
      ioTimeoutDesc: '数据传输操作（上传/下载）的超时时间，单位：秒',
      nonIoTimeout: '操作超时',
      nonIoTimeoutDesc: '远端操作（列表/删除）的超时时间，单位：秒'
    },
    compression: {
      self: '归档',
      algorithm: '归档格式',
      level: '压缩级别'
    },
    config: {
      self: '配置',
      autoSyncInterval: '自动上传间隔',
      autoSyncIntervalDesc: '仅上传配置，不上传存档',
      autoSyncIntervalPlaceholder: '单位：秒，设为 0 禁用自动上传',
      inSecs: '（秒）',
      manualSync: '管理配置',
      forceOp: '强制上传/下载'
    },
    appearance: {
      theme: '主题'
    },
    launch: {
      timestat: '时长统计',
      precisionMode: '精确模式',
      precisionModeDesc: '开启后只计算游戏在前台游玩的时长（窗口焦点时长），仅限 Windows'
    },
    device: {
      deviceIdentity: '设备信息',
      deviceName: '设备名称',
      deviceNameAlias: '自定义设备别名',
      uuid: 'UUID',
      uuidDesc: '设备唯一标识',
      variables: '变量',
      variablesDesc: '定义此设备关联的变量，将插入到路径中的 {...} 模板中',
      addVariable: '添加变量',
      removeVariable: '移除变量',
      editVariableName: '编辑变量名称',
      editVariableValue: '编辑变量值',
      noVariablesDefined: '无变量',
      variableAlreadyExists: '变量已存在: '
    }
  },
  hint: {
    appliedNewConfig: '已应用远端最新配置',
    archiveExists: '存档已存在',
    archiveFailed: '归档失败: ',
    archiving: '正在归档: ',
    checkRemoteConfigFailed: '检查远端配置失败',
    configAutoUploadFailed: '配置自动上传失败',
    configAutoUploadSuccess: '配置自动上传成功',
    configUploadFailed: '配置上传失败',
    configUploadSuccess: '配置上传成功',
    deleteArchiveFailed: '删除关联的存档失败: ',
    deleteFailed: '删除失败: ',
    deleteGameAndRemote: '删除游戏和所有存档成功: ',
    deleteGameFailed: '删除游戏失败',
    deleteGameFailedConfirm: '仍然删除本地游戏？',
    deleteGameSuccess: '删除游戏成功: ',
    deleteSuccess: '删除成功: ',
    deleting: '正在删除: ',
    deletingLocalArchive: '正在删除本地存档: ',
    deletingRemoteArchive: '正在删除远程存档: ',
    doubleClickToEdit: '双击路径手动编辑',
    downloadFailed: '下载失败: ',
    downloading: '正在下载: ',
    downloadSuccess: '下载成功: ',
    exitAbnormally: ' 异常退出',
    failToGetSaveList: '获取存档列表失败: ',
    failToLoadLocalConfig: '加载本地配置失败',
    failToStart: ' 启动失败: ',
    forceUpdatedConfig: '成功下载并应用远端配置',
    isRunning: ' 正在运行',
    loadImageFailed: '加载图片失败: ',
    localIsTheNewest: '本地配置已是最新！',
    noPathPleaseAdd: '暂无路径，点击上方按钮添加',
    noSavePaths: '未添加存档路径',
    remoteConfigNotFound: '未找到远端配置',
    remoteNotConfigured: '远端存储未配置',
    renameFailed: '重命名失败: ',
    renameSuccess: '重命名成功',
    renaming: '正在重命名: ',
    restorePreviousConfigSuccess: '成功恢复到之前的配置',
    revertFailed: '恢复失败: ',
    reverting: '正在恢复存档: ',
    revertSuccess: '恢复成功: ',
    saveConfigFailed: '保存配置失败',
    selectSaveArchive: '选择存档文件/文件夹',
    supportVar: '支持插入花括号模板，类似 {变量名}',
    syncFailed: '同步失败: ',
    syncSuccess: '同步成功: ',
    uploadFailed: '上传失败: ',
    uploading: '正在上传: ',
    uploadSuccess: '上传成功: ',
    duplicateGameId: '疑似配置损坏: 检测到重复的游戏 ID! 请手动修复配置。',
    retryError: '发生错误，正在重试',
    openDirFailed: '打开游戏目录失败',
    exePathNotAbsolute: '游戏启动路径解析后不是绝对路径，可能导致启动失败'
  }
}
