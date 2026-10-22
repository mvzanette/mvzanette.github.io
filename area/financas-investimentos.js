// Investimentos individuais (aba Investimentos de Finanças pessoais): os investimentos de cada pessoa, um a um, com o
// tipo (CDB, LCI, LCA, Tesouro, fundos, previdência, ações, cripto...), o indexador, a taxa e o vencimento. O saldo
// de cada mês vem de "Atualizar saldos"; o rendimento do mês é o informado ou a diferença entre os saldos, tirando
// o que foi aplicado e somando o que foi resgatado. Aplicar e resgatar podem lançar a saída ou a entrada no caixa.
// Ficam nas preferências do painel (financas_preferencias.investimentos), separados da carteira conjunta do projeto.
// Nenhum dado pessoal aqui: os investimentos, os nomes e os valores vêm do banco.
import { $, esc, avisar, numeroDigitado } from "./ui.js";

// Classes na ordem fixa das cores do gráfico (a última, "Outros", é neutra)
export const CLASSES = [
  { id: "bancaria", nome: "Renda fixa bancária", cor: "#2a78d6" },
  { id: "credito", nome: "Crédito privado", cor: "#eb6834" },
  { id: "tesouro", nome: "Tesouro Direto", cor: "#1baf7a" },
  { id: "fundos", nome: "Fundos", cor: "#eda100" },
  { id: "previdencia", nome: "Previdência", cor: "#e87ba4" },
  { id: "variavel", nome: "Renda variável", cor: "#008300" },
  { id: "cripto", nome: "Criptoativos", cor: "#6250d6" },
  { id: "outros", nome: "Outros", cor: "#8a8f96" },
];

// Tipos de investimento. isento: sem imposto de renda para pessoa física; indexador: o mais comum, para começar
export const TIPOS = [
  { id: "cdb", nome: "CDB", classe: "bancaria" },
  { id: "rdb", nome: "RDB", classe: "bancaria" },
  { id: "lci", nome: "LCI", classe: "bancaria", isento: true },
  { id: "lca", nome: "LCA", classe: "bancaria", isento: true },
  { id: "lc", nome: "LC (Letra de Câmbio)", classe: "bancaria" },
  { id: "lf", nome: "Letra Financeira", classe: "bancaria" },
  { id: "lig", nome: "LIG", classe: "bancaria", isento: true },
  { id: "poupanca", nome: "Poupança", classe: "bancaria", isento: true, indexador: "outro" },
  { id: "conta", nome: "Conta remunerada ou caixinha", classe: "bancaria", indexador: "cdi" },
  { id: "cra", nome: "CRA", classe: "credito", isento: true },
  { id: "cri", nome: "CRI", classe: "credito", isento: true },
  { id: "debenture", nome: "Debênture", classe: "credito" },
  { id: "debenture_inc", nome: "Debênture incentivada", classe: "credito", isento: true },
  { id: "tesouro_selic", nome: "Tesouro Selic", classe: "tesouro", indexador: "selic" },
  { id: "tesouro_pre", nome: "Tesouro Prefixado", classe: "tesouro", indexador: "pre" },
  { id: "tesouro_pre_juros", nome: "Tesouro Prefixado com juros semestrais", classe: "tesouro", indexador: "pre" },
  { id: "tesouro_ipca", nome: "Tesouro IPCA+", classe: "tesouro", indexador: "ipca" },
  { id: "tesouro_ipca_juros", nome: "Tesouro IPCA+ com juros semestrais", classe: "tesouro", indexador: "ipca" },
  { id: "tesouro_renda", nome: "Tesouro Renda+", classe: "tesouro", indexador: "ipca" },
  { id: "tesouro_educa", nome: "Tesouro Educa+", classe: "tesouro", indexador: "ipca" },
  { id: "fundo_rf", nome: "Fundo de renda fixa ou DI", classe: "fundos", indexador: "cdi" },
  { id: "fundo_multi", nome: "Fundo multimercado", classe: "fundos", indexador: "variavel" },
  { id: "fundo_acoes", nome: "Fundo de ações", classe: "fundos", indexador: "variavel" },
  { id: "fundo_cambial", nome: "Fundo cambial", classe: "fundos", indexador: "variavel" },
  { id: "pgbl", nome: "Previdência PGBL", classe: "previdencia", indexador: "cdi" },
  { id: "vgbl", nome: "Previdência VGBL", classe: "previdencia", indexador: "cdi" },
  { id: "acoes", nome: "Ações", classe: "variavel", indexador: "variavel" },
  { id: "fii", nome: "Fundo imobiliário (FII)", classe: "variavel", indexador: "variavel" },
  { id: "fiagro", nome: "Fiagro", classe: "variavel", indexador: "variavel" },
  { id: "etf", nome: "ETF", classe: "variavel", indexador: "variavel" },
  { id: "bdr", nome: "BDR", classe: "variavel", indexador: "variavel" },
  { id: "coe", nome: "COE", classe: "outros", indexador: "outro" },
  { id: "cripto", nome: "Criptoativos", classe: "cripto", indexador: "variavel" },
  { id: "ouro", nome: "Ouro", classe: "outros", indexador: "variavel" },
  { id: "outro", nome: "Outro", classe: "outros", indexador: "outro" },
];
export const INDEXADORES = { cdi: "CDI (pós-fixado)", pre: "Prefixado", ipca: "IPCA+", selic: "Selic", variavel: "Renda variável", outro: "Outro" };
const NOME_INDEXADOR = { ...INDEXADORES, nao: "Não informado" };

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const tipoDe = (id) => TIPOS.find((t) => t.id === id) || TIPOS.at(-1);
const classeDe = (id) => CLASSES.find((c) => c.id === tipoDe(id).classe) || CLASSES.at(-1);
const centavos = (v) => Math.round(v * 100) / 100;
const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const n2 = (v) => Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (v) => `${v < 0 ? "−" : ""}${(Math.abs(v) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
const brlSinal = (v) => `${v < 0 ? "−" : ""}${brl(Math.abs(v))}`;
const rotuloMes = (chave) => `${MESES[Number(chave.slice(5, 7)) - 1]}/${chave.slice(2, 4)}`;
const somarMes = (chave, k) => { const [a, m] = chave.split("-").map(Number); const t = a * 12 + m - 1 + k; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`; };
const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const dataBR = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
const semAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Tipo, indexador, taxa e vencimento pelo nome como o banco mostra ("LCA BANCO X CDI 87.5% 27/08/2030",
// "Tesouro IPCA+ com Juros Semestrais 2035", "CDB BANCO Y PRE 14.2% 14/10/2027")
export function detectar(nome) {
  const s = semAcento(nome);
  const r = {};
  const tem = (re) => re.test(s);
  if (tem(/^tesouro/)) {
    r.tipo = tem(/educa/) ? "tesouro_educa" : tem(/renda\s*\+|renda mais/) ? "tesouro_renda" : tem(/ipca/) ? (tem(/juros/) ? "tesouro_ipca_juros" : "tesouro_ipca")
      : tem(/selic/) ? "tesouro_selic" : tem(/prefixado/) ? (tem(/juros/) ? "tesouro_pre_juros" : "tesouro_pre") : "tesouro_selic";
  } else {
    const primeira = s.split(/\s+/)[0];
    const porSigla = { cdb: "cdb", rdb: "rdb", lci: "lci", lca: "lca", lc: "lc", lf: "lf", lig: "lig", cra: "cra", cri: "cri", deb: "debenture", coe: "coe", btc: "cripto", eth: "cripto" };
    if (porSigla[primeira]) r.tipo = porSigla[primeira];
    else if (tem(/debenture/)) r.tipo = tem(/incentivad/) ? "debenture_inc" : "debenture";
    else if (tem(/vgbl/)) r.tipo = "vgbl";
    else if (tem(/pgbl/)) r.tipo = "pgbl";
    else if (tem(/previd/)) r.tipo = "vgbl";
    else if (tem(/poupanca/)) r.tipo = "poupanca";
    else if (tem(/bitcoin|cripto|ethereum/)) r.tipo = "cripto";
    else if (tem(/multimercado/)) r.tipo = "fundo_multi";
    else if (tem(/fundo|fic |fi /) && tem(/acoes/)) r.tipo = "fundo_acoes";
    else if (tem(/fundo|fic |fi |referenciado/)) r.tipo = "fundo_rf";
    else if (/^[a-z]{4}11$/.test(primeira)) r.tipo = "fii";
    else if (/^[a-z]{4}3[2-5]$/.test(primeira)) r.tipo = "bdr";
    else if (/^[a-z]{4}([3-8])$/.test(primeira)) r.tipo = "acoes";
  }
  if (tem(/\bipca\b/)) r.indexador = "ipca";
  else if (tem(/\bpre\b|prefixado/)) r.indexador = "pre";
  else if (tem(/\bselic\b/)) r.indexador = "selic";
  else if (tem(/\bcdi\b|\bdi\b/)) r.indexador = "cdi";
  else if (r.tipo) r.indexador = tipoDe(r.tipo).indexador || null;
  const taxa = String(nome || "").match(/(\d+(?:[.,]\d+)?)\s*%/);
  if (taxa) {
    const v = taxa[1].replace(".", ",");
    r.taxa = r.indexador === "cdi" ? `${v}% do CDI` : r.indexador === "ipca" ? `IPCA + ${v}%` : `${v}% ao ano`;
  }
  const venc = String(nome || "").match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (venc) r.vencimento = `${venc[3]}-${venc[2]}-${venc[1]}`;
  else if (r.tipo === "tesouro_pre" || r.tipo === "tesouro_selic") {
    // Só o ano no nome: o Prefixado vence em 1º de janeiro e o Selic em 1º de março; os outros variam (confira no app)
    const ano = String(nome || "").match(/\b(20\d{2})\b/);
    if (ano) r.vencimento = `${ano[1]}-${r.tipo === "tesouro_pre" ? "01" : "03"}-01`;
  }
  return r;
}

// ---------------------------------------------------------------- cálculos
const mesesDe = (inv) => Object.keys((inv && inv.meses) || {}).filter((k) => /^\d{4}-\d{2}$/.test(k)).sort();
// Último registro com saldo até o mês (inclusive)
export function registroAte(inv, mes) {
  const k = mesesDe(inv).filter((x) => x <= mes && inv.meses[x].saldo != null).at(-1);
  return k ? { mes: k, ...inv.meses[k] } : null;
}
export const saldoEm = (inv, mes) => { const r = registroAte(inv, mes); return r ? Number(r.saldo) || 0 : 0; };
// Rendimento do mês: o informado ou saldo do mês − saldo anterior − aplicado + resgatado (sem saldo anterior, não há)
export function rendeuNoMes(inv, mes) {
  const r = inv.meses && inv.meses[mes];
  if (!r) return null;
  if (r.rendeu != null && Number.isFinite(Number(r.rendeu))) return Number(r.rendeu);
  const ant = registroAte(inv, somarMes(mes, -1));
  if (r.saldo == null || !ant) return null;
  return centavos(Number(r.saldo) - Number(ant.saldo) - (Number(r.aplicado) || 0) + (Number(r.resgatado) || 0));
}
// Mês mais recente com algum saldo (até o mês atual)
export function ultimoMes(lista, ate) {
  return lista.flatMap(mesesDe).filter((k) => !ate || k <= ate).sort().at(-1) || null;
}
// Resumo no mês: total, por tipo, por classe e por indexador, rendimento do mês e do ano, a parte isenta de IR
export function resumir(lista, mes) {
  const itens = lista.map((inv) => ({ inv, saldo: saldoEm(inv, mes), rendeu: rendeuNoMes(inv, mes), registro: registroAte(inv, mes) }))
    .filter((x) => x.saldo > 0 || x.rendeu != null);
  const total = centavos(itens.reduce((t, x) => t + x.saldo, 0));
  const agrupar = (chave) => {
    const m = new Map();
    for (const x of itens) {
      const k = chave(x.inv);
      const o = m.get(k) || { id: k, saldo: 0, rendeu: 0, temRendeu: false, n: 0 };
      o.saldo += x.saldo; o.n++;
      if (x.rendeu != null) { o.rendeu += x.rendeu; o.temRendeu = true; }
      m.set(k, o);
    }
    return [...m.values()].map((o) => ({ ...o, saldo: centavos(o.saldo), rendeu: o.temRendeu ? centavos(o.rendeu) : null, parte: total ? o.saldo / total : 0 }))
      .sort((a, b) => b.saldo - a.saldo);
  };
  const ano = mes.slice(0, 4);
  const doAno = [];
  for (let k = `${ano}-01`; k <= mes; k = somarMes(k, 1)) doAno.push(k);
  const rendeuAno = doAno.map((k) => lista.map((inv) => rendeuNoMes(inv, k)).filter((v) => v != null)).flat();
  const doMes = itens.map((x) => x.rendeu).filter((v) => v != null);
  const datas = itens.map((x) => x.registro && x.registro.data).filter(Boolean).sort();
  return {
    mes, total, itens, data: datas.at(-1) || null,
    porTipo: agrupar((inv) => inv.tipo || "outro"),
    porClasse: agrupar((inv) => tipoDe(inv.tipo).classe).sort((a, b) => CLASSES.findIndex((c) => c.id === a.id) - CLASSES.findIndex((c) => c.id === b.id)),
    porIndexador: agrupar((inv) => inv.indexador || tipoDe(inv.tipo).indexador || "nao"),
    rendeuMes: doMes.length ? centavos(doMes.reduce((t, v) => t + v, 0)) : null,
    // O que estava aplicado nos investimentos com rendimento no mês (saldo anterior mais as aplicações), para o %
    baseMes: centavos(itens.filter((x) => x.rendeu != null).reduce((t, x) => t + x.saldo - x.rendeu, 0)),
    rendeuAno: rendeuAno.length ? centavos(rendeuAno.reduce((t, v) => t + v, 0)) : null,
    isento: total ? itens.filter((x) => tipoDe(x.inv.tipo).isento).reduce((t, x) => t + x.saldo, 0) / total : 0,
  };
}
// Série dos últimos meses: saldo total e rendimento de cada mês
export function serieMensal(lista, ate, n = 12) {
  const linhas = [];
  for (let i = n - 1; i >= 0; i--) {
    const k = somarMes(ate, -i);
    const vals = lista.map((inv) => rendeuNoMes(inv, k)).filter((v) => v != null);
    linhas.push({ mes: k, saldo: centavos(lista.reduce((t, inv) => t + saldoEm(inv, k), 0)), rendeu: vals.length ? centavos(vals.reduce((t, v) => t + v, 0)) : null });
  }
  return linhas;
}

// ---------------------------------------------------------------- tela
// raiz: elemento onde o painel é desenhado; lista: os investimentos salvos; salvar(lista) grava e devolve a lista salva;
// lancarGasto e lancarEntrada lançam a aplicação ou o resgate no caixa; contas: as contas dos formulários
export function desenharInvestimentosPessoais({ raiz, lista: inicial = [], nomeDono = "", salvar, lancarGasto = null, lancarEntrada = null, contas = () => [] }) {
  let lista = Array.isArray(inicial) ? inicial : [];
  const mesAtual = hojeISO().slice(0, 7);
  let editando = null; // id do investimento aberto no formulário
  let movimento = null; // { id, tipo: "aplicar" | "resgatar" }
  let dicaTocada = {}; // campos que a pessoa mudou à mão no formulário (a detecção pelo nome não mexe mais)
  let filtro = "tudo"; // de quem é o dinheiro: tudo, pessoal ou o id da conta (ex.: casal)
  const contaDe = (inv) => inv.conta || "pessoal";
  const nomeConta = (id) => (id === "pessoal" ? "Pessoais" : id === "casal" ? "Do casal" : (contas().find((c) => c.id === id) || {}).nome || "Outra conta");

  const novoId = () => `i${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

  async function gravar(nova, aviso) {
    lista = (await salvar(nova)) || nova;
    desenhar();
    if (aviso) avisar(aviso);
  }

  // --- painel
  function barraLista(grupos, nome, cor) {
    const max = Math.max(1, ...grupos.map((g) => g.saldo));
    return grupos.map((g) => `<div class="cat"><span>${esc(nome(g))} <span class="muted">(${g.n})</span></span><span class="num">${brl(g.saldo)} <span class="muted">${pct(g.parte)}</span></span>
      <div class="track"><span style="width:${(g.saldo / max * 100).toFixed(1)}%${cor ? `;background:${cor(g)}` : ""}"></span></div>${g.rendeu != null ? `<span class="sub">rendeu ${rendeuTexto(g.rendeu)} no mês</span>` : ""}</div>`).join("");
  }
  const rendeuTexto = (v) => `<span class="${v < 0 ? "neg" : "pos"}">${v < 0 ? "−" : "+"}${brl(Math.abs(v))}</span>`;

  function graficoRendimentos(serie) {
    const comValor = serie.filter((x) => x.rendeu != null);
    if (!comValor.length) return '<p class="muted" style="margin:0">Os rendimentos de cada mês aparecem a partir da próxima atualização dos saldos, comparando com os saldos anteriores. Também dá para informar o rendimento do mês em Atualizar saldos (o app do banco mostra o quanto rendeu em cada mês).</p>';
    const W = 560, H = 200, ml = 54, mr = 8, mt = 14, mb = 24;
    const vals = comValor.map((x) => x.rendeu);
    const max = Math.max(0, ...vals), min = Math.min(0, ...vals);
    const passo = (() => { const bruto = Math.max(max - min, 1) / 4, p = 10 ** Math.floor(Math.log10(bruto)); return [1, 2, 2.5, 5, 10].map((f) => f * p).find((x) => x >= bruto); })();
    const topo = Math.ceil(max / passo) * passo || passo, fundo = Math.floor(min / passo) * passo;
    const y = (v) => mt + (topo - v) / (topo - fundo) * (H - mt - mb);
    const larg = (W - ml - mr) / serie.length;
    let s = "";
    for (let v = fundo; v <= topo + 1e-9; v += passo) s += `<line x1="${ml}" x2="${W - mr}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="grade${Math.abs(v) < 1e-9 ? " zero" : ""}"/><text x="${ml - 6}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${Math.round(v).toLocaleString("pt-BR")}</text>`;
    serie.forEach((x, i) => {
      const cx = ml + i * larg + larg / 2;
      s += `<text x="${cx.toFixed(1)}" y="${H - 6}" text-anchor="middle">${rotuloMes(x.mes).slice(0, 3)}</text>`;
      if (x.rendeu == null) return;
      const w = Math.min(28, larg * 0.6), y0 = y(0), y1 = y(x.rendeu), h = Math.max(1, Math.abs(y1 - y0)), topoBarra = Math.min(y0, y1);
      const r = Math.min(4, w / 2, h);
      // ponta arredondada só do lado do valor, presa na linha do zero
      const d = x.rendeu >= 0
        ? `M${cx - w / 2},${y0} V${topoBarra + r} Q${cx - w / 2},${topoBarra} ${cx - w / 2 + r},${topoBarra} H${cx + w / 2 - r} Q${cx + w / 2},${topoBarra} ${cx + w / 2},${topoBarra + r} V${y0} Z`
        : `M${cx - w / 2},${y0} V${y0 + h - r} Q${cx - w / 2},${y0 + h} ${cx - w / 2 + r},${y0 + h} H${cx + w / 2 - r} Q${cx + w / 2},${y0 + h} ${cx + w / 2},${y0 + h - r} V${y0} Z`;
      s += `<path d="${d}" class="${x.rendeu < 0 ? "barra-neg" : "barra-pos"}"/>`;
      s += `<rect x="${(ml + i * larg).toFixed(1)}" y="${mt}" width="${larg.toFixed(1)}" height="${H - mt - mb}" fill="transparent" data-i="${i}" tabindex="0" aria-label="${rotuloMes(x.mes)}: rendeu ${brlSinal(x.rendeu)}, saldo ${brl(x.saldo)}"/>`;
    });
    return `<div class="inv-grafico"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Rendimento de cada mês nos últimos 12 meses">${s}</svg><div class="inv-dica" hidden></div></div>
      <details class="gm-parcelas"><summary>Ver em tabela</summary><div class="scroll"><table><thead><tr><th>Mês</th><th class="r">Saldo</th><th class="r">Rendeu</th></tr></thead><tbody>
        ${serie.filter((x) => x.saldo || x.rendeu != null).map((x) => `<tr><td>${rotuloMes(x.mes)}</td><td class="r num">${n2(x.saldo)}</td><td class="r num">${x.rendeu == null ? "—" : `${x.rendeu < 0 ? "−" : ""}${n2(Math.abs(x.rendeu))}`}</td></tr>`).join("")}
      </tbody></table></div></details>`;
  }

  function desenhar() {
    // Com algum investimento fora da conta pessoal (do casal, por exemplo), o filtro aparece, mesmo sem nenhum pessoal
    const todas = [...new Set(["pessoal", ...lista.map(contaDe)])].filter((k, _, xs) => xs.length > 1 || k !== "pessoal").sort((a, b) => (a === "pessoal" ? -1 : b === "pessoal" ? 1 : a.localeCompare(b)));
    if (filtro !== "tudo" && !todas.includes(filtro)) filtro = "tudo";
    const vis = filtro === "tudo" ? lista : lista.filter((inv) => contaDe(inv) === filtro);
    const mes = ultimoMes(lista, mesAtual) || mesAtual;
    const R = resumir(vis, mes);
    const serie = serieMensal(vis, mes);
    const filtros = todas.length > 1 ? `<div class="inv-filtro" role="group" aria-label="De quem é o dinheiro">${["tudo", ...todas].map((k) => {
      const tot = resumir(k === "tudo" ? lista : lista.filter((inv) => contaDe(inv) === k), mes).total;
      return `<button type="button" data-inv-filtro="${esc(k)}" aria-pressed="${filtro === k}">${esc(k === "tudo" ? "Tudo" : nomeConta(k))}<span class="num">${brl(tot)}</span></button>`;
    }).join("")}</div>` : "";
    const vencimentos = vis.filter((inv) => inv.vencimento && inv.vencimento >= hojeISO() && saldoEm(inv, mes) > 0).sort((a, b) => a.vencimento.localeCompare(b.vencimento)).slice(0, 6);
    const kpi = (rotulo, valor, sub) => `<div class="fech-kpi"><span class="label">${rotulo}</span><b>${valor}</b><span class="sub">${sub}</span></div>`;
    const porClasse = R.porClasse.filter((g) => g.saldo > 0);
    const itensPorClasse = CLASSES.map((c) => ({ c, itens: vis.filter((inv) => tipoDe(inv.tipo).classe === c.id).sort((a, b) => saldoEm(b, mes) - saldoEm(a, mes)) })).filter((g) => g.itens.length);
    const linhaInv = (inv) => {
      const t = tipoDe(inv.tipo), s = saldoEm(inv, mes), rd = rendeuNoMes(inv, mes), reg = registroAte(inv, mes);
      const det = [t.nome, inv.instituicao, filtro === "tudo" && todas.length > 1 ? nomeConta(contaDe(inv)).toLowerCase() : "", inv.taxa || INDEXADORES[inv.indexador], inv.vencimento ? `vence em ${dataBR(inv.vencimento)}` : "", t.isento ? "isento de IR" : ""].filter(Boolean).map(esc).join(" · ");
      return `<tr class="${s > 0 ? "" : "inv-zerado"}"><td>${esc(inv.nome)}<div class="sub">${det}</div>${reg && reg.mes < mes ? `<div class="sub">saldo de ${rotuloMes(reg.mes)}</div>` : ""}
          <div class="acoes-lanc inv-acoes"><button type="button" class="btn-link" data-inv-aplicar="${esc(inv.id)}">Aplicar</button>${s > 0 ? `<button type="button" class="btn-link" data-inv-resgatar="${esc(inv.id)}">Resgatar</button>` : ""}<button type="button" class="btn-link" data-inv-editar="${esc(inv.id)}">Editar</button></div></td>
        <td class="r num">${n2(s)}</td><td class="r num">${rd == null ? '<span class="muted">—</span>' : rendeuTexto(rd)}</td></tr>`;
    };
    raiz.innerHTML = `
      <header class="top">
        <div><div class="label">Investimentos individuais</div><h1>${esc(nomeDono || "Seus investimentos")}</h1></div>
        <div class="acoes"><button type="button" class="btn" data-inv-novo>Novo investimento</button>${lista.length ? '<button type="button" class="btn sec" data-inv-saldos>Atualizar saldos</button>' : ""}</div>
      </header>
      ${filtros}
      ${!vis.length ? `<section class="panel"><p style="margin:0">${lista.length ? "Nenhum investimento nesta conta. Em Novo investimento, escolha a conta (de quem é o dinheiro)." : `Cadastre cada investimento (CDB, LCI, LCA, Tesouro, fundos, previdência, ações, cripto...) com o saldo de hoje. Todo mês, em <b>Atualizar saldos</b>, você informa os saldos novos e o painel mostra quanto rendeu, a parte de cada tipo e os próximos vencimentos.`}</p></section>` : `
      <div class="fech-kpis inv-kpis">
        ${kpi("Total investido", brl(R.total), R.data ? `posição de ${dataBR(R.data)}` : rotuloMes(mes))}
        ${kpi(`Rendeu em ${rotuloMes(mes)}`, R.rendeuMes == null ? "—" : rendeuTexto(R.rendeuMes), R.rendeuMes == null ? "aparece na próxima atualização" : R.baseMes > 0 ? `${pct(R.rendeuMes / R.baseMes)} sobre o aplicado` : "")}
        ${kpi(`Rendeu em ${mes.slice(0, 4)}`, R.rendeuAno == null ? "—" : rendeuTexto(R.rendeuAno), "soma dos meses com rendimento")}
        ${kpi("Isento de IR", pct(R.isento), "LCI, LCA, CRI, CRA, poupança e incentivadas")}
      </div>
      <div class="grid">
        <div class="col">
          <section class="panel">
            <h2>Por classe</h2>
            <div class="inv-pilha" role="img" aria-label="${esc(porClasse.map((g) => `${CLASSES.find((c) => c.id === g.id).nome} ${pct(g.parte)}`).join(", "))}">${porClasse.map((g) => `<span style="flex:${g.saldo} 1 0;background:${CLASSES.find((c) => c.id === g.id).cor}" title="${esc(CLASSES.find((c) => c.id === g.id).nome)}: ${pct(g.parte)}"></span>`).join("")}</div>
            <ul class="inv-legenda">${porClasse.map((g) => { const c = CLASSES.find((x) => x.id === g.id); return `<li><i style="background:${c.cor}"></i><span>${esc(c.nome)}</span><span class="num">${brl(g.saldo)}</span><b class="num">${pct(g.parte)}</b></li>`; }).join("")}</ul>
          </section>
          <section class="panel"><h2>Por tipo</h2>${barraLista(R.porTipo.filter((g) => g.saldo > 0), (g) => tipoDe(g.id).nome, (g) => classeDe(g.id).cor)}</section>
          <section class="panel"><h2>Por indexador</h2>${barraLista(R.porIndexador.filter((g) => g.saldo > 0), (g) => NOME_INDEXADOR[g.id] || "Outro")}</section>
        </div>
        <div class="col">
          <section class="panel"><h2>Rendimentos mensais</h2>${graficoRendimentos(serie)}</section>
          <section class="panel"><h2>Próximos vencimentos</h2>${vencimentos.length ? `<ul class="gm-itens inv-venc">${vencimentos.map((inv) => `<li><span>${esc(inv.nome)}<span class="sub"> · ${dataBR(inv.vencimento)}</span></span><span class="num">${n2(saldoEm(inv, mes))}</span></li>`).join("")}</ul>` : '<p class="muted" style="margin:0">Nenhum vencimento informado.</p>'}</section>
        </div>
      </div>
      <section class="panel" style="margin-top:18px">
        <h2>Investimentos</h2>
        ${itensPorClasse.map((g) => `<details class="inv-classe" open><summary><i style="background:${g.c.cor}"></i>${esc(g.c.nome)} <span class="muted">(${g.itens.length})</span><span class="num">${brl(g.itens.reduce((t, inv) => t + saldoEm(inv, mes), 0))}</span></summary>
          <div class="scroll"><table class="inv-tabela"><colgroup><col><col class="inv-col-saldo"><col class="inv-col-rendeu"></colgroup><thead><tr><th>Investimento</th><th class="r">Saldo</th><th class="r">Rendeu em ${rotuloMes(mes)}</th></tr></thead><tbody>${g.itens.map(linhaInv).join("")}</tbody></table></div></details>`).join("")}
      </section>`}`;
    ligarDica(serie);
  }

  function ligarDica(serie) {
    const box = raiz.querySelector(".inv-grafico");
    if (!box) return;
    const dica = box.querySelector(".inv-dica");
    const mostrar = (el) => {
      const x = serie[Number(el.dataset.i)];
      dica.innerHTML = `<b>${rotuloMes(x.mes)}</b><span>rendeu ${brlSinal(x.rendeu)}</span><span class="muted">saldo ${brl(x.saldo)}</span>`;
      dica.hidden = false;
      const b = box.getBoundingClientRect(), r = el.getBoundingClientRect();
      dica.style.left = `${Math.max(0, Math.min(b.width - dica.offsetWidth, r.left - b.left + r.width / 2 - dica.offsetWidth / 2))}px`;
    };
    box.querySelectorAll("rect[data-i]").forEach((el) => {
      el.addEventListener("pointerenter", () => mostrar(el));
      el.addEventListener("focus", () => mostrar(el));
      el.addEventListener("pointerleave", () => { dica.hidden = true; });
      el.addEventListener("blur", () => { dica.hidden = true; });
    });
  }

  // --- formulário do investimento
  const formInv = () => $("#form-investimento");
  function preencherTipos(sel) {
    sel.innerHTML = CLASSES.map((c) => `<optgroup label="${esc(c.nome)}">${TIPOS.filter((t) => t.classe === c.id).map((t) => `<option value="${t.id}">${esc(t.nome)}</option>`).join("")}</optgroup>`).join("");
  }
  function preencherContas(form, atual) {
    const cs = contas();
    const campo = form.querySelector("[data-campo-conta]");
    campo.hidden = cs.length < 2;
    form.elements.conta.innerHTML = cs.map((c) => `<option value="${esc(c.id)}">${esc(c.nome)}</option>`).join("");
    form.elements.conta.value = atual && cs.some((c) => c.id === atual) ? atual : "pessoal";
  }
  function abrirInvestimento(id = null) {
    const inv = id ? lista.find((x) => x.id === id) : null;
    editando = inv ? inv.id : null;
    dicaTocada = inv ? { tipo: true, indexador: true, taxa: true, vencimento: true } : {};
    const form = formInv();
    form.reset();
    $("#titulo-investimento").textContent = inv ? `Editar: ${inv.nome}` : "Novo investimento";
    form.elements.nome.value = inv ? inv.nome : "";
    form.elements.tipo.value = inv ? inv.tipo : "cdb";
    form.elements.instituicao.value = inv ? inv.instituicao || "" : (lista.map((x) => x.instituicao).filter(Boolean).at(-1) || "");
    form.elements.indexador.value = inv ? inv.indexador || "" : "cdi";
    form.elements.taxa.value = inv ? inv.taxa || "" : "";
    form.elements.vencimento.value = inv ? inv.vencimento || "" : "";
    preencherContas(form, inv ? inv.conta : filtro !== "tudo" ? filtro : null);
    form.querySelector("[data-so-novo]").hidden = !!inv;
    form.elements.data.value = hojeISO();
    $("#btn-apagar-investimento").hidden = !inv;
    $("#erro-investimento").hidden = true;
    $("#dlg-investimento").showModal();
    form.elements.nome.focus();
  }
  function aoDigitarNome() {
    if (editando) return;
    const form = formInv();
    const d = detectar(form.elements.nome.value);
    for (const k of ["tipo", "indexador", "taxa", "vencimento"]) if (d[k] && !dicaTocada[k]) form.elements[k].value = d[k];
  }
  async function salvarInvestimento(e) {
    e.preventDefault();
    const form = e.target;
    const falha = (t) => { $("#erro-investimento").textContent = t; $("#erro-investimento").hidden = false; };
    const nome = form.elements.nome.value.trim().slice(0, 120);
    if (!nome) return falha("Informe o nome do investimento (ex.: CDB Banco X 110% do CDI).");
    const antigo = lista.find((x) => x.id === editando);
    const inv = { ...(antigo || { id: novoId(), meses: {}, criado: hojeISO() }), nome, tipo: form.elements.tipo.value, instituicao: form.elements.instituicao.value.trim().slice(0, 60) || null,
      indexador: form.elements.indexador.value || null, taxa: form.elements.taxa.value.trim().slice(0, 60) || null, vencimento: form.elements.vencimento.value || null,
      conta: form.elements.conta.value && form.elements.conta.value !== "pessoal" ? form.elements.conta.value : null };
    let gasto = null;
    if (!antigo) {
      const saldo = numeroDigitado(form.elements.saldo.value);
      const data = form.elements.data.value || hojeISO();
      if (!(saldo >= 0) || !form.elements.saldo.value.trim()) return falha("Informe o saldo de hoje (ex.: 1.017,13).");
      const nova = form.elements.nova.checked;
      inv.meses = { [data.slice(0, 7)]: { data, saldo: centavos(saldo), ...(nova ? { aplicado: centavos(saldo) } : {}) } };
      if (nova && saldo > 0 && lancarGasto) gasto = { data, descricao: `Aplicação: ${nome}`.slice(0, 120), valor: centavos(saldo), forma: form.elements.forma.value, tipo: inv.tipo, conta: inv.conta };
    }
    const botao = form.querySelector("[type=submit]");
    botao.disabled = true;
    try {
      await gravar(antigo ? lista.map((x) => (x.id === inv.id ? inv : x)) : [...lista, inv]);
      if (gasto) await lancarGasto({ ...gasto, subcategoria: tipoDe(gasto.tipo).nome });
      $("#dlg-investimento").close();
      avisar(antigo ? "Investimento salvo." : gasto ? "Investimento cadastrado e aplicação lançada no caixa." : "Investimento cadastrado.");
    } catch (err) {
      falha("Não foi possível salvar: " + err.message);
    } finally {
      botao.disabled = false;
    }
  }
  async function apagarInvestimento() {
    const inv = lista.find((x) => x.id === editando);
    if (!inv || !confirm(`Apagar "${inv.nome}" e o histórico de saldos dele? Os gastos e entradas já lançados no caixa continuam.`)) return;
    try {
      await gravar(lista.filter((x) => x.id !== inv.id), "Investimento apagado.");
      $("#dlg-investimento").close();
    } catch (err) {
      $("#erro-investimento").textContent = "Não foi possível apagar: " + err.message;
      $("#erro-investimento").hidden = false;
    }
  }

  // --- aplicar e resgatar
  function abrirMovimento(id, tipo) {
    const inv = lista.find((x) => x.id === id);
    if (!inv) return;
    movimento = { id, tipo };
    const form = $("#form-inv-movimento");
    form.reset();
    const aplicar = tipo === "aplicar";
    $("#titulo-inv-movimento").textContent = `${aplicar ? "Aplicar em" : "Resgatar de"} ${inv.nome}`;
    form.elements.data.value = hojeISO();
    form.querySelector("[data-campo-forma]").hidden = !aplicar;
    $("#rotulo-inv-caixa").textContent = aplicar ? "Lançar a saída no caixa (o dinheiro sai da conta)" : "Lançar a entrada no caixa (o dinheiro volta para a conta)";
    form.elements.caixa.checked = aplicar ? !!lancarGasto : !!lancarEntrada;
    form.elements.caixa.disabled = aplicar ? !lancarGasto : !lancarEntrada;
    $("#dica-inv-movimento").textContent = `Saldo de hoje: ${brl(saldoEm(inv, mesAtual))}. ${aplicar ? "A aplicação soma no saldo do mês e não conta como rendimento." : "O resgate sai do saldo do mês e não conta como perda."}`;
    $("#erro-inv-movimento").hidden = true;
    $("#dlg-inv-movimento").showModal();
    form.elements.valor.focus();
  }
  async function salvarMovimento(e) {
    e.preventDefault();
    const form = e.target;
    const falha = (t) => { $("#erro-inv-movimento").textContent = t; $("#erro-inv-movimento").hidden = false; };
    const inv = lista.find((x) => x.id === movimento.id);
    const valor = numeroDigitado(form.elements.valor.value);
    if (!(valor > 0)) return falha("Informe o valor (ex.: 1.250,00).");
    const data = form.elements.data.value || hojeISO();
    const mes = data.slice(0, 7);
    const aplicar = movimento.tipo === "aplicar";
    const base = saldoEm(inv, mes);
    if (!aplicar && valor > base + 0.005) return falha(`O resgate passa do saldo (${brl(base)}). Atualize o saldo antes, se ele mudou.`);
    const reg = { ...((inv.meses || {})[mes] || {}) };
    reg.data = reg.data && reg.data > data ? reg.data : data;
    reg.saldo = centavos(base + (aplicar ? valor : -valor));
    if (aplicar) reg.aplicado = centavos((Number(reg.aplicado) || 0) + valor);
    else reg.resgatado = centavos((Number(reg.resgatado) || 0) + valor);
    const nova = lista.map((x) => (x.id === inv.id ? { ...x, meses: { ...(x.meses || {}), [mes]: reg } } : x));
    const botao = form.querySelector("[type=submit]");
    botao.disabled = true;
    try {
      await gravar(nova);
      if (form.elements.caixa.checked) {
        if (aplicar) await lancarGasto({ data, descricao: `Aplicação: ${inv.nome}`.slice(0, 120), valor: centavos(valor), forma: form.elements.forma.value, subcategoria: tipoDe(inv.tipo).nome, conta: inv.conta });
        else await lancarEntrada({ data, descricao: `Resgate: ${inv.nome}`.slice(0, 120), liquido: centavos(valor), conta: inv.conta });
      }
      $("#dlg-inv-movimento").close();
      avisar(aplicar ? `Aplicação de ${brl(valor)} registrada${form.elements.caixa.checked ? " e lançada no caixa" : ""}.` : `Resgate de ${brl(valor)} registrado${form.elements.caixa.checked ? " e lançado no caixa" : ""}.`);
    } catch (err) {
      falha("Não foi possível registrar: " + err.message);
    } finally {
      botao.disabled = false;
    }
  }

  // --- atualizar os saldos de um mês
  function abrirSaldos() {
    const form = $("#form-inv-saldos");
    form.reset();
    form.elements.mes.value = mesAtual;
    form.elements.data.value = hojeISO();
    desenharSaldos();
    $("#erro-inv-saldos").hidden = true;
    $("#dlg-inv-saldos").showModal();
    const primeiro = form.querySelector("[data-saldo]");
    if (primeiro) primeiro.focus();
  }
  function desenharSaldos() {
    const form = $("#form-inv-saldos");
    const mes = form.elements.mes.value || mesAtual;
    // Fora da lista: o que já tinha sido resgatado todo antes do mês (dá para informar meses anteriores ao cadastro)
    const fechado = (inv) => { const r = registroAte(inv, somarMes(mes, -1)); return r && Number(r.saldo) === 0 && !(inv.meses || {})[mes]; };
    const visiveis = lista.filter((inv) => !fechado(inv));
    $("#lista-inv-saldos").innerHTML = visiveis.map((inv) => {
      const r = (inv.meses || {})[mes] || {};
      const ant = registroAte(inv, somarMes(mes, -1));
      return `<tr data-id="${esc(inv.id)}"><td>${esc(inv.nome)}<div class="sub">${esc(tipoDe(inv.tipo).nome)}${ant ? ` · ${rotuloMes(ant.mes)}: ${n2(ant.saldo)}` : ""}</div></td>
        <td><input data-saldo inputmode="decimal" autocomplete="off" value="${r.saldo != null ? n2(r.saldo) : ""}" placeholder="${ant ? n2(ant.saldo) : "0,00"}" aria-label="Saldo de ${esc(inv.nome)} em ${rotuloMes(mes)}"></td>
        <td><input data-rendeu inputmode="decimal" autocomplete="off" value="${r.rendeu != null ? n2(r.rendeu) : ""}" placeholder="pela diferença" aria-label="Rendeu em ${rotuloMes(mes)} (opcional)"></td></tr>`;
    }).join("");
  }
  async function salvarSaldos(e) {
    e.preventDefault();
    const form = e.target;
    const falha = (t) => { $("#erro-inv-saldos").textContent = t; $("#erro-inv-saldos").hidden = false; };
    const mes = form.elements.mes.value;
    if (!/^\d{4}-\d{2}$/.test(mes)) return falha("Escolha o mês.");
    const data = form.elements.data.value && form.elements.data.value.slice(0, 7) === mes ? form.elements.data.value : `${mes}-${mes === mesAtual ? hojeISO().slice(8, 10) : "28"}`;
    const mudancas = new Map();
    for (const tr of form.querySelectorAll("#lista-inv-saldos tr")) {
      const ts = tr.querySelector("[data-saldo]").value.trim(), tr2 = tr.querySelector("[data-rendeu]").value.trim();
      const saldo = ts ? numeroDigitado(ts) : null, rendeu = tr2 ? numeroDigitado(tr2.replace(/^−/, "-")) : null;
      if (ts && !(saldo >= 0)) return falha("Algum saldo não é um número (ex.: 1.017,13).");
      if (tr2 && !Number.isFinite(rendeu)) return falha("Algum rendimento não é um número (use − para perda, ex.: −7,35).");
      if (ts || tr2) mudancas.set(tr.dataset.id, { saldo, rendeu });
    }
    if (!mudancas.size) return falha("Informe pelo menos um saldo.");
    const nova = lista.map((inv) => {
      const m = mudancas.get(inv.id);
      if (!m) return inv;
      const reg = { ...((inv.meses || {})[mes] || {}), data };
      if (m.saldo != null) reg.saldo = centavos(m.saldo);
      else if (reg.saldo == null) reg.saldo = saldoEm(inv, mes);
      if (m.rendeu != null) reg.rendeu = centavos(m.rendeu); else delete reg.rendeu;
      return { ...inv, meses: { ...(inv.meses || {}), [mes]: reg } };
    });
    const botao = form.querySelector("[type=submit]");
    botao.disabled = true;
    try {
      await gravar(nova, `Saldos de ${rotuloMes(mes)} salvos (${mudancas.size} ${mudancas.size === 1 ? "investimento" : "investimentos"}).`);
      $("#dlg-inv-saldos").close();
    } catch (err) {
      falha("Não foi possível salvar: " + err.message);
    } finally {
      botao.disabled = false;
    }
  }

  // --- ligações
  preencherTipos(formInv().elements.tipo);
  formInv().elements.indexador.innerHTML = Object.entries(INDEXADORES).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("");
  formInv().elements.nome.addEventListener("input", aoDigitarNome);
  ["tipo", "indexador", "taxa", "vencimento"].forEach((k) => formInv().elements[k].addEventListener("input", () => { dicaTocada[k] = true; }));
  formInv().elements.nova.addEventListener("change", (e) => { formInv().querySelector("[data-campo-forma-nova]").hidden = !e.target.checked; });
  formInv().addEventListener("submit", salvarInvestimento);
  $("#btn-apagar-investimento").addEventListener("click", apagarInvestimento);
  $("#form-inv-movimento").addEventListener("submit", salvarMovimento);
  $("#form-inv-saldos").addEventListener("submit", salvarSaldos);
  $("#form-inv-saldos").elements.mes.addEventListener("change", desenharSaldos);
  raiz.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.matches("[data-inv-novo]")) abrirInvestimento(null);
    else if (b.matches("[data-inv-saldos]")) abrirSaldos();
    else if (b.dataset.invEditar) abrirInvestimento(b.dataset.invEditar);
    else if (b.dataset.invAplicar) abrirMovimento(b.dataset.invAplicar, "aplicar");
    else if (b.dataset.invResgatar) abrirMovimento(b.dataset.invResgatar, "resgatar");
    else if (b.dataset.invFiltro) { filtro = b.dataset.invFiltro; desenhar(); const x = raiz.querySelector(`[data-inv-filtro="${CSS.escape(filtro)}"]`); if (x) x.focus(); }
  });
  desenhar();
  return {
    atualizar(nova) { lista = nova || []; desenhar(); },
    total: () => resumir(lista, ultimoMes(lista, mesAtual) || mesAtual).total,
  };
}
