---
phase: 5
slug: packaging-distribution
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-29
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | @vscode/test-cli 0.0.12 + @vscode/test-electron 2.5.2 |
| **Config file** | `extension/.vscode-test.js` (exists) |
| **Quick run command** | `npm run typecheck` (from extension/) |
| **Full suite command** | `npm test` (macOS) / `xvfb-run -a npm test` (Linux) |
| **Estimated runtime** | ~30 seconds (typecheck); ~90 seconds (full suite) |

---

## Sampling Rate

- **After every task commit:** Run `npm run typecheck` (type safety gate; full tests require VS Code binary / Xvfb)
- **After every plan wave:** Run `npm test` (macOS) or `xvfb-run -a npm test` (Linux CI)
- **Before `/gsd-verify-work`:** Full suite must be green on all platforms
- **Max feedback latency:** 30 seconds (typecheck gate)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 5-01-01 | 01 | 1 | PKG-03 | T-05-01 | version string parsed with regex only; never eval'd | unit | `npm test` | ❌ W0 | ⬜ pending |
| 5-01-02 | 01 | 1 | PKG-03 | — | N/A | unit | `npm test` | ❌ W0 | ⬜ pending |
| 5-02-01 | 02 | 1 | PKG-01 | — | N/A | unit (manifest check) | `npm test` | ✅ extension.test.ts | ⬜ pending |
| 5-03-01 | 03 | 2 | PKG-02 | — | N/A | smoke (CI build) | `vsce package --target linux-x64` | ❌ W0 (CI) | ⬜ pending |
| 5-04-01 | 04 | 2 | PKG-04 | — | N/A | smoke (CI YAML) | workflow run | ❌ W0 (CI) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `extension/src/test/extension.test.ts` — new test cases for PKG-03 (CLI detection: missing binary + version mismatch). Extends existing test file.
- [ ] `.github/workflows/ext-release.yml` — covers PKG-04 (CI matrix builds all 4 VSIXes on `ext/v*` tag)
- [ ] `.github/workflows/cli-release.yml` — covers D-06/D-07 (CLI binaries built on `cli/v*` tag)

*Note: PKG-03 detection logic lives in new `extension/src/cliDetect.ts` with testable exports. PKG-02 VSIX content verification is CI-only (smoke test — confirmed by CI build success + artifact inspection).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Marketplace pre-release publish succeeds | PKG-01 | Requires live VSCE_PAT + Marketplace account; D-10 prohibits CI automation | Run `vsce publish --pre-release` after downloading VSIX artifacts from GitHub Release |
| VSIX installs correctly from Marketplace | PKG-01 | Requires Marketplace propagation + VS Code install | Install from Marketplace, open workspace, confirm extension activates |
| CLI missing notification shown in VS Code | PKG-03 | Requires live VS Code window; notification not testable in test-cli headless | Remove ~/.this-code/bin/this-code, reload VS Code, confirm info notification appears |
| `ubuntu-24.04-arm` runner availability | PKG-04 | Runner availability depends on GitHub plan | Verify workflow runs on public repo without billing errors |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s (typecheck gate)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
