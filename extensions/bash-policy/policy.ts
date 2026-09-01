/**
 * Pure content-policy logic — no pi runtime imports, so it is unit-testable
 * directly (see policy.test.ts).
 */

// File-searching commands: redirected to the built-in tools. Matched only at
// command positions (see blockedSearchWord), not anywhere in the string.
// `rg` is deliberately NOT listed — any rg use is allowed.
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
  "xargs",
];

// Known no-op prefixes: `env cat f`, `LC_ALL=C grep ...`, `time cat f`,
// `! cat f`. Stripped before word detection. ponytail: wrappers with flags
// (`xargs -0 grep`), function definitions (`f(){ cat "$1"; }`) still slip
// through.
const PREFIXES = new Set(["env", "command", "time", "nice", "nohup", "stdbuf", "exec", "sudo", "!"]);

// Filters that can read stdin: with no file operand they trim or filter
// another command's output (`pnpm test 2>&1 | grep FAIL`), which is allowed;
// with a file operand they search/read files, which is not.
// ponytail: heuristic — exotic arg forms can slip through (grep --file=pats,
// unquoted multi-token awk programs).
const STDIN_FILTERS = new Set(["head", "tail", "wc", "grep", "awk", "sed"]);
// grep/awk/sed take the pattern/program as their first bare token; a file
// operand is any bare token after it.
const PATTERN_FIRST = new Set(["grep", "awk", "sed"]);
// Flags that consume the next token, so its value is not mistaken for a file
// operand. -f/--file are deliberately absent: they always read a file.
const VALUE_FLAGS: Record<string, RegExp> = {
  head: /^-(n|c|lines|bytes)$/,
  tail: /^-(n|c|lines|bytes)$/,
  grep: /^-(e|m|A|B|C)$/,
  awk: /^-(F|v)$/,
};

// Output redirections: plain form (> out.txt) consumes the target token; the
// fd-dup form (2>&1) has no target. Attached targets (>out.txt) and stdin
// herestrings (<<<) are handled inline. Input via `<` reads a file, which the
// bare-token count catches without a special case.
const OUTPUT_REDIRECT = /^\d*>>?$/;
const FD_DUP = /^\d*>>?&\d+$/;
const ATTACHED_REDIRECT = /^\d*>>?/;

// Quote-aware command splitter: cuts where a new command can start (| ; &
// ` newline ( ) and $() or <( openings), but never inside quotes.
function splitCommands(command: string): string[] {
  const segments: string[] = [];
  let cur = "";
  let quote: string | undefined;
  let prev = "";
  for (const ch of command) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = undefined;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
    } else if (/[|;`\n()]/.test(ch) || (ch === "&" && prev !== ">")) {
      segments.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
    prev = ch;
  }
  segments.push(cur);
  return segments;
}

// Split a segment into tokens, honoring quotes so `grep "foo bar"` and
// `awk '{print $1}'` stay one token. Backslash escapes are not handled.
function tokenize(segment: string): string[] {
  return segment
    .replace(/'[^']*'|"[^"]*"/g, (m) => m.replace(/\s/g, "\x01"))
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.replaceAll("\x01", " "));
}

// Does this filter invocation read files (blocked) or only stdin (allowed)?
function filterReadsFile(word: string, tokens: string[]): boolean {
  if (word === "grep" && tokens.some((t) => t.startsWith("-") && /[rR]/.test(t))) {
    return true; // -r/-R with no path searches the cwd, not stdin
  }
  const valueFlag = VALUE_FLAGS[word];
  const patternFirst = PATTERN_FIRST.has(word);
  let sawPatternFlag = false; // pattern/program supplied via -e or --regexp=
  let bare = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t === "-f" || t === "--file") return true; // patterns/program read from a file
    if (t === "<<<") { i++; continue; } // herestring word is data, not an operand
    if (FD_DUP.test(t)) continue; // 2>&1 — fd duplication, no target token
    if (OUTPUT_REDIRECT.test(t)) { i++; continue; } // target is written, not read
    if (ATTACHED_REDIRECT.test(t)) continue; // attached redirect target (>out.txt)
    if (t.startsWith("--regexp=") || t.startsWith("--expression=")) { sawPatternFlag = true; continue; }
    if (t === "-e") { sawPatternFlag = true; i++; continue; }
    if (valueFlag && valueFlag.test(t)) { i++; continue; }
    if (t.startsWith("-")) continue; // valueless flag or attached value (-n5, --lines=5)
    bare++;
  }
  if (patternFirst) return sawPatternFlag ? bare >= 1 : bare >= 2;
  return bare >= 1;
}

// First FILE_SEARCH word used to search/read files at a command position,
// or undefined if the command is clean. Stdin-only filter uses (pipes that
// trim/filter a command's own output) are allowed.
export function blockedSearchWord(command: string): string | undefined {
  for (const text of splitCommands(command)) {
    const tokens = tokenize(text);
    let start = 0;
    while (start < tokens.length && (PREFIXES.has(tokens[start]) || /^[A-Za-z_]\w*=/.test(tokens[start]))) {
      start++; // strip env/time/VAR=x/! prefixes
    }
    const word = (tokens[start] ?? "")
      .split("<")[0]
      .replaceAll("'", "")
      .replaceAll('"', "")
      .split("/")
      .pop() ?? "";
    if (!FILE_SEARCH.includes(word)) continue;
    if (STDIN_FILTERS.has(word) && !filterReadsFile(word, tokens.slice(start + 1))) continue;
    return word;
  }
  return undefined;
}
