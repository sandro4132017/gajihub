---
name: hygiene-sweep
description: Use AT SESSION START on unfamiliar ground, before opening a PR, and at session close. Use when a status doc, README, progress table or CLAUDE.md claim is about to be trusted or repeated. Use when disk is filling, when git worktree list disagrees with what is on disk, when branches have piled up, or when asked to clean up, tidy, prune, or check whether the docs are still true.
---

# Hygiene sweep

Two kinds of debris, both silent.

- **Physical** - worktrees that outlived their merge, merged branches, build
  caches, stray clone folders.
- **Informational** - a doc that describes a world that moved on. This costs far
  more, because it is read and believed.

> **A stale doc is worse than a missing one.** Missing prompts a check; stale
> prompts confidence.

## The rule that prevents the problem

**Every claim about current state carries the evidence that produced it and the
command that re-checks it.**

A status table with no as-of date cannot be audited, so nobody audits it, so it
rots. Prefer a pointer ("run X") over a snapshot whenever the snapshot has no
reason to persist.

## Physical sweep

- `git worktree list` and `git worktree prune`. A directory that **looks like** a
  worktree but is not registered is an orphan - a `worktree remove` that never
  finished.
- Before proposing removal, **BOTH** must hold:
  1. the tree is clean, and
  2. the branch is fully merged - `git rev-list --count base..branch` = 0.
- **Copy out any built artifact first.**
- Also sweep: merged branches, and `du -sh` on build caches. Build caches are the
  usual disk killer and are routinely misread as a code bug.

## Informational sweep - four verdicts

| Verdict | Action |
|---|---|
| **CURRENT** | Re-stamp the date - **but only after actually re-running the check**. Re-stamping without re-running manufactures false confidence at zero cost and makes the whole convention worthless. |
| **STALE** | Fix in the same turn. Never defer. |
| **SUPERSEDED** | **Do not delete.** Mark it and point forward, or you lose the reasoning and create two live doors. |
| **WRONG** | A note naming a symbol that no longer exists - delete it **and its index entry**, because it loads into every future session. |

## Removal is destructive and always escalates

Audit and recommend. **Never delete alone.**

## When it runs

- Before opening a PR.
- At session close.
- **AT SESSION START on unfamiliar ground** - the highest-value moment, because a
  stale doc read in the first five minutes steers the whole session.
