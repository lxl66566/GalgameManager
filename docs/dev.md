# 开发文档

需要安装 Rust 和 Bun。运行：

```sh
bun install
bun run tauri dev
```

## 配置

配置存储在 `~/.config/GalgameManager/config.toml`。

类型定义：Rust 侧类型定义在 `src-tauri/src/db` 下的多个文件里。TS 侧的 interface 由 ts-rs 自动生成，生成位置为 `src-tauri/bindings`。

## emit

所有 rust 端可能 emit 的事件如下：

| key                    | value  | description                              |
| ---------------------- | ------ | ---------------------------------------- |
| game://exit/{game_id}  | bool   | 游戏退出时触发（value 代表是否正常退出） |
| game://spawn/{game_id} | ()     | 游戏启动时触发                           |
| config://updated       | Config | Rust 侧更新配置时触发                    |

## 测试

- 存档上传备份：仅测试了 local 和 webdav。如果您在使用 S3 或其他存储后端时遇到问题，欢迎反馈。

## features

用户可以开关 rust features，以控制某些应用行为。（需要自行编译）

- config-daily-backup（默认开启）：云端将存储 config 的每日快照。
