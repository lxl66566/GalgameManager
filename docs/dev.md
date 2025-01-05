# 开发文档

需要安装 Rust 和 Bun。运行：

```sh
bun install
bun run tauri:dev
```

## 数据库表

使用 SQLite 存储游戏数据。

### Config table

table name: `config`

| Name    | Type    | Description     |
| ------- | ------- | --------------- |
| id      | INTEGER | 主键 (Unique)   |
| config  | TEXT    | 配置数据 (JSON) |
| version | INTEGER | 配置版本        |

### Game table

table name: `game`

| Name            | Type             | Description                   |
| --------------- | ---------------- | ----------------------------- |
| id              | INTEGER          | 主键 (Unique)                 |
| name            | TEXT             | 游戏名称 (Unique)             |
| path            | TEXT             | 游戏可执行文件路径            |
| image_data      | BLOB             | 游戏图片数据 (Optional)       |
| image_mime_type | TEXT             | 游戏图片 MIME 信息 (Optional) |
| image_url       | TEXT             | 游戏图片 URL (Optional)       |
| time            | UNSIGNED BIG INT | 游戏时长(秒)                  |
| chain           | TEXT             | 游戏启动链 (Optional)         |

### Plugin table

table name: `plugin`

| Name       | Type    | Description                                                                                       |
| ---------- | ------- | ------------------------------------------------------------------------------------------------- |
| id         | INTEGER | 主键 (Unique)                                                                                     |
| name       | TEXT    | 插件名称 (Unique)                                                                                 |
| path       | TEXT    | 插件可执行文件路径                                                                                |
| sole_start | BOOLEAN | 是否为单一启动插件 (Optional)                                                                     |
| start_func | TEXT    | 启动函数。若 sole_start 为否，则使用该函数对游戏启动路径进行处理。返回新的启动 command (Optional) |
