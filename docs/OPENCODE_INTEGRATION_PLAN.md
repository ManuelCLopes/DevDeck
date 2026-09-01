# DevDeck × OpenCode — Simplification Plan

**Document type:** Engineering plan
**Product:** DevDeck
**Capability:** Embedded terminals and OpenCode integration
**Status:** Phase 1 shipped, Phases 2–4 proposed
**Last updated:** 2026-09-01

---

## 1. The question this plan answers

If running `opencode` in a normal terminal is simpler than running it inside
DevDeck, DevDeck should not embed it at all. Everything below is written
against that bar: each piece of the integration either does something a bare
terminal cannot, or it should be removed.

What a bare terminal already does well, and DevDeck must not try to improve
on:

- rendering the OpenCode interface;
- its slash commands, agent switching, and model picker;
- scrollback, selection, and copy/paste.

What a bare terminal cannot do, and where DevDeck earns its place:

- creating a git worktree and starting the tool inside it in one step;
- showing which sessions exist across every tracked project;
- attaching a run to a project, a branch, and a task so token usage and
  traces roll up on the Agents page;
- holding several sessions side by side and keeping them alive while you
  work elsewhere in the app.

**Principle: DevDeck sets up and accounts for the work. OpenCode does the
work. The terminal is the interface, not a thing to wrap.**

---

## 2. Why it did not feel that way

Four defects, all now fixed, made the embedded experience worse than a plain
terminal window. They are recorded here because they explain the shape of the
remaining phases.

### 2.1 The terminal was never told how big it was

The renderer spawned every PTY at a hardcoded 80×24. The only code that
resized it ran from a `ResizeObserver` that fired once, on `observe`, while
the spawn was still in flight — at which point there was no process id to
resize, so it returned early and never ran again. The PTY stayed at 80×24 for
its whole life while xterm fitted itself to the pane, which is why OpenCode
drew its interface into a small box in the corner of a large pane.

### 2.2 Leaving the page threw the session away

The default pane was computed during render and never written to local
storage. The pane id is the PTY persistence key, so every mount minted a new
one: the shell from the previous visit was orphaned (still running, no longer
reachable) and a fresh one spawned in its place. Renaming a pane did the same
thing, because the label was part of the session signature.

### 2.3 The page was boxed into a reading column

`AppLayout` wrapped every page in `max-w-[1200px]` with `lg:p-8`. That is
right for a document and wrong for a workspace: on a wide display most of the
window was margin.

### 2.4 The agent and workflow lists were not real

The launcher's dropdowns were populated by scraping every markdown heading out
of `AGENTS.md` and `CLAUDE.md`, so they offered entries like "Java / build
environment" and "Before considering a change done". Meanwhile the real
definitions were skipped: OpenCode's config uses the singular `agent` and
`command` maps, and the parser only looked for plural `agents` / `workflows`
before falling back to treating the whole file as a list of agents — which
turned every other section of an `opencode.json` (`mcp`, `permission`,
`provider`) into an agent as well.

---

## 3. Phase 1 — make the embedded terminal trustworthy *(shipped)*

| Change | Effect |
| --- | --- |
| Measure the pane before spawning; re-measure after layout settles; remember the size while the process starts | OpenCode fills its pane |
| Push size changes on font-size changes too | Personalisation no longer desynchronises the process |
| Persist the pane list; treat local storage as the only source of truth | Navigating away and back re-attaches to the running shell |
| Nudge the PTY by one row and back on re-attach | Full-screen TUIs repaint instead of showing stale scrollback |
| Drop the label from the session signature | Renaming a pane no longer kills the shell |
| `AppLayout` gains a `fullBleed` mode; Terminals uses it | The grid gets the whole window |
| Read `agent` / `command` from OpenCode config; stop scraping doc headings | The dropdowns list what actually exists, or nothing |
| Launcher asks for the task only; branch, base, agent and workflow move behind a disclosure | One decision instead of five |
| Session polling: 3s → 15s, paused while the window is hidden | Stops hammering the OpenCode server DevDeck spawns |

**Exit criterion, met:** a session survives navigating to another page and
back, and OpenCode renders at full pane size.

---

## 4. Phase 2 — one way to start OpenCode

Today a session can begin from at least four places, each building a slightly
different pane and tracking the run differently:

1. the launcher (`?launch=opencode&project=…`) — creates a worktree, an agent
   run, and trace capture;
2. the "Split with… → OpenCode" quick shell — creates none of that;
3. `?launch=opencode&session=…` from the sidebar — adopts a pane, or opens a
   dialog asking which one;
4. `OpenInCodeButton`, which launches the external application entirely.

**Work:** collapse 1–3 onto a single `startOpenCodeSession(options)` in the
renderer that always produces the same pane config and the same `AgentRun`,
with the worktree step optional. Route 4 stays, clearly labelled as leaving
DevDeck.

**Exit criterion:** every OpenCode pane on the page has a corresponding
`AgentRun`, whichever entry point created it.

**Why it matters:** the Agents page reports on runs. Entry points that skip
run creation are why coverage there reads low.

---

## 5. Phase 3 — monitoring that reports live state

The sidebar lists what `GET /session` returns from the OpenCode server DevDeck
spawns. That is OpenCode's session *history*, not a set of live processes. It
was labelled "Active Sessions" with a pulsing indicator, and it grows without
bound — which is why an "archive" affordance had to exist at all. Phase 1
corrected the labelling; the underlying model is still wrong.

**Work:**

- Distinguish the three states DevDeck can actually tell apart, and show them:
  *running in a pane here* (a live PTY this window owns), *known to OpenCode*
  (in the server's list), and *archived*.
- Sort by `updatedAt` and collapse anything older than a threshold behind a
  "show older" control, replacing manual archiving.
- Surface the run's branch and worktree on the row — the two things you need
  to decide whether a session is still relevant.
- Reconcile a session against its `AgentRun` so the sidebar and the Agents
  page cannot disagree.

**Exit criterion:** a row's indicator answers "is this running right now?"
correctly, without the user cross-checking a terminal.

---

## 6. Phase 4 — reduce the surface

Simplification means deleting things, not only rearranging them. Candidates,
each to be confirmed against usage before removal:

- **Pane themes and accents per pane.** A global terminal theme is enough;
  per-pane overrides add a config panel most users never open.
- **The four-way layout picker.** Single and a 2×2 grid cover the real cases;
  `columns` and `rows` are the grid with two empty cells.
- **The 850-line snippets cabinet.** It is a second, weaker command palette
  next to the one in `AppLayout`. Either fold it into that palette or drop it.
- **`sanitizeUnavailableTerminalPanes`.** Silently rewriting a pane's command
  when a tool is missing hides the problem. Show the pane as failed with the
  reason, which the PTY layer already reports.

**Exit criterion:** `Terminals.tsx` is under 1000 lines and no longer holds
both the launcher and the workspace.

---

## 7. Non-goals

- Reimplementing any part of the OpenCode interface in React.
- Parsing OpenCode's output to drive DevDeck UI. Token usage comes from the
  usage log; task state comes from trace files the agent writes deliberately.
- Managing OpenCode's models, providers, or authentication. That is the CLI's
  job and its config file's job.

---

## 8. Verification

- `npm test` — harness discovery, including the OpenCode `agent` / `command`
  maps and the doc-heading exclusion.
- `npm run test:e2e:ui` — the launcher renders its defaults and the disclosure
  reveals branch, agent, and workflow.
- Manual, per phase: start a session, navigate to Projects and back, confirm
  the same process with its scrollback intact and the interface at full size.
