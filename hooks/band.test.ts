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

type Drawing = {
  findAll: (query: { type: string }) => Promise<{ text: string; props: Record<string, unknown> }[]>
}

/**
 * The colours the pets are drawn in, on either surface: the terminal's coloured Text
 * cells, or the fills in the desktop's SVGs. `faded` is whether every pet pixel is dimmed.
 * Only the pets count: on the terminal the Text cells made of half blocks alone (the
 * status line's icons, such as ✓, are not), on the desktop the SVGs (only pets use one).
 */
async function petColours(ui: Drawing): Promise<{ colours: Set<string>; faded: boolean }> {
  const colours = new Set<string>()
  const fades: boolean[] = []
  const isPixels = (text: { text: string }) => /^[ ▀▄█]+$/.test(text.text) && /[▀▄█]/.test(text.text)
  for (const text of (await ui.findAll({ type: 'Text' })).filter(isPixels)) {
    if (typeof text.props.color === 'string') {
      colours.add(text.props.color)
      fades.push(text.props.dimColor === true)
    }
  }
  for (const svg of await ui.findAll({ type: 'Svg' })) {
    const source = String(svg.props.source)
    for (const [, fill] of source.matchAll(/fill="([^"]+)"/g)) {
      colours.add(fill!)
    }
    fades.push(source.includes('opacity="0.45"'))
  }

  return { colours, faded: fades.length > 0 && fades.every(Boolean) }
}

/** One Agent call: finished when it returns, unless it runs in the background. */
function agent(subagentType: string, model: string | undefined, background: boolean) {
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
    // All red: the theme's red on the terminal, the same red as a colour in the SVG.
    const red = surface === 'terminal' ? 'error' : '#e06c75'
    expect((await petColours(ui)).colours).toEqual(new Set([red]))
    await ui.unmount()
  })

  test(`a subagent Claude gave no model gets the pet of the model it runs on (${surface})`, async ($, on) => {
    engineBeneath(on)
    // Like the engine: running the Agent tool spawns the subagent, and core resolves the
    // model it inherits. Here it reports Opus, and no agent id.
    on('agent.spawn', () => ({ model: 'claude-opus-5-5' }) as never)
    let callId = ''
    on('tool.call', (_$, e) => {
      callId = (e as { tool_use_id: string }).tool_use_id

      return { result: { text: 'started' } } as never
    })

    await $.tool.call(agent('general-purpose', undefined, true))
    await $.agent.spawn({
      tool_use_id: callId,
      description: 'general-purpose work',
      prompt: 'Review the design',
      subagentType: 'general-purpose',
      parentModel: 'claude-opus-5-5',
      background: true,
    } as never)

    const ui = await $.ui.mount({ plugin: 'delegation', surface, ...BAND })
    expect(await ui.find({ type: 'Text', text: 'general-purpose/opus ◌' })).toBeDefined()
    expect((await petColours(ui)).colours.has('#e5c07b')).toBe(true) // Opus's gold monocle
    await ui.unmount()
  })

  test(`the pet is pixel text on the terminal and an SVG on the desktop (${surface})`, async ($, on) => {
    engineBeneath(on)
    on('tool.call', () => ({ result: { stdout: 'relay finished' } }) as never)

    await $.tool.call({ tool: 'Bash', command: RELAY, run_in_background: false } as never)

    const ui = await $.ui.mount({ plugin: 'delegation', surface, ...BAND })
    const svgs = await ui.findAll({ type: 'Svg' })
    const blocks = (await ui.findAll({ type: 'Text' })).filter(text => /[▀▄█]/.test(text.text))
    if (surface === 'terminal') {
      expect(svgs).toHaveLength(0)
      expect(blocks.length).toBeGreaterThan(0)
    } else {
      expect(svgs).toHaveLength(1)
      expect(blocks).toHaveLength(0) // no half blocks for the desktop's font to break
      expect(String(svgs[0]?.props.source)).toContain('shape-rendering="crispEdges"')
    }
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

  test(`a Haiku subagent's pet is pink, captioned type/model, dimmed when done (${surface})`, async ($, on) => {
    engineBeneath(on)
    on('tool.call', () => ({ result: { text: 'found it' } }) as never)

    await $.tool.call(agent('Explore', 'haiku', false))

    const ui = await $.ui.mount({ plugin: 'delegation', surface, ...BAND })
    expect(await ui.find({ type: 'Text', text: 'Explore/haiku ✓' })).toBeDefined()
    const pet = await petColours(ui)
    expect(pet.colours).toEqual(new Set(['#ff87d7'])) // Haiku's pet
    expect(pet.faded).toBe(true) // finished
    await ui.unmount()
  })

  test(`a running pet moves as time passes (${surface})`, async ($, on) => {
    const clock = engineBeneath(on)
    on('tool.call', () => ({ result: { text: 'started' } }) as never)

    await $.tool.call(agent('Plan', 'opus', true))

    const ui = await $.ui.mount({ plugin: 'delegation', surface, ...BAND })
    expect(await ui.find({ type: 'Text', text: 'Plan/opus ◌' })).toBeDefined()
    const before = JSON.stringify(await ui.drawn())
    await clock.advance(300)
    expect(JSON.stringify(await ui.drawn())).not.toBe(before) // it walked or worked
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
