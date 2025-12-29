# 开发文档

需要安装 Rust 和 Bun。运行：

```sh
bun install
bun run tauri dev
```

## 配置

Config 存储在 `~/.config/GalgameManager/config.toml`。Rust 侧定义在 `src-tauri/src/db` 下的多个 .rs 文件里。TS 侧的 interface 由 ts-rs 自动生成，位于 `src-tauri/bindings` 下。

## emit

所有 rust 端可能 emit 的事件如下：

| key                    | value  | description                              |
| ---------------------- | ------ | ---------------------------------------- |
| game://exit/{game_id}  | bool   | 游戏退出时触发（value 代表是否正常退出） |
| game://spawn/{game_id} | ()     | 游戏启动时触发                           |
| config://updated       | Config | Rust 侧更新配置时触发                    |
