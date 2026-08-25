import assert from "node:assert/strict";
import test from "node:test";
import { isProtectedPath, isSafeArchivePath, isWritablePath } from "./applyArchive.js";

test("ordinary source files are writable", () => {
  for (const ok of [
    "package.json",
    "server/src/index.js",
    "frontend/src/components/AppNav.jsx",
    "scripts/start.sh",
    "docs/images/05-live.png",
  ]) {
    assert.equal(isWritablePath(ok), true, `${ok} should be writable`);
  }
});

test("traversal is refused in every shape", () => {
  for (const bad of [
    "../outside.js",
    "server/../../outside.js",
    "a/b/../../../etc/passwd",
    "..",
    "../",
  ]) {
    assert.equal(isSafeArchivePath(bad), false, `${bad} should be refused`);
    assert.equal(isWritablePath(bad), false);
  }
});

test("absolute paths are refused, POSIX and Windows alike", () => {
  for (const bad of ["/etc/passwd", "/tmp/x", "C:/Windows/system32", "c:\\Windows", "\\\\server\\share"]) {
    assert.equal(isSafeArchivePath(bad), false, `${bad} should be refused`);
  }
});

test("empty, nul-bearing and malformed paths are refused", () => {
  for (const bad of ["", null, undefined, "a\0b", "a//b"]) {
    assert.equal(isSafeArchivePath(bad), false, `${String(bad)} should be refused`);
  }
});

/*
 * The tokens and the saved audits are the two things a bad update could destroy that
 * no reinstall brings back. They are not in the archive, so the only protection is
 * this list.
 */
test("the user's own files are never a destination", () => {
  for (const sacred of [
    "config",
    "config/rtds-profiles.json",
    "config/.local-api-key",
    "config/rtds-profiles.example.json",
    ".stored-files",
    ".stored-files/report-123.json",
    "server/.env",
    "frontend/.env.local",
  ]) {
    assert.equal(isProtectedPath(sacred), true, `${sacred} must be protected`);
    assert.equal(isWritablePath(sacred), false, `${sacred} must never be written`);
  }
});

test("the install's own artefacts are left alone too", () => {
  for (const artefact of [
    ".git",
    ".git/config",
    "node_modules/express/index.js",
    "server/node_modules/x.js",
    "frontend/node_modules/y.js",
    ".node/bin/node",
    "frontend/dist/index.html",
  ]) {
    assert.equal(isWritablePath(artefact), false, `${artefact} must not be overwritten`);
  }
});

test("a protected prefix does not swallow a similarly named sibling", () => {
  // `config` is protected; `configuration` and `configure.sh` are ordinary source.
  assert.equal(isWritablePath("configuration/notes.md"), true);
  assert.equal(isWritablePath("scripts/configure.sh"), true);
  assert.equal(isWritablePath("server/src/config.js"), true);
});
