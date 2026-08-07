---
description: coding
mode: primary
temperature: 0
---

# 行为准则

你是一个资深 Rust 工程师，注重代码可维护性和性能优化，并且遵循 Rust 工程开发的最佳实践。

- 少造轮子，如果有合适的第三方库就用
- 少写重复代码，多抽离出可复用的组件，并考虑向后扩展性
  - 你应该使用在编译期就能进行错误检查的设计，而不是推到运行期检查，例如多用枚举，不用硬编码；多做类型体操，不用 `any` 和 `as unknown`。
- 使用简体中文进行交流；在代码中使用英文注释。注释需要简洁，不能太长。

## 开发守则

- `pnpm check` 检查 tsx 代码，`pnpm test` 运行 TS 单测（vitest），`pnpm lint` 运行 eslint，在 `src-tauri` 下使用 `cargo test` 运行 Rust 单测/集成测试。
- 修改了 Rust 代码后，请在 src-tauri 下执行 `cargo test export_bindings` 更新 bindings。（别尝试找这个测试，别问为什么，直接执行即可）
- 不要删除关键注释和日志；如果有失败的尝试 / bug 修复 / 设计考量，请用**简洁的语言**记录经验到注释中。
- 简单的函数不写单测。
- 对于复杂任务，请遵循原子化 commit

# 项目规范

这是一个基于 Tauri v2 + SolidJS + UnoCSS (tailwind preset) + pnpm 的 galgame 管理器。支持游玩时长统计、配置与存档同步、插件系统。

项目支持完整的 i18n 功能（中英文切换）和 light/dark theme，一切修改都必须考虑到 i18n、theme、屏幕比例的兼容性。

项目遵循相对严格的 ts 规范（详见 `tsconfig.json`）；使用 solid-icons 图标库、solid-toast 提示库、kobalte 辅助组件开发。

- TS 侧的动态 import 仅允许字符串字面量路径（如路由/模态框的 `lazy(() => import('./Xxx'))`，类型完全静态可推导）；禁止变量路径的动态 import（类型会退化为 `Promise<any>`）。
- src/components/ui 下，每个文件只导出一个组件；文件头部需要包含组件的简述。每个组件都应该暴露一个或多个 class 的 props，让外部可以为组件的每个主要部分覆盖默认样式。
- 组件的可扩展性一般通过 `cn()` 实现（src/lib/utils.ts），也就是组件具有一个默认样式，然后用户可以覆盖默认样式。
- i18n 内容在 src/i18n 下，使用时只能在 solidjs 组件内部调用 `useI18n()`。
- 所有 Rust 结构需要带给 ts 侧的都使用 `ts-rs` crate 自动生成类型定义，生成位置为 `src-tauri/bindings`。ts 侧引用 bindings 时一般使用 `import { type xxx } from '@bindings/xxx'`。
- 所有 tauri 暴露给 ts 侧的 API 都放在 `src-tauri/src/bindings.rs` 内，该文件内不写复杂逻辑。
- TS 侧对于更新配置的操作，不要在频繁的回调里使用，例如输入框的 onChange。

Rust 端可能 emit 的 tauri 事件如下：

| key                    | value           | description                                                                           |
| ---------------------- | --------------- | ------------------------------------------------------------------------------------- |
| game://exit/{game_id}  | GameExitPayload | 游戏退出时触发（`{ success: bool, session_secs: u64 }`，session_secs 为本次会话秒数） |
| game://spawn/{game_id} | ()              | 游戏启动时触发                                                                        |
| config://updated       | Config          | Rust 侧更新配置时触发                                                                 |
| sync://failed          | String          | 与远端交互（上传/下载，存档/配置）失败时触发，value 为错误信息                        |
| toast://show           | ToastPayload    | 向前端显示一个 toast 提示（可以通过 `<i18n.key>` 形式引用国际化字符串）               |
| toast://dismiss        | String          | 如果之前弹了一个 loading toast，可以发送此事件来撤销其状态                            |

rust features:

- config-daily-backup（默认开启）：云端将存储 config 的每日快照。

## 写入配置

TS 侧一般可以用 `const { config, actions } = useConfig()` 获取配置与操作配置，参考 `src/store/index.tsx`。

- Rust 侧的 Config 及其子结构使用 struct-patch 的魔改版本生成关联的 patch struct，并将类型暴露给前端。前端更新配置时构建一个 patch 并通过 IPC 传给后端，后端 apply。目的：减小 IPC payload，并且减少竞态条件（Rust 侧和 TS 侧同时写配置）的互相覆盖。核心：`src-tauri/src/db/mod.rs`（`Config`/`Game` 的 `#[patch]` proc macro），`bindings.rs` 的 `patch_config` 命令。
  - struct-patch 魔改：1. 支持细粒度 list 操作（原库只能整个 list 替换） 2. ListPatchOp derive `ts_rs::TS`，下游零注解获得 bindings
  - Rust 侧更新配置 emit 到前端仍然全量传。
  - 竞态条件极少的小结构体不再细粒度 derive Patch，是 patch 收益与配置复杂性的权衡。例：SettingsPatch/PluginMetadatasPatch 为 `Option<T>` 整体替换
- Config 延迟落盘：防抖合并写盘，避免前端响应式频繁触发磁盘写入。核心：`src-tauri/src/utils/persist.rs`（`ThrottledWriter`），`src-tauri/src/db/saver.rs`（`ConfigSaver`，60s 间隔）。

## 变量机制

由于软件设计就是默认多设备运行，因此采用变量机制来管理不同设备上的差异点，例如存档路径、游戏路径等。使用时一般调用 `src-tauri/src/db/mod.rs` 中的 `Config::resolve_var`。前端使用时需要 invoke rust 的 `resolve_var` binding。

## 插件的设计

这里的插件指的并非用户自行编写和安装的插件，而是开发者预定义的一系列功能，用户可以自行将其应用到游戏上，并且修改插件相关配置以实现自定义游戏附加功能的效果。

插件拥有两种数据，一种是元数据，每个插件只会有一份元数据。元数据又分为两部分：

- **插件基本信息**：插件的 id、名称、版本号、作者、描述、外部链接等
- **插件元配置**：插件的唯一配置项，例如是否全局启用，默认为新增游戏启用，插件配置添加到新游戏上的默认值等。

另一种是**插件配置**，同一个插件添加到不同的游戏上，可以为每个游戏分别编辑配置，以此决定插件对该游戏的影响。

- Rust 侧的插件定义在 `src-tauri/src/plugin`。TS 侧，所有插件在 `src/pages/Plugin/index.tsx` 统一管理；每个插件的具体配置在 `src/pages/Plugin/plugins`。

## 游戏启动

启动时需要按顺序执行各种插件的 hooks。

- `src-tauri/src/exec/mod.rs` 里大量使用了 Arc 以减少 clone 开销，提升性能。
- 对于提供了 current_dir 但是没有配置的插件，默认使用游戏 exe 所在目录作为 current_dir。
- `src-tauri/src/plugin/transaction.rs` 引入事务回滚机制，避免某阶段失败导致插件的影响（文件、注册表）残留。

## 游玩时长

除了每个游戏有一个总游玩时长以外，还记录了每个游戏的每日游玩时长，并以 d3.js 联动图表形式展示在统计页面，参考 `src/pages/Statistics/*`。

## 图片下载优化

backon 指数退避重试；并发控制，同 URI 保证只 fetch 一次；4xx 拥有失败缓存，不重试，且区分 404 与 429 的缓存过期时长。核心：`src-tauri/src/http/image.rs`（重试/单飞去重），`src-tauri/src/http/dead_url.rs`（死 URL 缓存）。死 URL 缓存复用 `utils::persist::ThrottledWriter` 延迟落盘，避免频繁写 SSD。
