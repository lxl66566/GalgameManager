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
    withdraw: '撤销'
  },
  game: {
    edit: {
      editTitle: '编辑游戏信息',
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
      confirmSave: '保存更改'
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
    orDrag: '或拖拽可执行文件至此'
  },
  plugin: {},
  settings: {
    self: '设置',
    tabs: {
      storageSync: '存储与同步',
      device: '设备',
      appearance: '外观'
    },
    storage: {
      self: '云存储后端',
      none: '（未设置）',
      provider: '服务提供方',
      Endpoint: 'URL',
      Username: '用户名',
      Password: '密码',
      Root: '根目录',
      localPath: '本地文件夹路径',
      localStorage: '本地备份'
    },
    compression: {
      self: '归档',
      algorithm: '归档格式',
      level: '压缩级别'
    },
    config: {
      self: '配置',
      autoSyncInterval: '自动上传间隔',
      autoSyncIntervalDesc: '仅上传配置，暂不支持自动存档同步',
      inSecs: '（秒）',
      manualSync: '管理配置',
      forceOp: '强制上传/下载'
    },
    appearance: {
      theme: '主题（暂不可用）'
    },
    device: {
      deviceIdentity: '设备信息',
      deviceName: '设备名称',
      deviceNameAlias: '自定义设备别名',
      uuid: 'UUID',
      uuidDesc: '设备唯一标识',
      variables: '变量',
      variablesDesc: '定义此设备关联的变量，将插入到路径中的 {name} 占位符中',
      addVariable: '添加变量',
      removeVariable: '移除变量',
      editVariableName: '编辑变量名称',
      editVariableValue: '编辑变量值',
      noVariablesDefined: '无变量',
      variableAlreadyExists: '变量已存在: '
    }
  },
  WIP: '开发中...',
  loading: '加载中...',
  hint: {
    supportVar: '支持插入花括号模板，类似 {变量名}',
    remoteNotConfigured: '远端存储未配置',
    selectSaveArchive: '选择存档文件/文件夹',
    noPathPleaseAdd: '暂无路径，点击上方按钮添加',
    doubleClickToEdit: '双击路径手动编辑',
    loadImageFailed: '加载图片失败: ',
    isRunning: ' 正在运行',
    exitAbnormally: ' 异常退出',
    failToStart: ' 启动失败: ',
    deleteGameAndRemote: '删除游戏和所有存档成功: ',
    deleteGameSuccess: '删除游戏成功: ',
    deleteGameFailed: '删除游戏失败',
    deleteArchiveFailed: '删除关联的存档失败: ',
    deleteGameFailedConfirm: '仍然删除本地游戏？',
    noSavePaths: '未添加存档路径',
    archiving: '正在归档: ',
    uploading: '正在上传: ',
    downloading: '正在下载: ',
    syncSuccess: '同步成功: ',
    syncFailed: '同步失败: ',
    failToGetSaveList: '获取存档列表失败: ',
    uploadSuccess: '上传成功: ',
    uploadFailed: '上传失败: ',
    downloadSuccess: '下载成功: ',
    downloadFailed: '下载失败: ',
    reverting: '正在恢复存档: ',
    revertFailed: '恢复失败: ',
    revertSuccess: '恢复成功: ',
    deletingRemoteArchive: '正在删除远程存档: ',
    deletingLocalArchive: '正在删除本地存档: ',
    deleting: '正在删除: ',
    deleteSuccess: '删除成功: ',
    deleteFailed: '删除失败: ',
    renaming: '正在重命名: ',
    renameSuccess: '重命名成功',
    renameFailed: '重命名失败: ',
    archiveExists: '存档已存在',
    appliedNewConfig: '已应用远端最新配置',
    restorePreviousConfigSuccess: '成功恢复到之前的配置',
    failToLoadLocalConfig: '加载本地配置失败',
    configUploadSuccess: '配置上传成功',
    configAutoUploadSuccess: '配置自动上传成功',
    configUploadFailed: '配置上传失败',
    configAutoUploadFailed: '配置自动上传失败'
  }
}
