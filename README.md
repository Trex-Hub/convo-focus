# convo-focus

A Claude Code mod that keeps the chat about two things: what you asked and what the agent said. Tool calls move out of the chat into a side pane.

## What it does

- **Chat:** tool call rows, their results, the folded "Read 3 files…" lines and the background-run hint are hidden. A failed call leaves one red `✗` line.
- **Side pane ("What the agent did"):** one block per prompt, oldest at the top, newest at the bottom, following the latest step like the chat does.
  - The block heading is your ask, with a summary line: calls, files, failures, duration.
  - **Files changed** lists each file with lines added and removed.
  - **Steps** lists edits and commands. Press a step to see its full input and output.
  - Reads and searches fold into a `looked at:` line.
  - The agent's final answer shows as `said:`.
  - The newest block is open; older ones are folded. Press a heading to fold or expand.

## Install

At the prompt of a terminal session:

```
/plugin install convo-focus --marketplace Trex-Hub/convo-focus
```

From a shell:

```
claude plugin install convo-focus --marketplace Trex-Hub/convo-focus
```

To try it from a local folder without installing:

```
claude --plugin-dir /path/to/this/folder
```

## Commands

| Command | What it does |
| --- | --- |
| `/chatfocus` | Toggle hiding tool calls in the chat. |
| `/toolpane` | Open the side pane again if you closed it. |

Ctrl+o shows the full transcript, tool rows included, whatever `/chatfocus` is set to.

## Notes

- The pane docks beside the chat in a fullscreen terminal at 110 columns or wider, and opens by itself from 144. In a narrower terminal, run `/toolpane` and it appears above the prompt.
- State is kept for the session only: the last 25 prompts and 150 calls per prompt.
- The mod only observes tool calls. It never changes, blocks or delays one.

## What it runs, reads and sends

Everything runs inside your Claude Code session. The mod makes no network requests, starts no processes, reads no files, and writes no files outside Claude Code's own session state.

It watches three events and only reads from them: the prompt you send, each tool call with its result, and the end of each turn. From these it keeps, in the session's state, your prompt text, each call's tool name and a shortened copy of its input and output, and the agent's final answer, so the pane can show them. That state is gone when the session ends, and nothing is sent anywhere.

It never changes, blocks or delays a tool call. If it fails to record a call, the call still runs. The only change to the chat is how the tool rows are drawn, which `/chatfocus` turns off.

## Develop

`hooks/register.tsx` is the whole mod. Check it with `claude plugin validate .`.

## License

MIT
