import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { STATIC_PLACEHOLDER_EQUIVALENCY_PAIRS } from "../data/courseCodePlaceholderEquivalencies.js";
import type { CourseRecord } from "../types/studentAccount.js";
import {
  buildCourseEquivalencyIndexFromPairs,
  collapseCatalogToCanonicalMap,
  normalizeCourseCode,
} from "./courseEquivalencyService.js";
import { legacyCompletedBlocksPortalRow } from "./studentAcademicCourseRecords.js";

describe("courseEquivalencyService", () => {
  it("normalizes spaces and hyphens", () => {
    assert.equal(normalizeCourseCode(" bs-110 "), "BS110");
  });

  it("treats legacy and PDF codes as equivalent", () => {
    const index = buildCourseEquivalencyIndexFromPairs([["BS110", "BS101"]]);
    assert.equal(index.resolveCanonical("BS101"), "BS110");
    assert.equal(index.resolveCanonical("BS110"), "BS110");
    assert.ok(index.areEquivalent("BS101", "BS110"));
    assert.ok(index.satisfiesRequirement("BS101", "BS110"));
  });

  it("transitively collapses chained equivalencies", () => {
    const index = buildCourseEquivalencyIndexFromPairs([
      ["WM310", "WM300"],
      ["WM300", "WM301"],
    ]);
    assert.ok(index.areEquivalent("WM301", "WM310"));
    assert.equal(index.resolveCanonical("WM301"), "WM300");
  });

  it("maps static placeholder codes to PDF canonical codes", () => {
    const index = buildCourseEquivalencyIndexFromPairs([...STATIC_PLACEHOLDER_EQUIVALENCY_PAIRS]);
    assert.ok(index.areEquivalent("TCM101", "OM111"));
    assert.ok(index.satisfiesRequirement("OM111", "TCM101"));
  });

  it("collapses duplicate catalog rows to one canonical entry", () => {
    const index = buildCourseEquivalencyIndexFromPairs([["BS110", "BS101"]]);
    const raw = new Map<string, CourseRecord>([
      [
        "BS101",
        {
          courseId: "c1",
          courseCode: "BS101",
          title: "Legacy",
          type: "didactic",
          units: 2,
        },
      ],
      [
        "BS110",
        {
          courseId: "c2",
          courseCode: "BS110",
          title: "PDF",
          type: "didactic",
          units: 3,
        },
      ],
    ]);
    const collapsed = collapseCatalogToCanonicalMap(raw, index);
    assert.equal(collapsed.size, 1);
    assert.equal(collapsed.get("BS110")?.courseCode, "BS110");
    assert.equal(collapsed.get("BS110")?.units, 3);
  });
});

describe("legacyCompletedBlocksPortalRow equivalency", () => {
  it("blocks portal row when legacy completed an equivalent code same term", () => {
    const index = buildCourseEquivalencyIndexFromPairs([["BS110", "BS101"]]);
    const legacy = [
      {
        courseCode: "BS101",
        term: "Spring",
        year: 2026,
        status: "completed" as const,
        source: "marks" as const,
        studentId: "S1",
        courseTitle: "Test",
        grade: "A",
        credits: 3,
        numericGrade: 4,
        days: null,
        timeFrom: null,
        timeTo: null,
        sectionCode: null,
        scheduleTrack: null,
        portalEnrollmentRowId: null,
      },
    ];
    assert.equal(
      legacyCompletedBlocksPortalRow(legacy, "BS110", "Spring", 2026, index),
      true,
    );
    assert.equal(
      legacyCompletedBlocksPortalRow(legacy, "BS110", "Fall", 2026, index),
      false,
    );
  });
});
