import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ownerKeys } from "./owner-keys";

describe("ownerKeys", () => {
  it("ignores case, extra spaces and phone formatting", () => {
    assert.deepEqual(ownerKeys("  Ana   PÉREZ ", "300 123-4567"), ownerKeys("ana pérez", "3001234567"));
  });

  it("tells different people apart", () => {
    assert.notDeepEqual(ownerKeys("Ana Pérez", "3001234567"), ownerKeys("Ana Pérez", "3009999999"));
    assert.notDeepEqual(ownerKeys("Ana Pérez", "3001234567"), ownerKeys("Luis Pérez", "3001234567"));
  });

  it("falls back to the trimmed text when the phone has no digits", () => {
    assert.equal(ownerKeys("Ana", " N/A ").phoneKey, "n/a");
  });
});
