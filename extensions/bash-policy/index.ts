/**
 * Bash policy — merged from gated-bash.ts + block-commands.ts (same goal:
 * keep the agent on the built-in grep/find/read tools instead of shell
 * file-dumping).
 * 1. Deferred access — `bash` is hidden from the initial tools array and only
 *    exposed after the model calls `request_terminal`. On models with native
 *    deferred loading (Anthropic 4.5+, OpenAI gpt-5.4+) the added tool
 *    definition is loaded at the tool-result position; other models get the
 *    full updated tool list on the next request.
 * 2. Reason gate — the bash tool is overridden with a schema that makes
 *    `reason` a required field (prose reminders lose to tool schemas, so the
 *    first call after activation used to lack one). The `tool_call` hook still
 *    enforces a non-empty reason.
 * 3. Content policy — file-search/read commands at command positions are
 *    redirected to the built-in tools. Content is checked on the command
 *    itself, so reasons can't lie.
 */
import { createBashTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { blockedSearchWord } from "./policy.ts";

const GATE_MESSAGE =
  "Blocked: bash calls require an explicit reason. Re-issue with a non-empty `reason` field stating why bash is needed.";

// Redirect the model to the equivalent built-in tool instead of a plain block.
const REDIRECTS: Record<string, string> = {
  grep: "Blocked by deny list (matched \"grep\"). Use the built-in `grep` tool instead.",
  ag: "Blocked by deny list (matched \"ag\"). Use the built-in `grep` tool instead.",
  ack: "Blocked by deny list (matched \"ack\"). Use the built-in `grep` tool instead.",
  find: "Blocked by deny list (matched \"find\"). Use the built-in `find` tool instead.",
  fd: "Blocked by deny list (matched \"fd\"). Use the built-in `find` tool instead.",
  fdfind: "Blocked by deny list (matched \"fdfind\"). Use the built-in `find` tool instead.",
  locate: "Blocked by deny list (matched \"locate\"). Use the built-in `find` tool instead.",
  tree: "Blocked by deny list (matched \"tree\"). Use the built-in `find` tool instead.",
  ls: "Blocked by deny list (matched \"ls\"). Use the built-in `find` tool to list files, `read` to read them.",
  cat: "Blocked by deny list (matched \"cat\"). Use the built-in `read` tool instead.",
  head: "Blocked by deny list (matched \"head\"). Use the built-in `read` tool with offset/limit instead.",
  tail: "Blocked by deny list (matched \"tail\"). Use the built-in `read` tool with offset/limit instead.",
  wc: "Blocked by deny list (matched \"wc\"). Use the built-in `read` or `grep` tool instead.",
  du: "Blocked by deny list (matched \"du\"). Use the built-in `find` tool instead.",
  stat: "Blocked by deny list (matched \"stat\"). Use the built-in `read` or `find` tool instead.",
  file: "Blocked by deny list (matched \"file\"). Use the built-in `read` tool instead.",
  awk: "Blocked by deny list (matched \"awk\"). Use the built-in `read` tool to inspect files; `grep` tool to filter lines.",
  sed: "Blocked by deny list (matched \"sed\"). Use the built-in `edit` tool to modify files; `read`/`grep` tools to inspect them.",
};

// Simple line counting: a lone `wc -l` with file arguments only — no pipes,
// semicolons, redirection into other commands, or command substitution.
const LINE_COUNT = /^(\S*\/)?wc\s+(-\w*l\w*\b\s*)+[^|;&`$<>]*$/;

export default function (pi: ExtensionAPI) {
  // Hide bash until terminal access is requested.
  pi.on("session_start", () => {
    if (!pi.getActiveTools().includes("bash")) return;
    pi.setActiveTools(pi.getActiveTools().filter((t) => t !== "bash"));
  });

  // Override built-in bash: identical behavior, but the schema requires a
  // `reason` field so models actually emit one (strict-schema providers must).
  let realBash: ReturnType<typeof createBashTool> | undefined;
  pi.registerTool({
    ...createBashTool(process.cwd()),
    parameters: Type.Object({
      command: Type.String({ description: "Bash command to execute" }),
      timeout: Type.Optional(Type.Number({ description: "Timeout in seconds" })),
      reason: Type.String({ description: "Why this bash command is needed" }),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      realBash ??= createBashTool(ctx.cwd);
      const { reason: _reason, ...rest } = params;
      return realBash.execute(toolCallId, rest, signal, onUpdate);
    },
  });

  pi.registerTool({
    name: "request_terminal",
    label: "Request Terminal",
    description:
      "Request access to the bash tool. Call this when you need to run shell commands.",
    parameters: Type.Object({}),
    async execute() {
      if (pi.getActiveTools().includes("bash")) {
        return { content: [{ type: "text", text: "bash is already available." }] };
      }
      pi.setActiveTools([...pi.getActiveTools(), "bash"]);
      return {
        content: [
          {
            type: "text",
            text:
              "bash tool is now available. REMINDER: every bash call MUST include a non-empty `reason` field stating why bash is needed — calls without one are blocked.",
          },
        ],
      };
    },
  });

  // Teach the model the gate rules. before_agent_start (not turn_start) is
  // the only event with a mutable systemPrompt.
  pi.on("before_agent_start", (event) => ({
    systemPrompt:
      event.systemPrompt +
      [
        "",
        "## Bash gating",
        "- Every `bash` tool call MUST include a `reason` field explaining why bash is needed.",
        "- Never use bash for file searching, listing, or reading (ls/cat/grep/find/head/tail/...). Use the built-in `grep`, `find`, and `read` tools instead.",
      ].join("\n"),
  }));

  pi.on("tool_call", async (event) => {
    if (event.toolName !== "bash") return;
    const command = typeof event.input.command === "string" ? event.input.command : "";

    if (!command.trim()) {
      return { block: true, reason: GATE_MESSAGE };
    }

    const reason = typeof event.input.reason === "string" ? event.input.reason.trim() : "";
    if (!reason) return { block: true, reason: GATE_MESSAGE };

    if (LINE_COUNT.test(command)) return; // allow plain line counts

    const word = blockedSearchWord(command);
    if (word) {
      return { block: true, reason: REDIRECTS[word] ?? `Blocked by deny list (matched "${word}")` };
    }
  });
}