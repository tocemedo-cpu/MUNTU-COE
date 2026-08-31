// Armazenamento de ficheiros de documentos — Supabase Storage via a sua
// API REST simples (sem SDK, mesmo padrão de lib/mailer.ts para o Brevo).
// Sem SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY definidas, isStorageConfigured()
// devolve false e os pontos de escrita (app/api/documents,
// app/api/applications/[id]/documents) continuam a guardar os bytes
// directamente em document_files.content (bytea no Postgres) — o
// comportamento de sempre, sem mudança nenhuma até estas variáveis
// existirem.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "documents";

export function isStorageConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

/** Caminho único por ficheiro — o id do documento sozinho não chega
 * (nomes de ficheiro podem colidir, e um id previsível a servir de nome
 * de objecto não deve ser adivinhável). */
export function storagePathFor(documentId: number, fileName: string): string {
  const safeName = fileName.replace(/[^a-zA-Z0-9_.-]/g, "_").slice(-120);
  return `${documentId}-${crypto.randomUUID()}-${safeName}`;
}

export async function uploadToStorage(path: string, bytes: Buffer, contentType?: string | null): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase Storage não está configurado (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY em falta)");
  }
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURIComponent(path)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      "Content-Type": contentType || "application/octet-stream",
    },
    body: new Uint8Array(bytes),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Falha ao carregar ficheiro para o Supabase Storage (${response.status}): ${body}`);
  }
}

export async function downloadFromStorage(path: string): Promise<Buffer> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase Storage não está configurado (SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY em falta)");
  }
  const response = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${encodeURIComponent(path)}`, {
    headers: {
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: SUPABASE_SERVICE_ROLE_KEY,
    },
  });
  if (!response.ok) {
    throw new Error(`Falha ao obter ficheiro do Supabase Storage (${response.status})`);
  }
  return Buffer.from(await response.arrayBuffer());
}

/** Devolve os bytes de um document_files, seja de onde vierem — do bucket
 * (storagePath preenchido, uploads mais recentes com o Storage já
 * configurado) ou da própria linha (content preenchido, comportamento
 * anterior). Nunca os dois nulos ao mesmo tempo — um deles é sempre
 * escrito no upload. */
export async function readDocumentBytes(file: { content: Buffer | null; storagePath: string | null }): Promise<Buffer> {
  if (file.storagePath) return downloadFromStorage(file.storagePath);
  if (file.content) return file.content;
  throw new Error("Ficheiro sem conteúdo nem caminho de armazenamento");
}
