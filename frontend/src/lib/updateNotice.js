/**
 * What, if anything, to tell the user about versions.
 *
 * Pure so the wording and the silence are both testable. Silence is the default and
 * the most common answer: a banner over an audit has to earn its place, so it only
 * appears when there is something to click.
 */

/**
 * @param {object|null} status payload from GET /api/updates
 * @returns {{action: "restart"|"apply"|null, actionLabel: string|null, title: string,
 *   detail: string}|null} null when there is nothing worth saying
 */
export function updateNotice(status) {
  if (!status) {
    return null;
  }

  if (status.state === "restart-required") {
    const from = status.running?.version ?? null;
    const to = status.disk?.version ?? null;
    const detail =
      from && to && from !== to
        ? `Version ${to} is installed. This window is still running ${from}.`
        : "A newer version is installed in this folder.";
    return {
      action: "restart",
      actionLabel: "Restart now",
      title: "An update is ready",
      detail: `${detail} Restarting takes a few seconds.`,
    };
  }

  if (status.state === "update-available") {
    const count = typeof status.behind === "number" ? status.behind : null;
    const changes = count ? `${count} update${count === 1 ? "" : "s"} behind. ` : "";
    if (!status.canApply) {
      return {
        action: null,
        actionLabel: null,
        title: "A new version is available",
        detail: `${changes}This folder has local changes, so it will not update itself.`,
      };
    }
    return {
      action: "apply",
      actionLabel: "Update and restart",
      title: "A new version is available",
      detail: `${changes}Updating downloads the new version and restarts the app.`,
    };
  }

  return null;
}
