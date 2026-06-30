import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { MarksRow } from "../repositories/studentAcademicsRepository.js";
import {
  isPortalEnrollmentStatusActive,
  resolveActiveEnrollmentTerm,
} from "./studentAcademicCourseRecords.js";

function mark(partial: Partial<MarksRow> & Pick<MarksRow, "term" | "year">): MarksRow {
  return {
    name: "Test Student",
    course_code: "BS101",
    course_title: "Test Course",
    grade: "A",
    grade2: "4.0",
    units: 3,
    ...partial,
  } as MarksRow;
}

describe("isPortalEnrollmentStatusActive", () => {
  it("treats non-terminal statuses as active", () => {
    assert.equal(isPortalEnrollmentStatusActive(null), true);
    assert.equal(isPortalEnrollmentStatusActive(""), true);
    assert.equal(isPortalEnrollmentStatusActive("active"), true);
    assert.equal(isPortalEnrollmentStatusActive(" enrolled "), true);
    assert.equal(isPortalEnrollmentStatusActive("REGISTERED"), true);
    assert.equal(isPortalEnrollmentStatusActive("unknown"), true);
  });

  it("treats withdrawn, completed, and dropped as inactive", () => {
    assert.equal(isPortalEnrollmentStatusActive("withdrawn"), false);
    assert.equal(isPortalEnrollmentStatusActive("completed"), false);
    assert.equal(isPortalEnrollmentStatusActive("dropped"), false);
  });
});

describe("resolveActiveEnrollmentTerm", () => {
  const anchor = { term: "Spring", year: 2027 };

  it("returns anchor when marks for the term are still open", () => {
    const result = resolveActiveEnrollmentTerm(
      anchor,
      [mark({ term: "Spring", year: 2027, grade: "IP", grade2: null })],
      [],
    );
    assert.deepEqual(result, anchor);
  });

  it("returns anchor when marks are all closed but portal enrollments remain", () => {
    const result = resolveActiveEnrollmentTerm(
      anchor,
      [mark({ term: "Spring", year: 2027, grade: "A", grade2: "4.0" })],
      [{ term: "Spring", year: 2027, status: "unknown" }],
    );
    assert.deepEqual(result, anchor);
  });

  it("returns null when marks are closed and portal has no active rows", () => {
    const result = resolveActiveEnrollmentTerm(
      anchor,
      [mark({ term: "Spring", year: 2027, grade: "A", grade2: "4.0" })],
      [{ term: "Spring", year: 2027, status: "withdrawn" }],
    );
    assert.equal(result, null);
  });

  it("returns anchor when there are no marks rows yet for the term", () => {
    const result = resolveActiveEnrollmentTerm(anchor, [], [
      { term: "Spring", year: 2027, status: "active" },
    ]);
    assert.deepEqual(result, anchor);
  });
});
