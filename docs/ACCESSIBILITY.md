# Accessibility conformance and test matrix

Version 0.9 adds a screen-reader mode alongside keyboard-complete navigation, dialog focus containment, visible focus, text scaling, reduced motion, high contrast, forced colors, named landmarks/dialogs, and polite status regions.

Screen-reader mode announces completed Codex turns and requests for a decision. It deliberately does not announce every streaming token. Settings persist locally and do not change model behavior or report accessibility preferences.

## Repeatable test matrix

| Desktop/session | Assistive technology | 0.9 status |
| --- | --- | --- |
| GNOME / Wayland | Orca | Automation and UI launch exercised in the 0.9 development environment; spoken-output walkthrough is a manual release check |
| GNOME / X11 | Orca | Manual release-candidate check |
| KDE Plasma / Wayland | Orca | Manual release-candidate check |
| KDE Plasma / X11 | Orca | Manual release-candidate check |

CI validates names, roles, live regions, focus containment, keyboard routes, visual modes, and screen-reader announcement boundaries. The packaged smoke test validates a complete renderer launch with a clean home and minimal desktop `PATH`. The separate [Linux desktop compatibility matrix](DESKTOP-COMPATIBILITY.md) records package and display-backend evidence without treating automation as a spoken-output pass.

For each manual row:

1. Launch a packaged build with the screen reader enabled.
2. Navigate Home, thread list, composer, terminal, Tasks, Review, Studio, Extensions, Settings, diagnostics, and all dialogs without a pointer.
3. Confirm labels, role/state changes, focus order, Escape behavior, and focus restoration.
4. Start a turn and confirm streaming text is not repeatedly announced, then confirm one completion announcement.
5. Trigger approval and question fixtures and confirm one decision announcement plus understandable controls.
6. Exercise 150% text, reduced motion, high contrast, and forced colors without clipped actions or hidden focus.

Do not mark a manual row passed based only on DOM inspection or the presence of Orca. Spoken output and actual keyboard behavior must be evaluated by a person for the release candidate.
