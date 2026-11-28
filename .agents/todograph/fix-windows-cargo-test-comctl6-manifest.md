---
id: fix-windows-cargo-test-comctl6-manifest
description: "Windows: cargo test lib harness exits 0xc0000139; the test exe imports comctl32!TaskDialogIndirect but has no common-controls v6 manifest"
status: open
priority: 2
type: task
tags: [rust, windows, testing]
created_at: 2026-11-28T16:10:44.5508388Z
updated_at: 2026-11-28T16:10:44.5508388Z
---
## Context

On Windows (MSVC) `cargo test` cannot start the lib unit-test harness of this crate: cargo reports `error: test failed, exit status 0xc0000139` (STATUS_ENTRYPOINT_NOT_FOUND) before any test runs.

Observed on 2026-11-28 against the harness built for the `test` profile:

- The only import the loader cannot bind is `comctl32.dll!TaskDialogIndirect`, pulled in through `tauri-plugin-dialog` (rfd). It exists only in common-controls v6, which needs an activation context.
- The harness exe carries no embedded manifest (its PE resource directory was parsed directly), so the process gets no activation context and comctl32 resolves to v5. The manifest step of the build script evidently does not reach test targets; this was not confirmed against the tauri-build source.

Impact: `cargo test`, including the `cargo test export_bindings` step from AGENTS.md, cannot be run as documented on Windows. Pre-existing and independent of the update-check change.

## Work

- [ ] Make test binaries get a common-controls v6 manifest and verify with `cargo test --lib`. Candidate directions, none verified: a `/MANIFESTDEPENDENCY:"type='win32' name='Microsoft.Windows.Common-Controls' version='6.0.0.0' processorArchitecture='*' publicKeyToken='6595b64144ccf1df' language='*'"` link argument through `cargo:rustc-link-arg-tests` in `build.rs`, or embedding the manifest the app binary gets.
- [ ] Re-check after tauri-build upgrades; upstream may start covering test targets.

## Notes

Local workaround used meanwhile (none of it is committed): relink the harness with an embedded manifest, then run the exe directly from `src-tauri` so ts-rs still exports into `src-tauri/bindings`.

```
cd src-tauri
cargo rustc --lib --profile test -- -C link-arg=/MANIFEST:EMBED -C link-arg=/MANIFESTINPUT:<common-controls v6 manifest>
./target/debug/build/GalgameManager/<hash>/out/app_lib-<hash>.exe [filter]
```

A plain `cargo test` rebuilds the manifest-less harness, and running the exe from another working directory writes `bindings/` there. An external `<exe>.manifest` next to the exe did not help.