import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  getInstallPrompt,
  resetInstallPrompt,
  runInstallPrompt,
  subscribeInstallPrompt,
  watchInstallPrompt,
} from "./installPrompt.js";

function installableEvent(outcome = "accepted") {
  const event = new Event("beforeinstallprompt");
  event.prompted = false;
  event.prompt = () => {
    event.prompted = true;
  };
  event.userChoice = Promise.resolve({ outcome });
  return event;
}

afterEach(() => {
  resetInstallPrompt();
});

describe("installPrompt", () => {
  it("offers nothing until the browser says the app qualifies", () => {
    const target = new EventTarget();
    watchInstallPrompt(target);
    assert.equal(getInstallPrompt(), null);
  });

  it("captures the event the browser fires and notifies subscribers", () => {
    const target = new EventTarget();
    watchInstallPrompt(target);

    let notified = 0;
    subscribeInstallPrompt(() => {
      notified += 1;
    });

    const event = installableEvent();
    target.dispatchEvent(event);

    assert.equal(getInstallPrompt(), event);
    assert.equal(notified, 1);
  });

  it("shows the dialog once and withdraws the offer whatever the answer", async () => {
    const target = new EventTarget();
    watchInstallPrompt(target);
    const event = installableEvent("dismissed");
    target.dispatchEvent(event);

    const outcome = await runInstallPrompt();

    assert.equal(outcome, "dismissed");
    assert.equal(event.prompted, true);
    assert.equal(getInstallPrompt(), null);
    assert.equal(await runInstallPrompt(), "unavailable");
  });

  it("withdraws the offer once the app is installed", () => {
    const target = new EventTarget();
    watchInstallPrompt(target);
    target.dispatchEvent(installableEvent());
    assert.notEqual(getInstallPrompt(), null);

    target.dispatchEvent(new Event("appinstalled"));

    assert.equal(getInstallPrompt(), null);
  });

  it("stops notifying once unsubscribed", () => {
    const target = new EventTarget();
    watchInstallPrompt(target);

    let notified = 0;
    const unsubscribe = subscribeInstallPrompt(() => {
      notified += 1;
    });
    unsubscribe();

    target.dispatchEvent(installableEvent());

    assert.equal(notified, 0);
  });
});
