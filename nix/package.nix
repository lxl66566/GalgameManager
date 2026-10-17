{
  lib,
  stdenv,
  rustPlatform,
  fetchPnpmDeps,
  pnpmConfigHook,
  copyDesktopItems,
  makeDesktopItem,
  nodejs,
  pnpm,
  pkg-config,
  cmake,
  wrapGAppsHook3,
  # link-time deps (pkg-config entries required by *-sys crates)
  dbus,
  gtk3,
  libayatana-appindicator,
  libsoup_3,
  webkitgtk_4_1,
  # runtime deps (exported to the environment by the wrapper)
  gdk-pixbuf,
  glib-networking,
  gsettings-desktop-schemas,
  gst_all_1,
  librsvg,
  shared-mime-info,
}:

let
  # Cargo.toml uses TOML 1.1 multi-line inline tables, which Nix's
  # builtins.importTOML (TOML 1.0) cannot parse; take the version from
  # package.json instead (kept in sync with tauri.conf.json on release).
  inherit (lib.importJSON ../package.json) version;
  icons = ../src-tauri/icons;

  gstPluginPath = lib.makeSearchPathOutput "lib" "lib/gstreamer-1.0" (
    with gst_all_1;
    [
      gstreamer
      gst-plugins-base
      gst-plugins-good
      gst-libav
    ]
  );

  # Vite build of the SolidJS frontend; consumed by tauri's
  # `frontendDist = "../dist"` at compile time.
  frontend = stdenv.mkDerivation (finalAttrs: {
    pname = "galgamemanager-frontend";
    inherit version;
    src = ../.;

    pnpmDeps = fetchPnpmDeps {
      pname = finalAttrs.pname;
      inherit (finalAttrs) src version;
      inherit pnpm;
      fetcherVersion = 4;
      hash = "sha256-U+nSW7MyP/gaIwx+2UlAjz9qb1MpdqW8R7n+wvCK3W4=";
    };

    nativeBuildInputs = [
      nodejs
      pnpm
      pnpmConfigHook
    ];

    buildPhase = ''
      runHook preBuild
      pnpm build
      runHook postBuild
    '';

    installPhase = ''
      runHook preInstall
      cp -r dist $out
      runHook postInstall
    '';
  });
in
rustPlatform.buildRustPackage (finalAttrs: {
  pname = "galgamemanager";
  inherit version;
  src = ../.;

  buildAndTestSubdir = "src-tauri";
  # vendor/lockfile location; not derived from buildAndTestSubdir
  cargoRoot = "src-tauri";
  cargoLock = {
    lockFile = ../src-tauri/Cargo.lock;
    # struct-patch is a git dependency; its vendored checkout needs a pin.
    outputHashes."struct-patch-0.12.7" = "sha256-u0LYRoqaxqXZW7ego4p/g8WaUh17SSo+43yXDjdvPUk=";
  };

  # tauri-build / generate_context! embed `frontendDist` ("../dist") from the
  # source tree at compile time.
  postPatch = ''
    cp -r ${frontend} ./dist
  '';

  nativeBuildInputs = [
    pkg-config
    # aws-lc-sys (opendal s3) builds its C sources with cmake
    cmake
    copyDesktopItems
    wrapGAppsHook3
  ];

  buildInputs =
    [
      dbus
      gtk3
      libayatana-appindicator
      libsoup_3
      webkitgtk_4_1
      # runtime-only: webkit/gtk schemas, gio modules, image loaders
      gdk-pixbuf
      glib-networking
      gsettings-desktop-schemas
      librsvg
      shared-mime-info
    ]
    ++ (with gst_all_1; [
      gstreamer
      gst-plugins-base
      gst-plugins-good
      gst-libav
    ]);

  gappsWrapperArgs = [
    "--set GDK_PIXBUF_MODULE_FILE ${librsvg}/lib/gdk-pixbuf-2.0/2.10.0/loaders.cache"
    "--suffix GIO_EXTRA_MODULES : ${glib-networking}/lib/gio/modules"
    "--suffix GST_PLUGIN_SYSTEM_PATH_1_0 : ${gstPluginPath}"
    "--suffix XDG_DATA_DIRS : ${shared-mime-info}/share"
  ];

  # GUI integration tests need a display; export_bindings rewrites the
  # read-only source tree.
  doCheck = false;

  desktopItems = [
    (makeDesktopItem {
      name = "GalgameManager";
      desktopName = "GalgameManager";
      exec = "GalgameManager";
      icon = "galgamemanager";
      comment = "Manage and sync your galgames";
      categories = [
        "Game"
        "Utility"
      ];
      startupWMClass = "GalgameManager";
      terminal = false;
    })
  ];

  postInstall = ''
    install -Dm644 ${../src-tauri/icons/32x32.png}   $out/share/icons/hicolor/32x32/apps/galgamemanager.png
    install -Dm644 ${../src-tauri/icons/128x128.png} $out/share/icons/hicolor/128x128/apps/galgamemanager.png
    install -Dm644 ${icons}/128x128@2x.png           $out/share/icons/hicolor/256x256/apps/galgamemanager.png
    copyDesktopItems
    # Tray icon lib is dlopen'ed ("libayatana-appindicator3.so.1"), not a
    # NEEDED entry, so no rpath entry covers it; add a real DT_NEEDED while
    # the raw ELF is still in place (wrapGAppsHook renames it in fixupPhase).
    patchelf --add-needed libayatana-appindicator3.so.1 $out/bin/GalgameManager
  '';

  passthru = {
    inherit frontend;
  };

  meta = {
    description = "Manage and sync your galgames";
    homepage = "https://github.com/lxl66566/GalgameManager";
    license = lib.licenses.mit;
    mainProgram = "GalgameManager";
    platforms = lib.platforms.linux;
  };
})
