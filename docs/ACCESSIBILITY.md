# Accessibility conformance and test matrix

Version 0.9 adds a screen-reader mode alongside keyboard-complete navigation, dialog focus containment, visible focus, text scaling, reduced motion, high contrast, forced colors, named landmarks/dialogs, and polite status regions.

Screen-reader mode announces completed Codex turns and requests for a decision. It deliberately does not announce every streaming token. Settings persist locally and do not change model behavior or report accessibility preferences.

## Repeatable test matrix

| Desktop/session | Assistive technology | Historical 0.9 evidence | 1.0 candidate status |
| --- | --- | --- | --- |
| GNOME / Wayland | Orca | Human spoken-output walkthroughs passed for installed Debian and Snap; AppImage evidence remains incomplete | Exact-candidate pass required |
| GNOME / X11 | Orca | None | Exact-candidate pass required |
| KDE Plasma / Wayland | Orca | None | Exact-candidate pass required |
| KDE Plasma / X11 | Orca | None | Exact-candidate pass required |

CI validates names, roles, live regions, focus containment, keyboard routes, visual modes, and screen-reader announcement boundaries. The packaged smoke test validates a complete renderer launch with a clean home and minimal desktop `PATH`. Every package completes keyboard and visual integration checks in the separate [Linux desktop compatibility matrix](DESKTOP-COMPATIBILITY.md); one package and digest is then assigned per desktop/session for the human Orca spoken-output sweep. Automation is never treated as a spoken-output pass.

For each manual row:

1. Launch the assigned reference package and digest with the screen reader enabled.
2. Navigate Home, thread list, composer, terminal, Tasks, Review, Studio, Extensions, Settings, diagnostics, and all dialogs without a pointer.
3. Confirm labels, role/state changes, focus order, Escape behavior, and focus restoration.
4. Start a turn and confirm streaming text is not repeatedly announced, then confirm one completion announcement.
5. Trigger an approval fixture and confirm understandable controls plus exactly one decision announcement.
6. Separately trigger a user-question fixture and confirm understandable choices plus exactly one decision announcement.
7. Exercise 150% text, reduced motion, high contrast, and forced colors without clipped actions or hidden focus.
8. If voice remains in the release scope, exercise microphone permission plus dictation start, stop, transcript insertion, and visible capability degradation.

Do not mark a manual row passed based only on DOM inspection, a protocol fixture, or the presence of Orca. Spoken output and actual keyboard behavior must be evaluated by a person using an exact release-candidate package digest. Historical results from another version do not promote a rebuilt candidate.
