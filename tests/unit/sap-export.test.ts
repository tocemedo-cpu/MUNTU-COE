import { describe, expect, it } from "vitest";
import { buildSapPurchaseOrderCsv } from "@/lib/sap-export";

describe("buildSapPurchaseOrderCsv", () => {
  it("writes the header row even with no purchase orders", () => {
    const csv = buildSapPurchaseOrderCsv([]);
    expect(csv).toBe("CompanyCode,PurchasingDocument,DocumentDate,ItemNumber,VendorName,ShortText,Currency,NetOrderValue,POStatus,Tier\r\n");
  });

  it("formats one row per purchase order with a fixed AGT/SAP item number convention", () => {
    const csv = buildSapPurchaseOrderCsv([
      {
        companyCode: "1",
        purchasingDocument: "PO-6100432",
        documentDate: new Date("2026-08-26T09:14:00Z"),
        vendorName: "Kwanza Industrial",
        shortText: "Válvulas de controlo",
        netOrderValue: 84_000_000,
        status: "Expediting",
        tier: "standard",
      },
    ]);
    const lines = csv.trim().split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe("1,PO-6100432,2026-08-26,000010,Kwanza Industrial,Válvulas de controlo,AOA,84000000.00,Expediting,standard");
  });

  it("quotes fields that contain commas, quotes or newlines", () => {
    const csv = buildSapPurchaseOrderCsv([
      {
        companyCode: "1",
        purchasingDocument: "PO-1",
        documentDate: new Date("2026-01-01T00:00:00Z"),
        vendorName: 'Fornecedor "X", Lda',
        shortText: "Item A\nItem B",
        netOrderValue: 100,
        status: "Confirmado",
        tier: "automatico",
      },
    ]);
    expect(csv).toContain('"Fornecedor ""X"", Lda"');
    expect(csv).toContain('"Item A\nItem B"');
  });

  it("keeps rows in the order given (caller decides sorting)", () => {
    const csv = buildSapPurchaseOrderCsv([
      { companyCode: "1", purchasingDocument: "PO-2", documentDate: new Date("2026-01-02T00:00:00Z"), vendorName: "B", shortText: "b", netOrderValue: 2, status: "s", tier: "t" },
      { companyCode: "1", purchasingDocument: "PO-1", documentDate: new Date("2026-01-01T00:00:00Z"), vendorName: "A", shortText: "a", netOrderValue: 1, status: "s", tier: "t" },
    ]);
    const lines = csv.trim().split("\r\n");
    expect(lines[1]).toContain("PO-2");
    expect(lines[2]).toContain("PO-1");
  });
});
