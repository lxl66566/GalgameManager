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

              # JavaScript runtimes & tools
              bun
              # nodejs
              pnpm
              # cargo-tauri
            ];

            GIO_MODULE_DIR = "${pkgs.glib-networking}/lib/gio/modules";
            XDG_DATA_DIRS = "${pkgs.gsettings-desktop-schemas}/share/gsettings-schemas/${pkgs.gsettings-desktop-schemas.name}:${pkgs.gtk3}/share/gsettings-schemas/${pkgs.gtk3.name}";
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
