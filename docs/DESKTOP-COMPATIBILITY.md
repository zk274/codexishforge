# Linux desktop compatibility

Version 0.9 validates packaged Linux behavior at two different levels: automated package/backend probes on every release gate and human desktop/assistive-technology checks before a release candidate is promoted.

## Automated package and display-backend probe

`npm run verify:desktop` launches both the AppImage and extracted Debian payload with clean home and configuration directories. It uses every display backend actually available to the test host:

- Native Wayland when `WAYLAND_DISPLAY` and its runtime directory are available.
- Native X11 or XWayland when `DISPLAY` is available.
- An isolated Xvfb X11 server on headless release runners.

Each case must prove:

- The packaged app and expected package identity start under the explicitly requested Electron backend.
- The main window and renderer finish loading at usable dimensions.
- Primary navigation, the composer, and named dialogs are present.
- A real rendered page can be captured as non-empty pixels.
- Tray, global-shortcut, and notification capability return an explicit success or bounded unavailable result.
- The packaged Electron, Chromium, and Node versions are recorded.

The gate writes `dist/desktop-compatibility-report.json`. It contains bounded environment labels and capability results, not usernames, home paths, display addresses, prompts, credentials, or repository contents.

An X11 launch inside a GNOME Wayland login is recorded as `xwayland`. It exercises Electron's X11 backend but does **not** count as the separate GNOME/X11 release-candidate row. Likewise, extracting the Debian payload validates the installed executable without mutating the host package database. Snap metadata and payload integrity are automated separately; an actual classic Snap installation remains a manual check.

### Current development evidence

On 2026-07-29, version 0.9 passed four packaged cases on an Ubuntu GNOME Wayland host:

| Package payload | Electron backend | Result |
| --- | --- | --- |
| AppImage | Native Wayland | Pass |
| Debian | Native Wayland | Pass |
| AppImage | X11 through XWayland | Pass |
| Debian | X11 through XWayland | Pass |

All four cases used Electron 43.2.0 and produced a loaded renderer, named modal state, non-empty pixel capture, available tray, supported notifications, and a registered global shortcut. This is development evidence for GNOME Wayland and both Electron display backends; it is not a human GNOME/X11, KDE, camera, portal, installed-package, or screen-reader pass.

### Installed Debian evidence

On 2026-07-29, a maintainer completed the Debian install lifecycle for version 0.9.0 (`amd64`) on Ubuntu 26.04 LTS with GNOME Shell 50.1 in a native Wayland session:

- A fresh `dpkg` install registered the package, command alternative, application launcher, icon, and `codex-linux:` URL handler.
- Launching from GNOME opened the installed application normally.
- Opening `codex-linux://open` focused the existing window without creating a second application instance.
- Removing the package removed its executable, command alternative, launcher, icon, and URL handler while preserving per-user application data.
- Reinstalling the same package opened normally with the previous user state intact.
- Closing the main window retained the tray process, and `Ctrl+Shift+Space` opened the quick-prompt window.
- File attachment, full-screen capture, region capture, camera preview, and still-image attachment completed successfully.
- GNOME displayed an explicit application-branded notification test.

This records the installed-package, launcher, deep-link, removal, reinstall, tray, shortcut, attachment, portal, camera, and desktop-notification-substrate portions of the GNOME/Wayland Debian check. It does not replace the remaining manual in-app completion/approval notification, keyboard, visual-mode, or spoken Orca checks required for that row.

## Release-candidate desktop matrix

| Desktop/session | AppImage | Debian | Classic Snap | Keyboard and screen reader | Status |
| --- | --- | --- | --- | --- | --- |
| GNOME / Wayland | Required | Required | Required | Orca | Manual RC pass required |
| GNOME / X11 | Required | Required | Required | Orca | Manual RC pass required |
| KDE Plasma / Wayland | Required | Required | Required | Orca | Manual RC pass required |
| KDE Plasma / X11 | Required | Required | Required | Orca | Manual RC pass required |

For each row:

1. Install or launch each package from a clean profile and confirm the app menu/launcher, deep link, upgrade channel, and uninstall behavior.
2. Exercise the tray, close-to-tray, global quick-prompt shortcut, completion/approval notification, screenshot picker, region capture, camera, and file attachment.
3. Navigate Home, threads, composer, terminal, Tasks, Review, Studio, Extensions, Settings, diagnostics, and every dialog without a pointer.
4. With Orca enabled, verify labels, state changes, focus order/restoration, Escape behavior, one completion announcement, and one decision announcement without streaming-token chatter.
5. Repeat at 150% text with reduced motion and high contrast; confirm that focus and actions remain visible.
6. Record the desktop and package versions, result, defects, and tester. Never record credentials, prompts, repository paths, or account information.

These rows stay manual because a headless runner cannot honestly evaluate compositor integration, installed desktop entries, portal prompts, camera hardware, or spoken output.
