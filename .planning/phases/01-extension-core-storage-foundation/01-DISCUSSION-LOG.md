# Phase 1: Extension Core + Storage Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-25
**Phase:** 01-extension-core-storage-foundation
**Areas discussed:** Profile detection, Close event false positives, Config surface, Local session JSON path, Storage path rename

---

## Profile Detection

| Option                 | Description                                                          | Selected |
| ---------------------- | -------------------------------------------------------------------- | -------- |
| Parse globalStorageUri | Extract profile ID from path segments (best-effort, null on failure) | ✓        |
| Skip for Phase 1       | Record null now, revisit in v2                                       |          |
| Check process.env      | Inspect for VSCODE_PROFILE or similar (fragile, undocumented)        |          |

**User's choice:** Parse globalStorageUri path segments
**Notes:** Validates the workaround empirically during Phase 1 while VS Code's profile API situation (issue #177463) remains unresolved.

---

## Close Event False Positives

| Option                       | Description                                                           | Selected |
| ---------------------------- | --------------------------------------------------------------------- | -------- |
| Reconcile from textDocuments | Rebuild open_files from vscode.workspace.textDocuments on every event | ✓        |
| Debounce + reconcile         | Wait 100ms then rebuild (batches rapid events)                        |          |
| Accept false positives       | Track events as-is, document as known behavior                        |          |

**User's choice:** Reconcile from `vscode.workspace.textDocuments` on every open/close event
**Notes:** Eliminates language mode change false positives cleanly without debounce latency.

---

## Configuration Surface

| Option                     | Description                                           | Selected |
| -------------------------- | ----------------------------------------------------- | -------- |
| Minimal: enable + logLevel | thisCode.enable (boolean) + thisCode.logLevel (enum)  | ✓        |
| Standard: + dbPath         | Above plus thisCode.dbPath for custom SQLite location |          |
| Full: + excludePatterns    | Above plus glob array to skip tracking certain files  |          |

**User's choice:** Minimal — `thisCode.enable` + `thisCode.logLevel` only
**Notes:** No speculative settings. Additional config added when actually needed.

---

## Local Session JSON Path

| Option                            | Description                                                       | Selected |
| --------------------------------- | ----------------------------------------------------------------- | -------- |
| ~/.this-code/sessions/{hash}.json | Consistent with this-code namespace, under same tree as SQLite DB | ✓        |
| Workspace .vscode/ dir            | {workspace}/.vscode/this-code-session.json                        |          |
| SQLite only for local             | Skip per-instance JSON for local sessions entirely                |          |

**User's choice:** `~/.this-code/sessions/{hash}.json`
**Notes:** User noted "not this-code.. this-code" — prompted the global path rename discussion below.

---

## Storage Path Rename (Global)

| Option                      | Description                                                                  | Selected |
| --------------------------- | ---------------------------------------------------------------------------- | -------- |
| Rename all to ~/.this-code/ | Consistent with project rename — sessions.db, bin/, sessions/, env var guard | ✓        |
| Keep ~/.this-code/          | Storage dir stays under original internal name                               |          |

**User's choice:** Rename all `~/.this-code/` paths to `~/.this-code/` everywhere
**Notes:** Affects all 4 phases. Planning docs (REQUIREMENTS.md, PROJECT.md, research files) still say `~/.this-code/` — CONTEXT.md D-06 is the authoritative correction for downstream agents.

---

## Claude's Discretion

- Startup scan aggressiveness (STOR-04) — incremental scan preferred
- Output channel log verbosity per event
- Schema migration implementation (PRAGMA user_version + idempotent DDL)
- Hash derivation for local session JSON filename

## Deferred Ideas

- `thisCode.dbPath` config override — Phase 2
- `thisCode.excludePatterns` — v2
