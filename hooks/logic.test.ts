// Checks for the rules in logic.ts. Run with: claude plugin test <this mod's folder>

import { expect, test } from 'claude-code/testing'

import {
  ADVICE_MS,
  bandJobs,
  petKind,
  petRows,
  petGrid,
  petSvg,
  PET_PIXEL_PX,
  PET_DESIGNS,
  PET_LOOP_FRAMES,
  PET_TRACK,
  petPose,
  petMark,
  relayFailed,
  relayModel,
  relayLabel,
  subagentLabel,
  FINISHED_SHOWN_MS,
  LONG_RUNNING_MS,
  addToDay,
  bandFor,
  EMPTY_DAY,
  filesNamed,
  formatElapsed,
  isSmall,
  confirmQuestion,
  parseConfirmArg,
  parseRelay,
  subagentWorker,
  titleFromBrief,
  touchedFiles,
  userAskedToDelegate,
  isReadOnly,
  refusalReason,
  parseCompanion,
  backgroundCompanionJobId,
  isCodexRescue,
  isReadOnlyRequest,
  platformFromUname,
  listProcessesArgv,
  killMatchingArgv,
  laneMapText,
  modelFor,
  splitArgs,
  withModel,
  fillTemplate,
  agyJobState,
  agyStatusTable,
} from './logic'
import type { Job } from '../types'

test('a Codex relay call is recognised, with its brief, lane and model', () => {
  const call = parseRelay(
    'node ~/.claude/skills/codex-delegate/scripts/relay.mjs --brief "C:/tmp/brief.txt" --cd "D:/x" --lane implement --model gpt-6-luna --timeout 9m',
  )
  expect(call).toEqual({ worker: 'Codex', skill: 'codex', briefPath: 'C:/tmp/brief.txt', model: 'gpt-6-luna', lane: 'implement' })
})

test('other relays get their own worker name', () => {
  expect(parseRelay('node a/agy-delegate/scripts/relay.mjs --brief b.txt')?.worker).toBe('agy')
  expect(parseRelay('node a\\claude-delegate\\scripts\\relay.mjs --brief b.txt')?.worker).toBe('Claude CLI')
})

test('help and ordinary commands are not delegations', () => {
  expect(parseRelay('node x/codex-delegate/scripts/relay.mjs --help')).toBe(null)
  expect(parseRelay('python -m pytest src/tests -q')).toBe(null)
})

test('a subagent is named after its model family', () => {
  expect(subagentWorker('sonnet')).toBe('Sonnet')
  expect(subagentWorker('claude-sonnet-5-5')).toBe('Sonnet')
  expect(subagentWorker(undefined)).toBe('Subagent')
})

test('task size is the number of distinct files a brief names', () => {
  const brief = 'Fix src/infrastructure/parsers/arxml_signal_parser.py and its test in src/tests/unit/test_x.py. Then rerun src/tests/unit/test_x.py.'
  expect(filesNamed(brief)).toBe(2)
  expect(isSmall(brief)).toBe(true)
  expect(isSmall('Refactor a.py, b.py and c.ts')).toBe(false)
  expect(isSmall('Investigate why the build is slow')).toBe(false) // names no file: unknown, not small
})

test('files changed are read from the relay summary', () => {
  expect(touchedFiles('{"status":"completed","touchedFiles":["a.py","b.py"]}')).toBe(2)
  expect(touchedFiles('{"touchedFiles": null}')).toBe(null)
  expect(touchedFiles('no summary')).toBe(null)
})

test('a brief becomes a short title from its first real line', () => {
  expect(titleFromBrief('\n## Task: convert ARXML limits\n\nDetails...')).toBe('Task: convert ARXML limits')
})

test('elapsed time is short', () => {
  expect(formatElapsed(45_000)).toBe('45s')
  expect(formatElapsed(372_000)).toBe('6m 12s')
  expect(formatElapsed(3_780_000)).toBe('1h 3m')
})

test('day totals add up', () => {
  expect(addToDay(addToDay(EMPTY_DAY, { jobs: 1, relayCalls: 1 }), { opusRequests: 2, opusUnits: 50_000 })).toEqual({
    jobs: 1, opusRequests: 2, opusUnits: 50_000, workerUnits: 0, relayCalls: 1,
  })
})

const job = (change: Partial<Job>): Job => ({
  id: 'j', worker: 'Codex', model: 'gpt-6-luna', title: 'task', label: 'codex:implement', startedAt: 0, finishedAt: null,
  status: 'running', background: true, small: false, aliveMarker: 'b.txt', agentId: null,
  opusRequests: 0, opusUnits: 0, workerUnits: 0, filesChanged: null, isTracking: true, ...change,
})

test('band: nothing when nothing was delegated', () => {
  expect(bandFor([], 1_000).kind).toBe('hidden')
})

test('band: a small job first shows the advice, then the running line', () => {
  expect(bandFor([job({ small: true })], ADVICE_MS - 1).kind).toBe('advice')
  expect(bandFor([job({ small: true })], ADVICE_MS + 1).kind).toBe('running')
})

test('band: a long run is flagged', () => {
  expect(bandFor([job({})], LONG_RUNNING_MS + 1).kind).toBe('long')
})

test('band: a finished job shows for ten minutes, then disappears', () => {
  const done = job({ status: 'done', finishedAt: 1_000 })
  expect(bandFor([done], 1_000 + FINISHED_SHOWN_MS - 1).kind).toBe('finished')
  expect(bandFor([done], 1_000 + FINISHED_SHOWN_MS + 1).kind).toBe('hidden')
})

test('a message asking for delegation is recognised', () => {
  expect(userAskedToDelegate('have Codex implement this')).toBe(true)
  expect(userAskedToDelegate('delegate the parser to a subagent')).toBe(true)
  expect(userAskedToDelegate('fix the parser bug')).toBe(false)
  expect(userAskedToDelegate('the console says resolved')).toBe(false) // "sol" only as a whole word
})

test('read-only delegations are never blocked', () => {
  expect(isReadOnly({ subagentType: 'Explore' })).toBe(true)
  expect(isReadOnly({ command: 'node x/codex-delegate/scripts/relay.mjs --brief b.txt --lane review' })).toBe(true)
  expect(isReadOnly({ command: 'node x/codex-delegate/scripts/relay.mjs --brief b.txt --read-only' })).toBe(true)
  expect(isReadOnly({ command: 'node x/codex-delegate/scripts/relay.mjs --brief b.txt --lane implement' })).toBe(false)
  expect(isReadOnly({ subagentType: 'general-purpose' })).toBe(false)
})

test('the refusal tells Claude what to do instead', () => {
  expect(refusalReason(1)).toContain('Do it directly')
})

test('a codex-companion task is recognised with its flags and task text', () => {
  const call = parseCompanion(
    'node "${CLAUDE_PLUGIN_ROOT}/scripts/codex-companion.mjs" task --background --write --model gpt-6-luna "Fix the limit conversion in src/parser.py and add a test"',
  )
  expect(call).toEqual({
    subcommand: 'task', background: true, write: true, model: 'gpt-6-luna',
    text: 'Fix the limit conversion in src/parser.py and add a test',
  })
  expect(parseCompanion('node x/codex-companion.mjs review --wait')?.subcommand).toBe('review')
  expect(parseCompanion('npm test')).toBe(null)
})

test('a background companion job id is read from its launch message', () => {
  expect(
    backgroundCompanionJobId('Fix parser started in the background as task-mgx1a2b. Check /codex:status task-mgx1a2b for progress.'),
  ).toBe('task-mgx1a2b')
  expect(backgroundCompanionJobId('done')).toBe(null)
})

test('the rescue subagent and read-only rescue requests are recognised', () => {
  expect(isCodexRescue('codex:codex-rescue')).toBe(true)
  expect(isCodexRescue('general-purpose')).toBe(false)
  expect(isReadOnlyRequest('investigate why the gate times out')).toBe(true)
  expect(isReadOnlyRequest('investigate and fix the gate timeout')).toBe(false)
})

test('platform: macOS and Linux are unix, Windows (with or without Git tools) is windows', () => {
  expect(platformFromUname('Darwin\n')).toBe('unix')
  expect(platformFromUname('Linux\n')).toBe('unix')
  expect(platformFromUname('MINGW64_NT-10.0-19045\n')).toBe('windows')
  expect(platformFromUname(null)).toBe('windows')
})

test('process commands differ per platform, and pkill gets a literal pattern', () => {
  expect(listProcessesArgv('unix')).toEqual(['ps', '-axo', 'command'])
  expect(listProcessesArgv('windows')[0]).toBe('powershell')
  expect(killMatchingArgv('unix', '/tmp/brief (1).txt')).toEqual(['pkill', '-f', '/tmp/brief \\(1\\)\\.txt'])
  expect(killMatchingArgv('windows', "C:/it's/brief.txt")[3]).toContain("Contains('C:/it''s/brief.txt')")
})

test('hand over / hand off count as asking for delegation', () => {
  expect(userAskedToDelegate('hand this over and keep going')).toBe(true)
  expect(userAskedToDelegate('can you hand it off?')).toBe(true)
  expect(userAskedToDelegate('write the handover notes')).toBe(true)
  expect(userAskedToDelegate('the handle is off by one')).toBe(false)
})

test('the lane map is grouped by implementer, and empty without lanes', () => {
  const text = laneMapText({
    lanes: {
      implement: { implementer: 'codex', model: 'gpt-6-luna' },
      'deep-review': { implementer: 'codex', model: 'gpt-6.1-sol', readOnly: true },
      research: { implementer: 'agy', model: 'gemini-3.8-flash-medium', readOnly: true },
    },
  })
  expect(text).toContain('- codex (codex-delegate): implement -> gpt-6-luna; deep-review -> gpt-6.1-sol, read-only')
  expect(text).toContain('- agy (agy-delegate): research -> gemini-3.8-flash-medium, read-only')
  expect(laneMapText({})).toBe('')
  expect(laneMapText(null)).toBe('')
})

test('a command runs --model if given, else its lane, else the default', () => {
  const lanes = { review: { implementer: 'codex', model: 'gpt-6-luna-custom' } }
  expect(modelFor('codex-review', 'gpt-6.1-sol', lanes)).toBe('gpt-6.1-sol')
  expect(modelFor('codex-review', null, lanes)).toBe('gpt-6-luna-custom')
  expect(modelFor('codex-adversarial-review', null, {})).toBe('gpt-6.1-sol')
  expect(modelFor('agy-rescue', null, {})).toBe('gemini-3.8-flash-high')
  expect(modelFor('agy-adversarial-review', null, {})).toBe('gemini-3.1-pro-high')
})

test('run flags come out of the arguments; the task text stays', () => {
  expect(splitArgs('--background --model gemini-3.8-flash-low fix the exporter --base main')).toEqual({
    background: true,
    model: 'gemini-3.8-flash-low',
    base: 'main',
    text: 'fix the exporter',
  })
  expect(splitArgs('--wait look at auth')).toEqual({ background: false, model: null, base: null, text: 'look at auth' })
})

test('Codex arguments get a model only when none was given', () => {
  expect(withModel('--background', 'gpt-6-luna')).toBe('--model gpt-6-luna --background')
  expect(withModel('--model gpt-6.1-sol focus', 'gpt-6-luna')).toBe('--model gpt-6.1-sol focus')
})

test('a command file becomes a prompt: front matter gone, placeholders filled', () => {
  const md = '---\ndescription: x\n---\n\nRun ${CLAUDE_PLUGIN_ROOT}/a.mjs "$ARGUMENTS" ${UNKNOWN}'
  expect(fillTemplate(md, { CLAUDE_PLUGIN_ROOT: '/p/codex', ARGUMENTS: '--wait' })).toBe('Run /p/codex/a.mjs "--wait" ${UNKNOWN}')
})

test('an agy job is done, failed, running or has no result', () => {
  expect(agyJobState({ status: 'completed' }, false)).toBe('done')
  expect(agyJobState({ status: 'timeout' }, false)).toBe('failed')
  expect(agyJobState({ status: 'failed' }, true)).toBe('running') // a rerun over an old result
  expect(agyJobState(null, true)).toBe('running')
  expect(agyJobState(null, false)).toBe('no result')
  const table = agyStatusTable(
    [{ id: 'agy-1', kind: 'review', title: 'auth', model: 'm', startedAt: 0, state: 'running' }],
    90_000,
  )
  expect(table).toContain('| agy-1 | review | running | m | 1m 30s ago | auth |')
  expect(agyStatusTable([], 0)).toContain('No agy jobs yet')
})

test('the confirm question says the worker, the model, the lane and how much is sent', () => {
  const question = confirmQuestion({
    worker: 'Codex',
    model: 'gpt-6.1-sol',
    lane: 'deep-review',
    brief: 'Review src/a.py and src/b.py for races.',
  })
  expect(question).toContain('a Codex run on gpt-6.1-sol, lane deep-review')
  expect(question).toContain('names 2 files')

  const review = confirmQuestion({ worker: 'Codex', model: null, lane: null, brief: '' })
  expect(review).toContain('on its default model')
  expect(review).toContain('no brief text')
})

test('/delegate-confirm takes on, off, or nothing to show the setting', () => {
  expect(parseConfirmArg(' ON ')).toBe(true)
  expect(parseConfirmArg('off')).toBe(false)
  expect(parseConfirmArg('')).toBe(null)
  expect(parseConfirmArg('yes')).toBe('invalid')
})

test('a relay or companion named inside a heredoc is file text, not a run', () => {
  const companion = 'node x/codex-' + 'companion.mjs'
  const writesATest = `cat >> policy.test.ts <<'EOF'\n${companion} adversarial-review --wait\nEOF\nnpm test`
  expect(parseCompanion(writesATest)).toBe(null)
  expect(parseRelay('cat > notes.md <<EOF\nnode a/codex-delegate/scripts/relay.mjs --brief b.txt\nEOF')).toBe(null)
  // A real call before a heredoc still counts.
  expect(parseCompanion(`${companion} review --wait <<'EOF'\nstdin\nEOF`)?.subcommand).toBe('review')
})

// ---- The pets ----------------------------------------------------------------------

test('pet captions: skill:lane for relays, type/model for subagents', () => {
  expect(relayLabel('codex', 'implement')).toBe('codex:implement')
  expect(relayLabel('agy', null)).toBe('agy:run')
  expect(subagentLabel('Explore', 'claude-haiku-5-5')).toBe('Explore/haiku')
  expect(subagentLabel(undefined, undefined)).toBe('general-purpose/inherit')
})

test('band pets: running jobs always, finished ones only since the last prompt', () => {
  const running = job({ id: 'r' })
  const before = job({ id: 'b', status: 'done', finishedAt: 50 })
  const after = job({ id: 'a', status: 'failed', finishedAt: 150 })
  expect(bandJobs([running, before, after], 100).map(one => one.id)).toEqual(['r', 'a'])
})

test('pet marks: foreground, background, done, failed, stopped', () => {
  expect(petMark(job({ background: false }))).toBe('…')
  expect(petMark(job({ background: true }))).toBe('◌')
  expect(petMark(job({ status: 'done' }))).toBe('✓')
  expect(petMark(job({ status: 'failed' }))).toBe('✗')
  expect(petMark(job({ status: 'stopped' }))).toBe('■')
})

test('a relay failure is read from its summary line, as JSON output would have it', () => {
  const output = (line: string) => JSON.stringify({ result: { stdout: `codex says hi\n${line}\ntouched files: 0` } })
  expect(relayFailed(output('relay: failed (exit 1)  ·  codex 0.9'))).toBe(true)
  expect(relayFailed(output('relay: timeout (exit 124)  ·  codex 0.9'))).toBe(true)
  expect(relayFailed(output('relay: aborted (exit 130)  ·  agy 1.2'))).toBe(true)
  expect(relayFailed(output('relay: codex_unavailable (exit 127)  ·  codex ?'))).toBe(true)
  expect(relayFailed(output('relay: completed (exit 0)  ·  codex 0.9'))).toBe(false)
  expect(relayFailed(output('relay: brief file not found'))).toBe(false) // an error message, not a status
  expect(relayFailed('{"status": "failed"}')).toBe(true)
})


// ---- Each model's pet ------------------------------------------------------------------

/** The rows as plain text, colours dropped: what the terminal shows in one colour. */
const shape = (rows: ReturnType<typeof petRows>) => rows.map(row => row.map(run => run.text).join(''))
const colours = (rows: ReturnType<typeof petRows>) => new Set(rows.flat().map(run => run.color).filter(Boolean))

test('each model gets its own pet; relays win over the subagent that forwards them', () => {
  expect(petKind(job({ worker: 'Opus', model: 'claude-opus-5-5', label: 'Plan/opus' }))).toBe('opus')
  expect(petKind(job({ worker: 'Sonnet', model: 'claude-sonnet-5-5', label: 'general-purpose/sonnet' }))).toBe('sonnet')
  expect(petKind(job({ worker: 'Haiku', model: 'claude-haiku-5-5', label: 'Explore/haiku' }))).toBe('haiku')
  expect(petKind(job({ worker: 'Codex', model: 'lane implement', label: 'codex:implement' }))).toBe('codex')
  expect(petKind(job({ worker: 'Codex (rescue)', model: null, label: 'codex:rescue' }))).toBe('codex')
  expect(petKind(job({ worker: 'agy', model: null, label: 'agy:research' }))).toBe('agy')
  expect(petKind(job({ worker: 'Claude CLI', model: null, label: 'claude:run' }))).toBe('claude')
})

test('every design has rows of one width, so the drawing does not shear', () => {
  for (const design of Object.values(PET_DESIGNS)) {
    const width = design.pixels[0]?.length
    for (const pixels of [design.pixels, ...design.work]) {
      expect(pixels).toHaveLength(design.pixels.length)
      expect(pixels.every(row => row.length === width)).toBe(true)
    }
  }
})

test('pets: Opus, Sonnet and Codex are three rows, Haiku is smaller', () => {
  const done = { status: 'done' as const, finishedAt: 1 }
  expect(petRows(job({ ...done, label: 'Plan/opus', worker: 'Opus' }), 0)).toHaveLength(3)
  expect(petRows(job({ ...done, label: 'x/sonnet', worker: 'Sonnet' }), 0)).toHaveLength(3)
  expect(petRows(job({ ...done }), 0)).toHaveLength(3) // codex
  const haiku = petRows(job({ ...done, label: 'Explore/haiku', worker: 'Haiku' }), 0)
  expect(haiku).toHaveLength(2)
  const clawd = petRows(job({ ...done }), 0)
  expect(shape(haiku)[0]?.length).toBeLessThan(shape(clawd)[0]?.length ?? 0) // narrower too
})

test('pets: Codex is purple, Haiku pink, agy a rainbow, Opus has its gold monocle', () => {
  expect(colours(petRows(job({ label: 'codex:implement' }), 0))).toEqual(new Set(['#c678dd']))
  expect(colours(petRows(job({ label: 'Explore/haiku', worker: 'Haiku' }), 0))).toEqual(new Set(['#ff87d7']))
  expect(colours(petRows(job({ label: 'agy:run', worker: 'agy' }), 0)).size).toBeGreaterThan(5)
  expect(colours(petRows(job({ label: 'Plan/opus', worker: 'Opus' }), 0)).has('#e5c07b')).toBe(true)
})

test('two colours in one cell use the background: the top pixel over the bottom one', () => {
  // Sonnet's hammer: its grey head sits right over the wooden handle in one cell, drawn
  // as a grey ▀ on a wooden background. Every run is blocks or blanks, nothing else.
  const rows = petRows(job({ status: 'done', finishedAt: 1, label: 'x/sonnet', worker: 'Sonnet' }), 0)
  for (const run of rows.flat()) {
    expect(run.text).toMatch(/^[ ▀▄█]+$/)
  }
  expect(rows.flat()).toContainEqual({ text: '▀', color: '#abb2bf', backgroundColor: '#a0703c' })
})

test('a failed pet is all red', () => {
  const failed = job({ label: 'agy:run', worker: 'agy', status: 'failed', finishedAt: 1 })
  expect(colours(petRows(failed, 0))).toEqual(new Set(['error']))
})

// ---- Walking and working -------------------------------------------------------------

const loop = (one: Job) => Array.from({ length: PET_LOOP_FRAMES }, (_, frame) => petPose(one, frame))

test('a running pet walks the whole track both ways and works at each end', () => {
  const poses = loop(job({ label: 'codex:implement' }))
  const offsets = new Set(poses.map(pose => pose.offset))
  for (let cell = 0; cell <= PET_TRACK; cell++) {
    expect(offsets.has(cell)).toBe(true)
  }
  expect(poses.filter(pose => pose.working).map(pose => pose.offset).sort()).toContain(0)
  expect(poses.filter(pose => pose.working).map(pose => pose.offset)).toContain(PET_TRACK)
  // It never jumps: from one frame to the next it moves at most one cell, the loop's end included.
  poses.forEach((pose, i) => {
    const next = poses[(i + 1) % poses.length]!
    expect(Math.abs(next.offset - pose.offset)).toBeLessThanOrEqual(1)
  })
})

test('a finished pet stands still in the middle', () => {
  const poses = loop(job({ status: 'done', finishedAt: 1 }))
  expect(new Set(poses.map(pose => JSON.stringify(pose))).size).toBe(1)
  expect(poses[0]).toEqual({ offset: PET_TRACK / 2, walking: false, working: false, step: 0 })
})

test('two pets started together are at different points of their loop', () => {
  const a = loop(job({ id: 'toolu_01AAA' })).map(pose => pose.offset)
  const b = loop(job({ id: 'toolu_01BBB' })).map(pose => pose.offset)
  expect(a).not.toEqual(b)
})

test('every frame draws the pet plus its track, the same width', () => {
  const kinds = [
    job({ label: 'Plan/opus', worker: 'Opus' }),
    job({ label: 'x/sonnet', worker: 'Sonnet' }),
    job({ label: 'Explore/haiku', worker: 'Haiku' }),
    job({ label: 'codex:implement' }),
    job({ label: 'agy:run', worker: 'agy' }),
    job({ label: 'claude:run', worker: 'Claude CLI' }),
  ]
  for (const one of kinds) {
    const width = new Set<number>()
    for (let frame = 0; frame < PET_LOOP_FRAMES; frame++) {
      for (const row of shape(petRows(one, frame))) {
        width.add([...row].length)
      }
    }
    expect(width.size).toBe(1)
  }
})

test('while working, each pet acts out its job', () => {
  const working = (one: Job) => {
    const frames = new Set<string>()
    for (let frame = 0; frame < PET_LOOP_FRAMES; frame++) {
      if (petPose(one, frame).working) {
        frames.add(JSON.stringify(petRows(one, frame)))
      }
    }
    return frames.size
  }
  for (const one of [
    job({ label: 'Plan/opus', worker: 'Opus' }), // monocle glints
    job({ label: 'x/sonnet', worker: 'Sonnet' }), // hammer swings
    job({ label: 'Explore/haiku', worker: 'Haiku' }), // waves
    job({ label: 'codex:implement' }), // types
    job({ label: 'agy:run', worker: 'agy' }), // rainbow slides
    job({ label: 'claude:run', worker: 'Claude CLI' }), // looks around
  ]) {
    expect(working(one)).toBeGreaterThan(2) // more than one look at each end of the track
  }
})

test("a relay's model: its flag, else its lane's model, else the lane", () => {
  const lanes = { implement: { implementer: 'claude', model: 'sonnet' }, review: { implementer: 'claude' } }
  expect(relayModel({ model: 'opus', lane: 'implement' }, lanes)).toBe('opus')
  expect(relayModel({ model: null, lane: 'implement' }, lanes)).toBe('sonnet')
  expect(relayModel({ model: null, lane: 'review' }, lanes)).toBe('lane review')
  expect(relayModel({ model: null, lane: null }, lanes)).toBeNull()
})

test('a Claude relay on a Sonnet lane gets Sonnet\'s pet', () => {
  expect(petKind(job({ worker: 'Claude CLI', label: 'claude:implement', model: 'sonnet' }))).toBe('sonnet')
  expect(petKind(job({ worker: 'Claude CLI', label: 'claude:deep', model: 'claude-opus-5-5' }))).toBe('opus')
  expect(petKind(job({ worker: 'Claude CLI', label: 'claude:run', model: null }))).toBe('claude') // CLI default: unknown
})

// ---- The desktop's SVG pet -----------------------------------------------------------------

test('the desktop SVG draws one square per pet pixel, and is as big as the grid', () => {
  const one = job({ label: 'x/sonnet', worker: 'Sonnet' })
  for (let frame = 0; frame < 12; frame++) {
    const grid = petGrid(one, frame)
    const svg = petSvg(one, frame)
    const filled = grid.flat().filter(Boolean).length
    expect(svg.source.match(/<rect /g)?.length).toBe(filled)
    expect(svg.width).toBe((grid[0]?.length ?? 0) * PET_PIXEL_PX)
    expect(svg.height).toBe(grid.length * PET_PIXEL_PX)
  }
})

test('the desktop SVG: a finished pet faded, a failed one red, no theme names in it', () => {
  expect(petSvg(job({ status: 'done', finishedAt: 1 }), 0).source).toContain('opacity="0.45"')
  expect(petSvg(job({}), 0).source).not.toContain('opacity')
  const failed = petSvg(job({ status: 'failed', finishedAt: 1 }), 0).source
  expect(new Set([...failed.matchAll(/fill="([^"]+)"/g)].map(match => match[1]))).toEqual(new Set(['#e06c75']))
})

test('the terminal text and the desktop SVG come from the same grid', () => {
  const one = job({ label: 'agy:run', worker: 'agy' })
  for (let frame = 0; frame < 30; frame++) {
    const grid = petGrid(one, frame)
    expect(petRows(one, frame)).toHaveLength(Math.ceil(grid.length / 2))
    expect(shape(petRows(one, frame))[0]?.length).toBe(grid[0]?.length)
  }
})
