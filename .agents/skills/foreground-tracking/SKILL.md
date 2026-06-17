---
name: foreground-tracking
description: |
  游戏启动后的前台窗口监听/聚焦计时的平台实现。
  涉及 Windows Job Object、Linux systemd scope / cgroup、
  X11 EWMH、AT-SPI D-Bus 等机制。
---

# Foreground Tracking

## 概述

`settings.launch.precision_mode` 开启时，只有游戏窗口位于前台才会计时。
轮询间隔 1 秒，持久化间隔 60 秒，均在 `game_loop()` 中完成。

---

## Windows

文件: `src-tauri/src/exec/windows.rs`

| 步骤 | 说明 |
|---|---|
| 创建 Job Object | `CreateJobObjectW`，未命名 |
| 绑定启动器 | `AssignProcessToJobObject`，子/孙进程自动继承 |
| 前台检测 | 每秒 `GetForegroundWindow()` → `GetWindowThreadProcessId()` → `IsProcessInJob(foreground_pid, job_handle)` |

关键：Windows Job 的继承语义保证即使经过 Locale Emulator 等包装层，最终的游戏进程也在 Job 内，`is_focused()` 始终能匹配。

---

## Linux

### 路径选择

```rust
enum GameTracker {
    Systemd { procs_path: PathBuf },   // 优先
    Child { child: tokio::process::Child }, // systemd 不可用时回退
}
```

`has_systemd_user()` 检查：
1. `systemd-run` 在 `$PATH` 中
2. `$XDG_RUNTIME_DIR` 已设置
3. `/run/user/$UID/systemd/private` 存在

### systemd 路径（推荐）

文件: `src-tauri/src/exec/linux/spawn.rs`

- `systemd-run --user --scope --no-block --unit=galgame-manager-{game_id}-{pid}.scope`
- 通过 `systemctl --user show --property=ControlGroup --value` 获取 scope 的 cgroup 子路径
- 轮询 `/sys/fs/cgroup/{subpath}/cgroup.procs` 来判断进程树存活性

存活性检测：`has_active_processes()` 读取 cgroup.procs，只要还有 PID 就认为活着。  
聚焦检测：`is_focused()` 检查前台 PID 是否在 cgroup.procs 列表中。

> 仅支持 cgroup v2（Arch / Fedora / Ubuntu 21.10+ / Debian 11+ 默认使用）。  
> cgroup v1 下查询会失败 → `has_active_processes()` 返回空 → 游戏循环结束。

### Child 回退路径（无 systemd）

- `has_active_processes()` 仅调用 `tokio::process::Child::try_wait()`
- `is_focused()` 仅比较前台 PID 与 `child.id()`（启动器自身的 PID）

局限性：
- 仅追踪直接子进程，经过包装层的游戏可能被误判为已退出
- `is_focused()` 几乎永不匹配（前台窗口的 PID ≠ 启动器 PID）
- 代码注释已标明这是可接受的折衷

---

### 前台检测链

文件: `src-tauri/src/exec/linux/foreground/mod.rs`

```rust
pub trait ForegroundDetector {
    fn focused_pid(&self) -> Option<u32>;
}
```

`CompositeDetector` 依次尝试每个子检测器，返回第一个 `Some(pid)`。

#### X11Detector — `src-tauri/src/exec/linux/foreground/x11.rs`

| 步骤 | 说明 |
|---|---|
| 1 | `_NET_ACTIVE_WINDOW` → 聚焦窗口的 XID |
| 2 | `_NET_WM_PID` → 该窗口所属 PID |

- 使用 `x11rb` 连接，每次 `focused_pid()` 调用时同步查询（约 1 个 X11 往返）
- `try_init()` 检查 `$DISPLAY`，无 DISPLAY 时返回 `None`
- 仅对 X11 / XWayland 窗口有效；原生 Wayland 窗口不可见

#### AtspiDetector — `src-tauri/src/exec/linux/foreground/atspi.rs`

- 独立 OS 线程，自带 `new_current_thread` tokio runtime
- D-Bus 订阅 `org.a11y.atspi.Event.Object.StateChanged:focused`，arg0=`"focused"`，detail1=1 表示获得焦点
- 将信号发送方的 unique bus name 通过 `GetConnectionUnixProcessID` 解析为 PID，缓存到 `HashMap<String, u32>`
- `NameOwnerChanged` 监听用于淘汰死进程的缓存
- `FOCUSED_PID` 通过 `AtomicU32` 共享，查询不阻塞
- `try_init()` 检查 `$DBUS_SESSION_BUS_ADDRESS`，无 D-Bus 时返回 `None`
- 仅在 GNOME / KDE（开启了 AT-SPI 的桌面）上工作

#### 组合顺序

```
X11Detector 优先  (廉价同步查询)
    ↓ 返回 None
AtspiDetector 兜底  (需 AT-SPI 桌面)
    ↓ 两者都 None
NoopDetector  (永不匹配，记录警告日志)
```

---

## 局限性汇总

| 场景 | 前台检测 | 存活性检测 |
|---|---|---|
| Windows | ✅ `GetForegroundWindow` + `IsProcessInJob` | ✅ Job Object `ActiveProcesses` |
| Linux + systemd + X11/XWayland | ✅ `X11Detector` | ✅ cgroup.procs |
| Linux + systemd + Wayland + AT-SPI | ✅ `AtspiDetector` | ✅ cgroup.procs |
| Linux + systemd + Wayland + 无 AT-SPI | ❌ 永不匹配 | ✅ cgroup.procs |
| Linux + Child 回退 | ⚠️ 仅匹配启动器自身 PID | ⚠️ 仅追踪直接子进程 |

额外边界：
- cgroup v1 系统下 systemd 路径不可用 → 退化为 Child 路径
- `systemd-run` 调用失败（权限、资源不足）→ 退化为 Child 路径
- AT-SPI 连接失败 → 监听线程退出，`FOCUSED_PID` 永远为 0
- X11 连接失败（无 `$DISPLAY` 或连接拒绝）→ `X11Detector` 不初始化
