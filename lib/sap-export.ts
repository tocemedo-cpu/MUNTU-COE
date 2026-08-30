// Exportação estruturada para SAP — um ficheiro CSV com um layout
// próximo do de importação de documentos de compra em SAP MM (EKKO/EKPO
// simplificado: um cabeçalho de documento de compra por linha, já que
// este modelo de PO não tem itens/linhas próprias — ver comentário no
// README sobre o que falta para um mapeamento LSMW/BAPI real). Sem
// dependência de base de dados, para poder ser testado isoladamente
// (mesmo padrão de lib/iso20022.ts e lib/saft.ts).

const CSV_COLUMNS = ["CompanyCode", "PurchasingDocument", "DocumentDate", "ItemNumber", "VendorName", "ShortText", "Currency", "NetOrderValue", "POStatus", "Tier"] as const;

function escapeCsvField(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export type SapPurchaseOrderRow = {
  companyCode: string; // companies.id — não é um código SAP real (não modelado nesta app), ver README
  purchasingDocument: string; // purchase_orders.id
  documentDate: Date; // purchase_orders.created_at
  vendorName: string; // purchase_orders.supplier
  shortText: string; // purchase_orders.description
  netOrderValue: number; // purchase_orders.value, AOA
  status: string;
  tier: string;
};

export function buildSapPurchaseOrderCsv(rows: SapPurchaseOrderRow[]): string {
  const lines = [CSV_COLUMNS.join(",")];
  for (const row of rows) {
    lines.push(
      [
        escapeCsvField(row.companyCode),
        escapeCsvField(row.purchasingDocument),
        isoDate(row.documentDate),
        "000010", // convenção SAP de numeração de item (10, 20, 30, ...) — sempre a primeira, este modelo não tem várias linhas por PO
        escapeCsvField(row.vendorName),
        escapeCsvField(row.shortText),
        "AOA",
        row.netOrderValue.toFixed(2),
        escapeCsvField(row.status),
        escapeCsvField(row.tier),
      ].join(",")
    );
  }
  return lines.join("\r\n") + "\r\n";
}
