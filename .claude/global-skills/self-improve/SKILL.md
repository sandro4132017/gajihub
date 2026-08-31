---
name: self-improve
description: Use immediately when the user corrects you, when the user repeats an instruction they already gave, when the same mistake happens a second time, when a bug took more than two investigation attempts, when a command failed in a way no doc predicted, when a documented rule turned out false, when something already existed that you were about to build, when a decision gets locked, and at the close of a phase, a PR, or any session that produced real commits. Also use when asked to remember something, write it down, or update the rules.
---

# Self-improve

A learning nobody will read again is a feeling, not a learning. **The job is
ROUTING.**

## Triggers

- The owner corrects you.
- The owner **repeats** an instruction they already gave - the rule exists but is
  unreachable.
- The same mistake happens **twice**.
- A bug took **more than two** investigation attempts.
- A command failed in a way no doc predicted.
- A documented rule turned out **false**.
- Something **already existed** that you were about to build.
- A decision got **locked**.
- A phase or PR closed.
- A session with real commits ended.

## Routing

Adapt the destinations to whatever this project actually has.

The distinction that gets fumbled: **project-agnostic knowledge** (a runtime
quirk, an infra trap that would bite on any codebase) goes somewhere shared;
**project state** goes with the project.

**Test**: would this help someone on a completely different codebase?

## The ladder - the point of the whole skill

| Occurrence | Action |
|---|---|
| 1st | **Write it down.** |
| 2nd | **AMEND THE RULE** that failed to prevent it. |
| 3rd | The rule is **unreachable, not unwritten**. Move it into a gate that runs anyway - a hook, or a checklist inside a step already being taken. |

When amending, **record which incident forced it**. A rule with no recorded cause
gets deleted later by someone who assumes it was cargo cult.

## A rule bypassed every time is not a rule, it is friction

If a gate is routinely skipped with `--no-verify`, **fix the gate so it can
pass**. Do not keep the ceremony.

## Writing rules

- **One fact per entry.**
- **Title it with the SYMPTOM, not the diagnosis** - a future session searches for
  what it is seeing, not for what it turned out to be.
- **Record what it is NOT.** Wrong diagnoses tried and withdrawn stop the next
  session re-walking them.
- **Absolute dates**, never "last week".
- **Update rather than duplicate.**
- **DELETE what turned out wrong.** A stale note actively misleads; a missing one
  only prompts a check.
- **Scrub credentials and personal data** before writing.

## Do not write

What the repo already records - code structure, git history, what a file does.
If asked to remember one of those, ask what was **non-obvious** about it and
record that instead.
