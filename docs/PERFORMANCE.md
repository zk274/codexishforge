# Performance budgets

Version 0.9 records bounded, local timing samples and exposes the latest and p95 values in diagnostics. Samples are never sent unless a future reporting schema explicitly adds them; the current opt-in reporting schema does not.

| Interaction | p95 budget |
| --- | ---: |
| Electron ready | 5,000 ms |
| Codex bootstrap | 6,000 ms |
| Thread list render | 50 ms |
| Conversation/message render | 120 ms |
| Diff parse and render | 250 ms |
| Terminal output render | 24 ms |

Only these named metrics are accepted over IPC. Durations must be finite, nonnegative, and at most two minutes. Each metric retains at most 120 samples in memory. A budget breach changes diagnostic health but does not silently remove content or disable a workflow.

Automated tests cover validation, bounded retention, p95 calculation, and health changes. Packaged smoke testing covers startup; representative long-thread, diff, and terminal fixtures exercise the renderer paths.
