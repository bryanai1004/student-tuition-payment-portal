import { describe, expect, it } from "vitest";
import {
  catalogCategoryIdToBucketHint,
  catalogDegreeRequirementTotals,
  resolveDegreeProgressBucket,
} from "./degreeProgressBucket.js";

describe("catalogCategoryIdToBucketHint", () => {
  it("detects elective tokens", () => {
    expect(catalogCategoryIdToBucketHint("ELECTIVE_POOL").elective).toBe(true);
    expect(catalogCategoryIdToBucketHint("el_gen").elective).toBe(true);
  });
  it("detects clinical tokens", () => {
    expect(catalogCategoryIdToBucketHint("clinical_rotation").clinical).toBe(true);
  });
});

describe("resolveDegreeProgressBucket", () => {
  it("maps MAHM clinical catalog codes to clinical", () => {
    expect(resolveDegreeProgressBucket("CLN301", "Clinical Internship Level 1", null)).toBe(
      "clinical",
    );
  });
  it("maps MAHM didactic codes to core when category empty", () => {
    expect(resolveDegreeProgressBucket("TCM101", "Foundations", null)).toBe("core");
  });
  it("lets catalog category override to elective", () => {
    expect(resolveDegreeProgressBucket("EL999", "Topics", "elective_open")).toBe("elective");
  });
});

describe("catalogDegreeRequirementTotals", () => {
  it("sums MAHM core units and clinical hours", () => {
    const t = catalogDegreeRequirementTotals(0);
    expect(t.coreQuarterUnits).toBeGreaterThan(0);
    expect(t.electiveQuarterUnits).toBe(0);
    expect(t.clinicalHoursRequired).toBeGreaterThan(0);
  });
  it("adds configured elective floor", () => {
    const t = catalogDegreeRequirementTotals(6);
    expect(t.electiveQuarterUnits).toBe(6);
  });
});
