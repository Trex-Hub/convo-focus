export type Call = {
  id: string
  tool: string
  kind: 'change' | 'run' | 'look'
  label: string
  file: string
  add: number
  del: number
  status: 'run' | 'ok' | 'err'
  note: string
  input: string
  output: string
  isSub: boolean
}

export type TurnRec = {
  id: string
  ask: string
  status: 'run' | 'done' | 'stopped' | 'error'
  said: string
  ms: number
  calls: Call[]
}

export type View = { open: string[]; closed: string[]; expanded: string[] }

declare module 'claude-code' {
  interface PluginState {
    'convo-focus': {
      turns: Shaped<TurnRec[]>
      view: Shaped<View>
      hidden: Shaped<boolean>
    }
  }
}
