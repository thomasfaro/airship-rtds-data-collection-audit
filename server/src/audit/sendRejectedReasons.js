/** QA hints for SEND_REJECTED body.status / reason (APNs, FCM, etc.). */

const GUIDES = [
  {
    match: ["unregistered"],
    critical: true,
    summary:
      "The push platform reports this device token is no longer active for the app (APNs 410 Unregistered).",
    likelyCauses: [
      "The user uninstalled the app or turned off notifications.",
      "The token on the Airship channel is stale after reinstall or token rotation.",
      "Apple may stop accepting tokens on devices that have not opened the app for a long time.",
    ],
  },
  {
    match: ["devicetokennotfortopic"],
    critical: true,
    summary:
      "The device token does not match the APNs topic (bundle ID + environment) used to send the push.",
    likelyCauses: [
      "Development vs production mismatch: sandbox token sent through production APNs (or the reverse).",
      "Wrong Airship app key / project environment for the build type (debug vs App Store).",
      "Bundle ID in the app build does not match the APNs key or certificate configured in Airship.",
      "Provisioning profile or .p8 key not aligned with the app’s bundle identifier.",
    ],
  },
  {
    match: ["baddevicetoken"],
    critical: true,
    summary: "APNs considers the device token invalid or malformed (HTTP 400 BadDeviceToken).",
    likelyCauses: [
      "Corrupted or truncated token stored on the channel.",
      "Token copied from the wrong environment or platform.",
      "Channel created before a valid push registration completed in the app.",
    ],
  },
  {
    match: ["expiredtoken"],
    critical: true,
    summary: "APNs reports the device token has expired (HTTP 410 ExpiredToken).",
    likelyCauses: [
      "Token lifetime ended; the app must register again with APNs.",
      "Similar to Unregistered — treat the channel as invalid until a fresh token is observed.",
    ],
  },
  {
    match: ["payloadtoolarge"],
    summary: "The notification payload exceeded the platform size limit (APNs 413).",
    likelyCauses: [
      "Rich push payload, large media URL, or too much custom data in the push body.",
      "Reduce payload size or use notification service extension / Message Center for heavy content.",
    ],
  },
  {
    match: ["toomanyrequests"],
    summary: "APNs rate-limited the send (HTTP 429 TooManyRequests).",
    likelyCauses: [
      "Burst of pushes to the same device or topic in a short window.",
      "Retry with backoff; avoid immediate mass retries on the same token.",
    ],
  },
  {
    match: ["forbidden"],
    summary: "APNs rejected the request due to credentials or authorization (HTTP 403).",
    likelyCauses: [
      "Invalid, revoked, or expired APNs auth key (.p8) or certificate in Airship.",
      "Key does not have permission for the bundle ID / topic being targeted.",
    ],
  },
  {
    match: ["missingdevicetoken"],
    summary: "The push request did not include a device token (APNs 400).",
    likelyCauses: [
      "Upstream pipeline sent a push without a resolvable channel token.",
      "Channel record exists but push address is empty — integration or audience issue.",
    ],
  },
];

const FALLBACK = {
  critical: false,
  summary:
    "Airship could not deliver the push to the third-party platform (see RTDS SEND_REJECTED status field).",
  likelyCauses: [
    "Compare the status string with Apple APNs or Google FCM documentation for your device types.",
    "Verify channel token, opt-in status, and Airship project environment (development vs production).",
    "Check push credentials (APNs .p8 / FCM service account) and bundle ID or package name alignment.",
  ],
};

export function normalizeSendRejectedReasonKey(reason) {
  return String(reason ?? "")
    .toLowerCase()
    .replace(/[\s_.-]+/g, "");
}

export function getSendRejectedReasonGuide(reason) {
  const key = normalizeSendRejectedReasonKey(reason);
  if (!key || key === "unknown") return { ...FALLBACK };

  for (const entry of GUIDES) {
    if (entry.match.some((needle) => key.includes(normalizeSendRejectedReasonKey(needle)))) {
      return {
        critical: Boolean(entry.critical),
        summary: entry.summary,
        likelyCauses: entry.likelyCauses,
      };
    }
  }
  return { ...FALLBACK };
}

export function enrichSendRejectedReasonRow(row) {
  const guide = getSendRejectedReasonGuide(row.reason);
  return {
    ...row,
    guide,
    critical: guide.critical,
  };
}

export function isCriticalSendRejectedReason(reason) {
  return getSendRejectedReasonGuide(reason).critical;
}
