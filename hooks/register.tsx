import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Call, TurnRec, View } from '../types'

const PANE = 'convo-focus'
const MAX_TURNS = 25
const MAX_CALLS = 150

const turns = atom({ plugin: 'convo-focus', key: 'turns' } as const, [], {
  shape: 'turns-1',
})
const view = atom(
  { plugin: 'convo-focus', key: 'view' } as const,
  { open: [], closed: [], expanded: [] },
  { shape: 'view-1' },
)
// true = tool rows are folded out of the chat (ctrl+o still shows everything)
const hidden = atom({ plugin: 'convo-focus', key: 'hidden' } as const, true, {
  shape: 'hidden-1',
})

const cut = (s: unknown, n: number): string => {
  const t = typeof s === 'string' ? s : ''
  const one = t.replace(/\s+/g, ' ').trim()
  return one.length > n ? one.slice(0, n - 1) + '…' : one
}
const cutLines = (s: unknown, n: number): string => {
  const t = typeof s === 'string' ? s : ''
  return t.length > n ? t.slice(0, n - 1) + '…' : t
}
const lines = (s: unknown): number =>
  typeof s === 'string' && s.length > 0 ? s.split('\n').length : 0
const tail = (p: string): string => p.split('/').slice(-2).join('/')
const flip = (list: string[], k: string): string[] =>
  list.includes(k) ? list.filter(x => x !== k) : [...list, k]

const CHANGE = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']
const LOOK = ['Read', 'Grep', 'Glob', 'LS', 'WebSearch', 'WebFetch', 'ToolSearch']

const bucket = (tool: string): string =>
  tool === 'Read'
    ? 'read'
    : tool === 'Grep' || tool === 'Glob' || tool === 'LS' || tool === 'ToolSearch'
      ? 'search'
      : tool === 'WebSearch' || tool === 'WebFetch'
        ? 'web'
        : 'other'

const describe = (rec: Record<string, unknown>): Call => {
  const tool = String(rec.tool ?? '?')
  const file = String(rec.file_path ?? rec.notebook_path ?? rec.path ?? '')
  let add = 0
  let del = 0
  let input = ''
  if (tool === 'Edit') {
    add = lines(rec.new_string)
    del = lines(rec.old_string)
    input = `- ${cutLines(rec.old_string, 300)}\n+ ${cutLines(rec.new_string, 300)}`
  } else if (tool === 'Write') {
    add = lines(rec.content)
    input = cutLines(rec.content, 500)
  } else if (tool === 'MultiEdit' && Array.isArray(rec.edits)) {
    for (const x of rec.edits as Record<string, unknown>[]) {
      add += lines(x.new_string)
      del += lines(x.old_string)
    }
    input = `${rec.edits.length} edits`
  } else if (tool === 'Bash') {
    input = cutLines(rec.command, 700)
  } else {
    const { tool: _t, tool_use_id: _i, agentId: _a, ...rest } = rec
    try {
      input = cutLines(JSON.stringify(rest), 500)
    } catch {}
  }
  const label =
    file !== ''
      ? tail(file)
      : cut(
          rec.command ??
            rec.pattern ??
            rec.url ??
            rec.query ??
            rec.description ??
            rec.prompt ??
            '',
          100,
        )
  return {
    id: String(rec.tool_use_id ?? ''),
    tool,
    kind: CHANGE.includes(tool) ? 'change' : LOOK.includes(tool) ? 'look' : 'run',
    label,
    file,
    add,
    del,
    status: 'run',
    note: '',
    input,
    output: '',
    isSub: rec.agentId !== undefined && rec.agentId !== null,
  }
}

export const register: Register = on => {
  // true while the pane sits at its end: new work then scrolls into view
  let follow = true

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'chatfocus',
      description: 'Toggle hiding tool calls in the chat (they stay in the side pane)',
    })
    await $.command.register({
      name: 'toolpane',
      description: 'Open the tool-calls side pane',
    })
    void $.ui.open({ id: PANE, title: 'What the agent did' })

    return next(e)
  })

  on('command.run', { command: 'chatfocus' }, async $ => {
    const now = !(await read($, hidden))
    await update($, hidden, () => now)
    return { text: now ? 'Chat focus on: tool rows hidden.' : 'Chat focus off: tool rows shown.' }
  }).catch(() => ({ text: 'chatfocus: could not toggle.' }))

  on('command.run', { command: 'toolpane' }, async $ => {
    await $.ui.open({ id: PANE, title: 'What the agent did' })
    return { text: 'Pane opened (docks beside the chat in a wide fullscreen terminal).' }
  })

  // A new typed prompt starts a new block in the pane.
  on('prompt.submit', async ($, e, next) => {
    try {
      if (e.command === undefined && e.isMeta !== true && e.text.trim() !== '') {
        const rec: TurnRec = {
          id: `t${await $.clock.now()}`,
          ask: cut(e.text, 200),
          status: 'run',
          said: '',
          ms: 0,
          calls: [],
        }
        await update($, turns, list => [rec, ...list].slice(0, MAX_TURNS))
      }
    } catch {}
    if (follow) {
      try {
        await $.ui.scroll({ in: PANE, to: 'end' })
      } catch {}
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    try {
      if (e.agentId === undefined) {
        const status =
          e.reason === 'answer' ? 'done' : e.reason === 'aborted' ? 'stopped' : 'error'
        await update($, turns, list =>
          list.map((t, i) =>
            i === 0
              ? { ...t, status, said: cut(e.answer, 220), ms: e.durationMs }
              : t,
          ),
        )
      }
    } catch {}
    if (follow) {
      try {
        await $.ui.scroll({ in: PANE, to: 'end' })
      } catch {}
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  // Record every call into the current block. Never alters the call.
  on('tool.call', async ($, e, next) => {
    const rec = e as unknown as Record<string, unknown>
    const call = describe(rec)
    const id = call.id
    try {
      const isSub = call.isSub
      await update($, turns, list => {
        let l = list
        if (l.length === 0 || (!isSub && l[0].status !== 'run')) {
          const fresh: TurnRec = {
            id: `t${Date.now()}`,
            ask: l.length === 0 ? '(before the mod loaded)' : '(continued without a new prompt)',
            status: 'run',
            said: '',
            ms: 0,
            calls: [],
          }
          l = [fresh, ...l].slice(0, MAX_TURNS)
        }
        return l.map((t, i) =>
          i === 0 ? { ...t, calls: [...t.calls, call].slice(-MAX_CALLS) } : t,
        )
      })
    } catch {}
    if (follow) {
      try {
        await $.ui.scroll({ in: PANE, to: 'end' })
      } catch {}
    }

    const ran = await next(e)

    try {
      const failed = ran.deny !== undefined || ran.isError === true
      const note = failed ? cut(ran.deny ?? (ran as { text?: string }).text, 200) : ''
      const out = failed ? '' : cutLines((ran as { text?: string }).text, 600)
      const ro = (ran as { isReadOnly?: boolean }).isReadOnly === true
      await update($, turns, list =>
        list.map(t => ({
          ...t,
          calls: t.calls.map(c =>
            c.id === id
              ? {
                  ...c,
                  status: failed ? 'err' : 'ok',
                  note,
                  output: out,
                  kind: ro && c.kind === 'run' ? 'look' : c.kind,
                }
              : c,
          ),
        })),
      )
    } catch {}
    if (follow) {
      try {
        await $.ui.scroll({ in: PANE, to: 'end' })
      } catch {}
    }

    return ran
  }).catch(($, e, next) => (next.called ? { deny: 'convo-focus: recorder failed.' } : next(e)))

  // The person scrolling up stops the follow; reaching the end resumes it.
  on('ui.scroll', { component: 'Pane', requestId: PANE }, ($, e, next) => {
    if (e.origin === 'person') {
      follow = e.offset >= e.contentRows - e.bodyRows
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const list = await read($, turns)
    const v: View = await read($, view)
    const cols = Math.max(20, (e.props.bodyColumns ?? 40) - 1)

    if (list.length === 0) {
      return <Text dimColor>Nothing yet. Send a prompt.</Text>
    }

    return (
      <Box flexDirection="column">
        {[...list].reverse().map(t => {
          const isLatest = t.id === list[0].id
          const isOpen = isLatest ? !v.closed.includes(t.id) : v.open.includes(t.id)
          const changes = t.calls.filter(c => c.kind !== 'look')
          const looks = t.calls.filter(c => c.kind === 'look')
          const failed = t.calls.filter(c => c.status === 'err').length
          const files = new Map<string, { add: number; del: number }>()
          for (const c of t.calls) {
            if (c.kind === 'change' && c.file !== '') {
              const f = files.get(c.file) ?? { add: 0, del: 0 }
              files.set(c.file, { add: f.add + c.add, del: f.del + c.del })
            }
          }
          const mark =
            t.status === 'run' ? '●' : t.status === 'done' ? '✓' : t.status === 'stopped' ? '■' : '✗'
          const counts: Record<string, number> = {}
          for (const c of looks) counts[bucket(c.tool)] = (counts[bucket(c.tool)] ?? 0) + 1
          const lookSummary = Object.entries(counts)
            .map(([k, n]) => `${n} ${k}${k === 'other' ? '' : n === 1 ? '' : 's'}`)
            .join(' · ')
          const lookKey = `look-${t.id}`
          const lookOpen = v.expanded.includes(lookKey)

          return (
            <Box flexDirection="column" marginBottom={1}>
              <Button
                key={`turn-${t.id}`}
                plain
                label={cut(`${isOpen ? '▾' : '▸'} ${t.ask}`, cols)}
                onPress={() =>
                  update($, view, x =>
                    isLatest
                      ? { ...x, closed: flip(x.closed, t.id) }
                      : { ...x, open: flip(x.open, t.id) },
                  )
                }
              />
              <Text
                wrap="truncate-end"
                dimColor={failed === 0}
                color={failed > 0 ? 'red' : undefined}
              >
                {'  '}
                {mark} {t.calls.length} {t.calls.length === 1 ? 'call' : 'calls'} · {files.size}{' '}
                {files.size === 1 ? 'file' : 'files'}
                {failed > 0 ? ` · ${failed} failed` : ''}
                {t.ms > 0 ? ` · ${Math.round(t.ms / 1000)}s` : ''}
              </Text>

              {isOpen && (
                <Box flexDirection="column">
                  {files.size > 0 && (
                    <Box flexDirection="column">
                      <Text dimColor>{'  '}Files changed</Text>
                      {[...files.entries()].map(([f, s]) => (
                        <Text wrap="truncate-start">
                          {'   '}
                          {tail(f)} +{s.add} −{s.del}
                        </Text>
                      ))}
                    </Box>
                  )}

                  {changes.length > 0 && <Text dimColor>{'  '}Steps</Text>}
                  {changes.map(c => {
                    const open = v.expanded.includes(c.id)
                    const glyph = c.kind === 'change' ? '✎' : c.tool === 'Bash' ? '$' : '◆'
                    const tag = c.kind === 'change' ? ` +${c.add} −${c.del}` : ''
                    return (
                      <Box flexDirection="column">
                        <Button
                          key={`call-${c.id}`}
                          plain
                          label={cut(
                            `${open ? '▾' : '▸'} ${c.status === 'err' ? '✗' : c.status === 'run' ? '●' : glyph} ${c.isSub ? '↳ ' : ''}${c.tool} ${c.label}${tag}`,
                            cols - 1,
                          )}
                          onPress={() =>
                            update($, view, x => ({ ...x, expanded: flip(x.expanded, c.id) }))
                          }
                        />
                        {c.note !== '' && (
                          <Text wrap="truncate-end" color="red" dimColor>
                            {'     '}
                            {c.note}
                          </Text>
                        )}
                        {open && (
                          <Box flexDirection="column" paddingLeft={4}>
                            <Text dimColor wrap="wrap">{c.input}</Text>
                            {c.output !== '' && <Text wrap="wrap">{c.output}</Text>}
                          </Box>
                        )}
                      </Box>
                    )
                  })}

                  {looks.length > 0 && (
                    <Box flexDirection="column">
                      <Button
                        key={lookKey}
                        plain
                        dimColor
                        label={cut(`${lookOpen ? '▾' : '▸'} looked at: ${lookSummary}`, cols - 1)}
                        onPress={() =>
                          update($, view, x => ({ ...x, expanded: flip(x.expanded, lookKey) }))
                        }
                      />
                      {lookOpen &&
                        looks.map(c => (
                          <Text dimColor wrap="truncate-end">
                            {'     '}
                            {c.status === 'err' ? '✗ ' : ''}
                            {c.tool} {c.label}
                          </Text>
                        ))}
                    </Box>
                  )}

                  {t.said !== '' && (
                    <Text dimColor wrap="wrap">
                      {'  '}said: {t.said}
                    </Text>
                  )}
                </Box>
              )}
            </Box>
          )
        })}
      </Box>
    )
  })

  // ---- fold tool rows out of the chat; ctrl+o (isExpanded) still shows all ----
  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    let isHiding = false
    try {
      isHiding = (await read($, hidden)) === true
    } catch {}
    if (e.props.isExpanded === true || !isHiding) return next(e)
    const { Box, Text } = $.ui.resolve(e)
    if (e.props.isErrored === true) {
      return (
        <Text color="red" dimColor>
          ✗ {e.props.tool} failed (details in the side pane)
        </Text>
      )
    }
    return <Box height={0} />
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    let isHiding = false
    try {
      isHiding = (await read($, hidden)) === true
    } catch {}
    if (e.props.isExpanded === true || !isHiding) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box height={0} />
  })

  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    let isHiding = false
    try {
      isHiding = (await read($, hidden)) === true
    } catch {}
    if (e.props.isExpanded === true || !isHiding) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box height={0} />
  })

  on('ui.render', { component: 'ToolProgress' }, async ($, e, next) => {
    let isHiding = false
    try {
      isHiding = (await read($, hidden)) === true
    } catch {}
    if (!isHiding) return next(e)
    const { Box } = $.ui.resolve(e)
    return <Box height={0} />
  })
}
