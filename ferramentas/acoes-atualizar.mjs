// Rotina diária do painel de ações (executada pelo GitHub Actions, de segunda a sexta, depois do fechamento da B3).
// 1. Busca, para as principais ações e para as que alguém acompanha, a cotação, o histórico de preços, os proventos
//    (dividendos e JCP, com as datas) e os indicadores do último balanço.
// 2. Grava tudo na tabela acoes_mercado do Supabase (a página Ações lê de lá).
// 3. Manda a cada pessoa que ligou o alerta um e-mail com a cotação do dia das ações dela e as que entraram na zona
//    de compra ou de venda (os alvos são os que a pessoa definiu na página).
//
// Fontes gratuitas, sem cadastro: Yahoo Finance (cotação, histórico, proventos e indicadores). Se houver o segredo
// BRAPI_TOKEN (plano gratuito da brapi.dev), os proventos vêm de lá, com data com, data de pagamento e tipo (JCP ou
// dividendo), e o histórico de lucros fica mais longo. Uma fonte que falhar não impede as outras.
//
// Teste local, sem internet, sem banco e sem envio (usa os dados de exemplo):  node ferramentas/acoes-atualizar.mjs --teste
// Só atualizar os dados, sem e-mail:                                            node ferramentas/acoes-atualizar.mjs --sem-email

import { ACOES_PADRAO, alertasDoDia, codigoValido, deLinha, normalizarCodigo } from "../area/regras-acoes.js";
import { ACOES_EXEMPLO } from "../area/acoes-exemplo.js";

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: CHAVE, RESEND_API_KEY, ALERTA_EMAIL, ALERTA_REMETENTE, ALERTA_LINK, BRAPI_TOKEN } = process.env;
const TESTE = process.argv.includes("--teste");
const SEM_EMAIL = process.argv.includes("--sem-email");
const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const NAVEGADOR = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const isoDe = (seg) => new Date(seg * 1000).toISOString().slice(0, 10);
const raw = (o) => (o && typeof o === "object" ? (Number.isFinite(o.raw) ? o.raw : null) : Number.isFinite(o) ? o : null);

// ---------------------------------------------------------------- Supabase
async function rest(caminho, opcoes = {}) {
  const resposta = await fetch(`${SUPABASE_URL}/rest/v1/${caminho}`, {
    ...opcoes,
    headers: {
      apikey: CHAVE,
      ...(CHAVE.startsWith("sb_") ? {} : { Authorization: `Bearer ${CHAVE}` }),
      "Content-Type": "application/json",
      ...(opcoes.headers || {}),
    },
  });
  if (!resposta.ok) throw new Error(`Supabase ${resposta.status}: ${await resposta.text()}`);
  return resposta.status === 204 || resposta.status === 201 ? null : resposta.json();
}

// ---------------------------------------------------------------- Yahoo Finance
let sessaoYahoo = null; // { cookie, crumb }: os indicadores (quoteSummary) pedem o "crumb" de uma visita
async function prepararYahoo() {
  if (sessaoYahoo) return sessaoYahoo;
  sessaoYahoo = { cookie: "", crumb: "" };
  try {
    const r = await fetch("https://fc.yahoo.com/", { headers: { "User-Agent": NAVEGADOR }, redirect: "manual" });
    const cookies = (r.headers.getSetCookie ? r.headers.getSetCookie() : [r.headers.get("set-cookie") || ""]).map((c) => c.split(";")[0]).filter(Boolean);
    sessaoYahoo.cookie = cookies.join("; ");
    const c = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", { headers: { "User-Agent": NAVEGADOR, Cookie: sessaoYahoo.cookie } });
    const texto = c.ok ? (await c.text()).trim() : "";
    if (texto && !/[<{]/.test(texto)) sessaoYahoo.crumb = texto;
  } catch (e) {
    console.warn("Yahoo: sem sessão para os indicadores:", e.message);
  }
  return sessaoYahoo;
}

async function yahoo(url) {
  const s = await prepararYahoo();
  const comCrumb = s.crumb ? `${url}${url.includes("?") ? "&" : "?"}crumb=${encodeURIComponent(s.crumb)}` : url;
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    const r = await fetch(comCrumb, { headers: { "User-Agent": NAVEGADOR, ...(s.cookie ? { Cookie: s.cookie } : {}) } });
    if (r.ok) return r.json();
    if (r.status !== 429 && r.status < 500) throw new Error(`Yahoo ${r.status}`);
    await esperar(1500 * tentativa);
  }
  throw new Error("Yahoo indisponível");
}

// Preços diários de 2 anos (cotação, mínima e máxima de 52 semanas, média de 200 dias, liquidez, variação)
export function lerDiario(json) {
  const r = json && json.chart && json.chart.result && json.chart.result[0];
  if (!r || !r.timestamp) throw new Error("sem histórico diário");
  const q = r.indicators.quote[0];
  const barras = r.timestamp.map((t, i) => ({ data: isoDe(t), fecha: q.close[i], volume: q.volume[i] })).filter((b) => Number.isFinite(b.fecha));
  if (!barras.length) throw new Error("sem cotações");
  const ult = barras[barras.length - 1];
  const preco = Number.isFinite(r.meta.regularMarketPrice) ? r.meta.regularMarketPrice : ult.fecha;
  const dataPreco = r.meta.regularMarketTime ? isoDe(r.meta.regularMarketTime) : ult.data;
  const ano = barras.filter((b) => b.data > isoDe(Date.parse(dataPreco) / 1000 - 365 * 86400));
  const anterior = barras.length > 1 ? (ult.data === dataPreco ? barras[barras.length - 2].fecha : ult.fecha) : null;
  const mm = barras.slice(-200);
  const liq = barras.slice(-60).filter((b) => Number.isFinite(b.volume));
  return {
    preco,
    data_preco: dataPreco,
    variacao: anterior ? preco / anterior - 1 : null,
    nome: r.meta.longName || r.meta.shortName || null,
    inicio: r.meta.firstTradeDate ? isoDe(r.meta.firstTradeDate) : null,
    min52: Math.min(...ano.map((b) => b.fecha)),
    max52: Math.max(...ano.map((b) => b.fecha)),
    mm200: mm.length >= 150 ? mm.reduce((t, b) => t + b.fecha, 0) / mm.length : null,
    ret12m: ano.length > 200 ? preco / ano[0].fecha - 1 : null,
    liquidez: liq.length ? liq.reduce((t, b) => t + b.fecha * b.volume, 0) / liq.length : null,
    // Últimos 12 meses, uma cotação por semana, para o gráfico da página
    semanal: ano.filter((_, i) => i % 5 === 0 || i === ano.length - 1).map((b) => [b.data, Math.round(b.fecha * 100) / 100]),
  };
}

// Histórico mensal desde o início: retorno de 5 anos e todos os proventos (data ex e valor por ação)
export function lerMensal(json) {
  const r = json && json.chart && json.chart.result && json.chart.result[0];
  if (!r) throw new Error("sem histórico mensal");
  const div = (r.events && r.events.dividends) || {};
  const proventos = Object.values(div)
    .map((d) => ({ data_ex: isoDe(d.date), valor: Math.round(d.amount * 1e6) / 1e6 }))
    .filter((p) => p.valor > 0)
    .sort((a, b) => a.data_ex.localeCompare(b.data_ex));
  const fech = (r.timestamp || []).map((t, i) => [isoDe(t), r.indicators.quote[0].close[i]]).filter(([, c]) => Number.isFinite(c));
  const ha5 = fech.length > 61 ? fech[fech.length - 61][1] : null;
  return {
    proventos,
    ret5a: ha5 ? fech[fech.length - 1][1] / ha5 - 1 : null,
    inicio: fech.length ? fech[0][0] : null,
  };
}

// Indicadores do último balanço (lucro e patrimônio por ação, ROE, margem, dívida, EBITDA, setor)
export function lerResumo(json, preco) {
  const r = json && json.quoteSummary && json.quoteSummary.result && json.quoteSummary.result[0];
  if (!r) throw new Error("sem indicadores");
  const sd = r.summaryDetail || {}, ks = r.defaultKeyStatistics || {}, fd = r.financialData || {}, ap = r.assetProfile || {}, pr = r.price || {};
  let lpa = raw(ks.trailingEps), vpa = raw(ks.bookValue);
  const pl = raw(sd.trailingPE), pvp = raw(ks.priceToBook);
  // Empresas que publicam o balanço em dólar (ex.: Vale): o LPA e o VPA vêm em outra moeda. Quando não batem com o
  // P/L e o P/VP do próprio Yahoo, valem os múltiplos (que não dependem da moeda).
  if (preco && pl > 0 && (!lpa || Math.abs(preco / lpa / pl - 1) > 0.3)) lpa = preco / pl;
  if (preco && pvp > 0 && (!vpa || Math.abs(preco / vpa / pvp - 1) > 0.3)) vpa = preco / pvp;
  const divida = raw(fd.totalDebt), caixa = raw(fd.totalCash), ebitda = raw(fd.ebitda);
  return {
    nome: pr.longName || pr.shortName || null,
    setor: ap.sector || null,
    ind: {
      pl, pvp, lpa, vpa,
      roe: raw(fd.returnOnEquity),
      margem: raw(fd.profitMargins),
      divEbitda: divida != null && ebitda > 0 ? (divida - (caixa || 0)) / ebitda : null,
      evEbitda: raw(ks.enterpriseToEbitda),
      payout: raw(sd.payoutRatio),
      valorMercado: raw(sd.marketCap) ?? raw(pr.marketCap),
      beta: raw(sd.beta),
    },
  };
}

// Lucro líquido anual (os últimos 4 ou 5 balanços)
export function lerLucros(json) {
  const res = (json && json.timeseries && json.timeseries.result) || [];
  const serie = res.find((x) => Array.isArray(x.annualNetIncome));
  if (!serie) return [];
  return serie.annualNetIncome
    .filter((x) => x && x.asOfDate && x.reportedValue && Number.isFinite(x.reportedValue.raw))
    .map((x) => ({ ano: Number(x.asOfDate.slice(0, 4)), lucro: x.reportedValue.raw }));
}

// ---------------------------------------------------------------- brapi.dev (opcional)
export function lerBrapi(json) {
  const r = json && json.results && json.results[0];
  if (!r) throw new Error("sem resultado");
  const dias = (v) => (v ? String(v).slice(0, 10) : null);
  const proventos = ((r.dividendsData && r.dividendsData.cashDividends) || [])
    .map((d) => ({ data_com: dias(d.lastDatePrior), pagamento: dias(d.paymentDate), valor: Number(d.rate), tipo: tipoProvento(d.label) }))
    .filter((p) => p.data_com && p.valor > 0)
    .sort((a, b) => a.data_com.localeCompare(b.data_com));
  const dre = (r.incomeStatementHistory && r.incomeStatementHistory.incomeStatementHistory) || [];
  const lucros = dre.filter((x) => x.endDate && Number.isFinite(Number(x.netIncome))).map((x) => ({ ano: Number(String(x.endDate).slice(0, 4)), lucro: Number(x.netIncome) }));
  return { proventos, lucros, setor: (r.summaryProfile && r.summaryProfile.sector) || null, nome: r.longName || null };
}
const tipoProvento = (l) => (/jcp|juros/i.test(l || "") ? "JCP" : /rend/i.test(l || "") ? "Rendimento" : "Dividendo");

async function brapi(ticker) {
  const base = `https://brapi.dev/api/quote/${ticker}?token=${encodeURIComponent(BRAPI_TOKEN)}&dividends=true`;
  for (const url of [`${base}&modules=summaryProfile,incomeStatementHistory`, base]) {
    const r = await fetch(url, { headers: { "User-Agent": NAVEGADOR } });
    if (r.ok) return lerBrapi(await r.json());
  }
  throw new Error("brapi recusou o pedido");
}

// Junta proventos iguais (mesma data e valor) e mantém os 15 anos mais recentes
function juntarProventos(lista) {
  const vistos = new Map();
  for (const p of lista) vistos.set(`${p.data_com || p.data_ex}|${p.valor.toFixed(6)}`, p);
  const limite = `${Number(hoje.slice(0, 4)) - 15}`;
  return [...vistos.values()].filter((p) => (p.data_com || p.data_ex) >= limite).sort((a, b) => (a.data_com || a.data_ex).localeCompare(b.data_com || b.data_ex));
}

// ---------------------------------------------------------------- uma ação
async function buscarAcao(ticker) {
  const s = `${ticker}.SA`;
  const avisos = [], fontes = [];
  const diario = lerDiario(await yahoo(`https://query1.finance.yahoo.com/v8/finance/chart/${s}?range=2y&interval=1d`));
  fontes.push("Yahoo Finance");
  let mensal = { proventos: [], ret5a: null, inicio: null };
  try {
    mensal = lerMensal(await yahoo(`https://query1.finance.yahoo.com/v8/finance/chart/${s}?range=max&interval=1mo&events=div`));
  } catch (e) { avisos.push(`proventos: ${e.message}`); }
  let resumo = { ind: {} };
  try {
    resumo = lerResumo(await yahoo(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${s}?modules=summaryDetail,defaultKeyStatistics,financialData,assetProfile,price`), diario.preco);
  } catch (e) { avisos.push(`indicadores: ${e.message}`); }
  let lucros = [];
  try {
    const p1 = Math.floor(Date.now() / 1000) - 11 * 365 * 86400;
    lucros = lerLucros(await yahoo(`https://query1.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${s}?symbol=${s}&type=annualNetIncome&period1=${p1}&period2=${Math.floor(Date.now() / 1000)}`));
  } catch (e) { avisos.push(`lucros: ${e.message}`); }
  let proventos = mensal.proventos;
  let extra = null;
  if (BRAPI_TOKEN) {
    try {
      extra = await brapi(ticker);
      fontes.push("brapi.dev");
      if (extra.proventos.length) proventos = extra.proventos;
      if (extra.lucros.length > lucros.length) lucros = extra.lucros;
    } catch (e) { avisos.push(`brapi: ${e.message}`); }
  }
  return {
    ticker,
    nome: resumo.nome || diario.nome || (extra && extra.nome) || ticker,
    setor: resumo.setor || (extra && extra.setor) || null,
    preco: Math.round(diario.preco * 100) / 100,
    variacao: diario.variacao,
    atualizado_em: new Date().toISOString(),
    dados: {
      data_preco: diario.data_preco,
      ind: { ...resumo.ind, liquidez: diario.liquidez },
      proventos: juntarProventos(proventos),
      lucros: lucros.sort((a, b) => a.ano - b.ano),
      historico: {
        inicio: [diario.inicio, mensal.inicio].filter(Boolean).sort()[0] || null,
        min52: diario.min52, max52: diario.max52, mm200: diario.mm200,
        ret12m: diario.ret12m, ret5a: mensal.ret5a, semanal: diario.semanal,
      },
      fontes, avisos,
    },
  };
}

// ---------------------------------------------------------------- e-mail
const escapar = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const brl = (v) => (v == null ? "—" : v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));
const pct = (v) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${(v * 100).toFixed(2).replace(".", ",")}%`);
const dataBR = (iso) => iso.split("-").reverse().join("/");
// Link do painel a partir do ALERTA_LINK (que costuma apontar para area/art.html)
function linkPainel() {
  if (!ALERTA_LINK) return "";
  try {
    const u = new URL(ALERTA_LINK);
    return new URL(u.pathname.includes("/area/") ? "acoes.html" : "area/acoes.html", u.pathname.includes("/area/") ? u : `${u.origin}${u.pathname.replace(/\/?$/, "/")}`).href;
  } catch { return ""; }
}

export function montarEmail(nome, alertas) {
  const compra = alertas.filter((a) => a.tipo === "compra"), venda = alertas.filter((a) => a.tipo === "venda");
  const destaque = [compra.length ? `${compra.length} na zona de compra` : "", venda.length ? `${venda.length} na zona de venda` : ""].filter(Boolean).join(", ");
  const assunto = `Ações: ${destaque || "cotação do dia"} – ${dataBR(hoje)}`;
  const linha = (a) => `${a.ticker} ${brl(a.preco)} (${pct(a.variacao)}) – ${a.texto}${a.acompanhamento.preco_compra ? ` · compra até ${brl(a.acompanhamento.preco_compra)}` : ""}${a.acompanhamento.preco_venda ? ` · venda a partir de ${brl(a.acompanhamento.preco_venda)}` : ""}`;
  const texto = [`Olá${nome ? `, ${nome}` : ""}. Cotação de fechamento de ${dataBR(hoje)}:`, "", ...alertas.map((a) => `• ${linha(a)}`), "",
    "Informativo: os alvos são os que você definiu; não é recomendação de compra ou venda.", linkPainel() ? `Painel: ${linkPainel()}` : ""].join("\n");
  const cor = { compra: "#2e7d32", venda: "#c62828", entre: "#5f646b", sem: "#8a8f96" };
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;color:#1e2125">
    <p>Olá${nome ? `, ${escapar(nome)}` : ""}. Cotação de fechamento de <b>${dataBR(hoje)}</b>:</p>
    <table style="border-collapse:collapse;font-size:14px">
      <tr style="text-align:left;border-bottom:2px solid #f5b800"><th style="padding:6px 10px">Ação</th><th style="padding:6px 10px">Preço</th><th style="padding:6px 10px">Dia</th><th style="padding:6px 10px">Situação</th><th style="padding:6px 10px">Seus alvos</th><th style="padding:6px 10px">Nota</th></tr>
      ${alertas.map((a) => `<tr style="border-bottom:1px solid #e5e7ea">
        <td style="padding:6px 10px"><b>${escapar(a.ticker)}</b><br><small>${escapar(a.nome || "")}</small></td>
        <td style="padding:6px 10px">${brl(a.preco)}</td>
        <td style="padding:6px 10px;color:${(a.variacao || 0) >= 0 ? "#2e7d32" : "#c62828"}">${pct(a.variacao)}</td>
        <td style="padding:6px 10px;color:${cor[a.tipo]};font-weight:bold">${escapar(a.texto)}</td>
        <td style="padding:6px 10px">${a.acompanhamento.preco_compra ? `compra ≤ ${brl(a.acompanhamento.preco_compra)}<br>` : ""}${a.acompanhamento.preco_venda ? `venda ≥ ${brl(a.acompanhamento.preco_venda)}` : ""}</td>
        <td style="padding:6px 10px">${a.nota ?? "—"}</td></tr>`).join("")}
    </table>
    <p style="color:#5f646b;font-size:13px">Informativo, com dados públicos e gratuitos (podem ter atraso ou erro). Os alvos são os que você definiu no painel; não é recomendação de compra ou venda.</p>
    ${linkPainel() ? `<p><a href="${escapar(linkPainel())}">Abrir o painel de ações</a></p>` : ""}
  </div>`;
  return { assunto, texto, html };
}

async function enviar(para, email) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: ALERTA_REMETENTE || "Área restrita <onboarding@resend.dev>", to: [para], subject: email.assunto, text: email.texto, html: email.html }),
  });
  if (!r.ok) throw new Error(`Resend ${r.status}: ${await r.text()}`);
}

// ---------------------------------------------------------------- principal
async function principal() {
  if (TESTE) {
    const mercado = ACOES_EXEMPLO.map(deLinha);
    const acomp = [
      { ticker: "TAEE11", alertar: true, preco_compra: 40, preco_venda: 48 },
      { ticker: "BBAS3", alertar: true, preco_compra: 30, preco_venda: null },
      { ticker: "WEGE3", alertar: true, preco_compra: 35, preco_venda: 45 },
    ];
    const email = montarEmail("Marcos", alertasDoDia(acomp, mercado, hoje));
    console.log(email.assunto + "\n\n" + email.texto);
    return;
  }
  if (!SUPABASE_URL || !CHAVE) throw new Error("Faltam os segredos SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");

  const acompanhamentos = await rest("acoes_acompanhamento?select=*");
  const codigos = [...new Set([...ACOES_PADRAO, ...acompanhamentos.map((a) => normalizarCodigo(a.ticker))])].filter(codigoValido);
  console.log(`Atualizando ${codigos.length} ações…`);
  const linhas = [], falhas = [];
  for (const t of codigos) {
    try {
      const l = await buscarAcao(t);
      linhas.push(l);
      console.log(`✓ ${t} ${l.preco} · ${l.dados.proventos.length} proventos · ${l.dados.lucros.length} balanços${l.dados.avisos.length ? ` · avisos: ${l.dados.avisos.join("; ")}` : ""}`);
    } catch (e) {
      falhas.push(t);
      console.warn(`✗ ${t}: ${e.message}`);
    }
    await esperar(350);
  }
  if (linhas.length) await rest("acoes_mercado?on_conflict=ticker", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify(linhas) });
  console.log(`Gravadas ${linhas.length} ações${falhas.length ? `; sem dados hoje: ${falhas.join(", ")}` : ""}.`);
  if (!linhas.length) throw new Error("Nenhuma ação foi atualizada: confira se as fontes de dados estão no ar.");

  if (SEM_EMAIL) return;
  // Pregão fechado (feriado): nenhuma cotação de hoje, nada de e-mail
  if (!linhas.some((l) => l.dados.data_preco === hoje)) {
    console.log("Sem pregão hoje: e-mails não enviados.");
    return;
  }
  if (!RESEND_API_KEY) {
    console.log("Sem RESEND_API_KEY: e-mails não enviados.");
    return;
  }
  const mercado = (await rest("acoes_mercado?select=*")).map(deLinha);
  const perfis = await rest("perfis?select=id,nome,email,situacao");
  const porPerfil = new Map();
  for (const a of acompanhamentos.filter((x) => x.alertar)) porPerfil.set(a.perfil_id, [...(porPerfil.get(a.perfil_id) || []), a]);
  for (const [perfilId, lista] of porPerfil) {
    const p = perfis.find((x) => x.id === perfilId);
    if (!p || p.situacao !== "ativo") continue;
    const para = p.email || ALERTA_EMAIL;
    if (!para) continue;
    const email = montarEmail((p.nome || "").split(" ")[0], alertasDoDia(lista, mercado, hoje));
    await enviar(para, email);
    console.log(`E-mail enviado para ${para.replace(/(.).*@/, "$1…@")}: ${email.assunto}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  principal().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
