---
name: atomic-commit
description: Stage isolated task changes locally and create standardized Conventional Commits. Never push to remote. Never touch or discard other agents' uncommitted files.
---

# Atomic Commit

Use this skill to isolate, stage, validate, and commit changes locally on the current branch using the Conventional Commits specification.
**Rule: Do not push to remote inside this skill.**

## 1. Staging Policy

1. **Active Agent Task Context (DEFAULT - STRICT ISOLATION)**:
   - Stage **ONLY** files explicitly created or modified for your current assigned task:
     ```bash
     git add src/path/to/my-file1.ts src/path/to/my-file2.test.ts
     ```
   - **STRICTLY FORBIDDEN:**
     - **NEVER** run `git checkout -- .`, `git checkout HEAD -- <dir>`, `git restore .`, or `git reset --hard` to revert untracked/modified files created by other agents or skills (such as `.agents/skills/*`, user edits, or parallel agent worktrees).
     - **NEVER** touch, overwrite, discard, or clean unrelated dirty files. Leave all other files untouched in the working tree.
     - **NEVER** run `git add -A` or `git add .` unless explicitly requested by the user.

2. **Explicit User Request to Stage All**:
   - Only when user explicitly says "commit everything" or "stage all":
     ```bash
     git status --short
     git add -A
     ```

## 2. Commit Message Structure (Conventional Commits)

Format: `<type>(<scope>): <description>`

```
<type>(<scope>): <short imperative description>

[optional body: detailed explanation of what changed and why]

[optional footer: BREAKING CHANGE: details, or issue refs]
Co-Authored-By: Claude <noreply@anthropic.com>
```

### Allowed Types
- `feat`: New feature or capability
- `fix`: Bug fix
- `docs`: Documentation only changes
- `style`: Formatting, missing semi colons, white-space (no code logic changes)
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `perf`: Performance improvement
- `test`: Adding or correcting tests
- `build`: Build system or external dependency changes
- `ci`: CI configuration and script changes
- `chore`: Maintenance tasks, meta files
- `revert`: Reverting previous commit

### Rules & Validation
- **Type**: Must be one of the allowed types. Use `feat!` or `fix!` with breaking changes.
- **Scope**: Lowercase noun describing module/feature touched (e.g., `(projects)`, `(api)`, `(skills)`, `(ui)`). Optional but recommended.
- **Description**: Imperative mood ("add", "fix", "update", not "added" or "fixes"), lowercase start, no period at the end.
- **Footer**: Include `Co-Authored-By: Claude <noreply@anthropic.com>` on every commit.

### Examples
- `feat(projects): add batch generator retry handler`
- `fix(ui): correct dialog close button alignment`
- `docs(skills): merge conventional commit into atomic commit`
- `refactor(db): streamline query caching logic`
- `feat(auth)!: require email verification on registration`

## 3. Execution Workflow

1. Inspect modified files and staged diff:
   ```bash
   git status --short
   git add <only-task-files>
   git diff --staged --stat
   ```

2. Commit locally:
   ```bash
   git commit -m "type(scope): concise description

   [optional body]

   Co-Authored-By: Claude <noreply@anthropic.com>"
   ```

3. Confirm commit creation:
   ```bash
   git log -n 1 --oneline
   ```
