import assert from "node:assert/strict";
import test from "node:test";
import { updateNotice } from "./updateNotice.js";

test("says nothing without a status, or when up to date", () => {
  assert.equal(updateNotice(null), null);
  assert.equal(updateNotice({ state: "current" }), null);
});

test("stays silent when there is no way to know", () => {
  assert.equal(updateNotice({ state: "unknown", tracked: false }), null);
});

test("asks for a restart and names both versions", () => {
  const notice = updateNotice({
    state: "restart-required",
    running: { version: "1.0.0", commit: "aaa" },
    disk: { version: "1.1.0", commit: "bbb" },
  });
  assert.equal(notice.action, "restart");
  assert.match(notice.detail, /1\.1\.0 is installed/);
  assert.match(notice.detail, /still running 1\.0\.0/);
});

test("asks for a restart without version numbers when only the commit moved", () => {
  const notice = updateNotice({
    state: "restart-required",
    running: { version: "1.0.0", commit: "aaa" },
    disk: { version: "1.0.0", commit: "bbb" },
  });
  assert.equal(notice.action, "restart");
  assert.match(notice.detail, /newer version is installed/);
});

test("offers the one-click update and counts the changes", () => {
  const notice = updateNotice({ state: "update-available", behind: 3, canApply: true });
  assert.equal(notice.action, "apply");
  assert.match(notice.detail, /3 updates behind/);
});

test("uses the singular for a single change", () => {
  const notice = updateNotice({ state: "update-available", behind: 1, canApply: true });
  assert.match(notice.detail, /1 update behind/);
});

test("explains instead of offering a button when the folder has local changes", () => {
  const notice = updateNotice({ state: "update-available", behind: 2, canApply: false });
  assert.equal(notice.action, null);
  assert.match(notice.detail, /local changes/);
});
