# Phase 1: Community Health - Research

**Researched:** 2026-02-18
**Domain:** GitHub community health files (CONTRIBUTING.md, CODE_OF_CONDUCT.md, SECURITY.md, issue templates, PR template, FUNDING.yml)
**Confidence:** HIGH

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Contribution workflow

- Conventional Commits format (feat:, fix:, docs:, chore:) — aligns with release-please in Phase 2
- Community reviewers welcome; contributors encouraged to review each other's PRs, maintainer does final merge
- CONTRIBUTING.md includes full walkthrough: clone, install, run tests, lint, build — beginner-friendly
- Branch naming convention: type prefix (feat/description, fix/description, docs/description) matching commit types

#### Issue template design

- Three YAML-form templates: bug report, feature request, docs improvement
- Blank issues disabled via config.yml — all issues must use a template
- Bug report required fields: steps to reproduce, expected vs actual behavior, version, OS/environment; optional: screenshots, logs
- Each template auto-assigns its label (bug, enhancement, documentation)

#### Security & conduct

- Contributor Covenant v2.1 as the Code of Conduct
- Vulnerability reporting via GitHub's built-in private vulnerability reporting (no email)
- Response timeline: best effort — no specific SLA commitment
- Security fixes for latest published version only

### Claude's Discretion

- PR template checklist items and formatting
- Feature request and docs improvement template field design
- CONTRIBUTING.md section ordering and tone
- FUNDING.yml platform configuration
- Code of Conduct contact method details

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

## Summary

This phase creates all GitHub community health files from scratch. The project (`handover-cli` at `github.com/farce1/handover`) has no `.github` directory yet, so every file needs to be created. The domain is pure file authoring — no npm packages, no code compilation, no testing infrastructure changes. Every deliverable is a static file placed in the correct GitHub-recognized location.

GitHub's community health system is stable and well-documented. File locations, YAML syntax for issue forms, and the Contributor Covenant text are all verified from official sources. The only moving part is GitHub's form schema, which was noted as "in public preview" in their docs — but YAML issue forms have been in use since 2021 and the syntax is stable in practice.

The primary risk in this phase is incorrect file placement or YAML syntax errors that silently break form rendering. Labels referenced in issue templates must pre-exist in the repository before they auto-apply. GitHub Sponsors enrollment must happen separately from FUNDING.yml creation — the file links to it, but the sponsor profile must exist first.

**Primary recommendation:** Author all files in order of decreasing complexity (issue templates first since they have the most syntax specifics, then CONTRIBUTING.md as the most prose-heavy, then SECURITY.md/CODE_OF_CONDUCT.md as near-verbatim standard text, then FUNDING.yml as a one-liner).

---

## Standard Stack

### Core

| File                                 | Location                     | Purpose                 | GitHub Recognition                                           |
| ------------------------------------ | ---------------------------- | ----------------------- | ------------------------------------------------------------ |
| CONTRIBUTING.md                      | `.github/CONTRIBUTING.md`    | Contributor guide       | Linked from repo sidebar + new issue/PR notice               |
| CODE_OF_CONDUCT.md                   | `.github/CODE_OF_CONDUCT.md` | Community standards     | Surfaces in Community Standards health check                 |
| SECURITY.md                          | `.github/SECURITY.md`        | Vulnerability reporting | Security policy tab; enables "Report a vulnerability" button |
| `.github/ISSUE_TEMPLATE/bug.yml`     | `.github/ISSUE_TEMPLATE/`    | Bug report form         | YAML form with structured fields                             |
| `.github/ISSUE_TEMPLATE/feature.yml` | `.github/ISSUE_TEMPLATE/`    | Feature request form    | YAML form with structured fields                             |
| `.github/ISSUE_TEMPLATE/docs.yml`    | `.github/ISSUE_TEMPLATE/`    | Docs improvement form   | YAML form with structured fields                             |
| `.github/ISSUE_TEMPLATE/config.yml`  | `.github/ISSUE_TEMPLATE/`    | Template chooser config | Disables blank issues                                        |
| `.github/pull_request_template.md`   | `.github/`                   | PR checklist            | Auto-populates PR body                                       |
| `.github/FUNDING.yml`                | `.github/`                   | Sponsor button          | "Sponsor" button in repo header                              |

### No npm packages required

This entire phase is file authoring only. No dependencies, no scripts, no build step.

### Alternatives Considered

| Standard                  | Alternative              | Tradeoff                                                                                                |
| ------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------- |
| YAML issue forms (.yml)   | Markdown templates (.md) | Markdown templates don't enforce structure; YAML forms provide validated fields and are locked decision |
| `.github/` placement      | Root or `docs/`          | `.github/` keeps repo root clean; all files still recognized by GitHub                                  |
| Contributor Covenant v2.1 | Custom CoC               | v2.1 is locked decision; established text, widely recognized                                            |

---

## Architecture Patterns

### Recommended File Structure

```
.github/
├── CONTRIBUTING.md
├── CODE_OF_CONDUCT.md
├── SECURITY.md
├── FUNDING.yml
├── pull_request_template.md
└── ISSUE_TEMPLATE/
    ├── config.yml
    ├── bug.yml
    ├── feature.yml
    └── docs.yml
```

All files live under `.github/`. GitHub checks `.github/`, root, then `docs/` — `.github/` is the standard convention for keeping the root clean.

### Pattern 1: YAML Issue Form Structure

**What:** Each issue template is a `.yml` file with top-level metadata and a `body` array of typed form fields.

**When to use:** All three issue templates (bug, feature, docs) use this structure.

**Verified syntax** (Source: https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms):

```yaml
name: Bug Report
description: File a bug report
title: '[Bug]: '
labels: ['bug']
body:
  - type: markdown
    attributes:
      value: |
        Thanks for taking the time to fill out this bug report!
  - type: textarea
    id: what-happened
    attributes:
      label: What happened?
      description: Also tell us what you expected to happen
      placeholder: Tell us what you see
    validations:
      required: true
  - type: input
    id: version
    attributes:
      label: Version
      placeholder: 'e.g. 0.1.0'
    validations:
      required: true
  - type: dropdown
    id: os
    attributes:
      label: Operating System
      options:
        - macOS
        - Linux
        - Windows
    validations:
      required: true
  - type: textarea
    id: steps
    attributes:
      label: Steps to Reproduce
      placeholder: "1. ...\n2. ...\n3. ..."
    validations:
      required: true
  - type: textarea
    id: logs
    attributes:
      label: Logs (optional)
      render: shell
```

### Pattern 2: Issue Template Config (Disabling Blank Issues)

**What:** `config.yml` controls the template chooser behavior.

**When to use:** Required — locks decision to disable blank issues.

**Verified syntax** (Source: https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/configuring-issue-templates-for-your-repository):

```yaml
blank_issues_enabled: false
contact_links:
  - name: GitHub Discussions
    url: https://github.com/farce1/handover/discussions
    about: Ask questions or share ideas
```

### Pattern 3: FUNDING.yml

**What:** Single file pointing to GitHub Sponsors username.

**Verified syntax** (Source: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/displaying-a-sponsor-button-in-your-repository):

```yaml
github: farce1
```

Multiple platforms can be added; GitHub Sponsors is the only locked decision here.

### Pattern 4: PR Template Markdown

**What:** Standard Markdown file that auto-populates the PR body.

**Location:** `.github/pull_request_template.md`

**Recommended structure** (Claude's Discretion):

```markdown
## Summary

<!-- Describe the change and why it's needed -->

Closes #

## Type of Change

- [ ] feat: new feature
- [ ] fix: bug fix
- [ ] docs: documentation
- [ ] chore: maintenance / refactor

## Checklist

- [ ] Tests pass (`npm test`)
- [ ] Types check (`npm run typecheck`)
- [ ] Changelog entry added (if user-facing change)
- [ ] Docs updated (if behaviour changed)
- [ ] Commit messages follow Conventional Commits format

## Testing Notes

<!-- How was this tested? -->
```

### Pattern 5: CONTRIBUTING.md Section Ordering

**Recommended section order** (Claude's Discretion — beginner-friendly, matches locked decisions):

1. Welcome / project intro (1 paragraph)
2. Prerequisites (Node >=18, git)
3. Getting started: clone, install, run
4. Running tests (`npm test`)
5. Linting and type checking (`npm run typecheck`)
6. Building (`npm run build`)
7. Branch naming convention
8. Commit message format (Conventional Commits)
9. Opening an issue
10. Submitting a pull request (PR process, reviewer policy)
11. Code review process
12. Architecture overview (brief tour of `src/` subdirectories)

### Anti-Patterns to Avoid

- **Using Markdown issue templates (.md) instead of YAML forms (.yml):** Markdown templates don't enforce required fields and allow free-form text that bypasses structure.
- **Referencing labels that don't exist:** Labels specified in `labels:` of a template must exist in the repo before GitHub auto-applies them. Create labels first or document this in the plan.
- **Putting issue templates in wrong folder:** Must be `.github/ISSUE_TEMPLATE/` (exact capitalization). GitHub won't recognize templates in `ISSUE_TEMPLATE/` at repo root for the form chooser.
- **Using .yaml extension:** GitHub requires `.yml` extension for issue form templates, not `.yaml`.
- **Omitting `id` on form fields:** Fields without `id` can't be referenced; good practice to include on all non-markdown fields.

---

## Don't Hand-Roll

| Problem                     | Don't Build       | Use Instead                            | Why                                                           |
| --------------------------- | ----------------- | -------------------------------------- | ------------------------------------------------------------- |
| Code of Conduct text        | Custom policy     | Contributor Covenant v2.1 verbatim     | Established, recognized, linked from GitHub CoC detection     |
| Enforcement guidelines      | Custom tiers      | CC v2.1 four-tier ladder               | Standard, expected by contributors                            |
| Security disclosure process | Custom email flow | GitHub private vulnerability reporting | Built into GitHub, no setup required, no email address needed |

**Key insight:** All three "template" documents (CoC, Security, Contributor Covenant) have established canonical text. Deviation from the verbatim text adds friction without benefit.

---

## Common Pitfalls

### Pitfall 1: Labels Must Pre-Exist

**What goes wrong:** Issue template specifies `labels: ["bug"]` but the label doesn't exist in the repo. GitHub silently skips label application — no error is shown.

**Why it happens:** GitHub can't create labels on-the-fly from template definitions.

**How to avoid:** Create the three required labels (`bug`, `enhancement`, `documentation`) in the repo before or during this phase. Document label creation as a task step.

**Warning signs:** After filing a test issue using the template, the label is absent.

### Pitfall 2: YAML Syntax Errors in Issue Forms

**What goes wrong:** Malformed YAML causes the template to not appear in the issue chooser, or to appear but render incorrectly. GitHub shows no error in the UI.

**Why it happens:** YAML is whitespace-sensitive; indentation errors are invisible.

**How to avoid:** Validate YAML locally before committing. Use a YAML linter (`npx js-yaml file.yml` or online tool). Test by filing a draft issue in a branch.

**Warning signs:** Template chooser shows template name but clicking it shows a blank form, or template doesn't appear at all.

### Pitfall 3: GitHub Sponsors Must Be Enrolled Separately

**What goes wrong:** FUNDING.yml is committed but no "Sponsor" button appears, or the button leads to a 404.

**Why it happens:** FUNDING.yml only configures the button; the GitHub Sponsors account must be separately enrolled at github.com/sponsors. Enrollment is a manual step that GitHub must approve.

**How to avoid:** Note in the plan that FUNDING.yml creation is complete but the button will only activate once Sponsors enrollment is approved. This is out of scope for the phase itself.

**Warning signs:** Button appears but links to an empty/error page.

### Pitfall 4: Private Vulnerability Reporting Must Be Enabled

**What goes wrong:** SECURITY.md directs users to the "Report a vulnerability" button, but the button doesn't appear because private vulnerability reporting is disabled on the repo.

**Why it happens:** Private vulnerability reporting is not enabled by default on all repos. It must be explicitly enabled in repo Settings > Security > Private vulnerability reporting.

**How to avoid:** Include repo setting enablement as a task step alongside SECURITY.md creation. Available for public repos on Free/Pro/Team/Enterprise Cloud plans.

**Warning signs:** Advisories tab exists but no "Report a vulnerability" button is present.

### Pitfall 5: PR Template Filename Case Sensitivity

**What goes wrong:** Template file named `PULL_REQUEST_TEMPLATE.md` (uppercase) works on case-insensitive filesystems (macOS) but GitHub recognizes both cases. The conventional lowercase `pull_request_template.md` in `.github/` is the safe choice.

**How to avoid:** Use `.github/pull_request_template.md` (lowercase).

---

## Code Examples

Verified patterns from official GitHub documentation:

### Bug Report Template (`.github/ISSUE_TEMPLATE/bug.yml`)

```yaml
name: Bug Report
description: File a bug report to help us improve
title: '[Bug]: '
labels: ['bug']
body:
  - type: markdown
    attributes:
      value: |
        Thanks for taking the time to fill out this bug report!
  - type: textarea
    id: steps
    attributes:
      label: Steps to Reproduce
      description: How do you reproduce this bug?
      placeholder: "1. Run `npx handover-cli generate`\n2. ...\n3. See error"
    validations:
      required: true
  - type: textarea
    id: expected
    attributes:
      label: Expected Behavior
      description: What did you expect to happen?
    validations:
      required: true
  - type: textarea
    id: actual
    attributes:
      label: Actual Behavior
      description: What actually happened?
    validations:
      required: true
  - type: input
    id: version
    attributes:
      label: handover-cli Version
      placeholder: 'e.g. 0.1.0 (run `npx handover-cli --version`)'
    validations:
      required: true
  - type: dropdown
    id: os
    attributes:
      label: Operating System
      options:
        - macOS
        - Linux
        - Windows
    validations:
      required: true
  - type: input
    id: node-version
    attributes:
      label: Node.js Version
      placeholder: 'e.g. 20.10.0 (run `node --version`)'
    validations:
      required: true
  - type: textarea
    id: logs
    attributes:
      label: Relevant Logs or Screenshots (optional)
      description: Paste any error output or attach screenshots
      render: shell
  - type: checkboxes
    id: existing-issues
    attributes:
      label: Checks
      options:
        - label: I have searched existing issues and this is not a duplicate
          required: true
```

### Feature Request Template (`.github/ISSUE_TEMPLATE/feature.yml`)

Design recommendation (Claude's Discretion):

```yaml
name: Feature Request
description: Suggest an idea or enhancement for handover-cli
title: '[Feature]: '
labels: ['enhancement']
body:
  - type: markdown
    attributes:
      value: |
        Thanks for your suggestion! Please fill out the details below.
  - type: textarea
    id: problem
    attributes:
      label: Problem or Motivation
      description: Is your feature request related to a problem? Describe it.
      placeholder: I'm always frustrated when...
    validations:
      required: true
  - type: textarea
    id: solution
    attributes:
      label: Proposed Solution
      description: Describe the solution you'd like
    validations:
      required: true
  - type: textarea
    id: alternatives
    attributes:
      label: Alternatives Considered
      description: Any alternative solutions or workarounds you've considered?
  - type: textarea
    id: context
    attributes:
      label: Additional Context
      description: Add any other context, screenshots, or examples
  - type: checkboxes
    id: existing-issues
    attributes:
      label: Checks
      options:
        - label: I have searched existing issues and this is not a duplicate
          required: true
```

### Docs Improvement Template (`.github/ISSUE_TEMPLATE/docs.yml`)

Design recommendation (Claude's Discretion):

```yaml
name: Documentation Improvement
description: Report missing, incorrect, or unclear documentation
title: '[Docs]: '
labels: ['documentation']
body:
  - type: markdown
    attributes:
      value: |
        Help us improve our documentation!
  - type: input
    id: location
    attributes:
      label: Documentation Location
      description: Which file or page needs improvement?
      placeholder: 'e.g. README.md, CONTRIBUTING.md, --help output'
    validations:
      required: true
  - type: textarea
    id: current
    attributes:
      label: Current Documentation
      description: What does the current documentation say? (quote or describe)
  - type: textarea
    id: problem
    attributes:
      label: What's Wrong or Missing
      description: What is incorrect, unclear, or missing?
    validations:
      required: true
  - type: textarea
    id: suggestion
    attributes:
      label: Suggested Improvement
      description: What should it say instead?
  - type: checkboxes
    id: existing-issues
    attributes:
      label: Checks
      options:
        - label: I have searched existing issues and this is not a duplicate
          required: true
```

### Template Config (`.github/ISSUE_TEMPLATE/config.yml`)

```yaml
blank_issues_enabled: false
contact_links:
  - name: GitHub Discussions
    url: https://github.com/farce1/handover/discussions
    about: Ask a question or share an idea — not a bug or feature request
```

### SECURITY.md Key Sections

```markdown
## Reporting a Vulnerability

**Do not report security vulnerabilities through public GitHub issues.**

To report a vulnerability privately, please use GitHub's built-in private
vulnerability reporting:

1. Go to the [Security Advisories page](https://github.com/farce1/handover/security/advisories)
2. Click **"Report a vulnerability"**
3. Fill in the details

We will acknowledge receipt and respond on a best-effort basis.

## Supported Versions

Security fixes are applied to the **latest published version** only.

## Disclosure Policy

We follow coordinated disclosure. Please give us reasonable time to address
the issue before public disclosure.
```

### CODE_OF_CONDUCT.md

Use the Contributor Covenant v2.1 verbatim from https://www.contributor-covenant.org/version/2/1/code_of_conduct/

For the `[INSERT CONTACT METHOD]` placeholder in the Enforcement section, the Claude's Discretion recommendation is to use the GitHub private vulnerability reporting link or the project's GitHub Discussions — avoid exposing personal email addresses. A practical choice:

```
Please report violations by [opening a private report](https://github.com/farce1/handover/security/advisories/new)
or contacting the maintainer through GitHub.
```

---

## State of the Art

| Old Approach                        | Current Approach                                            | When Changed        | Impact                                                             |
| ----------------------------------- | ----------------------------------------------------------- | ------------------- | ------------------------------------------------------------------ |
| Markdown issue templates (`.md`)    | YAML issue forms (`.yml`)                                   | 2021                | Forms enforce structure; required fields; no free-form workarounds |
| Email-based vulnerability reporting | GitHub private vulnerability reporting                      | 2022                | No email needed; built into GitHub; advisories managed in UI       |
| Manual CoC writing                  | Contributor Covenant standard                               | ~2014, v2.1 in 2022 | Industry standard; widely recognized                               |
| Single PR template                  | Multiple PR templates (via `PULL_REQUEST_TEMPLATE/` folder) | 2019                | Not needed for this project; single template is correct approach   |

**Deprecated/outdated:**

- Markdown issue templates (`.md` in `ISSUE_TEMPLATE/`): Still work but don't enforce structure. Decision is locked to YAML forms.
- `ISSUE_TEMPLATE.md` at root: Very old pattern, predates the `ISSUE_TEMPLATE/` directory. Do not use.
- `.github/CODEOWNERS`: Not in scope for this phase (no CI/CD yet).

---

## Open Questions

1. **GitHub Sponsors enrollment status**
   - What we know: FUNDING.yml with `github: farce1` is correct syntax; the button activates only after Sponsors enrollment
   - What's unclear: Whether the GitHub Sponsors profile for `farce1` is already enrolled
   - Recommendation: FUNDING.yml task creates the file and notes that Sponsors enrollment is a manual step outside this phase's scope

2. **Labels pre-existence**
   - What we know: Labels `bug`, `enhancement`, `documentation` must exist for auto-labeling to work
   - What's unclear: Whether these default labels already exist in the `farce1/handover` repo (GitHub creates `bug` and `enhancement` by default in new repos, but `documentation` may need to be created)
   - Recommendation: Task 01-02 should include a step to verify/create all three labels

3. **Contact method in CODE_OF_CONDUCT.md**
   - What we know: The placeholder `[INSERT CONTACT METHOD]` must be replaced; Claude's Discretion area
   - What's unclear: Maintainer's preference (GitHub Discussions link vs GitHub private report link vs generic "contact via GitHub")
   - Recommendation: Use GitHub private advisory link as it's already established in SECURITY.md; keeps everything in one ecosystem

---

## Sources

### Primary (HIGH confidence)

- https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/creating-a-default-community-health-file — File names, locations, GitHub recognition behavior
- https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-issue-forms — Issue form top-level metadata fields (name, description, title, labels, assignees, body)
- https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/syntax-for-githubs-form-schema — Complete form schema: all 5 field types, all attributes, validations
- https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/configuring-issue-templates-for-your-repository — config.yml syntax (blank_issues_enabled, contact_links)
- https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/displaying-a-sponsor-button-in-your-repository — FUNDING.yml syntax and all 12 supported platforms
- https://docs.github.com/en/code-security/security-advisories/working-with-repository-security-advisories/configuring-private-vulnerability-reporting-for-a-repository — Private vulnerability reporting feature details
- https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/creating-a-pull-request-template-for-your-repository — PR template file locations and behavior
- https://www.contributor-covenant.org/version/2/1/code_of_conduct/ — Contributor Covenant v2.1 verbatim text

### Secondary (MEDIUM confidence)

- WebSearch: GitHub PR template best practices — corroborated by official docs; checklist approach is near-universal community standard
- WebSearch: CONTRIBUTING.md best practices — consistent across multiple sources; section ordering is Claude's Discretion so no lock-in risk

### Tertiary (LOW confidence)

- None — all critical claims verified against official GitHub documentation

---

## Metadata

**Confidence breakdown:**

- File names and locations: HIGH — verified against official GitHub docs
- YAML issue form syntax: HIGH — verified against official form schema docs
- config.yml syntax: HIGH — verified against official docs
- FUNDING.yml syntax: HIGH — verified against official docs
- Private vulnerability reporting: HIGH — verified against official security docs
- PR template structure: MEDIUM — official docs confirm location/behavior; checklist content is Claude's Discretion
- CONTRIBUTING.md content: MEDIUM — section ordering is Claude's Discretion; locked decisions (Conventional Commits, branch naming, walkthrough steps) are fully specified
- Labels pre-existence: MEDIUM — behavior verified; actual repo state unknown

**Research date:** 2026-02-18
**Valid until:** 2026-08-18 (GitHub docs are stable; community health file system rarely changes)
