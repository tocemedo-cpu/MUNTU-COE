import { describe, expect, it } from "vitest";
import { contentDispositionHeader, MAX_UPLOAD_BYTES, validateUploadedFile } from "@/lib/uploads";

describe("validateUploadedFile", () => {
  it("accepts a normal file", () => {
    expect(validateUploadedFile({ name: "Contrato.pdf", size: 1024 })).toEqual({ ok: true });
  });

  it("rejects null (no file sent)", () => {
    const result = validateUploadedFile(null);
    expect(result.ok).toBe(false);
  });

  it("rejects an empty filename", () => {
    const result = validateUploadedFile({ name: "  ", size: 1024 });
    expect(result.ok).toBe(false);
  });

  it("rejects a zero-byte file", () => {
    const result = validateUploadedFile({ name: "vazio.txt", size: 0 });
    expect(result.ok).toBe(false);
  });

  it("rejects a file over the size cap", () => {
    const result = validateUploadedFile({ name: "grande.zip", size: MAX_UPLOAD_BYTES + 1 });
    expect(result.ok).toBe(false);
  });

  it("accepts a file exactly at the size cap", () => {
    expect(validateUploadedFile({ name: "limite.zip", size: MAX_UPLOAD_BYTES })).toEqual({ ok: true });
  });
});

describe("contentDispositionHeader", () => {
  it("keeps a plain ASCII filename intact", () => {
    const header = contentDispositionHeader("Contrato_MRO_2026.pdf");
    expect(header).toContain('filename="Contrato_MRO_2026.pdf"');
    expect(header).toContain("filename*=UTF-8''Contrato_MRO_2026.pdf");
  });

  it("substitutes accented characters in the ASCII fallback but preserves them in filename*", () => {
    const header = contentDispositionHeader("Recepção_Serviço.pdf");
    const asciiFallback = header.match(/filename="([^"]*)"/)?.[1];
    expect(asciiFallback).toBeTruthy();
    expect(/^[\x20-\x7E]*$/.test(asciiFallback!)).toBe(true);
    expect(header).toContain(`filename*=UTF-8''${encodeURIComponent("Recepção_Serviço.pdf")}`);
  });

  it("never lets a filename break out of the quoted attribute", () => {
    const header = contentDispositionHeader('evil".pdf');
    expect(header).not.toContain('filename="evil".pdf"');
  });
});
