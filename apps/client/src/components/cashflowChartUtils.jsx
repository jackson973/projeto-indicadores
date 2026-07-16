// Utilitários compartilhados do gráfico do Fluxo de Caixa
// (CashFlow.jsx e CashFlowConsolidated.jsx)

const WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

// Dia da semana ("seg", "ter"...) para o dia do mês exibido no eixo X
export const makeWeekdayFor = (year, month) => (dayStr) =>
  WEEKDAYS[new Date(year, month - 1, parseInt(dayStr)).getDay()];

// Tick do eixo X em duas linhas: dia do mês + dia da semana
export const DayTick = ({ x, y, payload, weekdayFor }) => (
  <g transform={`translate(${x},${y})`}>
    <text dy={10} textAnchor="middle" fontSize={11} fill="#666">{payload.value}</text>
    <text dy={21} textAnchor="middle" fontSize={8.5} fill="#999">{weekdayFor(payload.value)}</text>
  </g>
);

// Série acumulada de receitas e despesas por dia do mês (para o modo "Receitas e Despesas")
export function buildCumulativeSeries(entries, year, month) {
  const daysInMonth = new Date(year, month, 0).getDate();
  const perDay = {};
  for (const e of entries) {
    const d = parseInt(String(e.date).slice(8, 10));
    if (!perDay[d]) perDay[d] = { income: 0, expense: 0 };
    perDay[d][e.type === "income" ? "income" : "expense"] += e.amount;
  }
  const out = [];
  let ci = 0, ce = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    ci += perDay[d]?.income || 0;
    ce += perDay[d]?.expense || 0;
    out.push({
      date: String(d).padStart(2, "0"),
      receitas: Number(ci.toFixed(2)),
      despesas: Number(ce.toFixed(2))
    });
  }
  return out;
}

// Offset (0..1) onde a linha de saldo cruza o zero, para o gradiente azul/vermelho.
// O gradiente padrão mapeia o bounding box da linha (min..max dos dados), então
// max/(max-min) posiciona o corte exatamente no valor 0.
export function zeroSplitOffset(values) {
  if (!values.length) return 1;
  const max = Math.max(...values);
  const min = Math.min(...values);
  if (min >= 0) return 1;
  if (max <= 0) return 0;
  return max / (max - min);
}
