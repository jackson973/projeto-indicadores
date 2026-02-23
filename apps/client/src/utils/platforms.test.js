import { describe, it, expect } from "vitest";
import { getPlatformMeta } from "./platforms";

describe("getPlatformMeta", () => {
  it("detecta Mercado Livre", () => {
    const meta = getPlatformMeta("Mercado Livre");
    expect(meta.label).toBe("Mercado Livre");
    expect(meta.logo).toBeTruthy();
  });

  it("detecta Mercado Libre (espanhol)", () => {
    const meta = getPlatformMeta("Mercado Libre");
    expect(meta.label).toBe("Mercado Livre");
  });

  it("detecta Mercado Livre case insensitive", () => {
    const meta = getPlatformMeta("MERCADO LIVRE");
    expect(meta.label).toBe("Mercado Livre");
  });

  it("detecta Shopee", () => {
    const meta = getPlatformMeta("Shopee");
    expect(meta.label).toBe("Shopee");
    expect(meta.logo).toBeTruthy();
  });

  it("detecta Shein", () => {
    const meta = getPlatformMeta("Shein");
    expect(meta.label).toBe("Shein");
    expect(meta.logo).toBeTruthy();
  });

  it("detecta TikTok", () => {
    const meta = getPlatformMeta("TikTok");
    expect(meta.label).toBe("TikTok");
    expect(meta.logo).toBeTruthy();
  });

  it("detecta Tik Tok com espaco", () => {
    const meta = getPlatformMeta("Tik Tok");
    expect(meta.label).toBe("TikTok");
  });

  it("detecta Sisplan", () => {
    const meta = getPlatformMeta("Sisplan");
    expect(meta.label).toBe("Sisplan");
    expect(meta.logo).toBeTruthy();
  });

  it("retorna label original para plataforma desconhecida", () => {
    const meta = getPlatformMeta("Amazon");
    expect(meta.label).toBe("Amazon");
    expect(meta.logo).toBeNull();
  });

  it("retorna 'Nao informado' para null", () => {
    const meta = getPlatformMeta(null);
    expect(meta.label).toBe("Não informado");
    expect(meta.logo).toBeNull();
  });

  it("retorna 'Nao informado' para string vazia", () => {
    const meta = getPlatformMeta("");
    expect(meta.label).toBe("Não informado");
    expect(meta.logo).toBeNull();
  });

  it("detecta plataforma com acentos", () => {
    const meta = getPlatformMeta("Mercádo Livre");
    expect(meta.label).toBe("Mercado Livre");
  });
});
