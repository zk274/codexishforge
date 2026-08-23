# CodeXishForge Linux desktop compatibility

Version 0.9 validates packaged Linux behavior at two different levels: automated package/backend probes on every release gate and human desktop/assistive-technology checks before a release candidate is promoted.

## Automated package and display-backend probe

`npm run verify:desktop` extracts the AppImage and Debian packages, then launches both payloads with clean home and configuration directories. It uses every display backend actually available to the test host:

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

All four cases used Electron 43.2.0 and produced a loaded renderer, named modal state, non-empty pixel capture, available tray, and supported notifications. Shortcut registration was recorded by the application, while native accelerator delivery remained a manual check. This is development evidence for GNOME Wayland and both Electron display backends; it is not a human GNOME/X11, KDE, camera, portal, installed-package, or screen-reader pass.

On 2026-08-09, a maintainer manually launched the rebuilt version 0.9.0 AppImage on Ubuntu 26.04 LTS with GNOME Shell 50.1 in a native Wayland session:

- `Ctrl+Shift+Space` was installed as the app-owned GNOME custom binding (`<Primary><Shift>space`) and opened Quick Prompt in the existing application instance through the application deep-link handler while the application was retained in the tray. Renamed builds use `codexishforge://quick-prompt`.
- Ubuntu AppIndicators rendered the generated StatusNotifier `IconPixmap` instead of the three-dot `image-loading-symbolic` fallback. Show CodeXishForge, Quick prompt, Quit, and close-to-tray behavior remained functional.

This is narrow manual AppImage GNOME/Wayland evidence for shortcut delivery and visible tray rendering; it does not complete the remaining AppImage release-candidate checks or any GNOME/X11 or KDE row. The automated desktop probe now verifies visible Quick Prompt behavior with input focus in every case and a real X11 accelerator under Xvfb; native Wayland accelerator delivery remains manual.

### Installed Debian evidence

On 2026-07-29, a maintainer completed the Debian install lifecycle for version 0.9.0 (`amd64`) on Ubuntu 26.04 LTS with GNOME Shell 50.1 in a native Wayland session:

- A fresh `dpkg` install registered the package, command alternative, application launcher, icon, and application URL handler. Renamed builds use `codexishforge:`.
- Launching from GNOME opened the installed application normally.
- Opening the application URL focused the existing window without creating a second application instance. The CodeXishForge equivalent is `codexishforge://open`.
- Removing the package removed its executable, command alternative, launcher, icon, and URL handler while preserving per-user application data.
- Reinstalling the same package opened normally with the previous user state intact.
- Closing the main window retained the tray process, and `Ctrl+Shift+Space` opened the quick-prompt window.
- File attachment, full-screen capture, region capture, camera preview, and still-image attachment completed successfully.
- While the app was unfocused, a completed turn displayed the fixed, privacy-safe completion notification.
- A command attempting to write outside the active project paused for approval and displayed the fixed approval notification while the app was unfocused; denying it left the requested file uncreated.
- At 150% text with reduced motion and high contrast enabled, primary views and dialogs remained readable, navigable, scrollable, and free of overlapping controls.
- `Tab`, `Shift+Tab`, `F6`, and `Escape` preserved visible focus, cycled primary work areas, closed the active dialog, and restored focus to its trigger.
- With Orca and in-app screen-reader mode enabled, primary navigation, composer, Tasks, Review, Studio, Extensions, Settings, and dialog controls exposed useful spoken names.
- A completed turn produced one completion announcement without streaming-token chatter; a user question produced one decision announcement, and dismissing it restored focus correctly.

This completes the installed Debian GNOME/Wayland check for version 0.9.0, including launcher, deep-link, removal, reinstall, tray, shortcut, attachment, portal, camera, completion and approval notifications, keyboard, focus, visual modes, and spoken Orca behavior. It does not replace any AppImage, Snap, GNOME/X11, or KDE check.

### Installed classic Snap evidence

On 2026-07-29, a maintainer installed the locally built version 0.9.0 (`amd64`) classic Snap on the same Ubuntu GNOME Wayland host:

- The installed package reported revision `x1` with classic confinement and opened normally through its packaged Snap command. Renamed builds use `snap run codexishforge`.
- Existing threads, settings, and selected-project state from the Debian installation remained available.
- Launching from the GNOME application menu opened the Snap normally.
- The registered application URL handler routed repeated links to one main application process. Renamed builds use `codexishforge:`. GNOME displayed its “is ready” activation notification instead of allowing the background application to steal focus.
- Closing the main window retained the tray process, and `Ctrl+Shift+Space` opened the quick-prompt window.
- File attachment, full-screen capture, region capture, camera preview, and still-image attachment completed successfully.
- After the classic-Snap launcher selected the host notification daemon, an unfocused completed turn displayed the fixed, privacy-safe completion notification.
- On 2026-08-05, a command attempting to write outside the active project paused for approval and displayed the fixed approval notification while the app was unfocused; denying it left the requested file uncreated.
- On 2026-08-05, the rebuilt Snap kept Creation Studio's full Canvas boundary and primary action visible at 150% text. Packaged Wayland and X11 probes also confirmed that Canvas stayed inside the viewport and Templates scrolled to its Save action.
- On 2026-08-05, keyboard-only navigation at 150% text preserved visible focus across Studio and the primary work areas, arrow-key tab selection worked, and Escape closed Studio and restored focus. With Orca and in-app screen-reader mode enabled, navigation and selected states had useful spoken names; a pending command approval and its denied completion were each announced once without streaming-token chatter.
- Removing and reinstalling the locally built Snap completed successfully, and the previous threads, settings, and project state remained available afterward.

This completes the installed classic Snap GNOME/Wayland check for version 0.9.0, including install, launch, state continuity, application-menu activation, single-instance deep links, tray, shortcut, attachments, portals, camera, completion and approval notifications, keyboard, high-zoom layout, spoken Orca behavior, removal, and data preservation. It does not replace any AppImage, Debian, GNOME/X11, or KDE check.

## Release-candidate desktop matrix

The matrix is completed for one write-once candidate artifact set on the exact distribution and desktop versions selected in the release checklist. Record the package filename and SHA-256 for every result. Any rebuilt package requires a new version and tag and invalidates the manual results tied to its old digest; the 0.9 evidence above remains regression context only.

| Desktop/session | AppImage | Debian | Classic Snap | Assigned Orca reference | Status |
| --- | --- | --- | --- | --- | --- |
| GNOME / Wayland | Required | Required | Required | Orca | Manual RC pass required |
| GNOME / X11 | Required | Required | Required | Orca | Manual RC pass required |
| KDE Plasma / Wayland | Required | Required | Required | Orca | Manual RC pass required |
| KDE Plasma / X11 | Required | Required | Required | Orca | Manual RC pass required |

For every AppImage, Debian, and classic Snap cell:

1. Install or launch each package from a clean profile and confirm the app menu/launcher, deep link, upgrade channel, and uninstall behavior.
2. Exercise the tray, close-to-tray, global quick-prompt shortcut, completion and approval notifications, screenshot picker, region capture, camera, file attachment, and microphone/dictation when voice is supported.
3. Navigate Home, threads, composer, terminal, Tasks, Review, Studio, Extensions, Settings, diagnostics, and every dialog without a pointer.
4. Repeat at 150% text with reduced motion, high contrast, and forced colors; confirm that focus and actions remain visible.

For the one package and digest assigned as the Orca reference in each desktop/session row, additionally verify labels, state changes, focus order/restoration, Escape behavior, one completion announcement, one approval announcement, and one separate user-question announcement without streaming-token chatter.

Finally:

5. If voice remains supported for 1.0, exercise microphone permission and dictation start/stop behavior on the assigned reference package.
6. Record the desktop and package versions, result, defects, and tester. Never record credentials, prompts, repository paths, or account information.

These rows stay manual because a headless runner cannot honestly evaluate compositor integration, installed desktop entries, portal prompts, camera hardware, or spoken output.
