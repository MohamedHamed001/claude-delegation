# claude-delegation

A plugin for [Claude Code](https://docs.claude.com/en/docs/claude-code): **delegation**.

Everything for delegating coding work: Codex, agy and Claude worker skills; /delegate, /explore, /delegate-setup and /delegations; the official Codex plugin's commands bundled as /codex-* with matching /agy-* commands (rescue, review, adversarial-review, status, result, cancel, setup); a measured delegation policy that refuses tasks too small to be worth it; and a live view of running jobs and what they cost.

Part of [claude-mods](https://github.com/MohamedHamed001/claude-mods), which lists this plugin and its siblings.

## Install

```
/plugin marketplace add MohamedHamed001/claude-delegation
/plugin install delegation@claude-delegation
```

Then start a new session: a session reads its plugins once, when it starts. Update later with `/plugin marketplace update claude-delegation`.

## Requirements

- **Claude Code 2.1.28x or newer.** The plugins use function hooks (TypeScript modules the app
  loads), which older versions do not run.
- **Windows, macOS or Linux.** Process handling is detected per session: PowerShell on Windows,
  `ps` and `pkill` elsewhere. Developed on Windows; macOS has not been tested yet.
- For **delegation** only, the workers you want to use:
  - [Node.js](https://nodejs.org) 18 or newer (the relay and Codex scripts are Node scripts).
  - Codex: `npm install -g @openai/codex`, then `codex login`.
  - agy: the Google Antigravity CLI, signed in by running `agy` once.
  - Claude subagents need nothing extra.

## What it does

Everything for delegating coding work, in one plugin: worker skills, slash commands, a
delegation policy that is enforced, and a live view of running jobs and what they cost.

### Why it exists

Delegating feels cheaper than it is. A session carries a large context before any work, and
every main-model request re-reads it; briefing a worker, waiting for it and reviewing its work
add about as many requests as the delegation removes. A controlled test on real tasks of 1 to 6
files, each done three ways, found:

| Setup | Passed | Claude-side cost | Time |
|---|---|---|---|
| Opus alone | 3 of 3 | baseline | fastest |
| Opus + Sonnet subagent | 2 of 3 | about a third more | slower |
| Opus + Codex | 2 of 3 | about a tenth less | 2 to 3 times slower |

So the plugin's default is: **do the work yourself**, and delegate only when it pays.

### What you get

| Part | What it does |
|---|---|
| Policy | Added to every session's system prompt, so nobody has to copy rules into `CLAUDE.md`. Delegate only: large separable work with a check the worker can run; work that should move off the Claude limit (Codex); when you ask; read-only review; fast read-only exploration (agy). |
| Enforcement | A delegation whose brief names only one or two files is refused, and Claude is told to do it directly. Allowed anyway when you asked for delegation, or when it is read-only. |
| Plain words | Saying "delegate this", "hand this over" or naming a worker (Codex, agy, Sonnet) counts as asking, no slash command needed. |
| Band | One line above the prompt while a job runs, when it finishes, or when it has run for 15+ minutes, with a **Stop** button. |
| Pane | `Delegations` button or `/delegations`: jobs running now, every job this session with what it cost, today's totals across sessions, and the cost test's findings. |
| Skills | `codex-delegate`, `agy-delegate`, `claude-delegate`, `delegate-setup`, `gpt-5-4-prompting`, `codex-result-handling`. |

### Commands

| Command | What it does |
|---|---|
| `/delegate <task>` | Delegates the task if it is worth it under the policy; otherwise says why and does it directly |
| `/explore <question>` | Asks agy a fast, read-only question about the codebase; Claude spot-checks its file and line claims |
| `/delegate-setup` | Chooses which worker and model handles which kind of work (writes the lane map) |
| `/delegations` | Opens the pane |

And the same seven commands for each worker:

| Action | `/codex-…` | `/agy-…` |
|---|---|---|
| `rescue <task>` | Hands a task to Codex (may edit the workspace) | Hands a task to agy (runs with permissions skipped, see below) |
| `review` | Read-only review of your local changes | Read-only review of your local changes |
| `adversarial-review [focus]` | Review that challenges the design and its assumptions | Same, on agy's stronger model |
| `status` | Running and recent jobs | Running and recent jobs |
| `result [job-id]` | A finished job's full report | A finished job's report |
| `cancel [job-id]` | Stops a running job | Stops a running job |
| `setup` | Checks Node, Codex and its sign-in | Checks agy and its sign-in, lists default models |

Flags on rescue and the reviews: `--background` (run detached; check with `status`),
`--model <name>`, and for reviews `--base <ref>` (review a branch against a base instead of
the working tree). `/codex-setup --enable-review-gate` turns on Codex's optional stop-time
review gate (off by default).

`status`, `result`, `cancel` and `setup` answer at once without a Claude turn. Rescue and
the reviews hand Claude a prompt: it writes the brief, runs the worker, then reviews the
result itself.

### Which model a command uses

`--model` on the command wins; otherwise the command's lane in your lane map; otherwise:

| Command | Lane | Default model |
|---|---|---|
| `/codex-rescue` | `implement` | gpt-6-luna |
| `/codex-review` | `review` | gpt-6-luna |
| `/codex-adversarial-review` | `deep-review` | gpt-6.1-sol |
| `/agy-rescue` | `agy-implement` | gemini-3.8-flash-high |
| `/agy-review` | `agy-review` | gemini-3.8-flash-high |
| `/agy-adversarial-review` | `third-opinion` | gemini-3.1-pro-high |
| `/explore` | `research` | gemini-3.8-flash-medium |

Rule of thumb: the cheapest model that can do the job. Fast models for lookups, a mid model for
edits and reviews, the strongest only for design challenges.

### First run

1. Install the workers you want (see [Requirements](#requirements)).
2. Run `/codex-setup` and `/agy-setup` to check them.
3. Run `/delegate-setup` once to pick your lanes. The lane map is stored in
   `~/.config/delegate-skills/config.json` (or `$XDG_CONFIG_HOME/delegate-skills/`).

Without a lane map the commands use the defaults above.

### Things to know

- **agy and permissions.** agy runs headless and cannot ask for permission, so any action that
  needs approval is refused and the run fails. `/agy-rescue` therefore passes
  `--dangerously-skip-permissions`: agy can then do anything on your machine, not only in the
  repository. Running `/agy-rescue` is that approval. Reviews and `/explore` run in agy's
  read-only plan mode and are told not to run shell commands at all.
- **agy job files.** Each agy job keeps its files in `~/.claude/delegation/agy-jobs/<id>/`:
  `job.json`, `brief.md`, `diff.patch` (reviews), `result.json` and agy's logs.
- **Keep reviews small.** A fast model asked to review a large diff can explore the repository
  for a long time. Review a few files at a time; the relay stops a run at its timeout.
- **The official Codex plugin.** This plugin bundles it (see [Credits](#licence)).
  If `codex@openai-codex` is installed as well, the bundled `/codex-*` commands step aside and
  point to its `/codex:*` ones; the policy and job tracking still apply to them.
- **Sol asks first.** Sol (`gpt-6.1-sol`) has a small allowance. A Codex run that would use it (a
  Sol `--model`, the `deep-review` lane, or an adversarial review with no model given) first shows
  the model, the lane, and the brief's size and file count, with **Run it** and **Cancel**. Runs on
  other models start without a question.
- **Cost figures.** Claude subagents report tokens, so their cost is shown. Codex and agy report
  nothing to Claude, so they show as calls and time, with the Opus requests made while they ran.

### How it knows what is running

| Source | What it tells the plugin |
|---|---|
| The Agent tool call and `agent.spawn` | A Claude subagent started, its id and its real model |
| The subagent's own requests and `turn.complete` | What it cost and when it finished |
| A shell command running `<name>-delegate/scripts/relay.mjs --brief <file>` | A relay job (Codex, agy, Claude CLI); a background one counts as finished when its process is gone |
| A shell command running `codex-companion.mjs task\|review\|adversarial-review` | A Codex plugin job; a background one is followed through the job id it prints |
| Main-conversation requests while a job is open | What delegating cost on the Opus side |

## Developing

```
claude plugin validate .
claude plugin test .
```

To run your working copy instead of the installed version, add this folder to `CLAUDE_CODE_PLUGIN_DIRS` (separated by `;` on Windows, `:` elsewhere), for example in the `env` block of `~/.claude/settings.json`, then start a new session.

## Licence

This repository is under the [MIT licence](LICENSE).

It includes third-party code, each under its own licence, listed with every change in
[`skills/NOTICE.md`](skills/NOTICE.md):

- The skills `codex-delegate`, `agy-delegate`, `claude-delegate` and `delegate-setup` from
  [amElnagdy/delegate-skills](https://github.com/amElnagdy/delegate-skills) (MIT).
- The Codex companion, its command texts and the skills `gpt-5-4-prompting` and
  `codex-result-handling` from OpenAI's Codex plugin for Claude Code (`codex@openai-codex`
  1.0.6), under the [Apache License 2.0](codex/LICENSE) with its
  [NOTICE](codex/NOTICE).

Not affiliated with Anthropic, OpenAI or Google.
