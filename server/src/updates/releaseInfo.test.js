import assert from "node:assert/strict";
import test from "node:test";
import {
  ALLOWED_HOSTS,
  ARCHIVE_URL,
  MANIFEST_URL,
  PUBLISHED_ARCHIVE_AVAILABLE,
  fetchPublishedVersion,
  isAllowedUrl,
  openPublishedArchive,
} from "./releaseInfo.js";

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
  assert.equal(isAllowedUrl("https://github.com/an-owner/x/archive/main.tar.gz"), false);
  assert.equal(isAllowedUrl("https://api.github.com/repos/an-owner/x"), false);
});

test("credentials embedded in a URL do not buy their way past the host check", () => {
  assert.equal(isAllowedUrl("https://raw.githubusercontent.com@attacker.tld/x"), false);
});

test("nonsense is refused rather than thrown over", () => {
  for (const bad of [null, undefined, "", "not a url", "file:///etc/passwd", 42, {}]) {
    assert.equal(isAllowedUrl(bad), false, `${String(bad)} should be refused`);
  }
});

/*
 * The route is closed while the repository is private. Both tests below replace fetch
 * with something that fails the test if it is ever called: "returns null" would also
 * pass on a 404, and the point here is that no request leaves the machine at all.
 *
 * They skip themselves when the route is open, so that reopening it stays the one-line
 * change the constant claims to be rather than a one-line change plus two test edits.
 */
const closedRouteOnly = PUBLISHED_ARCHIVE_AVAILABLE
  ? { skip: "the published archive route is open" }
  : {};

test("a closed route reports no version, and without asking the network", closedRouteOnly, async (t) => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error("fetch was called on a closed route");
  };
  t.after(() => {
    globalThis.fetch = realFetch;
  });

  const result = await fetchPublishedVersion();
  assert.equal(result.version, null);
  // Silence, not an error: an untried route has nothing to report, and a message here
  // would surface as a banner about something deliberately switched off.
  assert.equal(result.error, null);
});

test("a closed route refuses to open the archive, and without asking the network", closedRouteOnly, async (t) => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = () => {
    throw new Error("fetch was called on a closed route");
  };
  t.after(() => {
    globalThis.fetch = realFetch;
  });

  const result = await openPublishedArchive();
  assert.equal(result.ok, false);
  assert.equal(result.response, null);
  assert.match(result.error, /anonymous/);
});
