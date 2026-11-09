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

## Develop

`hooks/register.tsx` is the whole mod. Check it with `claude plugin validate .`.

## License

MIT
