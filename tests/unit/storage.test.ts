import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

async function freshStorageModule() {
  vi.resetModules();
  return import("@/lib/storage");
}

describe("lib/storage", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
  });

  it("isStorageConfigured is false without both env vars, true with both", async () => {
    const { isStorageConfigured: withNone } = await freshStorageModule();
    expect(withNone()).toBe(false);

    process.env.SUPABASE_URL = "https://project.supabase.co";
    const { isStorageConfigured: withUrlOnly } = await freshStorageModule();
    expect(withUrlOnly()).toBe(false);

    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    const { isStorageConfigured: withBoth } = await freshStorageModule();
    expect(withBoth()).toBe(true);
  });

  it("storagePathFor builds a unique, sanitized path", async () => {
    const { storagePathFor } = await freshStorageModule();
    const path = storagePathFor(42, "fatura fornecedor (2026).pdf");
    expect(path).toMatch(/^42-[0-9a-f-]{36}-fatura_fornecedor__2026_\.pdf$/);
    // Duas chamadas com o mesmo input nunca colidem — cada uma sorteia o seu próprio uuid.
    expect(storagePathFor(42, "a.pdf")).not.toBe(storagePathFor(42, "a.pdf"));
  });

  it("readDocumentBytes returns content when storagePath is absent", async () => {
    const { readDocumentBytes } = await freshStorageModule();
    const bytes = await readDocumentBytes({ content: Buffer.from("hello"), storagePath: null });
    expect(bytes.toString("utf-8")).toBe("hello");
  });

  it("readDocumentBytes fetches from the bucket when storagePath is present", async () => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    const { readDocumentBytes } = await freshStorageModule();

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(new TextEncoder().encode("from bucket"), { status: 200 })
    );

    const bytes = await readDocumentBytes({ content: null, storagePath: "42-abc-file.pdf" });
    expect(bytes.toString("utf-8")).toBe("from bucket");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain("/storage/v1/object/documents/42-abc-file.pdf");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer service-role-key");
  });

  it("readDocumentBytes throws when neither content nor storagePath is set", async () => {
    const { readDocumentBytes } = await freshStorageModule();
    await expect(readDocumentBytes({ content: null, storagePath: null })).rejects.toThrow();
  });

  it("uploadToStorage throws a clear error when Storage isn't configured", async () => {
    const { uploadToStorage } = await freshStorageModule();
    await expect(uploadToStorage("path", Buffer.from("x"))).rejects.toThrow(/não está configurado/);
  });

  it("uploadToStorage POSTs the bytes with the service role key", async () => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    const { uploadToStorage } = await freshStorageModule();

    const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(new Response(null, { status: 200 }));
    await uploadToStorage("42-abc-file.pdf", Buffer.from("bytes"), "application/pdf");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain("/storage/v1/object/documents/42-abc-file.pdf");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>)["Content-Type"]).toBe("application/pdf");
  });

  it("uploadToStorage throws with the response body on a non-ok response", async () => {
    process.env.SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    const { uploadToStorage } = await freshStorageModule();

    vi.spyOn(global, "fetch").mockResolvedValue(new Response("bucket not found", { status: 404 }));
    await expect(uploadToStorage("path", Buffer.from("x"))).rejects.toThrow(/404/);
  });
});
