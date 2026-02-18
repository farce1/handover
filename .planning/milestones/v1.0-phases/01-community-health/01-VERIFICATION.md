---
phase: 01-community-health
verified: 2026-02-18T10:30:00Z
status: human_needed
score: 9/10 must-haves verified
human_verification:
  - test: 'Open GitHub repo Insights > Community Standards'
    expected: 'Green checkmarks for CONTRIBUTING, Code of Conduct, and Security policy (all three files exist in .github/ which is the detection path GitHub uses)'
    why_human: 'Cannot query GitHub API community standards endpoint without auth; must confirm via browser'
  - test: 'Open a new issue in the GitHub web UI'
    expected: "Template chooser appears with three options (Bug Report, Feature Request, Documentation Improvement); no 'Open a blank issue' link visible"
    why_human: 'blank_issues_enabled: false only takes effect in the GitHub web UI — cannot verify via file inspection alone'
  - test: 'Open a new PR in the GitHub web UI'
    expected: 'PR body auto-populates with the Summary / Type of Change / Checklist / Testing Notes template'
    why_human: 'PR template rendering requires the GitHub UI; cannot verify via file inspection'
  - test: 'Check Sponsors button in repo header'
    expected: 'Sponsor button appears in the repo header (requires the farce1 account to have enrolled in GitHub Sponsors)'
    why_human: 'FUNDING.yml is correctly configured but button activation depends on the Sponsors profile enrollment status, which is an external account state'
---

# Phase 01: Community Health Verification Report

**Phase Goal:** Any contributor who lands on the repo finds the minimum files needed to understand how to participate, report issues, and submit PRs
**Verified:** 2026-02-18T10:30:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                          | Status      | Evidence                                                                                                                                         |
| --- | -------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | New contributor finds setup instructions, commit conventions, branch naming, and PR process in CONTRIBUTING.md | VERIFIED    | All 10 sections present and substantive; "Conventional Commits" link, feat/fix/docs branch examples, npm install walkthrough, architecture table |
| 2   | GitHub Community Standards shows green for CONTRIBUTING, Code of Conduct, and Security policy                  | ? UNCERTAIN | All three files exist in `.github/` (correct detection path) but GitHub UI confirmation needed                                                   |
| 3   | Repo has a Sponsors button linked to GitHub Sponsors via FUNDING.yml                                           | VERIFIED    | `github: farce1` present in `.github/FUNDING.yml`; button activation requires enrolled Sponsors profile (noted as out-of-scope in plan)          |
| 4   | Vulnerability reporting points to GitHub's private advisory system — no email exposed                          | VERIFIED    | SECURITY.md links to `security/advisories`, uses `security/advisories/new` as contact; no email address in any file                              |
| 5   | Filing a bug report presents a structured YAML form with required reproduction fields                          | VERIFIED    | bug.yml: steps, expected, actual, version, OS dropdown, Node.js version all `required: true`                                                     |
| 6   | Filing a feature request presents a structured YAML form with problem/motivation and proposed solution         | VERIFIED    | feature.yml: problem and solution fields both `required: true`                                                                                   |
| 7   | Filing a docs improvement issue presents a structured YAML form with location and what's wrong                 | VERIFIED    | docs.yml: location and problem fields both `required: true`                                                                                      |
| 8   | Blank issues are disabled — all issues must use a template                                                     | VERIFIED    | `blank_issues_enabled: false` in config.yml; contact_links redirect to Discussions                                                               |
| 9   | Submitting a PR auto-populates a checklist covering tests, changelog, docs, and commit format                  | VERIFIED    | pull_request_template.md: Checklist includes npm test, npm run typecheck, docs, changelog, Conventional Commits items                            |
| 10  | Each issue template auto-assigns its label (bug, enhancement, documentation)                                   | VERIFIED    | bug.yml: `labels: ["bug"]`, feature.yml: `labels: ["enhancement"]`, docs.yml: `labels: ["documentation"]`                                        |

**Score:** 9/10 truths verified (1 uncertain — requires human)

### Required Artifacts

| Artifact                             | Expected                                                | Status   | Details                                                                                                                                         |
| ------------------------------------ | ------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `.github/CONTRIBUTING.md`            | Contributor guide with all 10 sections                  | VERIFIED | 135 lines; all sections present: setup, dev commands, branch naming, Conventional Commits, issue/PR process, code review, architecture overview |
| `.github/CODE_OF_CONDUCT.md`         | Contributor Covenant v2.1 with contact method filled in | VERIFIED | 78 lines; verbatim CC v2.1 text; enforcement section references `security/advisories/new` instead of `[INSERT CONTACT METHOD]`                  |
| `.github/SECURITY.md`                | Vulnerability reporting via GitHub private advisories   | VERIFIED | 31 lines; "Report a vulnerability" step-by-step, links to `security/advisories`, no email address                                               |
| `.github/FUNDING.yml`                | GitHub Sponsors configuration                           | VERIFIED | Single line: `github: farce1`                                                                                                                   |
| `.github/ISSUE_TEMPLATE/bug.yml`     | Bug report form with required structured fields         | VERIFIED | 69 lines; 6 required fields (steps, expected, actual, version, OS, Node.js version) + optional logs                                             |
| `.github/ISSUE_TEMPLATE/feature.yml` | Feature request form with problem/solution structure    | VERIFIED | 42 lines; problem and solution `required: true`; alternatives and context optional                                                              |
| `.github/ISSUE_TEMPLATE/docs.yml`    | Docs improvement form with location and problem         | VERIFIED | 37 lines; location and problem `required: true`; suggestion optional                                                                            |
| `.github/ISSUE_TEMPLATE/config.yml`  | Template chooser disabling blank issues                 | VERIFIED | 5 lines; `blank_issues_enabled: false`; contact_links to Discussions                                                                            |
| `.github/pull_request_template.md`   | PR body template with quality checklist                 | VERIFIED | 26 lines; Summary, Type of Change, Checklist (6 items), Testing Notes sections                                                                  |

### Key Link Verification

| From                                 | To                        | Via                                           | Status | Details                                                                         |
| ------------------------------------ | ------------------------- | --------------------------------------------- | ------ | ------------------------------------------------------------------------------- |
| `.github/SECURITY.md`                | `security/advisories`     | Link to private vulnerability reporting       | WIRED  | Line 9: direct link to `https://github.com/farce1/handover/security/advisories` |
| `.github/CODE_OF_CONDUCT.md`         | `security/advisories/new` | Contact method for CoC enforcement            | WIRED  | Line 39: `https://github.com/farce1/handover/security/advisories/new`           |
| `.github/ISSUE_TEMPLATE/bug.yml`     | GitHub labels             | `labels` field auto-applies `bug`             | WIRED  | Line 4: `labels: ["bug"]`                                                       |
| `.github/ISSUE_TEMPLATE/feature.yml` | GitHub labels             | `labels` field auto-applies `enhancement`     | WIRED  | Line 4: `labels: ["enhancement"]`                                               |
| `.github/ISSUE_TEMPLATE/docs.yml`    | GitHub labels             | `labels` field auto-applies `documentation`   | WIRED  | Line 4: `labels: ["documentation"]`                                             |
| `.github/ISSUE_TEMPLATE/config.yml`  | GitHub Discussions        | `contact_links` redirects non-template issues | WIRED  | Line 4: `url: https://github.com/farce1/handover/discussions`                   |

### Requirements Coverage

| Requirement | Status    | Notes                                                                     |
| ----------- | --------- | ------------------------------------------------------------------------- |
| COMM-01     | SATISFIED | CONTRIBUTING.md with full walkthrough, Conventional Commits, architecture |
| COMM-02     | SATISFIED | Bug report YAML form with required fields                                 |
| COMM-03     | SATISFIED | Feature request YAML form                                                 |
| COMM-04     | SATISFIED | Docs improvement YAML form                                                |
| COMM-05     | SATISFIED | Blank issues disabled via config.yml                                      |
| COMM-06     | SATISFIED | PR template with quality checklist                                        |
| COMM-07     | SATISFIED | CODE_OF_CONDUCT.md with Contributor Covenant v2.1                         |
| COMM-08     | SATISFIED | SECURITY.md with private vulnerability reporting                          |
| COMM-09     | SATISFIED | FUNDING.yml with `github: farce1`                                         |

### Anti-Patterns Found

None. The `placeholder:` occurrences in YAML templates are legitimate YAML form field attributes (hint text shown inside form inputs), not stub indicators.

### Human Verification Required

#### 1. GitHub Community Standards Checklist

**Test:** Navigate to the repo on GitHub, click Insights > Community Standards.
**Expected:** Green checkmarks for CONTRIBUTING, Code of Conduct, and Security policy. All three files are in `.github/` which is the path GitHub scans.
**Why human:** Cannot query the GitHub Community Standards API without authentication. The files are in the correct locations but GitHub's UI confirmation is needed.

#### 2. Issue Template Chooser (Blank Issues Disabled)

**Test:** Click "New issue" in the GitHub web UI.
**Expected:** Template chooser shows three options (Bug Report, Feature Request, Documentation Improvement) with no "Open a blank issue" link visible.
**Why human:** `blank_issues_enabled: false` only takes effect in the GitHub web UI — cannot verify via file inspection alone.

#### 3. PR Template Auto-Population

**Test:** Open a new PR in the GitHub web UI.
**Expected:** PR body auto-populates with the Summary / Type of Change / Checklist / Testing Notes template from `pull_request_template.md`.
**Why human:** PR template rendering requires the GitHub UI; cannot verify via file inspection.

#### 4. Sponsors Button in Repo Header

**Test:** Check the repo header on GitHub.
**Expected:** A "Sponsor" button appears, linking to the farce1 GitHub Sponsors profile.
**Why human:** FUNDING.yml is correctly configured (`github: farce1`) but the button only activates once the farce1 account has enrolled in GitHub Sponsors. This is an external account state that cannot be verified programmatically.

### Gaps Summary

No gaps found. All files exist, are substantive (not stubs), and all key links are wired correctly. The 4 human verification items are UI/account-state confirmations that automation cannot substitute for — they are not blockers to goal achievement given the underlying artifacts are all correct.

Commit hashes from SUMMARY.md were verified against git log:

- `8890647` — CONTRIBUTING.md (exists)
- `06ae77b` — CODE_OF_CONDUCT.md, SECURITY.md, FUNDING.yml (exists)
- `955a453` — Issue form templates and config.yml (exists)
- `1dca9fa` — PR template (exists)

---

_Verified: 2026-02-18T10:30:00Z_
_Verifier: Claude (gsd-verifier)_
