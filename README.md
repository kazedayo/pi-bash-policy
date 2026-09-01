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

No build step, no dependencies to install — pi's extension runtime provides
`@earendil-works/pi-coding-agent` and `typebox`.

Clone this repo anywhere, then symlink the extension into pi's extensions
directory:

```sh
git clone <this-repo-url> ~/Developer/pi-bash-policy
ln -s ~/Developer/pi-bash-policy/bash-policy.ts ~/.pi/agent/extensions/bash-policy.ts
```

(Copying the file instead of symlinking also works — you just lose
auto-updates on `git pull`.)

Restart pi (or `/reload`) to pick it up.

## Uninstall

```sh
rm ~/.pi/agent/extensions/bash-policy.ts
```
