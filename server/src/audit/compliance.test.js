import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildComplianceReport,
  createComplianceAccumulator,
  normalizeComplianceEventType,
  processComplianceEvent,
} from "./compliance.js";
import { createEventSampleCollector } from "./eventSamples.js";

describe("compliance audit", () => {
  it("normalizes event_type from body", () => {
    assert.equal(normalizeComplianceEventType({ event_type: "registration" }), "registration");
    assert.equal(normalizeComplianceEventType({}), "(unknown)");
  });

  it("aggregates by event_type and device_type", () => {
    const acc = { compliance: createComplianceAccumulator() };
    const samples = createEventSampleCollector();

    processComplianceEvent(
      acc,
      {
        type: "COMPLIANCE",
        device: { device_type: "EMAIL" },
        body: { event_type: "registration" },
      },
      "EMAIL",
      { event_type: "registration" },
      samples,
    );
    processComplianceEvent(
      acc,
      {
        type: "COMPLIANCE",
        device: { device_type: "SMS" },
        body: { event_type: "mobile_opt_in" },
      },
      "SMS",
      { event_type: "mobile_opt_in" },
      samples,
    );

    const report = buildComplianceReport(acc.compliance);
    assert.equal(report.total, 2);
    assert.equal(report.byEventType.length, 2);
    assert.equal(report.byDeviceType.length, 2);
    assert.equal(report.byDeviceType[0].deviceType, "EMAIL");
  });

  it("aggregates email opt-out volumes by registration_type and message_type", () => {
    const acc = { compliance: createComplianceAccumulator() };
    const samples = createEventSampleCollector();

    const emailRegistration = (registrationType, messageType) => {
      const body = {
        event_type: "registration",
        properties: { registration_type: registrationType, message_type: messageType },
      };
      processComplianceEvent(
        acc,
        { type: "COMPLIANCE", device: { device_type: "EMAIL" }, body },
        "EMAIL",
        body,
        samples,
      );
    };

    emailRegistration("open_tracking_opt_out", "transactional");
    emailRegistration("open_tracking_opt_out", "commercial");
    emailRegistration("unsubscribe", "commercial");
    emailRegistration("opt_in", "commercial");

    const report = buildComplianceReport(acc.compliance);
    const optOut = report.emailOptOut;

    assert.equal(optOut.total, 4);
    // open_tracking_opt_out (2) + unsubscribe (1) count as opt-outs; opt_in does not.
    assert.equal(optOut.optOutTotal, 3);

    const openTracking = optOut.byRegistrationType.find(
      (row) => row.registrationType === "open_tracking_opt_out",
    );
    assert.equal(openTracking.count, 2);
    assert.equal(openTracking.isOptOut, true);

    const optIn = optOut.byRegistrationType.find((row) => row.registrationType === "opt_in");
    assert.equal(optIn.isOptOut, false);

    const commercial = optOut.byMessageType.find((row) => row.messageType === "commercial");
    assert.equal(commercial.count, 3);
    assert.ok(optOut.matrix.length > 0);
  });

  it("returns an empty email opt-out report when no compliance events", () => {
    const report = buildComplianceReport(createComplianceAccumulator());
    assert.equal(report.total, 0);
    assert.equal(report.emailOptOut.total, 0);
    assert.equal(report.emailOptOut.optOutTotal, 0);
    assert.deepEqual(report.emailOptOut.byRegistrationType, []);
  });
});
