import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, jsonRequest, sessionHeaders } from "./helpers";
import { seedIfEmpty } from "@/db/seed-data";
import { documentFiles } from "@/db/schema";

// Ao contrário de documents-upload.test.ts (caminho bytea, sem Storage
// configurado), este ficheiro testa o caminho do Supabase Storage — por
// isso importa as rotas dinamicamente DEPOIS de definir
// SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY: lib/storage.ts lê essas
// variáveis no topo do módulo, e um import estático no topo do ficheiro
// corre antes de qualquer código dentro de beforeEach/it.
const ORIGINAL_ENV = { ...process.env };

function requestWithForm(url: string, form: FormData, session: Parameters<typeof sessionHeaders>[0]) {
  const headers = sessionHeaders(session) as Record<string, string>;
  delete headers["content-type"];
  return new Request(url, { method: "POST", headers, body: form });
}

async function loadStorageBackedRoutes() {
  process.env.SUPABASE_URL = "https://project.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  vi.resetModules();
  const uploadModule = await import("@/app/api/documents/route");
  const downloadModule = await import("@/app/api/documents/[id]/download/route");
  return { uploadDocument: uploadModule.POST, downloadDocument: downloadModule.GET };
}

describe("Document upload/download via Supabase Storage (mocked fetch)", () => {
  beforeEach(async () => {
    await seedIfEmpty(getDb());
  });
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("uploads to the bucket (not bytea) and downloads the bytes back from it", async () => {
    const { uploadDocument, downloadDocument } = await loadStorageBackedRoutes();

    const content = "Conteúdo carregado directamente para o bucket do Supabase Storage.";
    const uploadedBytesByPath = new Map<string, Uint8Array>();

    const fetchSpy = vi.spyOn(global, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (init?.method === "POST") {
        const path = decodeURIComponent(url.split("/storage/v1/object/documents/")[1]);
        uploadedBytesByPath.set(path, new Uint8Array(init.body as ArrayBuffer as unknown as ArrayBuffer));
        return new Response(null, { status: 200 });
      }
      const path = decodeURIComponent(url.split("/storage/v1/object/documents/")[1]);
      const bytes = uploadedBytesByPath.get(path);
      if (!bytes) return new Response("not found", { status: 404 });
      return new Response(bytes as BodyInit, { status: 200 });
    });

    const file = new File([content], "Bucket_Real.txt", { type: "text/plain" });
    const form = new FormData();
    form.append("file", file);
    form.append("type", "Compliance");
    form.append("request", "REQ-TEST-STORAGE");

    const uploadResponse = await uploadDocument(
      requestWithForm("http://localhost/api/documents", form, { userId: 1, accessLevel: "system_admin" })
    );
    expect(uploadResponse.status).toBe(201);
    const uploadBody = await uploadResponse.json();

    // A rota chamou mesmo o Storage (POST), não escreveu bytea directamente.
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const db = getDb();
    const [fileRow] = await db.select().from(documentFiles).where(eq(documentFiles.documentId, uploadBody.document.id));
    expect(fileRow.storagePath).not.toBeNull();
    expect(fileRow.content).toBeNull();

    const downloadResponse = await downloadDocument(
      jsonRequest(`http://localhost/api/documents/${uploadBody.document.id}/download`, { method: "GET", session: { userId: 1, accessLevel: "system_admin" } }),
      { params: Promise.resolve({ id: String(uploadBody.document.id) }) }
    );
    expect(downloadResponse.status).toBe(200);
    const downloadedText = await downloadResponse.text();
    expect(downloadedText).toBe(content);

    // Uma chamada para o upload, outra para o download.
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("returns a 500 (and leaves no document row behind) when the bucket upload fails", async () => {
    const { uploadDocument } = await loadStorageBackedRoutes();
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("bucket unreachable", { status: 500 }));

    const file = new File(["x"], "Falha.txt", { type: "text/plain" });
    const form = new FormData();
    form.append("file", file);

    const db = getDb();
    const before = await db.select().from(documentFiles);

    await expect(
      uploadDocument(requestWithForm("http://localhost/api/documents", form, { userId: 1, accessLevel: "system_admin" }))
    ).rejects.toThrow();

    // A transacção reverte o insert de documents também — nenhuma linha órfã.
    const after = await db.select().from(documentFiles);
    expect(after.length).toBe(before.length);
  });
});
