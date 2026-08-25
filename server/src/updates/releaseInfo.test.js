import assert from "node:assert/strict";
import test from "node:test";
import { ALLOWED_HOSTS, ARCHIVE_URL, MANIFEST_URL, isAllowedUrl } from "./releaseInfo.js";

test("the two URLs the updater uses are themselves allowed", () => {
  assert.ok(isAllowedUrl(MANIFEST_URL));
  assert.ok(isAllowedUrl(ARCHIVE_URL));
  assert.equal(ALLOWED_HOSTS.length, 2, "widening this list widens what can install code");
});

test("plain http is refused even on a trusted host", () => {
  assert.equal(isAllowedUrl("http://raw.githubusercontent.com/a/b/main/package.json"), false);
});

test("a hostname that merely ends with a trusted one is refused", () => {
  // The suffix-matching mistake, spelled out: these all read as GitHub at a glance.
  assert.equal(isAllowedUrl("https://raw.githubusercontent.com.attacker.tld/x"), false);
  assert.equal(isAllowedUrl("https://evil-codeload.github.com/x"), false);
  assert.equal(isAllowedUrl("https://notgithub.com/raw.githubusercontent.com"), false);
});

test("other GitHub hosts are not on the list either", () => {
  assert.equal(isAllowedUrl("https://github.com/thomasfaro/x/archive/main.tar.gz"), false);
  assert.equal(isAllowedUrl("https://api.github.com/repos/thomasfaro/x"), false);
});

test("credentials embedded in a URL do not buy their way past the host check", () => {
  assert.equal(isAllowedUrl("https://raw.githubusercontent.com@attacker.tld/x"), false);
});

test("nonsense is refused rather than thrown over", () => {
  for (const bad of [null, undefined, "", "not a url", "file:///etc/passwd", 42, {}]) {
    assert.equal(isAllowedUrl(bad), false, `${String(bad)} should be refused`);
  }
});
