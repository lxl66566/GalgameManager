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

## 关于主题

v0.1.1 开始支持 light 主题，但是本人使用的是 dark，说不定哪天改 UI 会把 light 的 UI 改炸了。所以如果您遇到了不同主题下的问题，欢迎反馈。
