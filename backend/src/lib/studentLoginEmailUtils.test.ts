import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  maskLoginEmail,
  normalizeLoginEmail,
} from "./studentLoginEmailUtils.js";

describe("studentLoginEmailUtils", () => {
  it("normalizes valid emails", () => {
    assert.equal(normalizeLoginEmail("  BingChen054@Gmail.com "), "bingchen054@gmail.com");
    assert.equal(normalizeLoginEmail("bad"), null);
  });

  it("masks login emails", () => {
    assert.equal(maskLoginEmail("bingchen054@gmail.com"), "b••••@gmail.com");
  });
});
