import { describe, expect, it } from "vitest";
import { classifyInvoiceTier, classifyPoTier } from "@/lib/billing-tiers";

describe("classifyPoTier", () => {
  it("classifies 'Compra urgente' as complexo", () => {
    expect(classifyPoTier("Compra urgente")).toBe("complexo");
  });

  it("classifies 'PO catalogado' as automatico", () => {
    expect(classifyPoTier("PO catalogado")).toBe("automatico");
  });

  it("defaults everything else to standard", () => {
    expect(classifyPoTier("PO standard")).toBe("standard");
    expect(classifyPoTier("Serviço técnico")).toBe("standard");
    expect(classifyPoTier("Contrato / Call-off")).toBe("standard");
    expect(classifyPoTier("qualquer-coisa-desconhecida")).toBe("standard");
  });
});

describe("classifyInvoiceTier", () => {
  it("classifies status Excepção as excecao regardless of match", () => {
    expect(classifyInvoiceTier({ match: "3-way match", status: "Excepção" })).toBe("excecao");
  });

  it("classifies a 3-way match as limpa", () => {
    expect(classifyInvoiceTier({ match: "3-way match", status: "Validada" })).toBe("limpa");
  });

  it("defaults everything else to assistida", () => {
    expect(classifyInvoiceTier({ match: "Preço divergente", status: "Pendente" })).toBe("assistida");
    expect(classifyInvoiceTier({ match: "Receção em falta", status: "Pendente" })).toBe("assistida");
  });
});
