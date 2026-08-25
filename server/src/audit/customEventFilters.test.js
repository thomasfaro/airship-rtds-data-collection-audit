import assert from "node:assert/strict";
import test from "node:test";
import { isMessagingInteractionCustomEvent } from "./customEventFilters.js";

test("isMessagingInteractionCustomEvent matches ua_button_tap and button_click prefixes", () => {
  assert.equal(isMessagingInteractionCustomEvent("ua_button_tap"), true);
  assert.equal(isMessagingInteractionCustomEvent("ua_button_tap_home"), true);
  assert.equal(isMessagingInteractionCustomEvent("button_click"), true);
  assert.equal(isMessagingInteractionCustomEvent("button_click_cta"), true);
  assert.equal(isMessagingInteractionCustomEvent("purchase"), false);
  assert.equal(isMessagingInteractionCustomEvent("screen_view"), false);
});
