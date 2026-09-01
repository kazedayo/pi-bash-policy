# pi-bash-policy

[Pi](https://github.com/earendil-works/pi-coding-agent) extension that keeps
the agent on the built-in `grep`/`find`/`read` tools instead of shell
file-dumping:

1. **Deferred access** — `bash` is hidden until the model calls
   `request_terminal`.
2. **Reason gate** — the `bash` schema requires a non-empty `reason` field;
   the `tool_call` hook enforces it.
3. **Content policy** — file search/read commands (`grep`, `cat`, `ls`,
   `find`, `head`, ...) at command positions are blocked with a redirect to
   the equivalent built-in tool. Checked on the command itself, so reasons
   can't lie.

## Install

No build step, no dependencies — pi's extension runtime provides
`@earendil-works/pi-coding-agent` and `typebox`. Install as a pi git package:

```sh
pi install git:github.com/kazedayo/pi-bash-policy
```

Public repo, so no GitHub auth is needed. Restart pi (or `/reload`) to pick
it up. Update later with `pi update --extensions`.

## Uninstall

```sh
pi remove git:github.com/kazedayo/pi-bash-policy
```
