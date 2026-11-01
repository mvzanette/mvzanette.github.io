// Onde investir (aba Investimentos, nas visões de cada um e do casal): ajuda a decidir onde aplicar cada aporte entre
// CDB, LCI, LCA, CRI, CRA, Tesouro e ações.
//   1. Comparador rápido: as ofertas digitadas, lado a lado, depois do IR (com a equivalência em CDB dos isentos);
//   2. Ranking de ofertas por prazo, com os selos (FGC, isento, resgate diário, taxa travada...);
//   3. Divisão do aporte do mês entre reserva, médio e longo prazo (e ações);
//   4. O que já temos, comparado com hoje (equivalência em CDB até o vencimento de cada investimento);
//   5. Ações com aportes mensais, em três cenários, contra o Tesouro IPCA+.
// As contas seguem as regras da Receita e do mercado (IR regressivo por dias, isenções, custódia do Tesouro, % do CDI
// pela taxa diária composta nos dias úteis) e as premissas editáveis (Selic, CDI e IPCA). Nenhum dado pessoal aqui:
// saldos, aportes e o custo essencial vêm do banco; o que a pessoa digita fica nas preferências dela.
import { esc } from "./ui.js";

// ---------------------------------------------------------------- premissas e calendário
export const PREMISSAS_PADRAO = {
  fonte: "Focus de out/2026",
  selicHoje: 13.75,
  selic: { 2026: 13.25, 2027: 11.75, 2028: 10.25 }, // no fim de cada ano
  selicDepois: 10, // de 2029 em diante
  spread: 0.1, // CDI = Selic − 0,10
  ipca: { 2026: 5.0, 2027: 4.1, 2028: 3.7 },
  ipcaDepois: 3.5,
};
const DU_ANO = 252, DU_MES = 21;
const idxMes = (chave) => Number(chave.slice(0, 4)) * 12 + Number(chave.slice(5, 7)) - 1;
const chaveDe = (i) => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
export const somarMeses = (iso, n) => {
  const [a, m, d] = iso.split("-").map(Number);
  const t = a * 12 + m - 1 + n, ano = Math.floor(t / 12), mes = (t % 12) + 1;
  return `${ano}-${String(mes).padStart(2, "0")}-${String(Math.min(d, new Date(ano, mes, 0).getDate())).padStart(2, "0")}`;
};
export const diasEntre = (de, ate) => Math.round((Date.parse(ate + "T12:00:00Z") - Date.parse(de + "T12:00:00Z")) / 864e5);
export const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

// Selic ao ano (%) num mês: interpolada mês a mês entre hoje e o fim de cada ano das premissas; depois, a de longo prazo
export function selicNoMes(prem, chave, hojeKey) {
  const anos = Object.keys(prem.selic || {}).map(Number).sort((a, b) => a - b);
  const pontos = [[idxMes(hojeKey), Number(prem.selicHoje)]];
  for (const a of anos) if (idxMes(`${a}-12`) > pontos.at(-1)[0]) pontos.push([idxMes(`${a}-12`), Number(prem.selic[a])]);
  const ultimoAno = anos.length ? anos.at(-1) : Number(hojeKey.slice(0, 4));
  if (idxMes(`${ultimoAno + 1}-12`) > pontos.at(-1)[0]) pontos.push([idxMes(`${ultimoAno + 1}-12`), Number(prem.selicDepois)]);
  const i = idxMes(chave);
  if (i <= pontos[0][0]) return pontos[0][1];
  for (let k = 1; k < pontos.length; k++) {
    const [i0, v0] = pontos[k - 1], [i1, v1] = pontos[k];
    if (i <= i1) return v0 + ((v1 - v0) * (i - i0)) / (i1 - i0);
  }
  return pontos.at(-1)[1];
}
export const ipcaDoAno = (prem, ano) => Number((prem.ipca || {})[ano] ?? prem.ipcaDepois) / 100;

// Os dias úteis do prazo, mês a mês (21 por mês), com a Selic, o CDI e o IPCA de cada mês.
// modo "fixo": o CDI de hoje o tempo todo; "esperado": a Selic caindo das premissas.
export function caminho(prem, dias, { inicioKey, modo = "fixo", hojeKey = inicioKey } = {}) {
  let du = Math.max(1, Math.round((dias * DU_ANO) / 365));
  const passos = [];
  for (let k = 0; du > 0; k++) {
    const chave = chaveDe(idxMes(inicioKey) + k);
    const n = Math.min(DU_MES, du);
    const selic = modo === "fixo" ? Number(prem.selicHoje) : selicNoMes(prem, chave, hojeKey);
    passos.push({ chave, du: n, selic: selic / 100, cdi: (selic - Number(prem.spread)) / 100, ipca: ipcaDoAno(prem, Number(chave.slice(0, 4))) });
    du -= n;
  }
  return passos;
}
const duDe = (passos) => passos.reduce((t, p) => t + p.du, 0);
// % do CDI: a taxa diária do CDI vezes o percentual, composta nos dias úteis
export const fatorCDI = (passos, pct) => passos.reduce((f, p) => f * Math.pow(1 + (Math.pow(1 + p.cdi, 1 / DU_ANO) - 1) * pct, p.du), 1);
const fatorSelic = (passos) => passos.reduce((f, p) => f * Math.pow(1 + p.selic, p.du / DU_ANO), 1);
const fatorIPCA = (passos) => passos.reduce((f, p) => f * Math.pow(1 + p.ipca, p.du / DU_ANO), 1);
const fatorPre = (taxa, du) => Math.pow(1 + taxa, du / DU_ANO);

// IR da renda fixa pelos dias corridos até o resgate (sobre o ganho)
export const aliquotaIR = (dias) => (dias <= 180 ? 0.225 : dias <= 360 ? 0.2 : dias <= 720 ? 0.175 : 0.15);
export const ISENTOS = ["lci", "lca", "cri", "cra"];
export const COM_FGC = ["cdb", "lci", "lca"];
export const NOME_TIPO = { cdb: "CDB", lci: "LCI", lca: "LCA", cri: "CRI", cra: "CRA", tesouro: "Tesouro" };
export const NOME_INDICE = { cdi: "% do CDI", pre: "Prefixado (% ao ano)", ipca: "IPCA + %", selic: "Selic" };
const CARENCIA = { lca: 9, lci: 12 }; // meses
export const custodiaTesouro = (valor, du) => 0.002 * Math.max(0, valor - 10000) * (du / DU_ANO);

// Fator bruto de uma aplicação (tipo, índice e taxa) nos passos do prazo
function fatorBruto(o, passos) {
  const taxa = Number(o.taxa) / 100;
  if (o.indice === "cdi") return fatorCDI(passos, taxa);
  if (o.indice === "selic") return fatorSelic(passos) * fatorPre(taxa, duDe(passos));
  if (o.indice === "ipca") return fatorIPCA(passos) * fatorPre(taxa, duDe(passos));
  return fatorPre(taxa, duDe(passos));
}
// Uma perna da aplicação (do começo até o resgate): bruto, custódia, IR e líquido
function perna(o, valor, dias, passos) {
  const isento = ISENTOS.includes(o.tipo);
  const fb = fatorBruto(o, passos);
  const ganho = valor * (fb - 1);
  const custodia = o.tipo === "tesouro" ? custodiaTesouro(valor, duDe(passos)) : 0;
  const aliquota = isento ? 0 : aliquotaIR(dias);
  const ir = Math.max(0, (ganho - custodia) * aliquota);
  return { bruto: ganho, custodia, aliquota, ir, final: valor + ganho - custodia - ir, isento };
}

// Quanto um CDB (% do CDI) precisaria pagar para dar o mesmo líquido no mesmo prazo: busca binária
export function equivalenteCDB(fatorLiq, dias, passos) {
  const aliq = aliquotaIR(dias);
  const liq = (p) => 1 + (fatorCDI(passos, p) - 1) * (1 - aliq);
  let lo = 0, hi = 5;
  if (liq(hi) < fatorLiq) return hi * 100;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (liq(m) < fatorLiq) lo = m; else hi = m; }
  return ((lo + hi) / 2) * 100;
}

// Simula uma aplicação de "valor" por "dias" (com vencimento antes do fim: reaplica num CDB de 100% do CDI da época)
export function simular(o, { valor, dias, prem, modo = "fixo", hoje = hojeISO() }) {
  const hojeKey = hoje.slice(0, 7);
  const venceAntes = o.vence && diasEntre(hoje, o.vence) > 0 && diasEntre(hoje, o.vence) < dias;
  const d1 = venceAntes ? diasEntre(hoje, o.vence) : dias;
  const passos1 = caminho(prem, d1, { inicioKey: hojeKey, modo, hojeKey });
  const p1 = perna(o, valor, d1, passos1);
  let final = p1.final, ir = p1.ir, custodia = p1.custodia, bruto = p1.bruto;
  if (venceAntes) {
    const d2 = dias - d1;
    const passos2 = caminho(prem, d2, { inicioKey: o.vence.slice(0, 7), modo, hojeKey });
    const p2 = perna({ tipo: "cdb", indice: "cdi", taxa: 100 }, p1.final, d2, passos2);
    final = p2.final; ir += p2.ir; bruto += p2.bruto;
  }
  const passos = caminho(prem, dias, { inicioKey: hojeKey, modo, hojeKey });
  const du = duDe(passos);
  const fl = final / valor;
  const fCdi = fatorCDI(passos, 1);
  const anual = (f) => Math.pow(f, DU_ANO / du) - 1;
  const r = {
    bruto, custodia, ir, aliquota: p1.aliquota, isento: p1.isento, final, ganho: final - valor,
    liqAno: anual(fl), pctCdiLiq: (fl - 1) / (fCdi - 1), real: anual(fl / fatorIPCA(passos)), cdiAno: anual(fCdi), venceAntes: !!venceAntes,
    equivCDB: equivalenteCDB(fl, dias, passos), alertas: [],
  };
  const meses = dias / 30.4375;
  if (CARENCIA[o.tipo] && meses < CARENCIA[o.tipo] - 0.01) r.alertas.push(`${NOME_TIPO[o.tipo]} tem prazo mínimo de ${CARENCIA[o.tipo]} meses: não dá para resgatar antes.`);
  if (o.tipo === "cri" || o.tipo === "cra") r.alertas.push(`${NOME_TIPO[o.tipo]} não tem garantia do FGC: o risco é de quem emitiu.`);
  return r;
}

// Nome curto de uma opção: "CDB 110%", "LCA pré 13,1%", "CRI IPCA+ 8%"
const num = (v, casas = 2) => Number(v).toLocaleString("pt-BR", { maximumFractionDigits: casas });
export const nomeOpcao = (o) => o.nome || `${NOME_TIPO[o.tipo] || o.tipo} ${o.indice === "cdi" ? `${num(o.taxa)}%` : o.indice === "pre" ? `pré ${num(o.taxa)}%` : o.indice === "ipca" ? `IPCA+ ${num(o.taxa)}%` : "Selic"}`;

// Taxa de um investimento cadastrado ("85% do CDI", "IPCA + 7,07%", "14,2% ao ano") → { indice, taxa }
export function lerTaxa(inv) {
  const t = String(inv.taxa || "").toLowerCase().replace(",", ".");
  const n = Number((t.match(/-?\d+(\.\d+)?/) || [])[0]);
  if (!Number.isFinite(n)) return null;
  const indice = /cdi/.test(t) ? "cdi" : /ipca/.test(t) ? "ipca" : /selic/.test(t) ? "selic" : inv.indexador === "cdi" || inv.indexador === "ipca" || inv.indexador === "selic" ? inv.indexador : "pre";
  return { indice, taxa: n };
}
export const tipoDoInvestimento = (inv) => (String(inv.tipo || "").startsWith("tesouro") ? "tesouro" : ["cdb", "lci", "lca", "cri", "cra"].includes(inv.tipo) ? inv.tipo : null);
const LIQUIDEZ_TIPOS = ["conta", "poupanca", "tesouro_selic", "fundo_rf"];
// Resgate diário: o marcado no cadastro (Resgate) ou, sem marcação, pelo tipo e pelo nome
export const temLiquidezDiaria = (inv) => (inv.liquidez ? inv.liquidez === "diaria" : LIQUIDEZ_TIPOS.includes(inv.tipo) || /caixinha|liquidez|diaria|di[aá]ria|\bld\b/i.test(inv.nome || ""));
const LONGO_TIPOS = ["pgbl", "vgbl", "acoes", "fii", "fiagro", "etf", "bdr", "fundo_acoes", "fundo_multi", "cripto", "outro"];
const VARIAVEL = ["acoes", "fii", "fiagro", "etf", "bdr", "fundo_acoes", "cripto"];

// Grupo de um investimento na divisão: reserva (liquidez diária), médio (vence em até 5 anos), longo (mais de 5 anos,
// previdência e renda variável) ou "falta detalhar" (sem taxa ou sem vencimento)
export function grupoDe(inv, hoje = hojeISO()) {
  if (temLiquidezDiaria(inv)) return "reserva";
  if (inv.vencimento) return diasEntre(hoje, inv.vencimento) <= 5 * 365 + 1 ? "medio" : "longo";
  if (LONGO_TIPOS.includes(inv.tipo) && (VARIAVEL.includes(inv.tipo) || ["pgbl", "vgbl"].includes(inv.tipo) || inv.indexador === "variavel")) return "longo";
  return "falta";
}

// Emissor pelo nome como o banco mostra ("LCA BTGPACTUALBM IPCA 7.07% ..." → "BTGPACTUALBM")
export const emissorDe = (inv) => String(inv.instituicao || "").trim() || (String(inv.nome || "").match(/^(?:CDB|LCI|LCA|RDB|LC)\s+(.+?)\s+(?:CDI|IPCA|PRE|SELIC|DI)\b/i) || [])[1] || "";

// Ações com aporte mensal fixo (em dinheiro de hoje) por "anos", rendendo "real" ao ano acima da inflação; o IR de 15%
// sai sobre o ganho nominal no fim (com a inflação das premissas). Volta o saldo líquido em dinheiro de hoje.
export function projetarAportes({ aporte, anos, real, prem, custodia = 0, hoje = hojeISO() }) {
  const meses = Math.round(anos * 12);
  const rm = Math.pow(1 + real / 100 - custodia, 1 / 12) - 1;
  let saldoReal = 0, colocadoNominal = 0, inflAcum = 1;
  for (let k = 0; k < meses; k++) {
    const ano = Number(somarMeses(hoje, k).slice(0, 4));
    inflAcum *= Math.pow(1 + ipcaDoAno(prem, ano), 1 / 12);
    saldoReal = saldoReal * (1 + rm) + aporte;
    colocadoNominal += aporte * inflAcum;
  }
  const saldoNominal = saldoReal * inflAcum;
  const ir = Math.max(0, (saldoNominal - colocadoNominal) * 0.15);
  return { colocado: aporte * meses, bruto: saldoReal, liquido: (saldoNominal - ir) / inflAcum, ir: ir / inflAcum };
}

// Ofertas de exemplo do ranking (marcadas "exemplo, confira no app"), com o vencimento contado a partir de hoje
export function ofertasExemplo(hoje = hojeISO()) {
  const em = (m) => somarMeses(hoje, m);
  return [
    { id: "ex1", nome: "CDB liquidez diária", tipo: "cdb", indice: "cdi", taxa: 100, vence: null, liquidez: "diaria", exemplo: true },
    { id: "ex2", nome: "CDB banco médio", tipo: "cdb", indice: "cdi", taxa: 116, vence: em(36), exemplo: true },
    { id: "ex3", nome: "LCI 92% do CDI", tipo: "lci", indice: "cdi", taxa: 92, vence: em(12), exemplo: true },
    { id: "ex4", nome: "LCA 94% do CDI", tipo: "lca", indice: "cdi", taxa: 94, vence: em(24), exemplo: true },
    { id: "ex5", nome: "LCA prefixada", tipo: "lca", indice: "pre", taxa: 13.1, vence: em(24), exemplo: true },
    { id: "ex6", nome: "Tesouro Selic", tipo: "tesouro", indice: "selic", taxa: 0, vence: null, liquidez: "diaria", exemplo: true },
    { id: "ex7", nome: "Tesouro Prefixado 2029", tipo: "tesouro", indice: "pre", taxa: 14.8, vence: "2029-01-01", exemplo: true },
    { id: "ex8", nome: "Tesouro IPCA+ 2032", tipo: "tesouro", indice: "ipca", taxa: 7.7, vence: "2032-08-15", exemplo: true },
    { id: "ex9", nome: "CRI IPCA+", tipo: "cri", indice: "ipca", taxa: 8, vence: em(60), exemplo: true },
  ];
}

// Selos de uma oferta num prazo (meses)
export function selosDe(o, meses, hoje = hojeISO()) {
  const s = [];
  if (COM_FGC.includes(o.tipo)) s.push(["FGC", "ok"]);
  if (o.tipo === "tesouro") s.push(["Tesouro Nacional", "ok"]);
  if (ISENTOS.includes(o.tipo)) s.push(["isento de IR", "ok"]);
  if (o.liquidez === "diaria") s.push(["resgate diário", "ok"]);
  if (o.indice === "pre" || o.indice === "ipca") s.push(["taxa travada", "info"]);
  if (o.indice === "ipca") s.push(["protege da inflação", "info"]);
  if (o.vence && o.liquidez !== "diaria") {
    const mv = Math.round(diasEntre(hoje, o.vence) / 30.4375);
    if (mv < meses) s.push(["vence antes do prazo, reaplica à taxa da época", "warn"]);
    else if (o.tipo === "tesouro" && (o.indice === "pre" || o.indice === "ipca")) { if (mv > meses) s.push(["venda antecipada oscila", "warn"]); }
    else if (mv > meses) s.push([`só libera em ${mv} meses`, "warn"]);
  }
  if (o.tipo === "cri" || o.tipo === "cra") s.push(["sem FGC", "warn"]);
  return s;
}

// ---------------------------------------------------------------- tela
const brl = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const brl0 = (v) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const pct = (v, casas = 2) => `${(Number(v) * 100).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
const pctN = (v, casas = 1) => `${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
const dataBR = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");
const lerBR = (t) => {
  let s = String(t ?? "").trim().replace(/\s|R\$|%/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};
const campoBR = (v, casas = 2) => (v == null || v === "" ? "" : Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: casas }));
const PRAZOS = [[6, "6 meses"], [12, "1 ano"], [24, "2 anos"], [36, "3 anos"], [60, "5 anos"], [120, "10 anos"]];
const novoId = () => `o${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

// raiz: onde desenhar; dados(): { investimentos: [{ inv, saldo }], aporte, essencial, essencialMes, nomeAporte };
// estado: o salvo (prefs.investir); salvar(estado) grava; prefixo: ids únicos (mais de uma tela na página);
// aoUsar(valor): o card de "decisão próxima" leva o valor ao comparador
export function desenharOndeInvestir({ raiz, dados, estado: salvo = {}, salvar = null, prefixo = "oi" }) {
  if (!raiz) return { desenhar() {} };
  const hoje = hojeISO();
  const E = {
    premissas: { ...PREMISSAS_PADRAO, ...(salvo.premissas || {}), selic: { ...PREMISSAS_PADRAO.selic, ...((salvo.premissas || {}).selic || {}) }, ipca: { ...PREMISSAS_PADRAO.ipca, ...((salvo.premissas || {}).ipca || {}) } },
    comparador: { valor: 50000, prazo: 12, unidade: "meses", modo: "fixo", linhas: [{ tipo: "cdb", indice: "cdi", taxa: 110 }, { tipo: "lci", indice: "cdi", taxa: 92 }], ...(salvo.comparador || {}) },
    ranking: { prazo: 60, valor: 10000, ...(salvo.ranking || {}) },
    ofertas: Array.isArray(salvo.ofertas) && salvo.ofertas.length ? salvo.ofertas : ofertasExemplo(hoje),
    divisao: { aporte: null, essencial: null, meses: 6, pctLongo: 50, pctAcoes: 15, ...(salvo.divisao || {}) },
    acoes: { aporte: null, anos: 15, cenarios: [0, 4.5, 7], ...(salvo.acoes || {}) },
  };
  let tempo = null;
  const guardar = () => {
    if (!salvar) return;
    clearTimeout(tempo);
    tempo = setTimeout(() => salvar(JSON.parse(JSON.stringify(E))).catch((e) => console.warn("Não salvou as escolhas de investimento:", e.message)), 700);
  };
  const id = (s) => `${prefixo}-${s}`;
  const $ = (s) => raiz.querySelector(`#${id(s)}`);
  const P = () => E.premissas;
  const diasDoComparador = () => (E.comparador.unidade === "dias" ? Math.max(1, Math.round(Number(E.comparador.prazo) || 1)) : Math.max(1, diasEntre(hoje, somarMeses(hoje, Math.max(1, Math.round(Number(E.comparador.prazo) || 1))))));
  const diasDeMeses = (m) => Math.max(1, diasEntre(hoje, somarMeses(hoje, m)));

  raiz.innerHTML = `
    <section class="card oi-card" id="${id("comparador")}">
      <span class="eyebrow">Comparador rápido</span>
      <h2>Qual oferta rende mais depois do IR</h2>
      <p class="note">Digite as ofertas do app do banco. O IR sai pela tabela regressiva (dias corridos até o resgate); LCI, LCA, CRI e CRA são isentos para pessoa física.</p>
      <div class="controls oi-geral">
        <div class="field"><label for="${id("valor")}">Valor</label><div class="money"><span>R$</span><input id="${id("valor")}" inputmode="decimal" autocomplete="off"></div></div>
        <div class="field"><label for="${id("prazo")}">Prazo</label><div class="money"><input id="${id("prazo")}" inputmode="numeric" autocomplete="off"><select id="${id("unidade")}" aria-label="Unidade do prazo"><option value="meses">meses</option><option value="dias">dias</option></select></div></div>
        <div class="field"><label for="${id("modo")}">CDI</label><select id="${id("modo")}" class="oi-select"><option value="fixo">CDI de hoje fixo</option><option value="esperado">CDI esperado (Selic caindo)</option></select></div>
      </div>
      <div class="scroll"><table class="oi-linhas"><thead><tr><th>Tipo</th><th>Índice</th><th>Taxa</th><th class="num">Rend. bruto</th><th class="num">IR</th><th class="num">Líquido final</th><th class="num">Líquido ao ano</th><th class="num">% do CDI líquido</th><th>Equivale a CDB</th><th><span class="vh">Remover</span></th></tr></thead><tbody id="${id("linhas")}"></tbody></table></div>
      <button type="button" class="chip" id="${id("mais")}">+ adicionar opção</button>
      <p class="headline" id="${id("frase")}" aria-live="polite"></p>
      <div id="${id("alertas")}"></div>
    </section>
    <section class="card oi-card" id="${id("ranking-card")}">
      <span class="eyebrow">Ranking de ofertas por prazo</span>
      <h2>O que rende mais em cada prazo</h2>
      <div class="controls">
        <div class="chips" role="group" aria-label="Prazo">${PRAZOS.map(([m, t]) => `<button type="button" class="chip" data-oi-prazo="${m}">${t}</button>`).join("")}</div>
        <div class="field"><label for="${id("rvalor")}">Valor</label><div class="money"><span>R$</span><input id="${id("rvalor")}" inputmode="decimal" autocomplete="off"></div></div>
      </div>
      <div id="${id("decisao")}"></div>
      <div class="scroll"><table class="oi-ranking"><thead><tr><th>#</th><th>Oferta</th><th class="num">Líquido ao ano</th><th>Acima da inflação</th><th class="num">Valor final</th><th>Equivale a CDB</th></tr></thead><tbody id="${id("rank")}"></tbody></table></div>
      <p class="headline" id="${id("rfrase")}"></p>
      <details class="oi-ofertas"><summary>Editar as ofertas (${"exemplos; confira no app"})</summary>
        <div class="scroll"><table class="oi-edita"><thead><tr><th>Nome</th><th>Tipo</th><th>Índice</th><th>Taxa</th><th>Vence em</th><th><span class="vh">Remover</span></th></tr></thead><tbody id="${id("ofertas")}"></tbody></table></div>
        <button type="button" class="chip" id="${id("nova-oferta")}">+ nova oferta</button> <button type="button" class="chip" id="${id("exemplos")}">Voltar aos exemplos</button>
        <p class="note">Vence em: em branco é resgate diário. O ranking usa o CDI esperado (Selic caindo, pelas premissas).</p>
      </details>
    </section>
    <section class="card oi-card" id="${id("divisao-card")}">
      <span class="eyebrow">Divisão do aporte do mês</span>
      <h2>Para onde vai o aporte</h2>
      <div class="controls oi-geral">
        <div class="field"><label for="${id("daporte")}">Aporte do mês</label><div class="money"><span>R$</span><input id="${id("daporte")}" inputmode="decimal" autocomplete="off"></div></div>
        <div class="field"><label for="${id("dess")}">Custo essencial por mês</label><div class="money"><span>R$</span><input id="${id("dess")}" inputmode="decimal" autocomplete="off"></div></div>
        <div class="field"><label for="${id("dmeses")}">Meses de reserva</label><div class="money"><input id="${id("dmeses")}" inputmode="numeric" autocomplete="off"><span>meses</span></div></div>
        <div class="field"><label for="${id("dlongo")}">Do restante, no longo prazo</label><div class="money"><input id="${id("dlongo")}" inputmode="numeric" autocomplete="off"><span>%</span></div></div>
        <div class="field"><label for="${id("dacoes")}">Do longo prazo, em ações</label><div class="money"><input id="${id("dacoes")}" inputmode="numeric" autocomplete="off"><span>%</span></div></div>
      </div>
      <p class="note" id="${id("dorigem")}"></p>
      <div id="${id("divisao")}"></div>
    </section>
    <section class="card oi-card" id="${id("temos-card")}">
      <span class="eyebrow">O que já temos, comparado com hoje</span>
      <h2>Vale repetir estas aplicações?</h2>
      <div id="${id("temos")}"></div>
    </section>
    <section class="card oi-card" id="${id("acoes-card")}">
      <span class="eyebrow">Ações com aportes mensais</span>
      <h2>Quanto pode virar, em dinheiro de hoje</h2>
      <div class="controls oi-geral">
        <div class="field"><label for="${id("aaporte")}">Aporte mensal</label><div class="money"><span>R$</span><input id="${id("aaporte")}" inputmode="decimal" autocomplete="off"></div></div>
        <div class="field"><label for="${id("aanos")}">Anos</label><div class="money"><input id="${id("aanos")}" inputmode="numeric" autocomplete="off"><span>anos</span></div></div>
        ${[0, 1, 2].map((i) => `<div class="field"><label for="${id("ac" + i)}">Cenário ${i + 1}: acima da inflação</label><div class="money"><input id="${id("ac" + i)}" inputmode="decimal" autocomplete="off"><span>% a.a.</span></div></div>`).join("")}
      </div>
      <div id="${id("acoes")}"></div>
      <ul class="oi-regras">
        <li>Vendas de ações até R$ 20 mil no mês, por CPF, são isentas de IR; acima disso, 15% sobre o ganho. <b>ETF não tem essa isenção.</b></li>
        <li>Para diversificar, um fundo de índice (ETF) compra dezenas de empresas de uma vez.</li>
        <li>Aporte fixo todo mês, sem tentar acertar a hora de comprar.</li>
        <li>Só dinheiro que fica 5 anos ou mais, e depois de a reserva de emergência estar completa.</li>
      </ul>
    </section>
    <section class="card oi-card" id="${id("premissas-card")}">
      <details><summary><span class="eyebrow">Premissas</span> Selic, CDI e IPCA (${esc(P().fonte || "")})</summary>
        <div class="controls oi-geral">
          <div class="field"><label for="${id("p-selic")}">Selic hoje</label><div class="money"><input id="${id("p-selic")}" data-p="selicHoje" inputmode="decimal"><span>%</span></div></div>
          ${Object.keys(PREMISSAS_PADRAO.selic).map((a) => `<div class="field"><label for="${id("p-s" + a)}">Selic no fim de ${a}</label><div class="money"><input id="${id("p-s" + a)}" data-p="selic.${a}" inputmode="decimal"><span>%</span></div></div>`).join("")}
          <div class="field"><label for="${id("p-sd")}">Selic de ${Number(Object.keys(PREMISSAS_PADRAO.selic).at(-1)) + 1} em diante</label><div class="money"><input id="${id("p-sd")}" data-p="selicDepois" inputmode="decimal"><span>%</span></div></div>
          <div class="field"><label for="${id("p-sp")}">CDI = Selic menos</label><div class="money"><input id="${id("p-sp")}" data-p="spread" inputmode="decimal"><span>p.p.</span></div></div>
          ${Object.keys(PREMISSAS_PADRAO.ipca).map((a) => `<div class="field"><label for="${id("p-i" + a)}">IPCA ${a}</label><div class="money"><input id="${id("p-i" + a)}" data-p="ipca.${a}" inputmode="decimal"><span>%</span></div></div>`).join("")}
          <div class="field"><label for="${id("p-id")}">IPCA de ${Number(Object.keys(PREMISSAS_PADRAO.ipca).at(-1)) + 1} em diante</label><div class="money"><input id="${id("p-id")}" data-p="ipcaDepois" inputmode="decimal"><span>%</span></div></div>
        </div>
        <button type="button" class="chip" id="${id("p-padrao")}">Voltar ao ${esc(PREMISSAS_PADRAO.fonte)}</button>
        <p class="note">A Selic é interpolada mês a mês entre hoje e o fim de cada ano. Com o CDI de hoje fixo, o comparador usa ${pctN(P().selicHoje - P().spread, 2)} o tempo todo.</p>
      </details>
    </section>
    <p class="oi-rodape" role="note">Ferramenta educativa, não é recomendação de investimento. Taxas de exemplo; confira as ofertas reais antes de aplicar.</p>`;

  // ---------- 1. comparador
  const opcoesTipo = (v) => Object.entries(NOME_TIPO).map(([k, t]) => `<option value="${k}"${k === v ? " selected" : ""}>${t}</option>`).join("");
  const opcoesIndice = (v) => [["cdi", "% do CDI"], ["pre", "Prefixado (% a.a.)"], ["ipca", "IPCA + %"]].map(([k, t]) => `<option value="${k}"${k === v ? " selected" : ""}>${t}</option>`).join("");
  function linhasDoComparador() {
    $("linhas").innerHTML = E.comparador.linhas.map((l, i) => `<tr data-i="${i}">
      <td><select data-c="tipo" aria-label="Tipo da opção ${i + 1}">${opcoesTipo(l.tipo)}</select></td>
      <td><select data-c="indice" aria-label="Índice da opção ${i + 1}">${opcoesIndice(l.indice)}</select></td>
      <td><input data-c="taxa" inputmode="decimal" value="${campoBR(l.taxa)}" aria-label="Taxa da opção ${i + 1}" size="6"></td>
      <td class="num" data-r="bruto"></td><td class="num" data-r="ir"></td><td class="num" data-r="final"></td><td class="num" data-r="ano"></td><td class="num" data-r="cdi"></td><td data-r="equiv"></td>
      <td>${E.comparador.linhas.length > 1 ? `<button type="button" class="btn-link" data-remover="${i}" aria-label="Remover a opção ${i + 1}">×</button>` : ""}</td></tr>`).join("");
  }
  function calcularComparador() {
    const c = E.comparador;
    const dias = diasDoComparador();
    const valor = Number(c.valor) || 0;
    const res = c.linhas.map((l) => (valor > 0 && Number.isFinite(Number(l.taxa)) ? simular(l, { valor, dias, prem: P(), modo: c.modo, hoje }) : null));
    $("linhas").querySelectorAll("tr").forEach((tr, i) => {
      const r = res[i], l = c.linhas[i];
      const set = (k, v) => { tr.querySelector(`[data-r="${k}"]`).innerHTML = v; };
      if (!r) { ["bruto", "ir", "final", "ano", "cdi", "equiv"].forEach((k) => set(k, "—")); return; }
      set("bruto", brl(r.bruto));
      set("ir", r.isento ? '<span class="oi-isento">isento</span>' : `${pctN(r.aliquota * 100, 1)} · ${brl(r.ir)}`);
      set("final", `<b>${brl(r.final)}</b>`);
      set("ano", pct(r.liqAno));
      set("cdi", pctN(r.pctCdiLiq * 100, 1));
      set("equiv", r.isento ? `CDB de ${pctN(r.equivCDB, 1)} do CDI` : "—");
      tr.classList.remove("oi-vence");
      tr.dataset.nome = nomeOpcao(l);
    });
    const validos = res.map((r, i) => ({ r, l: c.linhas[i] })).filter((x) => x.r);
    if (validos.length < 1) { $("frase").textContent = ""; $("alertas").innerHTML = ""; return; }
    const ordem = [...validos].sort((a, b) => b.r.final - a.r.final);
    const venc = ordem[0], seg = ordem[1];
    const iv = c.linhas.indexOf(venc.l);
    $("linhas").querySelectorAll("tr")[iv].classList.add("oi-vence");
    const prazoTxt = c.unidade === "dias" ? `${dias} dias` : `${c.prazo} ${Number(c.prazo) === 1 ? "mês" : "meses"}`;
    let frase = "";
    if (seg) {
      const dif = venc.r.final - seg.r.final;
      frase = Math.abs(dif) < 0.5 ? `${nomeOpcao(venc.l)} e ${nomeOpcao(seg.l)} empatam em ${prazoTxt}.`
        : `${venc.r.isento ? "A" : "O"} <b>${esc(nomeOpcao(venc.l))}</b> rende <b>${brl0(dif)}</b> a mais que ${seg.r.isento ? "a" : "o"} ${esc(nomeOpcao(seg.l))} em ${prazoTxt}.`;
      const isento = [venc, seg].find((x) => x.r.isento);
      if (isento && Math.abs(dif) >= 0.5) frase += ` Para empatar com ${isento.l.tipo === "lci" || isento.l.tipo === "lca" ? "a" : "o"} ${esc(nomeOpcao(isento.l))}, um CDB precisaria pagar <b>${pctN(isento.r.equivCDB, 1)} do CDI</b>.`;
    } else frase = `${esc(nomeOpcao(venc.l))}: ${brl(venc.r.final)} em ${prazoTxt} (${pct(venc.r.liqAno)} ao ano, líquido).`;
    $("frase").innerHTML = frase;
    const alertas = [...new Set(validos.flatMap((x) => x.r.alertas))];
    $("alertas").innerHTML = alertas.map((a) => `<p class="aviso-cj">${esc(a)}</p>`).join("");
  }

  // ---------- 2. ranking
  const rankingDe = (meses, valor, filtro = () => true) => {
    const dias = diasDeMeses(meses);
    return E.ofertas.filter((o) => Number.isFinite(Number(o.taxa)) && filtro(o)).map((o) => ({ o, r: simular(o, { valor, dias, prem: P(), modo: "esperado", hoje }), selos: selosDe(o, meses, hoje) }))
      .sort((a, b) => b.r.liqAno - a.r.liqAno);
  };
  function linhasDasOfertas() {
    $("ofertas").innerHTML = E.ofertas.map((o, i) => `<tr data-o="${i}">
      <td><input data-of="nome" value="${esc(o.nome || "")}" aria-label="Nome da oferta ${i + 1}">${o.exemplo ? '<small class="oi-exemplo">exemplo, confira no app</small>' : ""}</td>
      <td><select data-of="tipo" aria-label="Tipo">${opcoesTipo(o.tipo)}</select></td>
      <td><select data-of="indice" aria-label="Índice">${[["cdi", "% do CDI"], ["pre", "Prefixado"], ["ipca", "IPCA +"], ["selic", "Selic +"]].map(([k, t]) => `<option value="${k}"${k === o.indice ? " selected" : ""}>${t}</option>`).join("")}</select></td>
      <td><input data-of="taxa" inputmode="decimal" value="${campoBR(o.taxa)}" size="5" aria-label="Taxa"></td>
      <td><input data-of="vence" type="date" value="${esc(o.vence || "")}" aria-label="Vencimento"></td>
      <td><button type="button" class="btn-link" data-remover-oferta="${i}" aria-label="Remover a oferta">×</button></td></tr>`).join("");
  }
  function calcularRanking() {
    const meses = Number(E.ranking.prazo) || 60, valor = Number(E.ranking.valor) || 10000;
    raiz.querySelectorAll("[data-oi-prazo]").forEach((b) => b.setAttribute("aria-pressed", String(Number(b.dataset.oiPrazo) === meses)));
    const lista = rankingDe(meses, valor);
    const maxReal = Math.max(0.0001, ...lista.map((x) => x.r.real));
    $("rank").innerHTML = lista.map((x, i) => `<tr class="${i === 0 ? "oi-vence" : ""}"><td>${i + 1}</td>
      <td><b>${esc(nomeOpcao(x.o))}</b>${x.o.exemplo ? ' <small class="oi-exemplo">exemplo, confira no app</small>' : ""}<div class="oi-selos">${x.selos.map(([t, c]) => `<span class="oi-selo ${c}">${esc(t)}</span>`).join("")}</div></td>
      <td class="num"><b>${pct(x.r.liqAno)}</b></td>
      <td><div class="oi-barra" role="img" aria-label="${pct(x.r.real)} acima da inflação"><span style="width:${Math.max(0, (x.r.real / maxReal) * 100).toFixed(1)}%"></span></div><small>${pct(x.r.real)} ao ano</small></td>
      <td class="num">${brl0(x.r.final)}</td><td>${x.r.isento ? `CDB de ${pctN(x.r.equivCDB, 0)}` : `${pctN(x.r.equivCDB, 0)} do CDI`}</td></tr>`).join("") || '<tr><td colspan="6">Nenhuma oferta.</td></tr>';
    // Frase: a melhor de taxa travada (pré ou IPCA+) contra a melhor pós-fixada no prazo
    const trav = lista.find((x) => x.o.indice === "pre" || x.o.indice === "ipca"), pos = lista.find((x) => x.o.indice === "cdi" || x.o.indice === "selic");
    const prazoTxt = (PRAZOS.find(([m]) => m === meses) || [0, `${meses} meses`])[1];
    $("rfrase").innerHTML = trav && pos ? (trav.r.liqAno > pos.r.liqAno
      ? `Em ${prazoTxt}, a melhor de taxa travada (<b>${esc(nomeOpcao(trav.o))}</b>, ${pct(trav.r.liqAno)} ao ano) ganha da melhor pós-fixada (${esc(nomeOpcao(pos.o))}, ${pct(pos.r.liqAno)}): com o CDI esperado caindo, prefixado e IPCA+ ganham nos prazos longos, porque travam a taxa de hoje.`
      : `Em ${prazoTxt}, a melhor pós-fixada (<b>${esc(nomeOpcao(pos.o))}</b>, ${pct(pos.r.liqAno)} ao ano) ainda ganha da melhor de taxa travada (${esc(nomeOpcao(trav.o))}, ${pct(trav.r.liqAno)}). Nos prazos longos, com o CDI esperado caindo, prefixado e IPCA+ tendem a ganhar.`) : "";
    // Decisão próxima: o próximo investimento a vencer
    const d = dados();
    const prox = d.investimentos.filter((x) => x.inv.vencimento && x.inv.vencimento >= hoje && x.saldo > 0).sort((a, b) => a.inv.vencimento.localeCompare(b.inv.vencimento))[0];
    $("decisao").innerHTML = prox ? `<div class="oi-decisao"><div><span class="eyebrow">Decisão próxima</span><b>${esc(prox.inv.nome || "")}</b> vence em ${dataBR(prox.inv.vencimento)} com ${brl(prox.saldo)}.${d.aporte > 0 ? ` Somando o aporte do mês (${brl(d.aporte)}), são ${brl(prox.saldo + d.aporte)} para decidir onde aplicar.` : ""}</div>
      <button type="button" class="btn" id="${id("levar")}">Levar ao comparador</button></div>` : "";
    if (prox) $("levar").onclick = () => { E.comparador.valor = Math.round((prox.saldo + (d.aporte || 0)) * 100) / 100; preencherComparador(); calcularComparador(); guardar(); $("comparador").scrollIntoView({ behavior: "smooth", block: "start" }); };
  }

  // ---------- 3. divisão do aporte
  function calcularDivisao() {
    const d = dados();
    const v = E.divisao;
    const aporte = v.aporte != null ? Number(v.aporte) : Number(d.aporte) || 0;
    const essencial = v.essencial != null ? Number(v.essencial) : Number(d.essencial) || 0;
    $("dorigem").textContent = [v.aporte == null ? (d.aporte > 0 ? `Aporte: o previsto do mês (${d.nomeAporte || "plano de aportes"}).` : "Sem aporte previsto: digite o valor.") : "",
      v.essencial == null ? (d.essencial > 0 ? `Custo essencial: os gastos essenciais de ${d.essencialMes || "último mês"} na visão do casal.` : "Sem gastos marcados como essenciais: digite o custo essencial do mês.") : ""].filter(Boolean).join(" ");
    const grupos = { reserva: 0, medio: 0, longo: 0, falta: 0 };
    const itens = { reserva: [], medio: [], longo: [], falta: [] };
    d.investimentos.filter((x) => x.saldo > 0).forEach((x) => { const g = grupoDe(x.inv, hoje); grupos[g] += x.saldo; itens[g].push(x); });
    const metaReserva = essencial * (Number(v.meses) || 0);
    const faltaReserva = Math.max(0, metaReserva - grupos.reserva);
    const naReserva = faltaReserva > 0.005 ? Math.min(faltaReserva, aporte / 2) : 0;
    const resto = aporte - naReserva;
    const longo = resto * (Number(v.pctLongo) || 0) / 100, medio = resto - longo;
    const acoes = longo * (Number(v.pctAcoes) || 0) / 100, longoRF = longo - acoes;
    E._acoesMes = acoes;
    const melhor = (meses, filtro) => rankingDe(meses, 10000, filtro)[0];
    const mR = melhor(12, (o) => o.liquidez === "diaria" || !o.vence), mM = melhor(36), mL = melhor(120, (o) => o.indice === "pre" || o.indice === "ipca");
    const sugestao = (x, prazo) => (x ? `<small>Melhor do ranking (${prazo}): <b>${esc(nomeOpcao(x.o))}</b>, ${pct(x.r.liqAno)} ao ano líquido</small>` : "<small>Cadastre ofertas no ranking.</small>");
    const progresso = metaReserva > 0 ? Math.min(1, grupos.reserva / metaReserva) : 0;
    const total = Object.values(grupos).reduce((a, b) => a + b, 0);
    const linhaG = (nome, chave, desc) => `<tr><td><b>${nome}</b><small>${desc}</small></td><td class="num">${brl0(grupos[chave])}</td><td class="num">${total ? pctN((grupos[chave] / total) * 100, 0) : "—"}</td></tr>`;
    $("divisao").innerHTML = `
      <div class="oi-reserva"><div class="oi-reserva-topo"><span>Reserva de emergência: <b>${brl0(grupos.reserva)}</b> de ${brl0(metaReserva)} (${v.meses} meses de ${brl0(essencial)})</span><b>${pctN(progresso * 100, 0)}</b></div>
        <div class="oi-barra oi-barra-grande" role="img" aria-label="${pctN(progresso * 100, 0)} da reserva"><span style="width:${(progresso * 100).toFixed(1)}%"></span></div></div>
      ${grupos.falta > 0.005 ? `<p class="aviso-cj"><b>${brl0(grupos.falta)} falta detalhar</b> (sem taxa ou sem vencimento${itens.falta.length ? `: ${itens.falta.slice(0, 3).map((x) => esc(x.inv.nome || "")).join("; ")}` : ""}). ${grupos.reserva + grupos.falta >= metaReserva && faltaReserva > 0 ? "Se for de liquidez diária, ele já completa a reserva." : "Peça ao banco a taxa e o vencimento para saber onde ele entra."}</p>` : ""}
      <div class="scroll"><table class="oi-grupos"><thead><tr><th>A carteira hoje</th><th class="num">Saldo</th><th class="num">%</th></tr></thead><tbody>
        ${linhaG("Reserva", "reserva", "liquidez diária")}${linhaG("Médio prazo", "medio", "vence em até 5 anos")}${linhaG("Longo prazo", "longo", "vence em mais de 5 anos, previdência e renda variável")}${linhaG("Falta detalhar", "falta", "sem taxa ou vencimento")}
      </tbody></table></div>
      <h3>Divisão de ${brl(aporte)}</h3>
      <div class="oi-divisao">
        <div class="oi-parte"><span class="eyebrow">Reserva</span><b class="num">${brl(naReserva)}</b>${faltaReserva > 0.005 ? `<small>metade do aporte até completar (faltam ${brl0(faltaReserva)})</small>` : "<small>a reserva já está completa</small>"}${sugestao(mR, "liquidez diária")}</div>
        <div class="oi-parte"><span class="eyebrow">Médio prazo</span><b class="num">${brl(medio)}</b><small>${100 - (Number(v.pctLongo) || 0)}% do restante</small>${sugestao(mM, "36 meses")}</div>
        <div class="oi-parte"><span class="eyebrow">Longo prazo (renda fixa)</span><b class="num">${brl(longoRF)}</b><small>${v.pctLongo}% do restante, menos as ações</small>${sugestao(mL, "120 meses, pré ou IPCA+")}</div>
        <div class="oi-parte"><span class="eyebrow">Ações</span><b class="num">${brl(acoes)}</b><small>${v.pctAcoes}% do longo prazo</small><small>Veja a simulação abaixo.</small></div>
      </div>`;
  }

  // ---------- 4. o que já temos
  function calcularTemos() {
    const d = dados();
    const vivos = d.investimentos.filter((x) => x.saldo > 0);
    const linhas = vivos.map((x) => {
      const inv = x.inv, tipo = tipoDoInvestimento(inv), t = lerTaxa(inv);
      if (["pgbl", "vgbl"].includes(inv.tipo)) return { x, selo: ["checar taxa de administração", "info"], equiv: null };
      if (VARIAVEL.includes(inv.tipo) || inv.indexador === "variavel") return { x, selo: ["renda variável", "info"], equiv: null };
      if (!tipo || !t || !inv.vencimento || inv.vencimento <= hoje) return { x, selo: ["pedir detalhe ao banco", "warn"], equiv: null };
      const dias = diasEntre(hoje, inv.vencimento);
      const r = simular({ tipo, indice: t.indice, taxa: t.taxa }, { valor: x.saldo, dias, prem: P(), modo: "esperado", hoje });
      const e = r.equivCDB;
      return { x, equiv: e, isento: r.isento, selo: e >= 110 ? ["boa taxa, repetir", "ok"] : e >= 95 ? ["razoável", "info"] : ["fraca, evitar repetir", "bad"] };
    }).sort((a, b) => (b.equiv ?? -1) - (a.equiv ?? -1));
    const total = vivos.reduce((t, x) => t + x.saldo, 0);
    const isenta = vivos.filter((x) => ISENTOS.includes(x.inv.tipo) || x.inv.tipo === "poupanca").reduce((t, x) => t + x.saldo, 0);
    const porEmissor = new Map();
    vivos.filter((x) => COM_FGC.includes(x.inv.tipo)).forEach((x) => { const e = emissorDe(x.inv) || "Emissor não informado"; porEmissor.set(e, (porEmissor.get(e) || 0) + x.saldo); });
    const emissores = [...porEmissor.entries()].sort((a, b) => b[1] - a[1]);
    $("temos").innerHTML = linhas.length ? `
      <div class="kpis"><div class="kpi"><span class="eyebrow">Isento de IR</span><b>${total ? pctN((isenta / total) * 100, 0) : "—"}</b><span class="note">${brl0(isenta)} de ${brl0(total)}</span></div>
        <div class="kpi"><span class="eyebrow">Maior emissor (FGC)</span><b>${emissores[0] ? pctN((emissores[0][1] / 250000) * 100, 0) : "—"}</b><span class="note">${emissores[0] ? `${esc(emissores[0][0])}: ${brl0(emissores[0][1])} do limite de R$ 250 mil por CPF` : "nenhum CDB, LCI ou LCA"}</span></div></div>
      <div class="scroll"><table class="oi-temos"><thead><tr><th>Investimento</th><th class="num">Saldo</th><th>Equivale a CDB (até o vencimento)</th><th>Avaliação</th></tr></thead><tbody>
      ${linhas.map((l) => `<tr><td>${esc(l.x.inv.nome || "")}<small>${esc([l.x.inv.taxa, l.x.inv.vencimento ? `vence ${dataBR(l.x.inv.vencimento)}` : "", l.x.dono || ""].filter(Boolean).join(" · "))}</small></td>
        <td class="num">${brl0(l.x.saldo)}</td><td>${l.equiv != null ? `<b>${pctN(l.equiv, 0)} do CDI</b>${l.isento ? " <small>(isento)</small>" : ""}` : "—"}</td><td><span class="oi-selo ${l.selo[1]}">${esc(l.selo[0])}</span></td></tr>`).join("")}
      </tbody></table></div>
      ${emissores.length ? `<details class="oi-fgc"><summary>Concentração por emissor (FGC até R$ 250 mil por CPF e por banco)</summary><ul>${emissores.map(([e, v]) => `<li><span>${esc(e)}</span><span class="oi-barra"><span style="width:${Math.min(100, (v / 250000) * 100).toFixed(1)}%"></span></span><span class="num">${brl0(v)}</span></li>`).join("")}</ul>
        <p class="note">Na conta conjunta, o limite do FGC é dividido entre os titulares. CRI, CRA e ações não têm FGC; o Tesouro é garantido pelo Tesouro Nacional.</p></details>` : ""}
      <p class="note">Equivalência pelo CDI esperado (premissas) até o vencimento de cada um, já descontado o IR de um CDB no mesmo prazo. 110% ou mais: boa taxa; de 95% a 110%: razoável; menos de 95%: fraca.</p>`
      : '<p class="note">Cadastre os investimentos (com taxa e vencimento) na lista acima para comparar com as ofertas de hoje.</p>';
  }

  // ---------- 5. ações
  function calcularAcoes() {
    const a = E.acoes;
    const aporte = a.aporte != null ? Number(a.aporte) : Math.round((E._acoesMes || 0) * 100) / 100;
    const anos = Number(a.anos) || 15;
    const tes = E.ofertas.find((o) => o.tipo === "tesouro" && o.indice === "ipca");
    const barras = a.cenarios.map((c) => ({ nome: `Ações ${pctN(c, 1)} acima da inflação`, ...projetarAportes({ aporte, anos, real: Number(c) || 0, prem: P(), hoje }), cor: "var(--c1)" }));
    if (tes) barras.push({ nome: `${nomeOpcao(tes)} (${pctN(tes.taxa, 1)} + IPCA)`, ...projetarAportes({ aporte, anos, real: Number(tes.taxa), prem: P(), custodia: 0.002, hoje }), cor: "var(--c2)" });
    const colocado = aporte * Math.round(anos * 12);
    if (!(aporte > 0)) { $("acoes").innerHTML = '<p class="note">Informe o aporte mensal em ações (o padrão é a fatia de ações da divisão do aporte).</p>'; return; }
    const W = 640, rot = 230, mr = 90, alt = 34, H = barras.length * alt + 34;
    const max = Math.max(colocado, ...barras.map((b) => b.liquido)) * 1.05;
    const x = (v) => rot + (v / max) * (W - rot - mr);
    $("acoes").innerHTML = `<p class="headline">Com <b>${brl(aporte)}</b> por mês por ${anos} anos, vocês colocam <b>${brl0(colocado)}</b> (em dinheiro de hoje).</p>
      <svg class="oi-grafico" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(barras.map((b) => `${b.nome}: ${brl0(b.liquido)}`).join("; "))}">
        ${barras.map((b, i) => `<g><text x="${rot - 8}" y="${i * alt + 22}" text-anchor="end" class="oi-g-rot">${esc(b.nome)}</text>
          <rect x="${rot}" y="${i * alt + 8}" width="${Math.max(2, x(b.liquido) - rot).toFixed(1)}" height="20" rx="3" fill="${b.cor}"><title>${esc(b.nome)}: ${brl0(b.liquido)} líquido em dinheiro de hoje (IR de ${brl0(b.ir)})</title></rect>
          <text x="${(x(b.liquido) + 6).toFixed(1)}" y="${i * alt + 22}" class="oi-g-val">${brl0(b.liquido)}</text></g>`).join("")}
        <line x1="${x(colocado).toFixed(1)}" x2="${x(colocado).toFixed(1)}" y1="2" y2="${H - 22}" stroke="var(--ink)" stroke-dasharray="4 4" stroke-width="1.5"/>
        <text x="${x(colocado).toFixed(1)}" y="${H - 6}" text-anchor="middle" class="oi-g-val">vocês colocam ${brl0(colocado)}</text>
      </svg>
      <p class="note">Em dinheiro de hoje, já sem IR (15% sobre o ganho nominal, com a inflação das premissas). ${tes ? `O Tesouro IPCA+ usa a taxa da lista de ofertas, menos a custódia de 0,20% ao ano.` : "Cadastre um Tesouro IPCA+ nas ofertas para comparar."} Ações oscilam: os cenários não são garantia.</p>`;
  }

  // ---------- campos e eventos
  function preencherComparador() {
    $("valor").value = campoBR(E.comparador.valor);
    $("prazo").value = String(E.comparador.prazo);
    $("unidade").value = E.comparador.unidade;
    $("modo").value = E.comparador.modo;
  }
  function preencher() {
    preencherComparador();
    linhasDoComparador();
    $("rvalor").value = campoBR(E.ranking.valor);
    linhasDasOfertas();
    const d = dados();
    $("daporte").value = campoBR(E.divisao.aporte != null ? E.divisao.aporte : d.aporte || "");
    $("dess").value = campoBR(E.divisao.essencial != null ? E.divisao.essencial : d.essencial || "");
    $("dmeses").value = String(E.divisao.meses);
    $("dlongo").value = String(E.divisao.pctLongo);
    $("dacoes").value = String(E.divisao.pctAcoes);
    $("aanos").value = String(E.acoes.anos);
    E.acoes.cenarios.forEach((c, i) => { $("ac" + i).value = campoBR(c, 2); });
    raiz.querySelectorAll("[data-p]").forEach((el) => { const [a, b] = el.dataset.p.split("."); el.value = campoBR(b ? E.premissas[a][b] : E.premissas[a], 2); });
  }
  function tudo() {
    calcularComparador();
    calcularRanking();
    calcularDivisao();
    calcularTemos();
    if (E.acoes.aporte == null) $("aaporte").value = campoBR(Math.round((E._acoesMes || 0) * 100) / 100);
    calcularAcoes();
  }
  raiz.addEventListener("input", (e) => {
    const el = e.target;
    const v = lerBR(el.value);
    if (el.id === id("valor")) E.comparador.valor = v;
    else if (el.id === id("prazo")) E.comparador.prazo = v;
    else if (el.dataset.c) { const i = Number(el.closest("tr").dataset.i); E.comparador.linhas[i][el.dataset.c] = el.dataset.c === "taxa" ? v : el.value; }
    else if (el.id === id("rvalor")) E.ranking.valor = v;
    else if (el.dataset.of) { const i = Number(el.closest("tr").dataset.o); const o = E.ofertas[i]; o[el.dataset.of] = el.dataset.of === "taxa" ? v : el.value || null; if (el.dataset.of === "vence") o.liquidez = el.value ? null : "diaria"; o.exemplo = false; }
    else if (el.id === id("daporte")) E.divisao.aporte = el.value.trim() ? v : null;
    else if (el.id === id("dess")) E.divisao.essencial = el.value.trim() ? v : null;
    else if (el.id === id("dmeses")) E.divisao.meses = v ?? 6;
    else if (el.id === id("dlongo")) E.divisao.pctLongo = Math.min(100, Math.max(0, v ?? 50));
    else if (el.id === id("dacoes")) E.divisao.pctAcoes = Math.min(100, Math.max(0, v ?? 15));
    else if (el.id === id("aaporte")) E.acoes.aporte = el.value.trim() ? v : null;
    else if (el.id === id("aanos")) E.acoes.anos = v ?? 15;
    else if (/-ac\d$/.test(el.id)) E.acoes.cenarios[Number(el.id.slice(-1))] = v ?? 0;
    else if (el.dataset.p) { const [a, b] = el.dataset.p.split("."); if (v != null) { if (b) E.premissas[a][b] = v; else E.premissas[a] = v; } }
    else return;
    tudo();
    guardar();
  });
  raiz.addEventListener("change", (e) => {
    const el = e.target;
    if (el.id === id("unidade")) E.comparador.unidade = el.value;
    else if (el.id === id("modo")) E.comparador.modo = el.value;
    else if (el.tagName === "SELECT" && el.dataset.c) { const i = Number(el.closest("tr").dataset.i); E.comparador.linhas[i][el.dataset.c] = el.value; }
    else if (el.tagName === "SELECT" && el.dataset.of) { const i = Number(el.closest("tr").dataset.o); E.ofertas[i][el.dataset.of] = el.value; E.ofertas[i].exemplo = false; }
    else return;
    tudo();
    guardar();
  });
  raiz.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.id === id("mais")) { E.comparador.linhas.push({ tipo: "lca", indice: "cdi", taxa: 94 }); linhasDoComparador(); }
    else if (b.dataset.remover != null) { E.comparador.linhas.splice(Number(b.dataset.remover), 1); linhasDoComparador(); }
    else if (b.dataset.oiPrazo) E.ranking.prazo = Number(b.dataset.oiPrazo);
    else if (b.id === id("nova-oferta")) { E.ofertas.push({ id: novoId(), nome: "", tipo: "cdb", indice: "cdi", taxa: 100, vence: somarMeses(hoje, 24) }); linhasDasOfertas(); }
    else if (b.dataset.removerOferta != null) { E.ofertas.splice(Number(b.dataset.removerOferta), 1); linhasDasOfertas(); }
    else if (b.id === id("exemplos")) { E.ofertas = ofertasExemplo(hoje); linhasDasOfertas(); }
    else if (b.id === id("p-padrao")) { E.premissas = JSON.parse(JSON.stringify(PREMISSAS_PADRAO)); preencher(); }
    else return;
    tudo();
    guardar();
  });
  preencher();
  tudo();
  // Os dados do painel mudaram (o painel da outra pessoa carregou, um aporte novo): refaz o que depende deles
  return { desenhar() { const d = dados(); if (E.divisao.aporte == null) $("daporte").value = campoBR(d.aporte || ""); if (E.divisao.essencial == null) $("dess").value = campoBR(d.essencial || ""); tudo(); } };
}
