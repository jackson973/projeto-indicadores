const PDFDocument = require('pdfkit');
const { SCOPES, API_BASE } = require('../api/routeRegistry');

/**
 * PDF da documentação da API externa, gerado a partir do registro de rotas
 * (src/api/routeRegistry.js). A4 retrato.
 */

const NAVY = '#1F4E78';
const GREY = '#6B7683';
const BORD = '#CBD8E6';
const ZEBRA = '#F6F9FC';
const CODE_BG = '#EEF2F6';
const GREEN = '#1E7E34';
const BLACK = '#111111';

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const ML = 40;
const MR = 40;
const MT = 40;
const MB = 40;
const PW = PAGE_W - ML - MR;
const BOTTOM = PAGE_H - MB;

// Helvetica (WinAnsi) não tem →, ≤, ≥: troca por equivalentes ASCII
const tx = (v) => String(v ?? '').replace(/→/g, '->').replace(/≤/g, '<=').replace(/≥/g, '>=');

function createApiDocsPdf({ baseUrl }) {
  const doc = new PDFDocument({ size: 'A4', margins: { top: MT, bottom: MB, left: ML, right: MR }, bufferPages: true });
  const base = baseUrl || API_BASE;
  const today = new Date().toLocaleDateString('pt-BR');

  const ensure = (h) => { if (doc.y + h > BOTTOM) doc.addPage(); };

  const h1 = (t) => { ensure(40); doc.font('Helvetica-Bold').fontSize(18).fillColor(NAVY).text(t); doc.moveDown(0.3); };
  const h2 = (t, badge) => {
    ensure(90);
    doc.moveDown(0.6);
    doc.font('Helvetica-Bold').fontSize(13).fillColor(NAVY).text(t, { continued: !!badge });
    if (badge) doc.font('Helvetica').fontSize(9).fillColor(GREY).text(`   ${badge}`);
    const y = doc.y + 2;
    doc.moveTo(ML, y).lineTo(ML + PW, y).lineWidth(0.6).strokeColor(BORD).stroke();
    doc.y = y + 6;
  };
  const p = (t, opts = {}) => { ensure(24); doc.font('Helvetica').fontSize(9.5).fillColor(BLACK).text(tx(t), { lineGap: 1.5, ...opts }); doc.moveDown(0.25); };
  const small = (t) => { ensure(18); doc.font('Helvetica').fontSize(8.5).fillColor(GREY).text(tx(t), { lineGap: 1 }); doc.moveDown(0.25); };
  const code = (raw) => {
    const t = tx(raw);
    doc.font('Courier').fontSize(8.5);
    const h = doc.heightOfString(t, { width: PW - 12 }) + 10;
    ensure(h + 4);
    doc.rect(ML, doc.y, PW, h).fill(CODE_BG);
    doc.fillColor(BLACK).text(t, ML + 6, doc.y + 5, { width: PW - 12 });
    doc.y += 8;
    doc.x = ML;
  };

  // Tabela simples com quebra de página por linha
  const table = (cols, rows) => {
    const rowH = (cells, bold) => {
      let h = 0;
      cells.forEach((c, i) => {
        doc.font(bold ? 'Helvetica-Bold' : (cols[i].mono ? 'Courier' : 'Helvetica')).fontSize(8.5);
        h = Math.max(h, doc.heightOfString(tx(c), { width: cols[i].w - 8 }));
      });
      return h + 8;
    };
    const drawRow = (cells, { bold = false, bg = null } = {}) => {
      const h = rowH(cells, bold);
      ensure(h);
      const y = doc.y;
      if (bg) doc.rect(ML, y, PW, h).fill(bg);
      let x = ML;
      cells.forEach((c, i) => {
        doc.font(bold ? 'Helvetica-Bold' : (cols[i].mono ? 'Courier' : 'Helvetica')).fontSize(8.5)
          .fillColor(bold ? NAVY : BLACK)
          .text(tx(c), x + 4, y + 4, { width: cols[i].w - 8 });
        x += cols[i].w;
      });
      doc.moveTo(ML, y + h).lineTo(ML + PW, y + h).lineWidth(0.4).strokeColor(BORD).stroke();
      doc.y = y + h;
      doc.x = ML;
    };
    drawRow(cols.map((c) => c.label), { bold: true, bg: ZEBRA });
    rows.forEach((r, i) => drawRow(r, { bg: i % 2 ? ZEBRA : null }));
    doc.moveDown(0.5);
  };

  // ── Capa / cabeçalho ───────────────────────────────────────────────────────
  h1('API externa — Documentação');
  doc.font('Helvetica').fontSize(9.5).fillColor(GREY)
    .text(`Endereço base: ${base}    ·    Gerado em ${today}`);
  doc.moveDown(0.8);

  // ── Autenticação ───────────────────────────────────────────────────────────
  h2('1. Autenticação');
  p('Toda requisição precisa de uma credencial, criada em Configurações → API externa. A chave começa com "ind_" e é exibida uma única vez ao ser gerada. Envie-a no header X-API-Key (ou Authorization: Bearer <chave>).');
  code(`curl -H "X-API-Key: SUA_CHAVE" "${base}/health"`);
  p('Cada credencial tem uma lista de rotas liberadas (escopos), um limite de requisições por minuto e, opcionalmente, uma data de expiração. A rota /health é liberada para qualquer credencial válida.');

  h2('2. Formato das respostas');
  p('Sucesso: objeto com "data" (o conteúdo) e, quando houver, "meta" (paginação, filtros aplicados, totais).');
  code('{ "data": [ ... ], "meta": { "start": "2026-08-01", "end": "2026-08-31", "total": 120, "limit": 500, "offset": 0 } }');
  p('Erro: objeto "error" com código e mensagem.');
  code('{ "error": { "code": "scope_denied", "message": "Esta credencial não tem acesso à rota \\"stock\\"." } }');
  table(
    [{ label: 'HTTP', w: 50 }, { label: 'Código', w: 120, mono: true }, { label: 'Quando acontece', w: PW - 170 }],
    [
      ['400', 'bad_request', 'Parâmetro inválido (data fora do formato, agrupamento desconhecido, intervalo acima do máximo).'],
      ['401', 'missing_api_key / invalid_api_key', 'Chave ausente ou não reconhecida.'],
      ['403', 'api_key_disabled / api_key_expired / scope_denied', 'Credencial desativada, expirada ou sem a rota solicitada.'],
      ['404', 'not_found', 'Recurso ou rota inexistente.'],
      ['429', 'rate_limited', 'Limite por minuto atingido. Ver headers X-RateLimit-Limit, X-RateLimit-Remaining e X-RateLimit-Reset.'],
      ['500', 'internal_error', 'Falha interna. Tente novamente; se persistir, avise o administrador.'],
    ]
  );
  small('Convenções: datas no formato YYYY-MM-DD no fuso de São Paulo; "end" é inclusivo. Valores monetários em reais como número decimal (ponto). Listas grandes são paginadas por limit/offset ou page/limit; use "meta.total" para saber quantos registros existem.');

  // ── Rotas ──────────────────────────────────────────────────────────────────
  h2('3. Rotas');
  table(
    [{ label: 'Escopo', w: 90, mono: true }, { label: 'Nome', w: 120 }, { label: 'Descrição', w: PW - 210 }],
    SCOPES.map((s) => [s.key + (s.always ? ' (sempre)' : ''), s.label, s.description])
  );

  SCOPES.forEach((s, idx) => {
    h2(`3.${idx + 1}. ${s.label}`, `escopo: ${s.key}${s.always ? ' · liberado para qualquer credencial' : ''}`);
    p(s.description);
    s.endpoints.forEach((ep) => {
      ensure(40);
      doc.font('Helvetica-Bold').fontSize(9).fillColor(GREEN).text(ep.method, { continued: true });
      doc.font('Courier-Bold').fontSize(9.5).fillColor(BLACK).text(`  ${API_BASE}${ep.path}`);
      doc.font('Helvetica').fontSize(9).fillColor(BLACK).text(tx(ep.summary), { lineGap: 1 });
      doc.moveDown(0.2);
      if (ep.params && ep.params.length) {
        table(
          [{ label: 'Parâmetro', w: 95, mono: true }, { label: 'Tipo', w: 130 }, { label: 'Descrição', w: PW - 225 }],
          ep.params.map((pr) => [pr.name, pr.type, pr.description])
        );
      } else {
        small('Sem parâmetros.');
      }
      code(`curl -H "X-API-Key: SUA_CHAVE" "${base}${ep.path.replace('{orderId}', '123456')}${exampleQuery(ep)}"`);
    });
  });

  // ── Rodapé com numeração ───────────────────────────────────────────────────
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.font('Helvetica').fontSize(8).fillColor(GREY)
      .text(`API externa · ${base}`, ML, PAGE_H - 28, { width: PW / 2, lineBreak: false })
      .text(`Página ${i - range.start + 1} de ${range.count}`, ML + PW / 2, PAGE_H - 28, { width: PW / 2, align: 'right', lineBreak: false });
  }

  doc.end();
  return doc;
}

/** Monta uma query de exemplo com os parâmetros obrigatórios/mais úteis. */
function exampleQuery(ep) {
  const params = ep.params || [];
  const pick = [];
  for (const pr of params) {
    if (/obrigat/i.test(pr.description)) {
      if (pr.name === 'store_id') pick.push('store_id=1');
      else if (pr.name === 'store') pick.push('store=NOME_DA_LOJA');
      else pick.push(`${pr.name}=VALOR`);
    }
  }
  if (params.some((x) => x.name === 'start') && params.some((x) => x.name === 'end')) {
    pick.push('start=2026-01-01', 'end=2026-01-31');
  } else if (params.some((x) => x.name === 'date')) {
    pick.push('date=2026-01-15');
  }
  if (params.some((x) => x.name === 'group_by')) pick.push('group_by=month');
  return pick.length ? `?${pick.join('&')}` : '';
}

module.exports = { createApiDocsPdf };
