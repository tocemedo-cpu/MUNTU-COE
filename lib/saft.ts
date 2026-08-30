// Gerador de um subconjunto do SAF-T AGT (Ficheiro Normalizado de
// Auditoria Tributária, adaptação angolana do standard SAF-T) —
// Header + MasterFiles/Customer + SourceDocuments/SalesInvoices, cobrindo
// as facturas de cliente (client_invoices) que Muntu emite às empresas
// que serve. Sem dependência de base de dados, para poder ser testado
// isoladamente (mesmo padrão de lib/iso20022.ts).
//
// Fica deliberadamente por fazer: a cadeia de hash criptográfico exigida
// pela certificação oficial AGT (assinatura RSA encadeada entre facturas,
// elemento `Hash` de cada `Invoice`) não está implementada — precisaria
// de infra-estrutura de chaves que este projecto não tem. Omitido por
// completo (nunca um valor inventado que parecesse uma assinatura real) —
// ver README para o que falta para certificação oficial.

// IVA angolano — mesmo valor já mostrado como regime fiscal fixo em
// Administração ("Angola • IVA 14%"). client_invoices.total_amount não
// separa IVA de valor líquido (não modelado em nenhum outro sítio da
// app); a decomposição aqui aplica essa taxa já assumida, não inventa uma
// nova.
export const AGT_VAT_RATE = 0.14;

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function formatAmount(value: number): string {
  return value.toFixed(2);
}

export type SaftCustomer = {
  customerId: string; // usamos o companies.id como CustomerID
  taxId: string;
  companyName: string;
};

export type SaftInvoice = {
  invoiceNo: string; // client_invoices.id (ex.: "COB-2026-1000")
  invoiceDate: Date;
  customerId: string;
  grossTotal: number; // client_invoices.total_amount, IVA incluído
};

export type SaftParams = {
  companyTaxId: string; // NIF da própria Muntu
  companyName: string;
  fiscalYear: number;
  periodStart: Date;
  periodEnd: Date;
  dateCreated: Date;
  customers: SaftCustomer[];
  invoices: SaftInvoice[];
};

export function buildSaftAgtXml(params: SaftParams): string {
  const customersXml = params.customers
    .map(
      (customer) => `      <Customer>
        <CustomerID>${escapeXml(customer.customerId)}</CustomerID>
        <CustomerTaxID>${escapeXml(customer.taxId)}</CustomerTaxID>
        <CompanyName>${escapeXml(customer.companyName)}</CompanyName>
        <SelfBillingIndicator>0</SelfBillingIndicator>
      </Customer>`
    )
    .join("\n");

  let grossTotalSum = 0;

  const invoicesXml = params.invoices
    .map((invoice) => {
      const netTotal = invoice.grossTotal / (1 + AGT_VAT_RATE);
      const taxPayable = invoice.grossTotal - netTotal;
      grossTotalSum += invoice.grossTotal;

      return `      <Invoice>
        <InvoiceNo>${escapeXml(invoice.invoiceNo)}</InvoiceNo>
        <InvoiceType>FT</InvoiceType>
        <InvoiceDate>${isoDate(invoice.invoiceDate)}</InvoiceDate>
        <CustomerID>${escapeXml(invoice.customerId)}</CustomerID>
        <DocumentTotals>
          <TaxPayable>${formatAmount(taxPayable)}</TaxPayable>
          <NetTotal>${formatAmount(netTotal)}</NetTotal>
          <GrossTotal>${formatAmount(invoice.grossTotal)}</GrossTotal>
        </DocumentTotals>
      </Invoice>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<AuditFile xmlns="urn:OECD:StandardAuditFile-Tax:AO_1.01_01">
  <Header>
    <AuditFileVersion>1.01_01</AuditFileVersion>
    <CompanyID>${escapeXml(params.companyTaxId)}</CompanyID>
    <TaxRegistrationNumber>${escapeXml(params.companyTaxId)}</TaxRegistrationNumber>
    <TaxAccountingBasis>F</TaxAccountingBasis>
    <CompanyName>${escapeXml(params.companyName)}</CompanyName>
    <FiscalYear>${params.fiscalYear}</FiscalYear>
    <StartDate>${isoDate(params.periodStart)}</StartDate>
    <EndDate>${isoDate(params.periodEnd)}</EndDate>
    <CurrencyCode>AOA</CurrencyCode>
    <DateCreated>${isoDate(params.dateCreated)}</DateCreated>
    <TaxEntity>Global</TaxEntity>
    <ProductID>Muntu COE Portal</ProductID>
    <ProductVersion>1.0</ProductVersion>
  </Header>
  <MasterFiles>
    <Customer>
${customersXml}
    </Customer>
  </MasterFiles>
  <SourceDocuments>
    <SalesInvoices>
      <NumberOfEntries>${params.invoices.length}</NumberOfEntries>
      <TotalDebit>0.00</TotalDebit>
      <TotalCredit>${formatAmount(grossTotalSum)}</TotalCredit>
${invoicesXml}
    </SalesInvoices>
  </SourceDocuments>
</AuditFile>
`;
}
