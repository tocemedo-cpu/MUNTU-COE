import { describe, expect, it } from "vitest";
import { AGT_VAT_RATE, buildSaftAgtXml } from "@/lib/saft";

const BASE_PARAMS = {
  companyTaxId: "5417000123",
  companyName: "Muntu Centre of Excellence, Lda",
  fiscalYear: 2026,
  periodStart: new Date("2026-01-01T00:00:00Z"),
  periodEnd: new Date("2026-01-31T00:00:00Z"),
  dateCreated: new Date("2026-02-01T09:00:00Z"),
};

describe("buildSaftAgtXml", () => {
  it("declares the AGT SAF-T namespace and echoes company identity in Header", () => {
    const xml = buildSaftAgtXml({ ...BASE_PARAMS, customers: [], invoices: [] });
    expect(xml).toContain('xmlns="urn:OECD:StandardAuditFile-Tax:AO_1.01_01"');
    expect(xml).toContain("<CompanyID>5417000123</CompanyID>");
    expect(xml).toContain("<TaxRegistrationNumber>5417000123</TaxRegistrationNumber>");
    expect(xml).toContain("<FiscalYear>2026</FiscalYear>");
    expect(xml).toContain("<StartDate>2026-01-01</StartDate>");
    expect(xml).toContain("<EndDate>2026-01-31</EndDate>");
    expect(xml).toContain("<CurrencyCode>AOA</CurrencyCode>");
  });

  it("lists every customer under MasterFiles", () => {
    const xml = buildSaftAgtXml({
      ...BASE_PARAMS,
      customers: [
        { customerId: "1", taxId: "5000000001", companyName: "Operadora Atlântico, SA" },
        { customerId: "2", taxId: "5000000002", companyName: "Kwanza Refino, SA" },
      ],
      invoices: [],
    });
    expect(xml).toContain("<CustomerID>1</CustomerID>");
    expect(xml).toContain("<CustomerTaxID>5000000001</CustomerTaxID>");
    expect(xml).toContain("<CompanyName>Operadora Atlântico, SA</CompanyName>");
    expect(xml).toContain("<CustomerID>2</CustomerID>");
    expect(xml).toContain("<CompanyName>Kwanza Refino, SA</CompanyName>");
  });

  it("splits each invoice's gross total into net + tax at the 14% AGT VAT rate already used elsewhere in the app", () => {
    expect(AGT_VAT_RATE).toBe(0.14);
    const xml = buildSaftAgtXml({
      ...BASE_PARAMS,
      customers: [{ customerId: "1", taxId: "5000000001", companyName: "Cliente" }],
      invoices: [{ invoiceNo: "COB-2026-1000", invoiceDate: new Date("2026-01-15T00:00:00Z"), customerId: "1", grossTotal: 1140 }],
    });
    // 1140 / 1.14 = 1000.00 net; tax payable = 140.00
    expect(xml).toContain("<NetTotal>1000.00</NetTotal>");
    expect(xml).toContain("<TaxPayable>140.00</TaxPayable>");
    expect(xml).toContain("<GrossTotal>1140.00</GrossTotal>");
    expect(xml).toContain("<InvoiceNo>COB-2026-1000</InvoiceNo>");
    expect(xml).toContain("<InvoiceDate>2026-01-15</InvoiceDate>");
    expect(xml).toContain("<NumberOfEntries>1</NumberOfEntries>");
    expect(xml).toContain("<TotalCredit>1140.00</TotalCredit>");
  });

  it("never emits a Hash element — the cryptographic AGT signature chain is not implemented", () => {
    const xml = buildSaftAgtXml({
      ...BASE_PARAMS,
      customers: [{ customerId: "1", taxId: "5000000001", companyName: "Cliente" }],
      invoices: [{ invoiceNo: "COB-2026-1000", invoiceDate: new Date("2026-01-15T00:00:00Z"), customerId: "1", grossTotal: 1000 }],
    });
    expect(xml).not.toContain("<Hash>");
  });

  it("escapes XML special characters in company/customer names", () => {
    const xml = buildSaftAgtXml({
      ...BASE_PARAMS,
      companyName: 'Empresa "Atlântico" & Filhos <Lda>',
      customers: [],
      invoices: [],
    });
    expect(xml).toContain("Empresa &quot;Atlântico&quot; &amp; Filhos &lt;Lda&gt;");
    expect(xml).not.toContain('Empresa "Atlântico"');
  });
});
