# GalgameManager

基于 Tauri 和 SolidJS 的游戏启动器，用于管理游戏平台之外的 Galgame 或其他游戏。

它可以做到：

- 跨设备同步配置与存档
  - 当前支持本地路径、WebDAV 和 S3 作为存储后端（如果有其他后端需求，可以提 issue）
  - 高效的压缩算法（squashfs + zstd，可调压缩级别）
  - 通过自定义变量，支持不同设备上使用不同路径
  - 自由的存档管理与恢复
- 游玩时长记录
- 多语言支持

## Screenshots

![主界面](./assets/main.png)
![游戏编辑](./assets/edit.png)
![存档管理](./assets/sync.png)

## TODO

- [x] 存档备份与同步
- [x] 游玩时长记录
- [x] i18n
- [ ] 插件系统与启动链
- [ ] 支持更多存储后端
- [ ] unix exec 优化

## [开发文档](./docs/dev.md)
