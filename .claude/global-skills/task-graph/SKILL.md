---
name: task-graph
description: Use BEFORE writing code for any task with more than one moving part - a multi-file feature, a migration plus its callers, a review that fans out, a batch of fixes. Use when about to say "first I'll... and then I'll...", when deciding whether to dispatch subagents, when work is about to run serially that could run at once, or when a plan has more than three steps. Also use when a node has failed twice, when deciding how to cut commits, and when asked to parallelize, fan out, orchestrate, or speed up a long task.
---

# Task graph

Work has a shape. What runs before what, what can run at once, what must wait -
that shape is a graph. A linear plan is a degenerate graph where most arrows are
just the order you happened to type things in.

**Core test**: for every "and then", ask whether the next step READS the previous
step's output. If not, there is no edge, and the wait is invented.

## Node contract

Every node declares, before it runs:

- **Explicit input.** Never "it'll see the conversation" - a subagent has its own
  context and inherits nothing you did not write into the prompt.
- **A defined output shape.** A JSON schema when a later step is code, so a
  mismatch retries instead of handing you free text to parse.
- **Its exact file list.** No globs. This list is what makes the collision check
  below possible at all.
- **Forbidden surfaces.** What it must not touch, named.
- **A done-when gate that is a command**, not "it looks right".

## Edges are free

Flatten, dedupe, filter, rank, merge, reshape - that is plain code between nodes,
not an agent. A large share of the tokens people burn on "orchestration" is really
an edge wearing an agent costume.

## Topology

The workhorse is the diamond: split, fan out, reduce, synthesize.

**DEFAULT TO A PIPELINE, NOT A BARRIER.** A barrier makes everything wait for the
slowest node. A pipeline streams each item through all stages independently, so
item A can be in stage 3 while B is still in stage 1.

A barrier is justified ONLY when a stage genuinely needs every prior result at
once - a cross-set dedupe, an early-exit on the total, a prompt that compares
against "the other findings". "It's cleaner code" and "the stages feel separate"
are not reasons. **Separate is not the same as synchronized.**

## Concurrency: two caps, not one

**Write lanes** (an agent editing files): **MAX 4**, and only when every pair is
disjoint on all four axes:

1. **Files** - the same file is a collision even for different functions.
2. **Migrations** - numbering collides on merge.
3. **Global surfaces** - exactly one lane may touch `package.json` / route
   registries / barrel `index` / lockfiles / boot wiring. Assign it, and forbid
   it explicitly in the other prompts.
4. **Git** - the lead is the only git owner. Sub-agents never run
   `add`/`commit`/`checkout`/`push`/`stash`.

**Read-only lanes** (research, review, verify): up to **8**. They cannot collide,
and capping them at 4 would make adversarial verification impossible.

If a pair collides, **re-cut the node boundaries**. That is almost always
possible, and always better than a conflict resolved by an agent that cannot see
the other lane.

**Dispatch a whole wave in ONE message with multiple tool calls**, or the lanes
run serially and the graph bought you nothing.

## Verifiers on edges

Leverage is not more agents, it is structure around them. A verifier's job is to
**KILL** a finding; only survivors pass.

- **Adversarial** - N skeptics each prompted to refute. Default to refuted when
  uncertain. Keep on majority survival.
- **Perspective-diverse** - each verifier gets a distinct lens (correctness,
  security, does-it-reproduce). Diversity catches what N identical checks cannot.
- **Judge panel** - N attempts from different angles, scored in parallel,
  synthesize from the winner while grafting in the runners-up.

A **"critical" verdict requires a concrete repro**: `file:line` plus named inputs,
leading to a wrong output or a crash. "Could be cleaner" caps at warning.

## Cycles that converge

For unknown-size discovery, loop until K consecutive rounds surface nothing new.

**The detail that breaks it**: dedupe against **EVERYTHING SEEN**, not against
confirmed results. Dedupe against confirmed only, and every rejected finding
returns each round - a machine that pays forever to rediscover the same dead ends.

## Per-node loop

Implement, verify, on red fix and retry.

**THREE FAILED ATTEMPTS ON ONE NODE MEANS STOP.** Past three, the model of the
problem is wrong, not the code. Re-cut the node or escalate.

## Commits

**One commit per node.** If you cannot write a single conventional-commit subject
for it, it is two nodes. It must leave the tree green on its own.

Stage explicit paths - **never `-A`, never `-am`, never `.`** - then confirm
`git diff --cached --name-only` equals the node's file list.

**Push per node.** An unpushed commit is invisible work that a crash, or someone
else's push, destroys or entangles.

**SQUASH IS FORBIDDEN.** Ten nodes merged with `--merge` or `--rebase` land ten
commits; squashed they land one and the other nine are gone with the branch.
Noisy history is fixed by re-cutting boundaries with rebase, never by collapsing
them.

## Model tiering

Bounded repetitive nodes run cheap; nodes carrying real judgment run expensive.
By default every subagent inherits the session model, so a big fan-out bills
entirely at the top tier unless you say otherwise.

## Anti-patterns

- The big-bang node.
- Four agents on one module.
- Barrier by default.
- Deferred push.
- Verifying only at the end.
- **Nodes cut by file type** ("all schemas", "all tests") instead of by
  dependency - that produces nodes which never compile alone.
