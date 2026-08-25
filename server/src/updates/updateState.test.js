import assert from "node:assert/strict";
import test from "node:test";
import { UPDATE_STATE, buildUpdateState, compareVersions } from "./updateState.js";

const clean = { tracked: true, clean: true };
const same = { version: "1.4.0", commit: null };

test("up to date says so, and nothing else", () => {
  const state = buildUpdateState({
    ...clean,
    running: { version: "1.0.0", commit: "aaa" },
    disk: { version: "1.0.0", commit: "aaa" },
    behind: 0,
  });
  assert.equal(state.state, UPDATE_STATE.current);
  assert.equal(state.canRestart, false);
  assert.equal(state.canApply, false);
});

test("a commit that moved on disk asks for a restart", () => {
  const state = buildUpdateState({
    ...clean,
    running: { version: "1.0.0", commit: "aaa" },
    disk: { version: "1.0.0", commit: "bbb" },
    behind: 0,
  });
  assert.equal(state.state, UPDATE_STATE.restartRequired);
  assert.equal(state.canRestart, true);
});

test("a restart takes priority over fetching yet another update", () => {
  const state = buildUpdateState({
    ...clean,
    running: { version: "1.0.0", commit: "aaa" },
    disk: { version: "1.1.0", commit: "bbb" },
    behind: 4,
  });
  assert.equal(state.state, UPDATE_STATE.restartRequired);
  assert.equal(state.canApply, false, "restarting first is cheaper and certain");
});

test("falls back to version numbers when there is no commit to compare", () => {
  const state = buildUpdateState({
    tracked: false,
    clean: false,
    running: { version: "1.0.0", commit: null },
    disk: { version: "1.2.0", commit: null },
    behind: null,
  });
  assert.equal(state.state, UPDATE_STATE.restartRequired);
});

test("commits behind the remote offer a one-click update", () => {
  const state = buildUpdateState({
    ...clean,
    running: { version: "1.0.0", commit: "aaa" },
    disk: { version: "1.0.0", commit: "aaa" },
    behind: 2,
  });
  assert.equal(state.state, UPDATE_STATE.updateAvailable);
  assert.equal(state.canApply, true);
});

test("a folder with local changes is told, never touched", () => {
  const state = buildUpdateState({
    tracked: true,
    clean: false,
    running: { version: "1.0.0", commit: "aaa" },
    disk: { version: "1.0.0", commit: "aaa" },
    behind: 2,
  });
  assert.equal(state.state, UPDATE_STATE.updateAvailable);
  assert.equal(state.canApply, false);
});

test("no git checkout means no opinion", () => {
  const state = buildUpdateState({
    tracked: false,
    clean: false,
    running: { version: "1.0.0", commit: null },
    disk: { version: "1.0.0", commit: null },
    behind: null,
  });
  assert.equal(state.state, UPDATE_STATE.unknown);
  assert.equal(state.canApply, false);
  assert.equal(state.canRestart, false);
});

test("an unanswered remote check means no opinion either", () => {
  const state = buildUpdateState({
    ...clean,
    running: { version: "1.0.0", commit: "aaa" },
    disk: { version: "1.0.0", commit: "aaa" },
    behind: null,
  });
  assert.equal(state.state, UPDATE_STATE.unknown);
});

test("orders plain releases, and refuses to rank what it cannot read", () => {
  assert.equal(compareVersions("1.4.1", "1.4.0"), 1);
  assert.equal(compareVersions("1.4.0", "1.4.1"), -1);
  assert.equal(compareVersions("1.10.0", "1.9.0"), 1, "numeric, not lexicographic");
  assert.equal(compareVersions("2.0.0", "1.99.99"), 1);
  assert.equal(compareVersions("1.4.0", "1.4.0"), 0);
  assert.equal(compareVersions(null, "1.4.0"), null);
  assert.equal(compareVersions("1.4", "1.4.0"), null, "not three numbers");
  assert.equal(compareVersions("latest", "1.4.0"), null);
});

/*
 * The archive path has no ancestry check, so these four cases are the guard: only a
 * strictly newer published version may ever be offered to a folder without git.
 */
test("a ZIP install is offered a genuinely newer published version", () => {
  const state = buildUpdateState({
    tracked: false,
    clean: false,
    running: same,
    disk: same,
    remoteVersion: "1.5.0",
  });
  assert.equal(state.state, UPDATE_STATE.updateAvailable);
  assert.equal(state.canApply, true);
});

test("a ZIP install already on the published version is told nothing", () => {
  const state = buildUpdateState({
    tracked: false,
    clean: false,
    running: same,
    disk: same,
    remoteVersion: "1.4.0",
  });
  assert.equal(state.state, UPDATE_STATE.current);
  assert.equal(state.canApply, false);
});

test("an older published version is never offered — no downgrades", () => {
  const state = buildUpdateState({
    tracked: false,
    clean: false,
    running: same,
    disk: same,
    remoteVersion: "1.3.0",
  });
  assert.equal(state.state, UPDATE_STATE.current);
  assert.equal(state.canApply, false, "replacing files with older ones is an attack, not an update");
});

test("an unreadable published version fails closed", () => {
  const state = buildUpdateState({
    tracked: false,
    clean: false,
    running: same,
    disk: same,
    remoteVersion: "main",
  });
  assert.equal(state.state, UPDATE_STATE.unknown);
  assert.equal(state.canApply, false);
});

test("a git checkout ignores the published version entirely", () => {
  const state = buildUpdateState({
    ...clean,
    running: { version: "1.4.0", commit: "aaa" },
    disk: { version: "1.4.0", commit: "aaa" },
    behind: 0,
    remoteVersion: "9.9.9",
  });
  assert.equal(state.state, UPDATE_STATE.current, "commits are the better answer when we have them");
});
