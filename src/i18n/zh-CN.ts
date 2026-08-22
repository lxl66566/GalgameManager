import { pickRandom } from '~/lib/utils'

import type { DeepPartial } from '.'
import type { RawDictionary } from './en-US'

// 使用 Partial<RawDictionary> 允许缺失字段
export const dict: DeepPartial<RawDictionary> = {
  game: {
    backupButtonHint: '备份存档并上传至远程',
    clickToAdd: '点击添加',
    context: {
      copyName: '复制游戏名',
      openDir: '打开游戏目录'
    },
    edit: {
      addedTime: '添加时间',
      addTitle: '添加新游戏',
      cancel: '取消',
      clickToSelectImage: '点击选择图片',
      confirmSave: '保存更改',
      deleteGame: '删除游戏',
      editTitle: '编辑游戏',
      exePath: '启动路径',
      exePathPlaceholder: '选择可执行文件',
      gameName: '游戏名称',
      imageUrl: '封面图片',
      imageUrlPlaceholder: 'https://... 或 C:/...',
      lastPlayedTime: '最后游玩时间',
      savePath: '存档路径',
      searchFailed: '搜索失败',
      searchFailedMsg: '获取 VNDB 封面出错',
      searchNotFound: '未找到封面',
      searchNotFoundMsg: '在 VNDB 未找到相关游戏封面',
      useTime: '游玩时长'
    },
    editGame: '编辑游戏',
    lastPlayedLabel: '上次游玩：',
    openSyncModal: '打开同步面板',
    orDrag: '或拖拽可执行文件至此',
    playing: '运行中',
    self: '游戏列表',
    sessionDuration: '游玩时长：{{duration}}',
    sortType: {
      id: '默认',
      lastPlayed: '最近',
      name: '名称',
      playTime: '时长'
    },
    sync: {
      archiveNum: '个存档',
      deleteLocalArchive: '删除本地存档',
      deleteRemoteArchive: '删除云端存档',
      download: '下载到本地',
      local: '本',
      noArchive: '暂无存档记录',
      recoverArchive: '恢复存档',
      remote: '云',
      self: '存档管理',
      status: {
        LocalOnly: '仅本地',
        RemoteOnly: '仅云端',
        Synced: '已同步'
      },
      statusLong: {
        LocalOnly: '本地未上传',
        RemoteOnly: '云端未下载',
        Synced: '本地 & 云端'
      },
      upload: '上传到云端'
    },
    totalPlayTime: '总游玩时长'
  },
  hint: {
    appliedNewConfig: '已应用远端最新配置',
    archiveExists: '存档已存在',
    archiveFailed: '归档失败: ',
    archiving: '正在归档: ',
    checkingRemoteConfig: '正在检查远端配置...',
    checkRemoteConfigFailed: '检查远端配置失败',
    configAutoUploadFailed: '配置自动上传失败',
    configAutoUploadSuccess: '配置自动上传成功',
    configUploadConflict: '远端配置比本地更新，无法自动上传',
    configUploadFailed: '配置上传失败',
    configUploadSuccess: '配置上传成功',
    copiedGameName: '已复制游戏名',
    copyGameNameFailed: '复制游戏名失败: ',
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
    dragFileHere: '拖拽可执行文件到此处以添加游戏',
    duplicateGameId: '疑似配置损坏: 检测到重复的游戏 ID! 请手动修复配置。',
    exePathNotAbsolute: '游戏启动路径解析后不是绝对路径，可能导致启动失败',
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
    openDirFailed: '打开游戏目录失败',
    partialPathNotExist: '部分路径在当前设备上不存在',
    pathNotExist: '路径在当前设备上不存在',
    remoteConfigNotFound: '未找到远端配置',
    remoteNotConfigured: '远端存储未配置',
    renameFailed: '重命名失败: ',
    renameSuccess: '重命名成功',
    renaming: '正在重命名: ',
    resolveExeFailed: '无法解析游戏路径（可能存在未定义的变量）',
    restorePreviousConfigFailed: '恢复之前的配置失败',
    restorePreviousConfigSuccess: '成功恢复到之前的配置',
    retryError: '发生错误，正在重试',
    revertFailed: '恢复失败: ',
    reverting: '正在恢复存档: ',
    revertSuccess: '恢复成功: ',
    saveConfigFailed: '保存配置失败',
    selectImageFailed: '选择图片失败',
    selectSaveArchive: '选择存档文件/文件夹',
    supportVar: '支持插入花括号模板，类似 {变量名}',
    syncFailed: '同步失败: ',
    syncSuccess: '同步成功: ',
    unknownVar: '未知变量: ',
    uploadFailed: '上传失败: ',
    uploading: '正在上传: ',
    uploadSuccess: '上传成功: '
  },
  plugin: {
    addPlugin: '添加插件',
    arch: '架构',
    archAuto: '自动检测',
    author: '作者',
    autoAdd: '自动添加到新游戏',
    autoUpload: {
      description: '游戏退出时自动归档并上传存档',
      maxKept: '最多保留',
      maxKeptDesc: '每个游戏最多保留的存档份数，超出时删除最旧的（0 表示不限制）',
      name: '自动上传存档',
      retentionScope: '清理范围',
      scopeBoth: '本地和远端',
      scopeLocal: '仅本地',
      scopeRemote: '仅远端'
    },
    collapse: '收起',
    configEmpty: '无需配置',
    currentDir: '工作目录',
    currentDirDesc:
      '程序运行时的工作目录。命令中若以相对路径执行程序，则会从该目录开始查找程序',
    currentDirPlaceholder: '留空则使用游戏所在目录',
    defaultConfig: '默认配置',
    defaultConfigDesc: '新游戏添加此插件时的默认配置值',
    disabled: '已禁用',
    enabled: '已启用',
    execute: {
      addEnv: '添加环境变量',
      afterGameStart: '游戏启动后',
      beforeGameStart: '游戏启动前',
      cmd: '命令',
      cmdPlaceholder: '例如 echo "Hello World"',
      description: '执行外部命令行程序',
      env: '环境变量',
      exitSignal: '退出信号',
      exitSignalDesc: '游戏退出后，发送信号给该插件启动的进程',
      exitSignalDescWin: '游戏退出后是否终止该外部进程',
      exitSignalNone: '无',
      exitSignalTerminate: '终止进程',
      gameExit: '游戏退出后',
      name: '执行外部命令',
      on: '执行时机',
      passExePath: '插入游戏路径',
      passExePathDesc: '将游戏路径作为参数，插入到命令中的 {} 占位符里'
    },
    expand: '展开',
    gameWrapper: {
      addEnv: '添加环境变量',
      cmd: '命令',
      cmdPlaceholder: '例如 wrapper.exe "{}"',
      description: '用自定义命令替换游戏的启动方式',
      env: '环境变量',
      name: '游戏启动包装'
    },
    links: '链接',
    localeEmulator: {
      cmd: '命令',
      cmdPlaceholder: '例如 your_path/LEProc.exe "{}"',
      description: '通过转区启动游戏',
      name: 'Locale Emulator'
    },
    metaConfig: '元配置',
    moveDown: '下移',
    moveUp: '上移',
    needBraces: '命令必须包含 {} 占位符',
    noPlugins: '暂无已注册的插件',
    noPluginsAdded: '未添加任何插件',
    pluginConfig: '插件配置',
    pluginSection: '插件',
    removePlugin: '移除',
    title: '插件',
    translator: {
      cmd: '命令',
      cmdPlaceholder: '例如 your_translator.exe',
      description: '在游戏运行时启动翻译工具',
      exitForce: '强制关闭',
      exitGraceful: '关闭',
      exitNone: '不关闭',
      name: '翻译工具',
      onGameExit: '游戏退出后',
      onGameExitDesc: '游戏退出后是否关闭翻译工具？'
    },
    unavailableOnPlatform: '当前平台不生效',
    version: '版本',
    voiceSpeedup: {
      description: '加速游戏音频播放',
      mmdevapiWarn: 'MMDevAPI 注入方式在 Linux/Wine 下不可用，请使用 dsound。',
      name: 'SPEED UP!',
      provider: '注入方式',
      speed: '加速倍率'
    },
    voiceZerointerrupt: {
      description: '阻止游戏打断语音（仅限 dsound 游戏）',
      name: 'ZeroInterrupt'
    },
    wine: {
      addDllOverride: 'Add Override',
      addEnv: 'Add Variable',
      arch: 'WINEARCH',
      archDesc: 'Wine prefix 的架构，主要用于首次创建 prefix 时',
      description: '在 Linux 上通过 Wine 运行 Windows 游戏',
      dllOverrides: 'WINEDLLOVERRIDES',
      dllOverridesDesc: '覆盖各 DLL 在 Wine 中的加载方式（native、builtin、disabled 等）',
      esync: 'WINEESYNC',
      esyncDesc: '启用 esync（设置 WINEESYNC=1）。需要兼容内核与正确的 ulimit 配置。',
      extraEnv: 'Extra Environment Variables',
      fsync: 'WINEFSYNC',
      fsyncDesc: '启用 fsync（设置 WINEFSYNC=1）。需要支持 futex2 的兼容内核。',
      killWineserver: 'wineserver -k on Exit',
      killWineserverDesc: '游戏退出后执行 `wineserver -k` 清理 prefix',
      locale: 'LC_ALL',
      localeDesc:
        '设置 LC_ALL 环境变量。留空则不设置（使用系统 locale）。示例: ja_JP.UTF-8',
      localePlaceholder: 'ja_JP.UTF-8',
      name: 'Wine',
      prefix: 'WINEPREFIX',
      prefixDesc:
        '设置 WINEPREFIX 环境变量。留空则不设置（Wine 将使用默认的 ~/.wine）。支持 ~ 和 {变量}',
      prefixPlaceholder: '~/.wine'
    },
    wineRequired: '此插件仅在 Linux Wine 下可用，请先添加 Wine 插件。'
  },
  settings: {
    appearance: {
      extractCoverColor: '封面提取主题色',
      extractCoverColorDesc: '在统计页使用从游戏封面提取的主题色；关闭后回退为随机取色',
      statistics: {
        self: '统计'
      },
      theme: '主题',
      themeDark: '深色',
      themeLight: '浅色',
      themeSystem: '跟随系统',
      timeDisplay: {
        absoluteFormat: '绝对时间模板',
        absoluteFormatDesc: 'dayjs format string，例如 "YYYY-MM-DD HH:mm"',
        absoluteFormatPlaceholder: 'YYYY-MM-DD HH:mm',
        format: '时间格式',
        formatAbsolute: '绝对时间',
        formatRelative: '相对时间',
        language: '时间语言',
        languageAuto: '跟随界面语言',
        languageDesc: '单独指定"上次游玩"时间的显示语言，不影响全局语言',
        preview: '预览',
        self: '时间显示'
      }
    },
    compression: {
      algorithm: '归档格式',
      level: '压缩级别',
      self: '归档'
    },
    config: {
      autoSyncInterval: '自动上传间隔',
      autoSyncIntervalDesc: '仅上传配置，不上传存档',
      autoSyncIntervalPlaceholder: '单位：秒，设为 0 禁用自动上传',
      forceOp: '强制上传/下载',
      inSecs: '（秒）',
      manualSync: '管理配置',
      self: '配置'
    },
    device: {
      addVariable: '添加变量',
      deviceIdentity: '设备信息',
      deviceName: '设备名称',
      deviceNameAlias: '自定义设备别名',
      editVariableName: '编辑变量名称',
      editVariableValue: '编辑变量值',
      loadingInfo: '正在加载设备信息...',
      notFound: '未找到设备。',
      noVariablesDefined: '无变量',
      removeVariable: '移除变量',
      uuid: 'UUID',
      uuidDesc: '设备唯一标识',
      variableAlreadyExists: '变量已存在: ',
      variables: '变量',
      variablesDesc: '定义此设备关联的变量，将插入到路径中的 {...} 模板中'
    },
    launch: {
      clearDailyStat: '清除每日游玩时长数据',
      clearDailyStatDesc: '删除所有游戏的每日游玩时长数据。',
      dailyStat: '每日游玩时长统计',
      dailyStatCleared: '已清除所有游戏的每日游玩时长数据。',
      dailyStatDesc: '记录每日游玩时长并在统计页展示',
      precisionMode: '精确模式',
      precisionModeDesc: '开启后只计算游戏在前台游玩的时长（窗口焦点时长）',
      timestat: '时长统计'
    },
    self: '设置',
    storage: {
      Endpoint: 'URL',
      ioTimeout: '传输超时',
      ioTimeoutDesc: '数据传输操作（上传/下载）的超时时间，单位：秒',
      localPath: '本地文件夹路径',
      localStorage: '本地备份',
      none: '（未设置）',
      nonIoTimeout: '操作超时',
      nonIoTimeoutDesc: '远端操作（列表/删除）的超时时间，单位：秒',
      Password: '密码',
      provider: '服务提供方',
      Root: '根目录',
      s3AccessKey: 'Access Key',
      s3Bucket: 'Bucket Name',
      s3EndpointDesc: '留空则使用 AWS',
      s3Region: 'Region',
      s3SecretKey: 'Secret Key',
      self: '云存储',
      Username: '用户名'
    },
    tabs: {
      appearance: '外观',
      device: '设备',
      general: '通用',
      launch: '启动'
    }
  },
  sidebar: {
    game: '游戏',
    plugin: '插件',
    settings: '设置',
    statistics: '统计'
  },
  stats: {
    backToCurrent: '回到本期',
    granularity: {
      month: '月',
      week: '周',
      year: '年'
    },
    jumpToDate: '选择日期，跳转到包含它的时段',
    nextPeriod: '下一期',
    noDataCurrent: () =>
      pickRandom([
        'Ciallo～(∠・ω< )',
        '去成为真正的旮旯给木高手吧！',
        '需要我给你三个选项吗？',
        'わたしも、高性能ですから！'
      ]),
    noDataInScope: '该时间段内暂无游玩记录',
    noDataPast: '无游玩记录',
    perGameTitle: '分游戏时长',
    periodPlaytime: {
      current: {
        month: '本月游玩时长',
        week: '本周游玩时长',
        year: '本年游玩时长'
      },
      other: {
        month: '当月游玩时长',
        week: '当周游玩时长',
        year: '当年游玩时长'
      }
    },
    prevPeriod: '上一期',
    self: '统计'
  },
  time: {
    daysAgo: '{{n}} 天前',
    hoursAgo: '{{n}} 小时前',
    justNow: '刚刚',
    minutesAgo: '{{n}} 分钟前',
    monthsAgo: '{{n}} 个月前',
    never: '永不',
    yearsAgo: '{{n}} 年前'
  },
  ui: {
    addFile: '添加文件',
    addFolder: '添加文件夹',
    browse: '浏览',
    cancel: '取消',
    clear: '清除',
    confirm: '确定',
    delete: '删除',
    interface: '界面',
    loading: '加载中...',
    none: '无',
    pull: '下载',
    push: '上传',
    rename: '重命名',
    save: '保存',
    select: '选择',
    WIP: '开发中...',
    withdraw: '撤销'
  },
  unit: {
    hour: '小时',
    hourShort: '小时',
    minute: '分钟',
    minuteShort: '分钟',
    second: '秒',
    secondShort: '秒'
  }
}
