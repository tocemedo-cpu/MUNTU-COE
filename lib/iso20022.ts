// Gerador de pain.001.001.03 (Customer Credit Transfer Initiation) —
// sem dependência de base de dados nem dependências externas, para poder
// ser testado isoladamente (mesmo padrão de lib/billing-tiers.ts). A
// rota que o usa (app/api/payments/[id]/export/iso20022) é responsável
// por reunir dados reais (empresa devedora, facturas validadas,
// fornecedores credores) — esta função só formata o XML.

export type Pain001Transaction = {
  endToEndId: string;
  amount: number; // AOA, inteiro (sem casas decimais — mesma unidade usada em todo o resto da app)
  creditorName: string;
  creditorIban: string;
  creditorBic: string;
  remittanceInfo: string;
};

export type Pain001Params = {
  messageId: string;
  creationDateTime: Date;
  executionDate: Date;
  debtorName: string;
  debtorIban: string;
  debtorBic: string;
  transactions: Pain001Transaction[];
};

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

// Duas casas decimais fixas — o formato ISO 20022 exige um valor
// decimal (`InstdAmt`), mesmo a app inteira operando em AOA sem
// fracções (mesma conversão que a exportação de facturação faria).
function formatAmount(value: number): string {
  return value.toFixed(2);
}

export function buildPain001Xml(params: Pain001Params): string {
  const nbOfTxs = params.transactions.length;
  const ctrlSum = formatAmount(params.transactions.reduce((sum, tx) => sum + tx.amount, 0));

  const transactionsXml = params.transactions
    .map(
      (tx) => `      <CdtTrfTxInf>
        <PmtId>
          <EndToEndId>${escapeXml(tx.endToEndId)}</EndToEndId>
        </PmtId>
        <Amt>
          <InstdAmt Ccy="AOA">${formatAmount(tx.amount)}</InstdAmt>
        </Amt>
        <CdtrAgt>
          <FinInstnId>
            <BIC>${escapeXml(tx.creditorBic)}</BIC>
          </FinInstnId>
        </CdtrAgt>
        <Cdtr>
          <Nm>${escapeXml(tx.creditorName)}</Nm>
        </Cdtr>
        <CdtrAcct>
          <Id>
            <IBAN>${escapeXml(tx.creditorIban)}</IBAN>
          </Id>
        </CdtrAcct>
        <RmtInf>
          <Ustrd>${escapeXml(tx.remittanceInfo)}</Ustrd>
        </RmtInf>
      </CdtTrfTxInf>`
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${escapeXml(params.messageId)}</MsgId>
      <CreDtTm>${params.creationDateTime.toISOString()}</CreDtTm>
      <NbOfTxs>${nbOfTxs}</NbOfTxs>
      <CtrlSum>${ctrlSum}</CtrlSum>
      <InitgPty>
        <Nm>${escapeXml(params.debtorName)}</Nm>
      </InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${escapeXml(params.messageId)}</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <NbOfTxs>${nbOfTxs}</NbOfTxs>
      <CtrlSum>${ctrlSum}</CtrlSum>
      <ReqdExctnDt>${isoDate(params.executionDate)}</ReqdExctnDt>
      <Dbtr>
        <Nm>${escapeXml(params.debtorName)}</Nm>
      </Dbtr>
      <DbtrAcct>
        <Id>
          <IBAN>${escapeXml(params.debtorIban)}</IBAN>
        </Id>
      </DbtrAcct>
      <DbtrAgt>
        <FinInstnId>
          <BIC>${escapeXml(params.debtorBic)}</BIC>
        </FinInstnId>
      </DbtrAgt>
${transactionsXml}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>
`;
}
