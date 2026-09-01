/**
 * Pure content-policy logic — no pi runtime imports, so it is unit-testable
 * directly (see policy.test.ts).
 */

// File-searching commands: redirected to the built-in tools. Matched only at
// command positions (see blockedSearchWord), not anywhere in the string.
export const FILE_SEARCH: string[] = [
  "grep",
  "find",
  "fd",
  "fdfind",
  "locate",
  "ls",
  "cat",
  "head",
  "tail",
  "wc",
  "du",
  "stat",
  "file",
  "tree",
  "ag",
  "ack",
  "awk",
  "sed",
];

// A FILE_SEARCH word only counts where a command can start: first token, or
// right after |, &&, ;, &, newline, $(), or backticks. Prevents false hits in
// flags/paths/commit messages ("git diff --stat", "git ls-files", -m "add file").
const COMMAND_SPLIT = /[|;&`\n]|\$\(/;

// head/tail flags that take a separate value token (-n 5, -c 100, ...).
const VALUE_FLAG = /^-(n|c|lines|bytes)$/;

// Output redirections (>, >>, 2>, 2>&1): the target is where output goes,
// not a file being read. Input via `<` stays a bare token below = blocked.
const OUTPUT_REDIRECT = /^\d*>>?(&\d+)?$/;

// head/tail with no file operand read stdin — that is trimming another
// command's output (`pnpm typecheck 2>&1 | tail -5`), not reading a file.
function headTailReadsFile(tokens: string[]): boolean {
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (VALUE_FLAG.test(t) || t === "--lines" || t === "--bytes" || OUTPUT_REDIRECT.test(t)) {
      i++; // skip the flag value / redirect target
      continue;
    }
    if (t.startsWith("-")) continue; // -5, -n5, -q, --lines=5, ...
    return true; // bare operand = file to read
  }
  return false;
}

// First FILE_SEARCH word used to search/read files at a command position,
// or undefined if the command is clean.
export function blockedSearchWord(command: string): string | undefined {
  for (const seg of command.split(COMMAND_SPLIT)) {
    const tokens = seg.trim().split(/\s+/);
    const word = (tokens[0] ?? "").split("/").pop() ?? "";
    if (!FILE_SEARCH.includes(word)) continue;
    if ((word === "head" || word === "tail") && !headTailReadsFile(tokens.slice(1))) continue;
    return word;
  }
  return undefined;
}
