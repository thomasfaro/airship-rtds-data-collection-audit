/**
 * Turn what we know about versions into the one thing the user should be told.
 *
 * Kept pure and separate from the git calls so the decision table can be tested
 * without a repository: it is the part with actual judgement in it, and the part that
 * decides whether a banner interrupts someone mid-audit.
 */

export const UPDATE_STATE = {
  /** Nothing to say. Up to date, or no way to know. */
  current: "current",
  /** New code is already on disk; this process is still running the old one. */
  restartRequired: "restart-required",
  /** The remote has commits we don't. */
  updateAvailable: "update-available",
  /** Not a git checkout, or git/network unavailable: stay quiet. */
  unknown: "unknown",
};

function differs(running, disk) {
  // Commits are the precise answer. Version numbers are the fallback for a folder
  // that was replaced wholesale (a ZIP install), where there is no commit to compare.
  if (running?.commit && disk?.commit) {
    return running.commit !== disk.commit;
  }
  if (running?.version && disk?.version) {
    return running.version !== disk.version;
  }
  return false;
}

function releaseNumbers(version) {
  // Only the numeric release part is ordered. A pre-release suffix is deliberately
  // ignored rather than ranked: this compares our own published versions, which never
  // carry one, and inventing an order for something unexpected is how a guard leaks.
  const core = String(version ?? "")
    .trim()
    .split(/[-+]/)[0];
  const parts = core.split(".");
  if (parts.length !== 3) {
    return null;
  }
  const numbers = parts.map((part) => Number.parseInt(part, 10));
  return numbers.every((n) => Number.isInteger(n) && n >= 0) ? numbers : null;
}

/**
 * Order two `x.y.z` strings: 1 when `a` is newer, -1 when older, 0 when equal.
 * Returns null when either side is not a plain three-number version — the caller
 * must then do nothing, because "I cannot read this" has to fail closed.
 */
export function compareVersions(a, b) {
  const left = releaseNumbers(a);
  const right = releaseNumbers(b);
  if (!left || !right) {
    return null;
  }
  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) {
      return left[i] > right[i] ? 1 : -1;
    }
  }
  return 0;
}

/**
 * @param {object} input
 * @param {{version: string|null, commit: string|null}} input.running version this process loaded
 * @param {{version: string|null, commit: string|null}} input.disk version sitting in the folder
 * @param {boolean} input.tracked git checkout we could update from
 * @param {boolean} input.clean working tree has no local changes
 * @param {number|null} input.behind commits behind the remote branch, null when unknown
 * @param {string|null} input.remoteVersion version published upstream, for a folder
 *   with no git to compare commits with. Only consulted when `tracked` is false.
 */
export function buildUpdateState({
  running = null,
  disk = null,
  tracked = false,
  clean = false,
  behind = null,
  remoteVersion = null,
} = {}) {
  // A restart wins over everything else: the update is already downloaded, so the
  // only thing left to do is the cheapest and most certain action available.
  if (differs(running, disk)) {
    return {
      state: UPDATE_STATE.restartRequired,
      canRestart: true,
      canApply: false,
    };
  }

  if (tracked) {
    if (typeof behind === "number" && behind > 0) {
      return {
        state: UPDATE_STATE.updateAvailable,
        canRestart: false,
        // A dirty folder is somebody's work in progress. Offer nothing, explain instead.
        canApply: clean,
      };
    }
    if (behind === null) {
      return { state: UPDATE_STATE.unknown, canRestart: false, canApply: false };
    }
    return { state: UPDATE_STATE.current, canRestart: false, canApply: false };
  }

  /*
   * No git folder: the only comparison left is the published version number against
   * ours. Replacing files from an archive has none of the ancestry guarantees a
   * fast-forward gives, so this path only ever moves *forward* — an upstream version
   * that is older than, equal to, or unreadable next to ours is answered with silence.
   * That is the anti-downgrade guard, and it belongs here rather than at the download,
   * because refusing is a decision and decisions are what this module is tested on.
   */
  const ordering = compareVersions(remoteVersion, disk?.version);
  if (ordering === 1) {
    return { state: UPDATE_STATE.updateAvailable, canRestart: false, canApply: true };
  }
  if (ordering === null) {
    return { state: UPDATE_STATE.unknown, canRestart: false, canApply: false };
  }
  return { state: UPDATE_STATE.current, canRestart: false, canApply: false };
}
