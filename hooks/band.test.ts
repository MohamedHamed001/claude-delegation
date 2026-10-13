// Draws the band through the real hooks: a delegated job gets a pet with its caption,
// ordinary work gets none, Hide hides it, and a new prompt clears finished pets.
// The test's own hooks stand for the engine beneath the plugin: the tool actually running,
// the drawing beneath the band, toasts and prompts. mock.clock is a clock the test moves.

import { expect, mock, test } from 'claude-code/testing'

type On = Parameters<Parameters<typeof test>[1]>[1]

const SURFACES = ['terminal', 'desktop'] as const
const BAND = {
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 100 },
} as never

const RELAY = 'node ~/.claude/skills/codex-delegate/scripts/relay.mjs --brief /tmp/b.txt --lane implement'

/** What the engine does beneath the plugin, and a clock at 1 second that moves only when told. */
function engineBeneath(on: On) {
  on('ui.render', () => ({ type: 'Box', props: {}, children: [] }) as never)
  on('ui.toast', () => ({ value: undefined }) as never)
  on('prompt.submit', (_$, e) => ({ text: e.text }) as never)

  return mock.clock(on, { now: 1_000 })
}

/** One Agent call: finished when it returns, unless it runs in the background. */
function agent(subagentType: string, model: string, background: boolean) {
  return {
    tool: 'Agent',
    description: `${subagentType} work`,
    prompt: 'Where is the parser used?',
    subagent_type: subagentType,
    model,
    run_in_background: background,
  } as never
}

for (const surface of SURFACES) {
  test(`a finished relay job shows its pet and caption (${surface})`, async ($, on) => {
    engineBeneath(on)
    on('tool.call', () => ({ result: { stdout: 'relay finished' } }) as never)

    await $.tool.call({ tool: 'Bash', command: RELAY, run_in_background: false } as never)

    const ui = await $.ui.mount({ plugin: 'delegation', surface, ...BAND })
    expect(await ui.find({ type: 'Text', text: 'codex:implement ✓' })).toBeDefined()
    await ui.unmount()
  })

  test(`a failed relay job's pet is red (${surface})`, async ($, on) => {
    engineBeneath(on)
    on('tool.call', () => ({ result: { stdout: 'relay: failed (exit 1)  ·  codex 0.9\ntouched files: 0' } }) as never)

    await $.tool.call({ tool: 'Bash', command: RELAY, run_in_background: false } as never)

    const ui = await $.ui.mount({ plugin: 'delegation', surface, ...BAND })
    expect(await ui.find({ type: 'Text', text: 'codex:implement ✗' })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: '▄█▄' }))?.props.color).toBe('error')
    await ui.unmount()
  })

  test(`ordinary Bash gets no band (${surface})`, async ($, on) => {
    engineBeneath(on)
    on('tool.call', () => ({ result: { stdout: 'ok' } }) as never)

    await $.tool.call({ tool: 'Bash', command: 'ls -la', run_in_background: false } as never)

    const ui = await $.ui.mount({ plugin: 'delegation', surface, ...BAND })
    expect(await ui.find({ key: 'band-hide' })).toBeUndefined()
    await ui.unmount()
  })

  test(`a subagent's pet says type/model, coloured and dimmed (${surface})`, async ($, on) => {
    engineBeneath(on)
    on('tool.call', () => ({ result: { text: 'found it' } }) as never)

    await $.tool.call(agent('Explore', 'haiku', false))

    const ui = await $.ui.mount({ plugin: 'delegation', surface, ...BAND })
    expect(await ui.find({ type: 'Text', text: 'Explore/haiku ✓' })).toBeDefined()
    const body = await ui.find({ type: 'Text', text: '▄█▄' })
    expect(body?.props.color).toBe('green')
    expect(body?.props.dimColor).toBe(true) // finished
    await ui.unmount()
  })

  test(`a running pet's legs move as time passes (${surface})`, async ($, on) => {
    const clock = engineBeneath(on)
    on('tool.call', () => ({ result: { text: 'started' } }) as never)

    await $.tool.call(agent('Plan', 'opus', true))

    const ui = await $.ui.mount({ plugin: 'delegation', surface, ...BAND })
    expect(await ui.find({ type: 'Text', text: 'Plan/opus ◌' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '▘ ▝' })).toBeDefined()
    await clock.advance(100)
    expect(await ui.find({ type: 'Text', text: '▝ ▘' })).toBeDefined()
    await ui.unmount()
  })

  test(`Hide hides the band until the next prompt, which clears finished pets (${surface})`, async ($, on) => {
    const clock = engineBeneath(on)
    on('tool.call', () => ({ result: { text: 'started' } }) as never)

    // One background subagent (still running) and one foreground one (finished).
    await $.tool.call(agent('Plan', 'opus', true))
    await $.tool.call(agent('Explore', 'haiku', false))

    const ui = await $.ui.mount({ plugin: 'delegation', surface, ...BAND })
    expect(await ui.find({ type: 'Text', text: 'Plan/opus ◌' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Explore/haiku ✓' })).toBeDefined()

    await ui.press({ key: 'band-hide' })
    expect(await ui.find({ key: 'band-hide' })).toBeUndefined()

    await clock.advance(1_000)
    await $.prompt.submit({ text: 'next thing', asUser: true } as never)
    expect(await ui.find({ type: 'Text', text: 'Plan/opus ◌' })).toBeDefined() // still running
    expect(await ui.find({ type: 'Text', text: 'Explore/haiku ✓' })).toBeUndefined() // cleared
    await ui.unmount()
  })
}
