import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { getDb, jsonRequest, sessionHeaders } from "./helpers";
import { seedIfEmpty } from "@/db/seed-data";
import { documentFiles } from "@/db/schema";
import { GET as listDocuments, POST as uploadDocument } from "@/app/api/documents/route";
import { GET as downloadDocument } from "@/app/api/documents/[id]/download/route";

function requestWithForm(url: string, form: FormData, session: Parameters<typeof sessionHeaders>[0]) {
  const headers = sessionHeaders(session) as Record<string, string>;
  delete headers["content-type"]; // let the runtime set the multipart boundary itself
  return new Request(url, { method: "POST", headers, body: form });
}

describe("Real document upload/download (bytea round trip)", () => {
  beforeAll(async () => {
    await seedIfEmpty(getDb());
  });

  it("uploads a file, stores its actual bytes, and serves them back byte-for-byte on download", async () => {
    const content = "Conteúdo real do documento de teste — não é um placeholder.";
    const file = new File([content], "Teste_Real.txt", { type: "text/plain" });
    const form = new FormData();
    form.append("file", file);
    form.append("type", "Compliance");
    form.append("request", "REQ-TEST-UPLOAD");

    const uploadResponse = await uploadDocument(
      requestWithForm("http://localhost/api/documents", form, { userId: 1, accessLevel: "system_admin" })
    );
    expect(uploadResponse.status).toBe(201);
    const uploadBody = await uploadResponse.json();
    expect(uploadBody.document.name).toBe("Teste_Real.txt");
    expect(uploadBody.document.size).toBe(new TextEncoder().encode(content).length);
    expect(uploadBody.document).not.toHaveProperty("content"); // metadata row never carries the bytes

    // The bytes actually landed in document_files, not just the metadata row.
    const db = getDb();
    const [fileRow] = await db.select().from(documentFiles).where(eq(documentFiles.documentId, uploadBody.document.id));
    // Sem SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY nos testes, o upload usa
    // sempre o caminho bytea (ver lib/storage.ts#isStorageConfigured) —
    // content nunca é nulo neste cenário, storagePath sim.
    expect(fileRow.storagePath).toBeNull();
    expect(fileRow.content).not.toBeNull();
    expect(Buffer.from(fileRow.content!).toString("utf-8")).toBe(content);

    const downloadResponse = await downloadDocument(
      jsonRequest(`http://localhost/api/documents/${uploadBody.document.id}/download`, { method: "GET", session: { userId: 1, accessLevel: "system_admin" } }),
      { params: Promise.resolve({ id: String(uploadBody.document.id) }) }
    );
    expect(downloadResponse.status).toBe(200);
    expect(downloadResponse.headers.get("content-type")).toBe("text/plain");
    expect(downloadResponse.headers.get("content-disposition")).toContain("Teste_Real.txt");
    const downloadedText = await downloadResponse.text();
    expect(downloadedText).toBe(content);
  });

  it("rejects an upload with no file (400)", async () => {
    const form = new FormData();
    form.append("type", "Geral");
    const response = await uploadDocument(requestWithForm("http://localhost/api/documents", form, { userId: 1, accessLevel: "system_admin" }));
    expect(response.status).toBe(400);
  });

  it("rejects an upload over the size cap (400)", async () => {
    const oversized = new File([new Uint8Array(16 * 1024 * 1024)], "grande.bin", { type: "application/octet-stream" });
    const form = new FormData();
    form.append("file", oversized);
    const response = await uploadDocument(requestWithForm("http://localhost/api/documents", form, { userId: 1, accessLevel: "system_admin" }));
    expect(response.status).toBe(400);
  });

  it("404s downloading a document that was never uploaded (id does not exist)", async () => {
    const response = await downloadDocument(
      jsonRequest("http://localhost/api/documents/999999999/download", { method: "GET", session: { userId: 1, accessLevel: "system_admin" } }),
      { params: Promise.resolve({ id: "999999999" }) }
    );
    expect(response.status).toBe(404);
  });

  it("a seeded demo document (metadata only, no real file) 404s on download instead of crashing", async () => {
    const list = await listDocuments(jsonRequest("http://localhost/api/documents", { method: "GET", session: { userId: 1, accessLevel: "system_admin" } }));
    const { documents: rows } = await list.json();
    const demoDoc = rows.find((d: { name: string }) => d.name === "Contrato_MRO_2026.pdf");
    expect(demoDoc).toBeTruthy();

    const response = await downloadDocument(
      jsonRequest(`http://localhost/api/documents/${demoDoc.id}/download`, { method: "GET", session: { userId: 1, accessLevel: "system_admin" } }),
      { params: Promise.resolve({ id: String(demoDoc.id) }) }
    );
    expect(response.status).toBe(404);
  });

  it("shows up in the document list right after upload", async () => {
    const file = new File(["outro ficheiro"], "Outro.txt", { type: "text/plain" });
    const form = new FormData();
    form.append("file", file);
    await uploadDocument(requestWithForm("http://localhost/api/documents", form, { userId: 1, accessLevel: "system_admin" }));

    const list = await listDocuments(jsonRequest("http://localhost/api/documents?q=Outro", { method: "GET", session: { userId: 1, accessLevel: "system_admin" } }));
    const { documents: rows } = await list.json();
    expect(rows.some((d: { name: string }) => d.name === "Outro.txt")).toBe(true);
  });

  it("rejects a requester with no entity context from the general listing (403)", async () => {
    const response = await listDocuments(jsonRequest("http://localhost/api/documents", { method: "GET", session: { userId: 1, accessLevel: "requester" } }));
    expect(response.status).toBe(403);
  });
});
