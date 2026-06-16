{
  description = "Development shell for GalgameManager (Tauri v2 + SolidJS + Bun)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    rust-overlay.url = "github:oxalica/rust-overlay";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
      rust-overlay,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs {
          inherit system;
          overlays = [ (import rust-overlay) ];
        };
      in
      {
        devShells = {
          default = pkgs.mkShell {
            nativeBuildInputs = with pkgs; [
              pkg-config
              file
              wrapGAppsHook3
            ];

            buildInputs = with pkgs; [
              (rust-bin.stable.latest.default.override {
                extensions = [
                  "rust-src"
                  "rust-analyzer"
                  "clippy"
                ];
              })

              # Tauri v2 system dependencies
              webkitgtk_4_1
              gtk3
              libsoup_3
              glib-networking
              xdo
              librsvg
              # openssl
              libayatana-appindicator.dev

              # GSettings backend: needed by GTK to actually read/write
              # settings. Without it, GTK initialization panics with
              # "Failed to initialize GTK" on most non-NixOS distros.
              dconf
              gsettings-desktop-schemas

              # gdk-pixbuf loaders + shared mime info: webkit/gtk need these
              # to decode images and detect file types at runtime.
              gdk-pixbuf
              shared-mime-info

              # GStreamer: webkitgtk uses it for media playback inside the
              # webview; missing plugins cause silent failures or panics.
              gst_all_1.gstreamer
              gst_all_1.gst-plugins-base
              gst_all_1.gst-plugins-good
              gst_all_1.gst-libav

              # ── Linux game tracking dependencies ──────────────────────────
              # X11 (x11rb crate): EWMH foreground-window queries.
              libx11
              libxau
              libxcb
              libxdmcp
              libxext
              libxrandr
              # D-Bus (zbus crate): AT-SPI focus events on Wayland.
              dbus

              # JavaScript runtimes & tools
              bun
              # nodejs
              pnpm
              # cargo-tauri
            ];

            # ── Runtime environment ──────────────────────────────────────────

            # GSettings: prefer the explicit GSETTINGS_SCHEMA_DIR over
            # XDG_DATA_DIRS because some gtk builds only honor the former.
            # Both are set here for redundancy.
            GSETTINGS_SCHEMA_DIR = "${pkgs.gsettings-desktop-schemas}/share/gsettings-schemas/${pkgs.gsettings-desktop-schemas.name}:${pkgs.gtk3}/share/gsettings-schemas/${pkgs.gtk3.name}";
            XDG_DATA_DIRS = "${pkgs.gsettings-desktop-schemas}/share/gsettings-schemas/${pkgs.gsettings-desktop-schemas.name}:${pkgs.gtk3}/share/gsettings-schemas/${pkgs.gtk3.name}:${pkgs.shared-mime-info}/share";

            GIO_MODULE_DIR = "${pkgs.glib-networking}/lib/gio/modules";

            # gdk-pixbuf loaders + mime cache so gtk can decode bundled
            # images and SVGs at runtime.
            GDK_PIXBUF_MODULE_FILE = "${pkgs.librsvg}/lib/gdk-pixbuf-2.0/2.10.0/loaders.cache";
            GST_PLUGIN_SYSTEM_PATH_1_0 = pkgs.lib.makeSearchPathOutput "lib" "lib/gstreamer-1.0" (
              with pkgs.gst_all_1;
              [
                gstreamer
                gst-plugins-base
                gst-plugins-good
                gst-libav
              ]
            );

            WEBKIT_DISABLE_COMPOSITING_MODE = "1";

            LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath (
              with pkgs;
              [
                webkitgtk_4_1
                gtk3
                libsoup_3
                glib-networking
                librsvg
                openssl
                libayatana-appindicator
                # X11 + D-Bus runtime libs (must be visible to the Rust
                # binaries spawned by `cargo run` / `tauri dev`).
                libx11
                libxau
                libxcb
                libxdmcp
                libxext
                libxrandr
                dbus
              ]
            );

            shellHook = ''
              echo "GalgameManager development environment"
              echo "   Rust: $(rustc --version)"
              echo "   Bun: $(bun --version)"
              echo ""
              echo "Run 'bun install' then 'bun run tauri dev' to start developing"
            '';
          };
        };
      }
    );
}
