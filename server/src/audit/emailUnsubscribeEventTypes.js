/**
 * Airship email unsubscribe_event_type values on CUSTOM unsubscribe events.
 * @see https://www.airship.com/docs/guides/messaging/messages/content/email/email/
 */
export const EMAIL_UNSUBSCRIBE_EVENT_TYPES = {
  list_unsubscribe: {
    description:
      "User selected the unsubscribe button in their email client, generated from the List-Unsubscribe email header.",
  },
  link_unsubscribe: {
    description:
      "User clicked an unsubscribe link in the message body (data-ua-unsubscribe) or the Unsubscribe from all button in the Email Preference Center. Body links include triggering_push on the CUSTOM event.",
  },
  global_unsubscribe: {
    description:
      "Channel-wide unsubscribe from email messaging (full opt-out rather than a subscription-list change).",
  },
  spam_complaint: {
    description:
      "Subscription status changed because the recipient reported the message as spam (often seen on related SUBSCRIPTION events).",
  },
  bounce: {
    description:
      "Subscription status changed as a result of a bounce event (often seen on related SUBSCRIPTION events).",
  },
  out_of_band: {
    description:
      "A bounce occurred after the recipient mail server initially accepted the message.",
  },
};

export function getUnsubscribeEventTypeDetail(typeKey) {
  if (typeKey == null || typeKey === "" || typeKey === "(missing)") return null;
  const norm = String(typeKey).trim().toLowerCase();
  const meta = EMAIL_UNSUBSCRIBE_EVENT_TYPES[norm];
  if (meta?.description) return meta.description;
  return `Unsubscribe source type "${typeKey}" — see Airship email unsubscribe documentation for CUSTOM events.`;
}
