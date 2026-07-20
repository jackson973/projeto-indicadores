const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const { syncDayFees } = require('./mlOrderFeesService');
const { getReportData, listMlStoreLabels } = require('./mlProfitReportService');
const { createProfitPdf } = require('./mlProfitPdf');
const { getSaoPauloDate, TZ } = require('../lib/timezone');

/**
 * Job diário do Relatório de Lucro ML (handover, seção 8.4):
 *   1. Para cada loja ML com vendas ontem, busca os valores reais na API do ML
 *   2. Gera o PDF e salva em apps/server/reports/ml-profit/
 *   3. (Opcional) envia por e-mail — defina ML_PROFIT_REPORT_EMAILS no .env
 *      (lista separada por vírgula)
 *
 * Roda às 05:30 (Brasília), após a sincronização do UpSeller já ter trazido
 * as vendas do dia anterior.
 */

const REPORTS_DIR = path.join(__dirname, '../../reports/ml-profit');

function reportFilename(storeLabel, date) {
  const slug = String(storeLabel).replace(/\(.*?\)/g, '').trim().replace(/\s+/g, '_');
  const [y, m, d] = date.split('-');
  return `Lucro_ML_${slug}_${d}-${m}-${y}.pdf`;
}

function savePdf(data, filePath) {
  return new Promise((resolve, reject) => {
    const doc = createProfitPdf(data);
    const out = fs.createWriteStream(filePath);
    doc.pipe(out);
    out.on('finish', resolve);
    out.on('error', reject);
  });
}

async function runDailyProfitReport(date = getSaoPauloDate(-1)) {
  const tag = '[ML Profit Job]';
  console.log(`${tag} Iniciando relatório de ${date}...`);
  fs.mkdirSync(REPORTS_DIR, { recursive: true });

  const stores = await listMlStoreLabels();
  const generated = [];

  for (const { store } of stores) {
    try {
      const sync = await syncDayFees({ store, date });
      const data = await getReportData({ store, date });
      if (!data.totals.pedidos) {
        console.log(`${tag} ${store}: sem vendas em ${date} — pulando`);
        continue;
      }
      const filePath = path.join(REPORTS_DIR, reportFilename(store, date));
      await savePdf(data, filePath);
      generated.push({ store, date, filePath, sync, totals: data.totals });
      console.log(
        `${tag} ${store}: PDF gerado (${data.totals.pedidos} pedidos, ` +
        `lucro R$ ${(data.totals.lucro ?? 0).toFixed(2)}) → ${filePath}`
      );
    } catch (err) {
      console.error(`${tag} ${store}: falha — ${err.message}`);
    }
  }

  await emailReports(generated, date);
  return generated;
}

async function emailReports(generated, date) {
  const recipients = (process.env.ML_PROFIT_REPORT_EMAILS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!recipients.length || !generated.length) return;

  try {
    const { sendEmail } = require('./emailService');
    const [y, m, d] = date.split('-');
    const linhas = generated.map((g) => {
      const nome = g.store.replace(/\(.*?\)/g, '').trim();
      return `<li><b>${nome}</b>: ${g.totals.pedidos} pedidos · ` +
        `Lucro R$ ${(g.totals.lucro ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} · ` +
        `Margem ${(g.totals.margem ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 1 })}%</li>`;
    });
    await sendEmail({
      to: recipients.join(', '),
      subject: `Lucro ML — vendas de ${d}/${m}/${y}`,
      html: `<p>Relatório diário de lucro por venda no Mercado Livre.</p><ul>${linhas.join('')}</ul>`,
      attachments: generated.map((g) => ({
        filename: path.basename(g.filePath),
        path: g.filePath,
      })),
    });
    console.log(`[ML Profit Job] Relatório enviado para ${recipients.join(', ')}`);
  } catch (err) {
    console.error(`[ML Profit Job] Falha ao enviar e-mail: ${err.message}`);
  }
}

function startMlProfitScheduler() {
  cron.schedule('30 5 * * *', () => {
    runDailyProfitReport().catch((err) =>
      console.error('[ML Profit Job] Erro não tratado:', err)
    );
  }, { timezone: TZ });
  console.log('[ML Profit Job] Scheduler ativo — diário às 05:30 (Brasília)');
}

module.exports = { startMlProfitScheduler, runDailyProfitReport, REPORTS_DIR };
