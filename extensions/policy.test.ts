import assert from "node:assert/strict";
import { test } from "node:test";
import { blockedSearchWord } from "./policy.ts";

test("piped head/tail trimming is allowed", () => {
  assert.equal(blockedSearchWord("pnpm typecheck 2>&1 | tail -5"), undefined);
  assert.equal(blockedSearchWord("pnpm test | tail -n 20"), undefined);
  assert.equal(blockedSearchWord("git log --oneline | head -10"), undefined);
  assert.equal(blockedSearchWord("cmd 2>&1 | tail"), undefined);
  assert.equal(blockedSearchWord("cmd | tail -5 > out.txt"), undefined);
});

test("head/tail reading files stays blocked", () => {
  assert.equal(blockedSearchWord("tail /var/log/syslog"), "tail");
  assert.equal(blockedSearchWord("head -n 5 package.json"), "head");
  assert.equal(blockedSearchWord("cmd | tail -5 output.log"), "tail");
  assert.equal(blockedSearchWord("tail < package.json"), "tail");
  assert.equal(blockedSearchWord("pnpm build && tail logs.txt"), "tail");
});

test("other file-search commands unchanged", () => {
  assert.equal(blockedSearchWord("cat package.json"), "cat");
  assert.equal(blockedSearchWord("pnpm test | grep -i error"), "grep");
  assert.equal(blockedSearchWord("/usr/bin/sed -i '' x.ts"), "sed");
  assert.equal(blockedSearchWord("git diff --stat"), undefined);
  assert.equal(blockedSearchWord('git commit -m "add file handling"'), undefined);
});
