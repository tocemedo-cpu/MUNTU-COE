import { describe, expect, it } from "vitest";
import { buildPain001Xml } from "@/lib/iso20022";

const BASE_PARAMS = {
  messageId: "PAY-TEST-1-1735689600000",
  creationDateTime: new Date("2026-01-01T12:00:00Z"),
  executionDate: new Date("2026-01-02T00:00:00Z"),
  debtorName: "Operadora Atlântico, SA",
  debtorIban: "AO06004000000123456789101",
  debtorBic: "BAOAAOLU",
};

describe("buildPain001Xml", () => {
  it("declares the pain.001.001.03 namespace and echoes the debtor once in GrpHdr and once in PmtInf", () => {
    const xml = buildPain001Xml({ ...BASE_PARAMS, transactions: [] });
    expect(xml).toContain('xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03"');
    expect(xml.match(/<Nm>Operadora Atlântico, SA<\/Nm>/g)).toHaveLength(2); // InitgPty + Dbtr
    expect(xml).toContain("<IBAN>AO06004000000123456789101</IBAN>");
    expect(xml).toContain("<BIC>BAOAAOLU</BIC>");
    expect(xml).toContain("<ReqdExctnDt>2026-01-02</ReqdExctnDt>");
  });

  it("counts transactions and sums their amounts into NbOfTxs/CtrlSum", () => {
    const xml = buildPain001Xml({
      ...BASE_PARAMS,
      transactions: [
        { endToEndId: "FT-1", amount: 1000, creditorName: "Fornecedor A", creditorIban: "AO0600...A", creditorBic: "AAA", remittanceInfo: "FT-1" },
        { endToEndId: "FT-2", amount: 2500, creditorName: "Fornecedor B", creditorIban: "AO0600...B", creditorBic: "BBB", remittanceInfo: "FT-2" },
      ],
    });
    expect(xml.match(/<NbOfTxs>2<\/NbOfTxs>/g)).toHaveLength(2); // GrpHdr + PmtInf
    expect(xml.match(/<CtrlSum>3500\.00<\/CtrlSum>/g)).toHaveLength(2);
    expect(xml).toContain("<EndToEndId>FT-1</EndToEndId>");
    expect(xml).toContain("<EndToEndId>FT-2</EndToEndId>");
  });

  it("formats amounts with two decimal places even for whole AOA values", () => {
    const xml = buildPain001Xml({
      ...BASE_PARAMS,
      transactions: [{ endToEndId: "FT-1", amount: 42_000_000, creditorName: "X", creditorIban: "Y", creditorBic: "Z", remittanceInfo: "r" }],
    });
    expect(xml).toContain('<InstdAmt Ccy="AOA">42000000.00</InstdAmt>');
  });

  it("escapes XML special characters in free-text fields", () => {
    const xml = buildPain001Xml({
      ...BASE_PARAMS,
      debtorName: 'Empresa "Atlântico" & Filhos <SA>',
      transactions: [
        { endToEndId: "FT-1", amount: 100, creditorName: "R&D Supplies", creditorIban: "IBAN", creditorBic: "BIC", remittanceInfo: 'Ref "special" <case>' },
      ],
    });
    expect(xml).toContain("Empresa &quot;Atlântico&quot; &amp; Filhos &lt;SA&gt;");
    expect(xml).toContain("R&amp;D Supplies");
    expect(xml).toContain("Ref &quot;special&quot; &lt;case&gt;");
    expect(xml).not.toContain('Empresa "Atlântico"');
  });

  it("produces zero transactions cleanly (still a valid, well-formed skeleton)", () => {
    const xml = buildPain001Xml({ ...BASE_PARAMS, transactions: [] });
    expect(xml).toContain("<NbOfTxs>0</NbOfTxs>");
    expect(xml).toContain("<CtrlSum>0.00</CtrlSum>");
    expect(xml).not.toContain("<CdtTrfTxInf>");
  });
});
