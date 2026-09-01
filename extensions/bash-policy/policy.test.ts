import assert from "node:assert/strict";
import { test } from "node:test";
import { blockedSearchWord } from "./policy.ts";

test("pipes that trim/filter a command's own output are allowed", () => {
  assert.equal(blockedSearchWord("pnpm typecheck 2>&1 | tail -5"), undefined);
  assert.equal(blockedSearchWord("pnpm test | tail -n 20"), undefined);
  assert.equal(blockedSearchWord("git log --oneline | head -10"), undefined);
  assert.equal(blockedSearchWord("cmd 2>&1 | tail"), undefined);
  assert.equal(blockedSearchWord("cmd | tail -5 > out.txt"), undefined);
  assert.equal(blockedSearchWord("cmd | tail -5 >out.txt"), undefined);
  assert.equal(blockedSearchWord("ps aux | grep node"), undefined);
  assert.equal(blockedSearchWord("pnpm test 2>&1 | grep -i FAIL"), undefined);
  assert.equal(blockedSearchWord("git log | grep -e feat | head -5"), undefined);
  assert.equal(blockedSearchWord("echo hi | wc -l"), undefined);
  assert.equal(blockedSearchWord("curl -s https://x | sed 's/a/b/'"), undefined);
  assert.equal(blockedSearchWord("ps aux | awk '{print $2}'"), undefined);
  assert.equal(blockedSearchWord('grep foo <<< "$bar"'), undefined); // herestring is data
  assert.equal(blockedSearchWord("grep -c error"), undefined); // stdin only
  // quoted text must not create phantom command positions
  assert.equal(blockedSearchWord('git commit -m "fix parser; cat notes follow-up"'), undefined);
  assert.equal(blockedSearchWord('echo "a | tail file"'), undefined);
  assert.equal(blockedSearchWord("echo 'use $(cat file) to read'"), undefined);
});

test("filters reading files stay blocked", () => {
  assert.equal(blockedSearchWord("tail /var/log/syslog"), "tail");
  assert.equal(blockedSearchWord("head -n 5 package.json"), "head");
  assert.equal(blockedSearchWord("cmd | tail -5 output.log"), "tail");
  assert.equal(blockedSearchWord("tail < package.json"), "tail");
  assert.equal(blockedSearchWord("wc -l < file.txt"), "wc");
  // policy.ts says wc; index.ts LINE_COUNT still allows plain wc -l
  assert.equal(blockedSearchWord("wc -l src/a.ts"), "wc");
  assert.equal(blockedSearchWord("tail 2>&1 /var/log/syslog"), "tail"); // fd-dup has no target token
  assert.equal(blockedSearchWord("grep foo 2>&1 file.txt"), "grep");
  assert.equal(blockedSearchWord('grep -rn "todo" src/'), "grep");
  assert.equal(blockedSearchWord("grep -rn todo"), "grep"); // -r with no path searches cwd
  assert.equal(blockedSearchWord('grep "foo bar" file.txt'), "grep");
  assert.equal(blockedSearchWord("grep -e pat src/"), "grep");
  assert.equal(blockedSearchWord("grep --regexp=todo package.json"), "grep");
  assert.equal(blockedSearchWord("grep -f pats.txt"), "grep");
  assert.equal(blockedSearchWord("awk '{print $1}' data.csv"), "awk");
  assert.equal(blockedSearchWord("sed 's/a/b/' f.txt"), "sed");
  assert.equal(blockedSearchWord("/usr/bin/sed -i '' x.ts"), "sed");
});

test("pure search/read commands always blocked, even mid-pipe", () => {
  assert.equal(blockedSearchWord("cat package.json"), "cat");
  assert.equal(blockedSearchWord("cat notes.md | head -20"), "cat");
  assert.equal(blockedSearchWord("find . -name '*.ts' | wc -l"), "find");
  assert.equal(blockedSearchWord("ls -la src/ | head"), "ls");
  assert.equal(blockedSearchWord("echo f | xargs cat"), "xargs");
});

test("hidden command words are seen through", () => {
  assert.equal(blockedSearchWord('"cat" secret.txt'), "cat");
  assert.equal(blockedSearchWord("c'a't secret.txt"), "cat");
  assert.equal(blockedSearchWord("(cat secret.txt)"), "cat");
  assert.equal(blockedSearchWord("cat<secret.txt"), "cat");
  assert.equal(blockedSearchWord("diff <(cat a.txt) <(cat b.txt)"), "cat");
  assert.equal(blockedSearchWord("env cat f"), "cat");
  assert.equal(blockedSearchWord("time grep -rn x src"), "grep");
  assert.equal(blockedSearchWord("LC_ALL=C grep -rn todo src/"), "grep");
  assert.equal(blockedSearchWord("! cat f"), "cat");
});

test("non-search commands unchanged", () => {
  assert.equal(blockedSearchWord('git commit -m "add file handling"'), undefined);
  assert.equal(blockedSearchWord("rg pattern src/"), undefined); // rg deliberately allowed
});
