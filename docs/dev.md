# 开发文档

需要安装 Rust 和 Bun。运行：

```sh
bun install
bun run tauri dev
```

## 配置

Config 存储在 `~/.config/GalgameManager/config.toml`。Rust 侧定义在 `src-tauri/src/db` 下的多个 .rs 文件里。TS 侧的 interface 由 ts-rs 自动生成，位于 `src-tauri/bindings` 下。
