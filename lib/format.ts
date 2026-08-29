// Formatação de datas partilhada entre rotas de servidor que gravam uma
// etiqueta pontual (ex.: requests.submitted, documents.updated) em vez de
// guardarem só o timestamp — evita duplicar a mesma função em cada rota.
export function formatPtDateTime(date: Date): string {
  return new Intl.DateTimeFormat("pt-PT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
    .format(date)
    .replace(".", "");
}
