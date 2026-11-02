// Testes do painel de ações, sem internet: contas de regras-acoes.js e leitura das respostas das fontes
// (respostas no formato do Yahoo Finance e da brapi.dev, montadas à mão).   node ferramentas/testar-acoes.mjs
import assert from "node:assert/strict";
import * as R from "../area/regras-acoes.js";
import { lerDiario, lerMensal, lerResumo, lerLucros, lerBrapi } from "./acoes-atualizar.mjs";

const hoje = "2026-11-02";
const perto = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);

// Data com: dia útil anterior à data ex (segunda → sexta)
assert.equal(R.diaUtilAnterior("2026-11-02"), "2026-10-30");
assert.equal(R.dataDoDireito({ data_ex: "2026-11-04" }), "2026-11-03");
assert.equal(R.dataDoDireito({ data_com: "2026-10-01", data_ex: "2026-10-02" }), "2026-10-01");

// Ação montada à mão: R$ 1,00 por ano de 2016 a 2025 (dois pagamentos de 0,50), preço R$ 20
const proventos = [];
for (let a = 2016; a <= 2025; a++) proventos.push({ data_com: `${a}-04-10`, valor: 0.5 }, { data_com: `${a}-12-10`, valor: 0.5 });
const acao = { ticker: "TEST3", preco: 20, ind: { lpa: 2, vpa: 10, roe: 0.2, divEbitda: 1, liquidez: 5e7 }, proventos, lucros: [2021, 2022, 2023, 2024].map((ano, k) => ({ ano, lucro: 100 * 1.1 ** k })), historico: { inicio: "2005-01-03" } };

perto(R.mediaProventos5a(acao, hoje), 1);
perto(R.precoTeto(acao, hoje), 1 / 0.06);
perto(R.precoJusto(acao), Math.sqrt(22.5 * 2 * 10));
const i = R.indicadores(acao, hoje);
perto(i.pl, 10); perto(i.pvp, 2);
perto(i.dy12m, 0.5 / 20); // só o pagamento de 10/12/2025 cai nos últimos 12 meses
perto(i.dy5a, 0.05);
perto(i.cagrLucro, 0.1, 1e-9);
const c = R.confiabilidade(acao, hoje);
assert.equal(c.nota, 100, JSON.stringify(c.partes));
assert.equal(c.nivel, "alta");

// Corte de proventos e prejuízo derrubam a nota; preço acima do teto
const ruim = { ...acao, preco: 30, proventos: proventos.filter((p) => !p.data_com.startsWith("2020") && !p.data_com.startsWith("2021")), lucros: [{ ano: 2023, lucro: 100 }, { ano: 2024, lucro: -50 }], ind: { ...acao.ind, roe: 0.05, divEbitda: 4 } };
const cr = R.confiabilidade(ruim, hoje);
assert.ok(cr.nota < 75, `nota ${cr.nota}`);
assert.equal(R.zonaReferencia(ruim, hoje).zona, "acima");
// Teto de R$ 16,67: 20 acima, 17,50 perto (até 10% acima), 16 abaixo
assert.equal(R.zonaReferencia(acao, hoje).zona, "acima");
assert.equal(R.zonaReferencia({ ...acao, preco: 17.5 }, hoje).zona, "perto");
assert.equal(R.zonaReferencia({ ...acao, preco: 16 }, hoje).zona, "abaixo");
const sug = R.alvosSugeridos(acao, hoje);
perto(sug.compra, 16.67, 0.001); perto(sug.venda, 25.46, 0.001); // o maior entre 16,67 × 1,4 = 23,33 e 21,21 × 1,2 = 25,46

// Alvos da pessoa
assert.equal(R.situacaoAlvo(19, { preco_compra: 20, preco_venda: 30 }).tipo, "compra");
assert.equal(R.situacaoAlvo(31, { preco_compra: 20, preco_venda: 30 }).tipo, "venda");
assert.equal(R.situacaoAlvo(25, { preco_compra: 20, preco_venda: 30 }).texto, "faltam 20% para a compra");
assert.equal(R.situacaoAlvo(25, {}).tipo, "sem");
const al = R.alertasDoDia([{ ticker: "TEST3", alertar: true, preco_venda: 19 }, { ticker: "XPTO3", alertar: true }, { ticker: "TEST3", alertar: false }], [acao], hoje);
assert.deepEqual(al.map((a) => [a.ticker, a.tipo]), [["TEST3", "venda"], ["XPTO3", "sem"]]);

// Banco: dívida/EBITDA fica de fora da nota
const banco = { ...acao, ticker: "ITUB4", ind: { ...acao.ind, divEbitda: 9 } };
assert.ok(!R.confiabilidade(banco, hoje).partes.some((p) => p.nome === "Endividamento"));
assert.equal(R.indicadores(banco, hoje).divEbitda, null);

// ---------------- leitura das fontes
const t0 = Date.parse("2024-11-04T13:00:00Z") / 1000;
const ts = [], close = [], volume = [];
for (let d = 0; d < 520; d++) { ts.push(t0 + d * 86400 * 1.4); close.push(10 + d * 0.01); volume.push(1e6); }
const diario = lerDiario({ chart: { result: [{ meta: { regularMarketPrice: 15.3, regularMarketTime: ts.at(-1), longName: "Teste SA", firstTradeDate: 946900800 }, timestamp: ts, indicators: { quote: [{ close, volume }] } }] } });
perto(diario.preco, 15.3);
assert.equal(diario.inicio, "2000-01-03");
perto(diario.variacao, 15.3 / close.at(-2) - 1, 1e-9);
assert.ok(diario.min52 < diario.max52 && diario.mm200 > 0 && diario.liquidez > 1e7 && diario.semanal.length > 40);

const mensal = lerMensal({ chart: { result: [{ timestamp: [1e9, 1.1e9], indicators: { quote: [{ close: [5, 6] }] }, events: { dividends: { 1700000000: { amount: 0.4321, date: 1700000000 }, 1600000000: { amount: 0, date: 1600000000 } } } }] } });
assert.deepEqual(mensal.proventos, [{ data_ex: "2023-11-14", valor: 0.4321 }]);

// Balanço em dólar: o LPA do Yahoo não bate com o P/L e é refeito pelo preço
const resumo = lerResumo({ quoteSummary: { result: [{ summaryDetail: { trailingPE: { raw: 8 }, payoutRatio: { raw: 0.6 }, marketCap: { raw: 3e11 } }, defaultKeyStatistics: { trailingEps: { raw: 1.2 }, bookValue: { raw: 40 }, priceToBook: { raw: 1.5 }, enterpriseToEbitda: { raw: 4 } }, financialData: { returnOnEquity: { raw: 0.18 }, profitMargins: { raw: 0.2 }, totalDebt: { raw: 100 }, totalCash: { raw: 40 }, ebitda: { raw: 30 } }, assetProfile: { sector: "Basic Materials" }, price: { longName: "Mineradora" } }] } }, 60);
perto(resumo.ind.lpa, 7.5); perto(resumo.ind.vpa, 40); perto(resumo.ind.divEbitda, 2);
assert.equal(resumo.setor, "Basic Materials");

assert.deepEqual(lerLucros({ timeseries: { result: [{ meta: {}, annualNetIncome: [{ asOfDate: "2023-12-31", reportedValue: { raw: 5 } }, null, { asOfDate: "2024-12-31", reportedValue: { raw: 6 } }] }] } }), [{ ano: 2023, lucro: 5 }, { ano: 2024, lucro: 6 }]);

const b = lerBrapi({ results: [{ longName: "X", dividendsData: { cashDividends: [{ rate: 0.8, label: "JCP", lastDatePrior: "2025-12-22T00:00:00.000Z", paymentDate: "2026-01-15T00:00:00.000Z" }, { rate: 1.1, label: "DIVIDENDO", lastDatePrior: "2025-06-02T00:00:00.000Z", paymentDate: null }] } }] });
assert.deepEqual(b.proventos, [{ data_com: "2025-06-02", pagamento: null, valor: 1.1, tipo: "Dividendo" }, { data_com: "2025-12-22", pagamento: "2026-01-15", valor: 0.8, tipo: "JCP" }]);

console.log("Testes do painel de ações: tudo certo.");
