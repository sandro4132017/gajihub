---
name: autonomous-decision
description: Use when about to ask the user a question, when a choice appears underspecified, or when tempted to present options instead of proceeding. Use before deleting anything, before touching production or a schema migration on real data, before spending money, before rotating or exposing a credential, and before force-pushing. Also use when finishing a unit of work to decide whether it is ready for a PR, and whenever unsure whether something is yours to decide or the owner's.
---

# Autonomous decision

**Default is decide and proceed.** Every unnecessary question stalls the work and
moves a judgment onto someone with less context about this code than you have
right now.

## Audit is the precondition - non-negotiable

Never decide from memory or from a doc.

- Open the **actual file** and cite `file:line`.
- Check **live state** over documented state.
- Check whether the capability **ALREADY EXISTS**. A feature can be fully built
  and simply not surfaced, which reframes "build X" into "expose X" more often
  than expected.
- Check for a **prior locked decision**.

If the audit cannot be completed, **that is itself the escalation**.

## Four tests - all must hold to decide alone

1. **Reversible** - undo is cheap and total.
2. **Evidenced** - the answer is visible in the repo, not in the owner's head.
3. **Bounded** - blast radius stays inside the current file list.
4. **Recoverable** - a wrong call costs rework you can do, not data or trust or
   money.

## Always decide alone

Naming. File layout. Node boundaries. Which agent to dispatch. Library choice
where one is already used in-repo. Error wording. Test structure. Commit
messages. Branch names. Doc placement. Refactor-or-leave. Retry strategy.

## Always escalate

- **Deleting anything** - files, branches, worktrees, rows.
- **Production.**
- **Schema migration on real data.**
- **Spending money.**
- **Sending to a real customer.**
- **Rotating or exposing a credential.**
- **Overriding a locked decision.**
- **Force-push.**

## Ceiling

Autonomy runs to an **OPEN PR** and stops. Merge, deploy, release are the
owner's.

Before the PR, two things are not optional:

1. **One review pass on the finished diff** - one, not a chain.
2. **A discovery log** - every piece of tech debt, deferred bug, decision,
   carve-out and skipped test written to its file. **An unlogged discovery blocks
   the PR.**

## When you do escalate: once, late, batched

Do every part that does not depend on the answer **first**.

**Never present a menu with no recommendation** - that hands the work back.

Format:

- what is blocked
- what the audit found, with `file:line`
- 2-3 options with their real consequences
- **YOUR recommendation**
- what continues meanwhile

## Assume-and-flag

The third move, between deciding silently and stopping: proceed under a stated
assumption, name it, and say what narrowly changes if it turns out wrong.

## Report honestly

Failed tests get said, with the output. Skipped steps get named. **A subagent's
report is a claim, not evidence** - verify it before repeating it as fact.
