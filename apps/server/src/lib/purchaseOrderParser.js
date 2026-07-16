// Parser da "cópia de pedido" (PDF PEDIDO DE VENDA — modelo Tuck Kids/Sisplan).
// Extrai os campos por regex sobre o texto do PDF; tudo que não for encontrado
// volta null e o usuário preenche manualmente na tela.

const SIZE_TOKENS = ['PRE', 'RN', 'P', 'M', 'G', 'GG', 'XG', 'XGG', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '12', '14', '16'];

const parseBRL = (s) => {
  if (!s) return null;
  const n = parseFloat(String(s).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

const toISO = (br) => {
  const m = String(br || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

function parseOrderText(rawText) {
  const text = String(rawText || '').replace(/\r/g, '');
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // Fornecedor: primeira linha com cara de nome (o emitente fica no topo do PDF)
  const supplier = lines.find(l => /[a-zá-ú]/i.test(l) && !/pedido de venda|cnpj|i\.e\.|fone|rua|av\./i.test(l)) || null;

  const nro = text.match(/N(?:ro|º|o)\.?:?\s*(\d+)/i)?.[1] || null;

  // Data: preferir "Emissão:", senão a primeira data após o Nro
  const emissao = text.match(/Emiss[ãa]o:?\s*(\d{2}\/\d{2}\/\d{4})/i)?.[1]
    || text.match(/\d{2}\/\d{2}\/\d{4}/)?.[0] || null;

  // Condição de pagamento: sequência de números após o rótulo (ex.: "0 15 30")
  const cond = text.match(/Cond\.?\s*(?:de\s*)?Pagamento:?\s*([0-9][0-9 \/]*)/i)?.[1]?.trim().replace(/\s+/g, ' ') || null;

  // Obs: linhas após "Obs:" até uma seção conhecida
  let obs = null;
  const obsMatch = text.match(/Obs:?\s*([\s\S]*?)(?=\n\s*(?:ITENS DO PEDIDO|DADOS DO CLIENTE|Produto\s|Total de pe|$))/i);
  if (obsMatch) obs = obsMatch[1].split('\n').map(l => l.trim()).filter(Boolean).join(' ').trim() || null;

  const totalPieces = text.match(/Total de pe[çc]as:?\s*([\d.]+)/i)?.[1]?.replace(/\./g, '') || null;

  // Valor total: o último R$ do documento (total geral vem no fim)
  const amounts = [...text.matchAll(/R\$\s*([\d.]+,\d{2})/g)].map(m => parseBRL(m[1]));
  const totalAmount = amounts.length ? amounts[amounts.length - 1] : null;

  // Itens: bloco entre "ITENS DO PEDIDO" e "Total de peças"
  const items = [];
  const itemsBlock = text.match(/ITENS DO PEDIDO([\s\S]*?)(?:Total de pe[çc]as|$)/i)?.[1] || '';
  if (itemsBlock) {
    // Cabeçalho da tabela pode vir com as células coladas ("ProdutoQtdePreço Unit.Total")
    const isTableHeader = (l) => {
      const flat = l.toLowerCase().replace(/\s+/g, '');
      return (flat.startsWith('produto') && flat.includes('qtde') && flat.includes('total'))
        || /^qtde$|^pre[çc]ounit\.?$|^total$/.test(flat);
    };
    const bLines = itemsBlock.split('\n').map(l => l.trim()).filter(Boolean)
      .filter(l => !isTableHeader(l));
    let current = null;
    const flush = () => { if (current && current.description) items.push(current); current = null; };
    for (let i = 0; i < bLines.length; i++) {
      const l = bLines[i];
      // linha de valores: "1500 R$ 18,00 R$ 27.000,00" (qtde, unit, total)
      const val = l.match(/^([\d.]+)\s*R\$\s*([\d.]+,\d{2})\s*R\$\s*([\d.]+,\d{2})$/);
      if (val) {
        if (!current) current = { description: '', sizes: [] };
        current.qty = parseInt(val[1].replace(/\./g, '')) || 0;
        current.unit_price = parseBRL(val[2]);
        current.total = parseBRL(val[3]);
        flush();
        continue;
      }
      // descrição + valores na mesma linha: "Trijunto Longo - Menino 1500 R$ 18,50 R$ 27.750,00"
      const inline = l.match(/^(.+?)\s+([\d.]+)\s*R\$\s*([\d.]+,\d{2})\s*R\$\s*([\d.]+,\d{2})$/);
      if (inline) {
        if (current && current.description) flush();
        items.push({
          description: inline[1].trim(),
          sizes: [],
          qty: parseInt(inline[2].replace(/\./g, '')) || 0,
          unit_price: parseBRL(inline[3]),
          total: parseBRL(inline[4]),
        });
        current = null;
        continue;
      }
      // token de grade (tamanho) seguido de quantidade
      if (SIZE_TOKENS.includes(l.toUpperCase())) {
        const qty = bLines[i + 1] && /^[\d.]+$/.test(bLines[i + 1]) ? bLines[i + 1].replace(/\./g, '') : null;
        if (current && qty) { current.sizes.push(`${l.toUpperCase()} ${qty}`); i++; }
        continue;
      }
      // números soltos (qtde total do item em outra posição) — ignora
      if (/^[\d.]+$/.test(l)) continue;
      // Obs do item (vale para o item em construção ou o último fechado)
      if (/^Obs:/i.test(l)) {
        const obsTxt = l.replace(/^Obs:\s*/i, '');
        if (current) current.obs = obsTxt;
        else if (items.length) items[items.length - 1].obs = obsTxt;
        continue;
      }
      // R$ soltos — ignora
      if (/^R\$/.test(l)) continue;
      // linha de descrição: inicia novo item
      if (current && current.description) flush();
      current = { description: l, sizes: [] };
    }
    flush();
  }

  return {
    supplier_name: supplier,
    order_number: nro,
    order_date: toISO(emissao),
    payment_terms: cond,
    obs,
    total_pieces: totalPieces ? parseInt(totalPieces) : null,
    total_amount: totalAmount,
    items: items.map(it => ({
      description: it.description,
      size_grid: it.sizes?.length ? it.sizes.join(' · ') : null,
      qty: it.qty || 0,
      unit_price: it.unit_price || 0,
      total: it.total || 0,
      obs: it.obs || null,
    })),
  };
}

module.exports = { parseOrderText };
