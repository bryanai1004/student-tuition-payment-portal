import { describe, expect, it } from "vitest";
import { messageForPortalWithdrawalPrecheck } from "./portalWithdrawalEligibilityService.js";

describe("messageForPortalWithdrawalPrecheck", () => {
  it("returns empty string when withdrawal is allowed", () => {
    expect(messageForPortalWithdrawalPrecheck("allowed")).toBe("");
  });

  it("explains past withdraw deadline", () => {
    expect(messageForPortalWithdrawalPrecheck("deadline_passed")).toBe(
      "The withdraw deadline for this term has passed.",
    );
  });

  it("blocks completed courses", () => {
    expect(messageForPortalWithdrawalPrecheck("completed")).toBe(
      "This course is completed; withdrawal is not available.",
    );
  });

  it("blocks already withdrawn enrollments", () => {
    expect(messageForPortalWithdrawalPrecheck("already_withdrawn")).toBe(
      "This enrollment is already withdrawn.",
    );
  });

  it("blocks non-active enrollment status", () => {
    expect(messageForPortalWithdrawalPrecheck("not_withdrawable_status")).toBe(
      "This enrollment cannot be withdrawn (status is not active).",
    );
  });
});
