import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { csvCell, toCsv } from "./csv";

describe("csv", () => {
  it("leaves plain values untouched", () => {
    assert.equal(csvCell("Luna"), "Luna");
  });

  it("quotes values with commas, quotes and line breaks", () => {
    assert.equal(csvCell("Ana, Luis"), '"Ana, Luis"');
    assert.equal(csvCell('Dijo "hola"'), '"Dijo ""hola"""');
    assert.equal(csvCell("a\nb"), '"a\nb"');
  });

  it("neutralises spreadsheet formulas", () => {
    assert.equal(csvCell("=1+1"), "'=1+1");
    assert.equal(csvCell("@cmd"), "'@cmd");
    assert.equal(csvCell("+57 300"), "'+57 300");
  });

  it("builds a UTF-8 CSV with BOM, header and CRLF rows", () => {
    const csv = toCsv(["mascota", "motivo"], [["Peña", "Control, general"]]);
    assert.equal(csv, "\uFEFFmascota,motivo\r\nPeña,\"Control, general\"\r\n");
  });
});
