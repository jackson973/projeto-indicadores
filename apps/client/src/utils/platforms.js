const mercadoLivreLogo = new URL("../../images/mercado_livre.ico", import.meta.url).href;
const shopeeLogo = encodeURI(new URL("../../images/shopee.ico", import.meta.url).href);
const sheinLogo = encodeURI(new URL("../../images/shein.ico", import.meta.url).href);
const tiktokLogo = encodeURI(new URL("../../images/tiktok.ico", import.meta.url).href);
const sisplanLogo = encodeURI(new URL("../../images/sisplan.ico", import.meta.url).href);

const normalize = (value) => String(value || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

export const getPlatformMeta = (name) => {
  const normalized = normalize(name);
  if (normalized.includes("mercado") && (normalized.includes("livre") || normalized.includes("libre"))) {
    return { label: "Mercado Livre", logo: mercadoLivreLogo };
  }
  if (normalized.includes("shopee")) {
    return { label: "Shopee", logo: shopeeLogo };
  }
  if (normalized.includes("shein")) {
    return { label: "Shein", logo: sheinLogo };
  }
  if (normalized.includes("tiktok") || normalized.includes("tik tok")) {
    return { label: "TikTok", logo: tiktokLogo };
  }
  if (normalized.includes("sisplan")) {
    return { label: "Sisplan", logo: sisplanLogo };
  }
  return { label: name || "Não informado", logo: null };
};
