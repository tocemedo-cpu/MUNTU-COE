export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15 MB — chega para contratos/certificados em PDF/imagem.

export type UploadedFileLike = { name: string; size: number };

export function validateUploadedFile(file: UploadedFileLike | null): { ok: true } | { ok: false; error: string } {
  if (!file) return { ok: false, error: "Nenhum ficheiro enviado" };
  if (!file.name || !file.name.trim()) return { ok: false, error: "Ficheiro sem nome" };
  if (!Number.isFinite(file.size) || file.size <= 0) return { ok: false, error: "Ficheiro vazio" };
  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, error: `Ficheiro excede o limite de ${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))} MB` };
  }
  return { ok: true };
}

/** Cabeçalho Content-Disposition com um nome ASCII de recurso e o nome
 * real em UTF-8 (filename*) — para que acentos/ç não corrompam o download
 * em navegadores que só olham para o primeiro. */
export function contentDispositionHeader(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "'");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
