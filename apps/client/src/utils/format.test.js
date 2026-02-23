import { describe, it, expect } from "vitest";
import { formatCurrency, formatNumber, formatPercent } from "./format";

describe("formatCurrency", () => {
  it("formata valor em BRL", () => {
    const result = formatCurrency(1234.56);
    expect(result).toContain("1.234,56");
    expect(result).toContain("R$");
  });

  it("formata valor zero", () => {
    const result = formatCurrency(0);
    expect(result).toContain("0,00");
  });

  it("retorna R$ 0,00 para null", () => {
    const result = formatCurrency(null);
    expect(result).toContain("0,00");
  });

  it("retorna R$ 0,00 para undefined", () => {
    const result = formatCurrency(undefined);
    expect(result).toContain("0,00");
  });

  it("formata valores negativos", () => {
    const result = formatCurrency(-500);
    expect(result).toContain("500,00");
  });

  it("formata string numerica", () => {
    const result = formatCurrency("1500.75");
    expect(result).toContain("1.500,75");
  });
});

describe("formatNumber", () => {
  it("formata numero com separador de milhar", () => {
    expect(formatNumber(1234567)).toBe("1.234.567");
  });

  it("formata zero", () => {
    expect(formatNumber(0)).toBe("0");
  });

  it("retorna 0 para null", () => {
    expect(formatNumber(null)).toBe("0");
  });

  it("formata decimal", () => {
    const result = formatNumber(1234.5);
    expect(result).toContain("1.234");
  });
});

describe("formatPercent", () => {
  it("formata porcentagem com 2 casas decimais por default", () => {
    const result = formatPercent(0.1234);
    expect(result).toContain("12,34");
    expect(result).toContain("%");
  });

  it("formata zero", () => {
    const result = formatPercent(0);
    expect(result).toContain("0,00%");
  });

  it("retorna 0% para null", () => {
    const result = formatPercent(null);
    expect(result).toContain("0,00%");
  });

  it("respeita digitos customizados", () => {
    const result = formatPercent(0.5, 0);
    expect(result).toContain("50%");
  });

  it("formata 100%", () => {
    const result = formatPercent(1);
    expect(result).toContain("100,00%");
  });
});
