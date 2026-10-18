// Finanças pessoais (area/financas.html): o painel do projeto Financeiro (visão geral do mês, gastos do dia a dia,
// cartão e faturas e investimentos), desenhado com os dados importados do arquivo do painel e guardados no banco.
// Os cálculos são os do painel original do projeto. O que depende do Claude (pasta do computador, envio do PDF
// da fatura) continua no painel original, aberto pelo botão "Abrir no Claude".
// Nenhum dado pessoal fica neste código: nomes, valores e cartões vêm todos dos dados importados.
import { outrasPessoas } from "./financas-importar.js";
import { chavesFatura, chavesGastos, efetivo, lerCategorias, nomeConta } from "./financas-classificacao.js";

const MESES_PADRAO = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const VAZIO = {arquivo: "", faturas: [], parcelamentos: [], comprometido: {}, categorias: {}, postos: {}, lancamentos: [], alertas: []};
const guardar = (chave, valor) => {
  try {
    localStorage.setItem(`mz-fin-${chave}`, valor);
  } catch {
    /* sem armazenamento: só não lembra a escolha */
  }
};
const lembrar = (chave) => {
  try {
    return localStorage.getItem(`mz-fin-${chave}`);
  } catch {
    return null;
  }
};

// Completa o que faltar, para um arquivo de outra versão do painel não quebrar a tela
function completar(dados) {
  const d = {...(dados || {})};
  d.meses = (Array.isArray(d.meses) ? d.meses : []).map(m => ({lancamentos: [], receitas: [], compromissos: [], ...m}));
  d.cartao = {...VAZIO, ...(d.cartao || {})};
  d.relatorios = Array.isArray(d.relatorios) ? d.relatorios : [];
  d.recorrentes = (Array.isArray(d.recorrentes) ? d.recorrentes : []).map(r => ({busca: [], ...r}));
  d.rotulos_meses = Array.isArray(d.rotulos_meses) && d.rotulos_meses.length === 12 ? d.rotulos_meses : MESES_PADRAO;
  return d;
}

// Desenha o painel uma vez por página (depois de importar dados novos, a página é recarregada).
// Os gastos lançados pelo site entram junto com os do projeto; atualizarGastos() redesenha depois de lançar ou apagar.
// A classificação feita no site (categoria, subcategoria, essencial, conta e complemento) vale por cima do que veio
// do projeto; atualizarClassificacao() redesenha depois de classificar ou de mudar a lista de categorias.
export function desenharFinancas({ dados, carteira = null, modo = "completo", nome = "", linkClaude = null,
  gastosSite = [], aoLancarGasto = null, aoApagarGasto = null, aoImportarExtrato = null,
  categorias = null, ajustes = [], contas = [], aoClassificar = null, aoEditarCategorias = null, comDesejos = false }) {
  const D = completar(dados);
  let CATS = categorias || lerCategorias(null, dados);
  let AJ = new Map(ajustes.map(a => [a.chave, a]));
  let CONTAS = contas;
  const ef = l => efetivo(l, AJ.get(l.chave), CATS);
  const nomeDaConta = c => (CONTAS.find(x => x.id === c) || {}).nome || nomeConta(c);
  const SO_FATURAS = modo === "faturas";
  const CARTEIRA = carteira || null;
  const TEM_NOME = !!String(nome || "").trim();
  const DONO = TEM_NOME ? String(nome).trim().split(/\s+/)[0] : "Você";
  const OUTRA = SO_FATURAS ? null : outrasPessoas(D)[0] || null;
  const TITULARES = CARTEIRA && CARTEIRA.titulares ? String(CARTEIRA.titulares) : "";

  const brl = v => (v == null ? "—" : typeof v === "number" ? v.toLocaleString("pt-BR", {style: "currency", currency: "BRL"}) : esc(v));
  const n = v => (v == null ? "—" : typeof v === "number" ? v.toLocaleString("pt-BR", {minimumFractionDigits: 2, maximumFractionDigits: 2}) : esc(v));
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const sum = (a, f = x => x) => a.reduce((s, x) => s + (f(x) || 0), 0);
  const MES = D.rotulos_meses;
  const lbl = (a, m) => `${MES[m - 1]}/${String(a).slice(2)}`;
  const nextYM = (a, m, n = 1) => { const t = m - 1 + n; return [a + Math.floor(t / 12), (t % 12) + 1]; };
  const dBR = iso => esc(`${String(iso).slice(8, 10)}/${String(iso).slice(5, 7)}`);
  const dataLonga = iso => new Date(iso + "T12:00").toLocaleDateString("pt-BR");
  const $id = id => document.getElementById(id);
  const semAcento = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const hoje = new Date();
  const hojeKey = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  const card = f => /cart/i.test(f || "");
  const META = D.metas ? D.metas.cartao_mensal : null;
  const INV = D.metas ? D.metas.investimento_mensal || 0 : 0;
  const INV_NOME = D.metas ? D.metas.investimento_nome : "";
  // Um print antigo de uma fatura que já foi processada não conta mais como fatura aberta
  const AB = D.aberta && !D.cartao.faturas.some(f => f.mes === D.aberta.fatura) ? D.aberta : null;
  const SAL_NORMAL = (() => { for (const m of [...D.meses].reverse()) { const s = m.receitas.find(r => r.fonte === "Empresa" && r.liquido != null); if (s) return s.liquido; } return 0; })();
  // Outras receitas do mês (além do salário), como no último mês em que apareceram
  const OUTRAS_NORMAL = (() => { for (const m of [...D.meses].reverse()) { const o = m.receitas.filter(r => r.fonte !== "Empresa" && r.liquido != null); if (o.length) return sum(o, r => r.liquido); } return 0; })();
  const RECEITA_PREVISTA = SAL_NORMAL + OUTRAS_NORMAL;

  // ---------- Gastos lançados pelo site: entram nos meses como os do projeto (os de cartão, na fatura) ----------
  const ORIGINAL = {meses: structuredClone(D.meses), comprometido: structuredClone(D.cartao.comprometido)};
  const FORMAS_SITE = {cartao: "Cartão de crédito", pix: "Pix", debito: "Débito", dinheiro: "Dinheiro", outro: "Outro"};
  const faturaSeguinte = (rotulo, k) => {
    const [mm, yy] = String(rotulo || "").split("/");
    const i = MES.indexOf(mm);
    if (i < 0 || !yy) return null;
    const [a, m] = nextYM(2000 + Number(yy), i + 1, k);
    return lbl(a, m);
  };
  let duplicados = 0;
  let parcelasSite = []; // compras parceladas lançadas pelo site, para a lista de parceladas a vencer
  let atual = null;
  function mesclarGastosSite(lista) {
    D.meses = structuredClone(ORIGINAL.meses);
    D.cartao.comprometido = structuredClone(ORIGINAL.comprometido);
    duplicados = 0;
    parcelasSite = [];
    for (const g of lista || []) {
      const chave = String(g.data).slice(0, 7);
      let m = D.meses.find(x => x.chave === chave);
      if (!m) {
        const [a, mes] = chave.split("-").map(Number);
        const [fa, fm] = nextYM(a, mes);
        m = {chave, rotulo: lbl(a, mes), ano: a, mes, fatura: lbl(fa, fm), lancamentos: [], receitas: [], compromissos: []};
        D.meses.push(m);
        D.meses.sort((x, y) => x.chave.localeCompare(y.chave));
      }
      const parcelas = g.forma === "cartao" ? Math.max(1, g.parcelas || 1) : 1;
      const valor = Math.round(g.valor / parcelas * 100) / 100;
      // O mesmo gasto já anotado no projeto (mesma data e mesmo valor) não conta de novo
      if (m.lancamentos.some(l => l.origem !== "site" && l.data === g.data && Math.abs(l.valor - valor) < 0.01)) { duplicados++; continue; }
      m.lancamentos.push({data: g.data, desc: g.descricao, valor, forma: FORMAS_SITE[g.forma] || "Outro", cat: g.categoria || "Outros",
        parcelas: parcelas > 1 ? `1/${parcelas}` : null, obs: g.observacao || "",
        essencial: g.essencial === true ? "Essencial" : g.essencial === false ? "Não essencial" : null, origem: "site", id: g.id,
        sub: g.subcategoria || null, conta: g.conta || null});
      // Parcelado no cartão: as próximas parcelas entram nas faturas seguintes, a não ser que a compra já
      // apareça numa fatura processada pelo projeto (aí as parcelas já estão contadas)
      if (parcelas > 1 && !D.cartao.lancamentos.some(l => l.data === g.data && Math.abs(l.valor - valor) < 0.01)) {
        for (let k = 1; k < parcelas; k++) {
          const fat = faturaSeguinte(m.fatura, k);
          if (fat) D.cartao.comprometido[fat] = Math.round(((D.cartao.comprometido[fat] || 0) + valor) * 100) / 100;
        }
        parcelasSite.push({nome: g.descricao, valor, faturas: Array.from({length: parcelas}, (_, k) => faturaSeguinte(m.fatura, k))});
      }
    }
    D.meses.forEach(x => x.lancamentos.sort((p, q) => String(p.data).localeCompare(String(q.data))));
    // Chave de cada lançamento, para achar a classificação feita no site
    D.meses.forEach(x => chavesGastos(x.lancamentos).forEach((k, i) => { x.lancamentos[i].chave = k; }));
    if (atual) atual = D.meses.find(x => x.chave === atual.chave) || atual;
  }
  mesclarGastosSite(gastosSite);

  atual = D.meses.find(m => m.chave === hojeKey) || [...D.meses].reverse().find(m => m.chave <= hojeKey) || D.meses[0];
  { const s = lembrar("mes"); if (s && D.meses.some(m => m.chave === s) && s >= hojeKey) atual = D.meses.find(m => m.chave === s); }

  const snapDe = m => (AB && AB.mes_compras === m.chave ? AB : null);

  // Liga cada gasto fixo a um lançamento já registrado, para não contar duas vezes.
  // Com a fatura aberta do app, fixos de cartão cujo dia já passou estão dentro dela.
  function statusRecorrentes(m) {
    const usados = new Set(), snap = snapDe(m);
    const snapDia = snap ? Number(snap.data.slice(8, 10)) : null;
    const corrente = m.chave === hojeKey, passado = m.chave < hojeKey;
    return D.recorrentes.map(r => {
      const bate = l => r.busca.some(b => l.desc.toLowerCase().includes(b));
      if (r.variavel) {
        let gasto = 0;
        m.lancamentos.forEach((l, i) => { if (!usados.has(i) && bate(l)) { usados.add(i); gasto += l.valor; } });
        if (snap) gasto += sum((snap.transacoes || []).filter(t => r.busca.some(b => t.nome.toLowerCase().includes(b)) && !m.lancamentos.some(l => l.data === t.data && Math.abs(l.valor - t.valor) < 0.01)), t => t.valor);
        const falta = r.valor != null ? Math.max(0, r.valor - gasto) : 0;
        const st = r.valor == null ? {t: "informar valor", c: "bad"}
          : gasto >= r.valor ? {t: `${brl(gasto)} no mês`, c: ""}
          : gasto > 0 ? {t: `${brl(gasto)} até agora`, c: "warn"}
          : {t: "previsto no mês", c: "warn"};
        return {...r, st, pendente: falta};
      }
      let idx = -1;
      if (r.valor != null) idx = m.lancamentos.findIndex((l, i) => !usados.has(i) && bate(l) && Math.abs(l.valor - r.valor) <= Math.max(5, r.valor * 0.15));
      if (idx >= 0) usados.add(idx);
      let st, pend = 0;
      if (idx >= 0) st = {t: "lançado", c: ""};
      else if (r.valor == null) st = {t: "informar valor", c: "bad"};
      else if (snap && card(r.forma) && r.dia && r.dia <= snapDia) st = {t: "na fatura aberta", c: ""};
      else if (passado || (corrente && r.dia && r.dia < hoje.getDate())) { st = {t: `dia ${r.dia}, não lançado`, c: "warn"}; pend = r.valor; }
      else { st = {t: r.dia ? `previsto dia ${r.dia}` : "previsto", c: "warn"}; pend = r.valor; }
      return {...r, st, pendente: pend};
    });
  }

  function calc(m) {
    const snap = snapDe(m);
    const receitas = sum(m.receitas, r => r.liquido);
    const rec = statusRecorrentes(m);
    const fixosCartao = sum(rec.filter(r => card(r.forma)), r => r.pendente);
    const fixosOutros = sum(rec.filter(r => !card(r.forma)), r => r.pendente);
    const lancCartao = m.lancamentos.filter(l => card(l.forma));
    const outros = sum(m.lancamentos.filter(l => !card(l.forma)), l => l.valor);
    const linhas = [];
    if (INV) linhas.push({t: INV_NOME || "Investimento", v: INV, cor: "var(--inv)", leg: "Investimento"});
    let cartao, parcelas = D.cartao.comprometido[m.fatura];
    if (parcelas == null) parcelas = sum(m.compromissos, c => c.valor);
    if (snap) {
      const depois = sum(lancCartao.filter(l => l.data > snap.data), l => l.valor);
      cartao = snap.total + depois + fixosCartao;
      linhas.push({t: `Fatura ${snap.fatura} aberta no app (${dBR(snap.data)})`, v: snap.total, cor: "var(--parc)", leg: "Fatura aberta"});
      linhas.push({t: `Compras no cartão depois de ${dBR(snap.data)}`, v: depois, cor: "var(--gasto)", leg: "Compras novas"});
      linhas.push({t: "Fixos no cartão que ainda vão cair", v: fixosCartao, cor: "var(--rec)", leg: "Fixos a cair"});
    } else {
      const compras = sum(lancCartao, l => l.valor);
      cartao = parcelas + compras + fixosCartao;
      linhas.push({t: `Parcelas já agendadas · fatura ${m.fatura}`, v: parcelas, cor: "var(--parc)", leg: "Parcelas"});
      linhas.push({t: "Compras lançadas no cartão", v: compras, cor: "var(--gasto)", leg: "Compras"});
      linhas.push({t: "Fixos no cartão que ainda vão cair", v: fixosCartao, cor: "var(--rec)", leg: "Fixos a cair"});
    }
    linhas.push({t: "Gastos fora do cartão (Pix, débito, dinheiro)", v: outros, cor: "var(--muted)", leg: "Fora do cartão"});
    if (fixosOutros) linhas.push({t: "Fixos fora do cartão", v: fixosOutros, cor: "var(--rec)", leg: "Fixos fora"});
    const saldo = receitas - sum(linhas, l => l.v);
    let dias = null;
    if (m.chave === hojeKey) dias = new Date(m.ano, m.mes, 0).getDate() - hoje.getDate() + 1;
    const sal = m.receitas.find(r => r.fonte === "Empresa");
    return {snap, receitas, rec, linhas, cartao, parcelas, fixosCartao, outros, saldo, dias, semSalario: !sal || sal.liquido == null};
  }

  // Ritmo dos gastos variáveis no cartão desde o início do ciclo da fatura aberta
  function ritmo(m, c) {
    const snap = c.snap; if (!snap || !snap.melhor_data) return null;
    const dia = Number(snap.data.slice(8, 10));
    const fecha = new Date(snap.melhor_data + "T12:00"); fecha.setDate(fecha.getDate() - 1);
    if (isNaN(fecha)) return null;
    const snapD = new Date(snap.data + "T12:00");
    const desde = new Date(Math.max(snapD, new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 12)));
    const faltam = Math.max(0, Math.round((fecha - desde) / 864e5));
    const decorridos = Math.max(0, Math.round((desde - snapD) / 864e5));
    const jaFixos = sum(c.rec.filter(r => card(r.forma) && r.st.t === "na fatura aberta"), r => r.valor);
    // Só as parceladas que já estavam no print; as informadas depois entram como compras lançadas
    const novas = sum((snap.novas_parcelas || []).filter(n => n.primeira_fatura === snap.fatura && !(n.data > snap.data)), n => n.valor);
    const variavel = Math.max(0, snap.total - c.parcelas - jaFixos - novas);
    const porDia = Math.round(variavel / dia * 100) / 100;
    // Dias já passados desde o print: vale o que foi lançado ou o ritmo, o que for maior
    const depois = (c.linhas.find(l => l.leg === "Compras novas") || {}).v || 0;
    return {faltam, porDia, fecha, projecao: c.cartao - depois + Math.max(depois, porDia * decorridos) + porDia * faltam};
  }

  const porcento = v => `${Math.round(v * 100).toLocaleString("pt-BR")}%`;
  function listaAlertas(m, c) {
    const a = [];
    if (META != null) {
      if (c.snap) {
        const r = ritmo(m, c);
        if (c.snap.total > META) a.push({c: "bad", h: `A fatura de ${c.snap.fatura} já passou da sua previsão.`, t: `Está em ${brl(c.snap.total)} no app, ${brl(c.snap.total - META)} acima dos ${brl(META)}. ${r ? `${r.faltam > 1 ? `Faltam ${r.faltam} dias para ela fechar` : r.faltam === 1 ? "Ela fecha amanhã" : "Ela fecha hoje"} e ainda vão` : "Ainda vão"} cair ${brl(c.fixosCartao)} de fixos, então ela fecha em pelo menos ${brl(c.cartao)}.${r ? ` Se o ritmo de compras das primeiras semanas continuar (${brl(r.porDia)} por dia), ela fecha perto de ${brl(r.projecao)}.` : ""}`});
        else if (c.cartao > META) a.push({c: "bad", h: `A fatura de ${c.snap.fatura} vai passar da sua previsão.`, t: `Com os fixos que ainda vão cair, ela chega a ${brl(c.cartao)}, ${brl(c.cartao - META)} acima dos ${brl(META)}.`});
        else if (c.cartao > META * 0.85) a.push({c: "warn", h: `A fatura de ${c.snap.fatura} está perto da sua previsão.`, t: `Já soma ${brl(c.cartao)} de ${brl(META)}. Cabem mais ${brl(META - c.cartao)}${r && r.faltam ? (r.faltam === 1 ? " até amanhã" : ` em ${r.faltam} dias`) : ""}.`});
      } else {
        const base = c.parcelas + c.fixosCartao;
        if (c.cartao > META) a.push({c: "bad", h: `A fatura de ${m.fatura} vai passar da sua previsão.`, t: `Já soma ${brl(c.cartao)}, ${brl(c.cartao - META)} acima dos ${brl(META)}.`});
        else a.push({c: "info", h: `A fatura de ${m.fatura} começa com ${brl(base)} comprometidos.`, t: `São ${brl(c.parcelas)} de parcelas e ${brl(c.fixosCartao)} de fixos. Para ficar nos ${brl(META)}, cabem mais ${brl(META - c.cartao)} em compras no cartão em ${m.rotulo}.`});
      }
      if (m.chave === hojeKey) {
        const ult = D.cartao.faturas.at(-1);
        if (ult && ult.total > META) a.push({c: "warn", h: `A última fatura fechada (${ult.mes}) foi de ${brl(ult.total)}.`, t: `Ficou ${brl(ult.total - META)} acima da previsão de ${brl(META)}.`});
      }
    }
    if (AB && m.chave === hojeKey) (AB.novas_parcelas || []).forEach(n => {
      const [pa, pm] = (() => { const [mm, yy] = n.primeira_fatura.split("/"); return [2000 + Number(yy), MES.indexOf(mm) + 1]; })();
      const [ua, um] = nextYM(pa, pm, n.parcelas - 1);
      a.push({c: "info", h: `Nova compra parcelada: ${n.nome}.`, t: `${n.parcelas}x de ${brl(n.valor)} até a fatura de ${lbl(ua, um)}, somando ${brl(n.total != null ? n.total : n.valor * n.parcelas)}.`});
    });
    // O uso do dinheiro do mês vem antes dos outros: saldo negativo, ou 85% ou mais já usados
    if (c.saldo < 0) a.unshift({c: "bad", h: `O saldo de ${m.rotulo} está negativo.`, t: `Faltam ${brl(-c.saldo)} para fechar o mês com o que já está gasto e previsto.`});
    else if (c.receitas > 0 && (c.receitas - c.saldo) / c.receitas >= 0.85) {
      a.unshift({c: "warn", h: `Você já usou ${porcento((c.receitas - c.saldo) / c.receitas)} do dinheiro de ${m.rotulo}.`,
        t: `Sobram ${brl(c.saldo)} para o resto do mês${c.dias ? `, ${brl(c.saldo / c.dias)} por dia` : ""}.`});
    }
    return a;
  }
  const htmlAlertas = a => a.map(x => `<div class="alert ${x.c}" role="${x.c === "bad" ? "alert" : "status"}"><span class="sev"></span><div><b>${esc(x.h)}</b> ${esc(x.t)}</div></div>`).join("");
  function alertas(m, c) {
    const html = htmlAlertas(listaAlertas(m, c));
    $id("alertas").innerHTML = html;
    $id("g-alertas").innerHTML = html;
  }

  // ---------- Termômetro do mês: quanto do dinheiro do mês já está gasto ou comprometido ----------
  function renderTermometro(m, c) {
    const box = $id("g-termometro");
    const botao = !aoLancarGasto ? "" : `<div class="termometro-acoes"><button type="button" class="btn" id="btn-lancar-gasto">Lançar gasto ou Pix</button>${aoImportarExtrato ? '<button type="button" class="btn btn-claro" id="btn-extrato-gastos">Importar extrato</button>' : ""}</div>`;
    if (!(c.receitas > 0)) {
      box.innerHTML = `<div class="termometro-topo"><div><div class="label">Uso do dinheiro de ${esc(m.rotulo)}</div><p class="muted" style="margin:6px 0 0">O percentual aparece quando as receitas do mês estiverem lançadas no projeto Financeiro.</p></div>${botao}</div>`;
    } else {
      const usado = c.receitas - c.saldo;
      const uso = usado / c.receitas;
      const nivel = uso >= 1 ? "bad" : uso >= 0.85 ? "warn" : "ok";
      const escala = Math.max(c.receitas, usado);
      const w = v => `${(Math.max(0, v) / escala * 100).toFixed(2)}%`;
      const segs = c.linhas.filter(l => l.v > 0);
      const gastosDia = sum(m.lancamentos, l => l.valor);
      const doSite = m.lancamentos.filter(l => l.origem === "site").length;
      box.innerHTML = `
        <div class="termometro-topo">
          <div>
            <div class="label">Uso do dinheiro de ${esc(m.rotulo)}</div>
            <div class="termometro-pct ${nivel}">${porcento(uso)}</div>
            <div class="sub">${brl(usado)} de ${brl(c.receitas)} já gastos ou comprometidos · ${c.saldo >= 0 ? `sobram ${brl(c.saldo)}${c.dias ? ` (${brl(c.saldo / c.dias)} por dia)` : ""}` : `faltam ${brl(-c.saldo)}`}</div>
          </div>
          ${botao}
        </div>
        <div class="meter termometro-barra" role="img" aria-label="${porcento(uso)} do dinheiro do mês usado">
          <div class="bar">${segs.map(l => `<span style="width:${w(l.v)};background:${l.cor}"></span>`).join("")}</div>
          <span class="metaline" style="left:${w(c.receitas * 0.85)}"></span><span class="metalbl" style="left:${w(c.receitas * 0.85)}">85%</span>
        </div>
        <div class="legend">${segs.map(l => `<span><i style="background:${l.cor}"></i>${l.leg} ${porcento(l.v / c.receitas)}</span>`).join("")}<span><i style="background:var(--line)"></i>Livre ${porcento(Math.max(0, c.saldo) / c.receitas)}</span></div>
        <div class="kv" style="margin-top:14px">
          <div><span class="label">Gastos do dia a dia</span><b>${brl(gastosDia)} · ${porcento(gastosDia / c.receitas)} do mês</b></div>
          <div><span class="label">Cartão (fatura ${esc(m.fatura)})</span><b>${brl(c.cartao)}${META != null ? ` · ${porcento(c.cartao / META)} da previsão` : ""}</b></div>
        </div>
        ${doSite ? `<p class="sub" style="margin:10px 0 0">${doSite} ${doSite === 1 ? "gasto lançado" : "gastos lançados"} pelo site neste mês.${duplicados ? ` ${duplicados === 1 ? "Um já estava" : `${duplicados} já estavam`} no projeto Financeiro e não contou de novo.` : ""}</p>` : ""}`;
    }
    const b = $id("btn-lancar-gasto");
    if (b) b.onclick = aoLancarGasto;
    const x = $id("btn-extrato-gastos");
    if (x) x.onclick = aoImportarExtrato;
  }

  function renderMonths() {
    document.querySelectorAll(".fin nav.months").forEach(box => {
      box.innerHTML = D.meses.map(m =>
        `<button type="button" aria-pressed="${m === atual}" data-k="${esc(m.chave)}">${esc(m.rotulo)}${m.chave === hojeKey ? " · agora" : ""}</button>`).join("");
      box.querySelectorAll("button").forEach(b => b.onclick = () => {
        const vista = b.closest("section.view").id;
        atual = D.meses.find(m => m.chave === b.dataset.k);
        guardar("mes", atual.chave);
        render();
        const nb = [...document.querySelectorAll(`#${vista} nav.months button`)].find(x => x.dataset.k === atual.chave);
        if (nb) nb.focus();
      });
    });
  }

  function renderHero(m, c) {
    const pct = v => (c.receitas > 0 ? Math.max(0, v / c.receitas * 100) : 0);
    const segs = c.linhas.filter(l => l.v > 0);
    $id("hero").innerHTML = `
      <div class="label">Saldo disponível em ${esc(m.rotulo)}</div>
      <div class="big num ${c.saldo < 0 ? "neg" : ""}">${brl(c.saldo)}</div>
      <div class="sub">${c.dias ? `${brl(c.saldo / c.dias)} por dia nos ${c.dias} dias que faltam` : m.chave > hojeKey ? "Previsão para o mês" : "Mês encerrado"}</div>
      ${c.receitas > 0 ? `<div class="stack" role="img" aria-label="Como a receita do mês está dividida">${segs.map(l => `<span style="width:${pct(l.v)}%;background:${l.cor}"></span>`).join("")}</div>
      <div class="legend">${segs.map(l => `<span><i style="background:${l.cor}"></i>${l.leg}</span>`).join("")}<span><i style="background:var(--line)"></i>Livre</span></div>` : ""}
      <table class="calc" style="margin-top:14px"><tbody>
        ${m.receitas.map(r => `<tr><td>${esc(r.desc)} ${r.liquido == null ? '<span class="chip bad">aguardando holerite</span>' : /estimativa/i.test(r.obs || "") ? '<span class="chip warn">estimado</span>' : ""}</td><td class="r num">${brl(r.liquido)}</td></tr>`).join("")}
        ${c.linhas.map(l => `<tr><td>(−) ${esc(l.t)}</td><td class="r num">${l.v ? brl(-l.v) : brl(0)}</td></tr>`).join("")}
        <tr class="total"><td>Saldo disponível</td><td class="r num">${brl(c.saldo)}</td></tr>
      </tbody></table>
      ${c.semSalario ? `<div class="note"><b>Falta o salário.</b> Ele entra quando o holerite for lançado no projeto Financeiro.</div>` : ""}
      ${c.snap ? `<p class="muted" style="font-size:.85rem;margin:10px 0 0">O cartão deste mês vem do valor da fatura aberta no app do banco em ${dBR(c.snap.data)}, que já inclui as parcelas e as compras até essa data.</p>` : ""}`;
  }

  function renderComparativo(m, c) {
    if (META == null) { $id("comparativo").hidden = true; return; }
    const prevFora = c.receitas - META - INV;
    const linhas = [
      {t: "Receitas", p: c.receitas, h: c.receitas},
      {t: `Cartão (fatura ${m.fatura})`, p: META, h: c.cartao, gasto: true},
      {t: INV_NOME || "Investimento", p: INV, h: INV, gasto: true},
      {t: "Gastos fora do cartão", p: null, h: c.outros, gasto: true},
    ];
    const dif = l => (l.p == null ? null : l.gasto ? l.p - l.h : l.h - l.p);
    const cel = v => (v == null ? '<td class="r num muted">—</td>' : `<td class="r num ${v < -0.005 ? "neg" : v > 0.005 ? "pos" : ""}">${n(v)}</td>`);
    $id("comparativo").innerHTML = `
      <h2>Sua previsão x hoje</h2>
      <div class="scroll"><table><thead><tr><th>${esc(m.rotulo)}</th><th class="r">Previsto</th><th class="r">Hoje</th><th class="r"><span class="lg">Diferença</span><span class="sm">Dif.</span></th></tr></thead><tbody>
      ${linhas.map(l => `<tr><td>${esc(l.t)}</td><td class="r num">${n(l.p)}</td><td class="r num">${n(l.h)}</td>${cel(dif(l))}</tr>`).join("")}
      <tr class="total"><td>Sobra para Pix, débito e dinheiro</td><td class="r num">${n(prevFora)}</td><td class="r num">${n(c.saldo)}</td>${cel(c.saldo - prevFora)}</tr>
      </tbody></table></div>
      <p class="muted" style="font-size:.85rem;margin:10px 0 0">${c.snap ? "No cartão, “hoje” é a fatura aberta mais os fixos que ainda vão cair." : "No cartão, “hoje” soma parcelas, compras lançadas e fixos previstos."} A sua previsão é ${brl(META)} no cartão e ${brl(INV)} de investimento por mês.</p>`;
  }

  function renderRecorrentes(m, c) {
    const semValor = c.rec.filter(r => r.valor == null).length;
    $id("recorrentes").innerHTML = `
      <h2>Gastos fixos do mês</h2>
      <div class="scroll"><table><thead><tr><th>Item</th><th>Situação</th><th class="r">Valor</th></tr></thead><tbody>
      ${c.rec.map(r => `<tr><td>${esc(r.nome)}<div class="muted" style="font-size:.8rem">${esc(r.categoria)} · ${esc(r.forma)}${r.origem ? ` · ${esc(r.origem)}` : ""}</div></td>
        <td><span class="chip ${r.st.c}">${esc(r.st.t)}</span></td><td class="r num">${n(r.valor)}</td></tr>`).join("")}
      <tr class="total"><td>Total previsto</td><td></td><td class="r num">${n(sum(c.rec, r => r.valor))}</td></tr>
      </tbody></table></div>
      ${semValor || INV ? `<p class="muted" style="font-size:.85rem;margin:10px 0 0">${semValor ? "Falta o valor de algum gasto fixo. " : ""}${INV ? `O investimento de ${brl(INV)} aparece separado, no saldo.` : ""}</p>` : ""}`;
  }

  function renderAtalhos(m, c) {
    const gastos = sum(m.lancamentos, l => l.valor);
    const tiles = [];
    tiles.push({aba: "gastos", t: "Gastos do dia a dia", v: brl(gastos), s: `${m.lancamentos.length} lançamentos em ${esc(m.rotulo)}`});
    if (AB) tiles.push({aba: "cartao", t: "Cartão e faturas", v: brl(AB.total), s: `Fatura ${AB.fatura} aberta no app em ${dBR(AB.data)}${META != null ? (AB.total > META ? ` · ${brl(AB.total - META)} acima da previsão` : ` · cabem ${brl(META - AB.total)}`) : ""}`});
    else { const ult = D.cartao.faturas.at(-1); if (ult) tiles.push({aba: "cartao", t: "Cartão e faturas", v: brl(ult.total), s: `Última fatura fechada (${ult.mes})`}); }
    const I = D.investimentos;
    if (I && CARTEIRA) tiles.push({aba: "investimentos", t: TITULARES ? `Investimentos (${TITULARES})` : "Investimentos", v: brl(I.total), s: `Carteira${I.data ? ` em ${dBR(I.data)}` : ""}${I.rentab_ano_pct != null ? ` · ${String(I.rentab_ano_pct).replace(".", ",")}% no ano` : ""}`});
    $id("atalhos").innerHTML = `<h2>Resumo das áreas</h2><div class="tiles">${tiles.map(x =>
      `<button type="button" class="tile" data-ir="${x.aba}"><span class="label">${esc(x.t)}</span><span class="tv">${x.v}</span><span class="sub">${esc(x.s)}</span><span class="go" aria-hidden="true">Abrir →</span></button>`).join("")}</div>`;
    $id("atalhos").querySelectorAll("[data-ir]").forEach(b => b.onclick = () => irPara(b.dataset.ir, true));
  }

  // Previsão mês a mês: receita, cartão (parcelas, fixos e o que já foi lançado), quanto ainda cabe no cartão
  // e a sobra para Pix, débito e dinheiro se o cartão fechar na previsão. Também usada pela lista de desejos.
  function previsaoMeses(n = 7) {
    const fixCartao = sum(D.recorrentes.filter(r => card(r.forma)), r => r.valor);
    const fixOutros = sum(D.recorrentes.filter(r => !card(r.forma)), r => r.valor);
    const [a0, m0] = hojeKey.split("-").map(Number);
    const linhas = [];
    for (let i = 0; i < n; i++) {
      const [a, m] = nextYM(a0, m0, i), [fa, fm] = nextYM(a, m);
      const mm = D.meses.find(x => x.ano === a && x.mes === m);
      const fat = lbl(fa, fm);
      let rec = RECEITA_PREVISTA, parc = D.cartao.comprometido[fat] || 0, cartao = parc + fixCartao, nota = "";
      if (mm) {
        const c = calc(mm); rec = c.receitas; cartao = c.cartao;
        if (c.snap) { parc = c.snap.total; nota = "aberta"; } else parc = c.parcelas;
      }
      const gastoCartao = META != null ? Math.max(META, cartao) : cartao;
      linhas.push({chave: `${a}-${String(m).padStart(2, "0")}`, mes: lbl(a, m), fat, parc, nota, receita: rec, cartao,
        livre: META != null ? META - cartao : null, sobra: rec - INV - gastoCartao - fixOutros});
    }
    return linhas;
  }
  // Gasto médio fora do cartão (Pix, débito, dinheiro) nos meses fechados, para estimar o que sobra de verdade
  const mediaForaCartao = () => {
    const fechados = D.meses.filter(m => m.chave < hojeKey);
    const base = fechados.length ? fechados : D.meses.filter(m => m.chave === hojeKey);
    return base.length ? sum(base, m => sum(m.lancamentos.filter(l => !card(l.forma)), l => l.valor)) / base.length : 0;
  };

  function renderPrevisao() {
    const linhas = previsaoMeses(7);
    const cel = v => `<td class="r num" style="color:${v < 0 ? "var(--bad)" : "var(--ok)"};font-weight:600">${n(v)}</td>`;
    $id("previsao").innerHTML = `
      <h2>Previsão dos próximos meses</h2>
      <p class="muted" style="margin:0 0 8px;font-size:.85rem">Receita prevista de ${brl(RECEITA_PREVISTA)} por mês (salário de ${brl(SAL_NORMAL)}${OUTRAS_NORMAL ? ` + outras receitas de ${brl(OUTRAS_NORMAL)}` : ""}, como no último mês registrado), menos ${brl(INV)} de investimento. “Livre no cartão” é quanto ainda cabe em compras na fatura para ficar nos ${brl(META)}. “Sobra” é o que fica para Pix, débito e dinheiro se o cartão fechar na previsão (ou acima dela, quando já passou).</p>
      <div class="scroll"><table><thead><tr><th>Mês</th><th class="r">Parcelas</th><th class="r">Livre no cartão</th><th class="r">Sobra</th></tr></thead><tbody>
      ${linhas.map(l => `<tr><td>${esc(l.mes)}<div class="muted" style="font-size:.75rem">fatura ${esc(l.fat)}</div></td><td class="r num">${n(l.parc)}${l.nota ? `<div class="muted" style="font-size:.75rem">${l.nota}</div>` : ""}</td>${l.livre == null ? "<td></td>" : cel(l.livre)}${cel(l.sobra)}</tr>`).join("")}
      </tbody></table></div>`;
  }

  // ---------- Gastos do dia a dia ----------
  const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const diaSemana = iso => SEMANA[new Date(iso + "T12:00").getDay()];
  const ehAjuste = l => /^ajuste/i.test(l.desc || "");
  const catDe = l => (ehAjuste(l) ? "Não detalhado (ajuste)" : ef(l).categoria);
  const rotuloEssencial = e => (e.essencial === true ? " · essencial" : e.essencial === false ? " · não essencial" : "");
  const chipConta = e => (e.conta !== "pessoal" ? ` · <span class="chip conta">${esc(nomeDaConta(e.conta))}</span>` : "");
  // Essencial, não essencial e sem classificação (o ajuste "não detalhado" fica à parte)
  function divisaoEssencial(L) {
    const det = L.filter(l => !ehAjuste(l));
    const ess = sum(det.filter(l => ef(l).essencial === true), l => l.valor);
    const nEss = sum(det.filter(l => ef(l).essencial === false), l => l.valor);
    return [[ess, "var(--parc)", "Essencial"], [nEss, "var(--inv)", "Não essencial"], [sum(det, l => l.valor) - ess - nEss, "var(--line)", "Sem classificação"],
      [sum(L.filter(ehAjuste), l => l.valor), "var(--muted)", "Não detalhado"]].filter(s => s[0] > 0.004);
  }
  // Total por conta (pessoal, engenharia, empresas), só quando há lançamento fora da conta pessoal
  function porConta(L) {
    const t = {};
    L.forEach(l => { const c = ef(l).conta; t[c] = (t[c] || 0) + l.valor; });
    return Object.keys(t).some(c => c !== "pessoal") ? Object.entries(t).sort((a, b) => (a[0] === "pessoal" ? -1 : b[0] === "pessoal" ? 1 : b[1] - a[1])) : [];
  }
  function opcoes(sel, valores, rotuloTodos) {
    const antes = sel.value;
    sel.innerHTML = `<option value="">${rotuloTodos}</option>` + valores.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
    if (valores.includes(antes)) sel.value = antes;
  }

  function renderGastosView(m) {
    const L = m.lancamentos;
    const det = L.filter(l => !ehAjuste(l)), aj = L.filter(ehAjuste);
    const total = sum(L, l => l.valor), totDet = sum(det, l => l.valor), totAj = sum(aj, l => l.valor);
    const dias = new Set(det.map(l => l.data)).size;
    const pctT = v => (total > 0 ? `${(v / total * 100).toLocaleString("pt-BR", {maximumFractionDigits: 0})}%` : "—");
    const porForma = {};
    L.forEach(l => { const k = l.forma || "Outro"; (porForma[k] ||= {v: 0, q: 0}); porForma[k].v += l.valor; porForma[k].q++; });
    const segs = divisaoEssencial(L);
    const contas = porConta(L);
    $id("g-resumo").innerHTML = `
      <h2>Resumo de ${esc(m.rotulo)}</h2>
      ${L.length ? `
      <div class="tv-big num">${brl(total)}</div>
      <p class="sub" style="margin:2px 0 0">${L.length} ${L.length === 1 ? "lançamento" : "lançamentos"}${dias ? ` · média de ${brl(totDet / dias)} por dia com gasto` : ""}</p>
      <div class="stack" role="img" aria-label="Essencial e não essencial">${segs.map(s => `<span style="width:${s[0] / total * 100}%;background:${s[1]}"></span>`).join("")}</div>
      <div class="legend">${segs.map(s => `<span><i style="background:${s[1]}"></i>${s[2]} <span class="num">${brl(s[0])}</span> (${pctT(s[0])})</span>`).join("")}</div>
      <div class="label" style="margin:14px 0 2px">Por forma de pagamento</div>
      <div class="scroll"><table><tbody>${Object.entries(porForma).sort((a, b) => b[1].v - a[1].v).map(([k, o]) =>
        `<tr><td>${esc(k)}<div class="sub">${o.q} ${o.q === 1 ? "lançamento" : "lançamentos"}</div></td><td class="r num">${n(o.v)}</td><td class="r num muted">${pctT(o.v)}</td></tr>`).join("")}</tbody></table></div>
      ${contas.length ? `<div class="label" style="margin:14px 0 2px">Por conta</div>
      <div class="scroll"><table><tbody>${contas.map(([c, v]) => `<tr><td>${esc(nomeDaConta(c))}</td><td class="r num">${n(v)}</td><td class="r num muted">${pctT(v)}</td></tr>`).join("")}</tbody></table></div>` : ""}
      ${totAj ? `<div class="note"><b>Inclui ${brl(totAj)} não detalhados.</b> ${esc(aj.map(a => a.desc.replace(/^ajuste:\s*/i, "")).join("; "))}. Esse valor fica fora das categorias detalhadas e do gráfico por dia.</div>` : ""}
  `
      : `<p class="muted" style="margin:0">Nenhum gasto lançado em ${esc(m.rotulo)}.</p>`}`;

    // Por categoria, com as subcategorias (o ajuste não detalhado fica por último)
    const porCat = {};
    L.forEach(l => {
      const k = catDe(l);
      const o = (porCat[k] ||= {v: 0, q: 0, subs: {}});
      o.v += l.valor; o.q++;
      const s = !ehAjuste(l) && ef(l).subcategoria;
      if (s) o.subs[s] = (o.subs[s] || 0) + l.valor;
    });
    const ultimo = k => (k.startsWith("Não detalhado") ? 1 : 0);
    const cats = Object.entries(porCat).sort((a, b) => ultimo(a[0]) - ultimo(b[0]) || b[1].v - a[1].v);
    const maxc = Math.max(1, ...cats.map(c => c[1].v));
    $id("g-cats").innerHTML = `<h2>Por categoria</h2>${cats.length ? cats.map(([k, o]) =>
      `<div class="cat"><span>${esc(k)} <span class="sub">· ${o.q}</span></span><span class="num">${brl(o.v)} <span class="muted">${pctT(o.v)}</span></span><div class="track"><span style="width:${o.v / maxc * 100}%${ultimo(k) ? ";background:var(--muted)" : ""}"></span></div></div>
      ${Object.entries(o.subs).sort((a, b) => b[1] - a[1]).map(([s, v]) => `<div class="subcat"><span>${esc(s)}</span><span class="num">${brl(v)}</span></div>`).join("")}`).join("")
      : '<p class="muted" style="margin:0">Sem gastos no mês.</p>'}`;

    // Gasto por dia (sem o ajuste)
    const ult = new Date(m.ano, m.mes, 0).getDate();
    const porDia = Array(ult).fill(0), qDia = Array(ult).fill(0);
    det.forEach(l => { if (l.data.slice(0, 7) === m.chave) { const d = Number(l.data.slice(8, 10)); porDia[d - 1] += l.valor; qDia[d - 1]++; } });
    const maxd = Math.max(...porDia);
    const hojeDia = m.chave === hojeKey ? hoje.getDate() : null;
    const marcas = new Set([1, 5, 10, 15, 20, 25, ult]);
    $id("g-dias").innerHTML = `<h2>Gasto por dia</h2>
      ${maxd > 0 ? `<div class="daychart" role="img" aria-label="Gasto por dia em ${esc(m.rotulo)}; maior dia ${brl(maxd)}">
        <span class="dmax num">${brl(maxd)}</span>
        ${porDia.map((v, i) => { const d = i + 1; const dd = String(d).padStart(2, "0") + "/" + String(m.mes).padStart(2, "0");
          const lado = d <= 6 ? " l" : d >= ult - 5 ? " rt" : "";
          return `<div class="dcol${lado}" ${v ? `tabindex="0" data-tip="${dd} · ${brl(v)} (${qDia[i]})"` : ""}><span class="dbar" style="height:${v ? Math.max(2, v / maxd * 100) : 0}%"></span></div>`; }).join("")}
      </div>
      <div class="daxis" aria-hidden="true">${porDia.map((v, i) => { const d = i + 1; const mostra = d === hojeDia || (marcas.has(d) && !(hojeDia && Math.abs(d - hojeDia) === 1));
        return `<span class="${d === hojeDia ? "hoje" : ""}">${mostra ? d : ""}</span>`; }).join("")}</div>
      <p class="sub" style="margin:8px 0 0">Toque ou passe o mouse nas barras para ver o valor de cada dia.${totAj ? ` O ajuste de ${brl(totAj)} fica fora do gráfico.` : ""}</p>`
      : '<p class="muted" style="margin:0">Sem gastos detalhados no mês.</p>'}`;

    opcoes($id("g-fcat"), Object.keys(porCat).sort(), "Todas");
    opcoes($id("g-fforma"), Object.keys(porForma).sort(), "Todas");
    const fConta = $id("g-fconta");
    const contasMes = [...new Set(L.map(l => ef(l).conta))];
    fConta.closest("label").hidden = !contasMes.some(c => c !== "pessoal");
    opcoesComRotulo(fConta, contasMes.map(c => [c, nomeDaConta(c)]), "Todas");
    renderGastosLista(m);
  }
  function opcoesComRotulo(sel, pares, rotuloTodos) {
    const antes = sel.value;
    sel.innerHTML = `<option value="">${rotuloTodos}</option>` + pares.map(([v, r]) => `<option value="${esc(v)}">${esc(r)}</option>`).join("");
    if (pares.some(([v]) => v === antes)) sel.value = antes;
  }

  // O que vai para o diálogo de classificar um lançamento (página financas.js)
  function paraClassificar(l, tipo) {
    return {chave: l.chave, tipo, site: l.origem === "site", id: l.id || null, titulo: tipo === "fatura" ? l.nome : l.desc,
      data: l.data || null, valor: l.valor, mes: l.mes || null, forma: l.forma || null, parcela: l.parcela || l.parcelas || null,
      atual: ef(l), ajuste: AJ.get(l.chave) || null, original: efetivo(l, null, CATS),
      essencialOriginal: efetivo(l, null, null).semAjuste}; // o que veio do projeto (sem o padrão da categoria)
  }

  let listaGastos = [];
  function renderGastosLista(m) {
    const fc = $id("g-fcat").value, ff = $id("g-fforma").value, fco = $id("g-fconta").value, q = semAcento($id("g-busca").value.trim());
    const L = m.lancamentos.filter(l => {
      const e = ef(l);
      return (!fc || catDe(l) === fc) && (!ff || (l.forma || "Outro") === ff) && (!fco || e.conta === fco)
        && (!q || semAcento(`${l.desc} ${l.obs || ""} ${e.categoria} ${e.subcategoria || ""} ${e.complemento || ""} ${nomeDaConta(e.conta)}`).includes(q));
    });
    listaGastos = L;
    const indice = new Map(L.map((l, i) => [l, i]));
    const porData = {};
    L.forEach(l => (porData[l.data] ||= []).push(l));
    const datas = Object.keys(porData).sort().reverse();
    $id("g-itens").innerHTML = L.length ? datas.map(d => `<div class="dgroup"><div class="dhead"><span>${dBR(d)} · ${diaSemana(d)}</span><span class="num">${brl(sum(porData[d], l => l.valor))}</span></div>
      <table><tbody>${porData[d].map(l => { const e = ef(l); return `<tr><td>${esc(l.desc)}${ehAjuste(l) ? ' <span class="chip neutral">ajuste</span>' : ""}${l.origem === "site" ? ' <span class="chip info">lançado no site</span>' : ""}
        ${e.complemento ? `<div class="compl">${esc(e.complemento)}</div>` : ""}
        <div class="sub">${esc(catDe(l))}${e.subcategoria && !ehAjuste(l) ? ` › ${esc(e.subcategoria)}` : ""} · ${esc(l.forma || "")}${l.parcelas ? ` · parcela ${esc(l.parcelas)}` : ""}${ehAjuste(l) ? "" : rotuloEssencial(e)}${chipConta(e)}${l.obs && !ehAjuste(l) && l.origem !== "site" ? ` · ${esc(l.obs)}` : ""}</div></td>
        <td class="r num">${n(l.valor)}<div class="acoes-lanc">${aoClassificar && !ehAjuste(l) ? `<button type="button" class="btn sec mini" data-classificar-g="${indice.get(l)}">Classificar</button>` : ""}${l.origem === "site" && aoApagarGasto ? `<button type="button" class="btn sec mini" data-apagar-gasto="${esc(l.id)}">Apagar</button>` : ""}</div></td></tr>`; }).join("")}</tbody></table></div>`).join("")
      + `<p class="sub" style="margin:10px 0 0">${L.length} ${L.length === 1 ? "lançamento" : "lançamentos"} · total ${brl(sum(L, l => l.valor))}</p>`
      : `<p class="muted" style="margin:6px 0 0">${m.lancamentos.length ? "Nenhum lançamento com esses filtros." : `Nenhum gasto lançado em ${esc(m.rotulo)}.`}</p>`;
    $id("g-itens").querySelectorAll("[data-apagar-gasto]").forEach(b => { b.onclick = () => aoApagarGasto(b.dataset.apagarGasto); });
    $id("g-itens").querySelectorAll("[data-classificar-g]").forEach(b => { b.onclick = () => aoClassificar(paraClassificar(listaGastos[Number(b.dataset.classificarG)], "gasto")); });
  }

  // ---------- Cartão e faturas ----------
  function renderFaturaAberta() {
    const box = $id("fatura-aberta");
    if (!AB) { box.innerHTML = `<h2>Fatura aberta</h2><p class="muted" style="margin:0">Nenhuma fatura aberta registrada no projeto Financeiro.</p>`; return; }
    const mm = D.meses.find(x => x.chave === AB.mes_compras);
    const c = mm ? calc(mm) : null, r = c ? ritmo(mm, c) : null;
    const minimo = c ? c.cartao : AB.total;
    const escala = Math.max(META || 0, minimo, AB.total) * 1.08;
    const w = v => `${(Math.max(0, v) / escala * 100).toFixed(2)}%`;
    const linhas = [["Aberta no app em " + dBR(AB.data), AB.total]];
    if (c) {
      const depois = c.linhas.find(l => l.leg === "Compras novas");
      if (depois && depois.v) linhas.push([`Compras lançadas depois de ${dBR(AB.data)}`, depois.v]);
      linhas.push(["Fixos que ainda vão cair", c.fixosCartao]);
    }
    box.innerHTML = `
      <h2>Fatura aberta ${esc(AB.fatura)}</h2>
      <div class="tv-big num">${brl(AB.total)}</div>
      <p class="sub" style="margin:2px 0 0">Vence em ${dataLonga(AB.vencimento)}${r ? ` · fecha em ${r.fecha.toLocaleDateString("pt-BR")}, ${r.faltam > 1 ? `daqui a ${r.faltam} dias` : r.faltam === 1 ? "amanhã" : "hoje"}` : ""}</p>
      <div class="meter" role="img" aria-label="Fatura em relação à sua previsão de ${brl(META)}">
        <div class="bar"><span style="width:${w(AB.total)};background:var(--parc)"></span>${c && c.cartao - AB.total > 0 ? `<span style="width:${w(c.cartao - AB.total)};background:var(--rec)"></span>` : ""}</div>
        ${META != null ? `<span class="metaline" style="left:${w(META)}"></span><span class="metalbl" style="left:${w(META)}">previsão ${brl(META)}</span>` : ""}
      </div>
      <div class="legend"><span><i style="background:var(--parc)"></i>Já na fatura</span>${c ? `<span><i style="background:var(--rec)"></i>Fixos e compras a cair</span>` : ""}</div>
      <table class="calc" style="margin-top:12px"><tbody>
        ${linhas.map(([t, v]) => `<tr><td>${esc(t)}</td><td class="r num">${brl(v)}</td></tr>`).join("")}
        <tr class="total"><td>Fecha em pelo menos</td><td class="r num">${brl(minimo)}</td></tr>
        ${META != null ? `<tr><td>Sua previsão</td><td class="r num">${brl(META)}</td></tr><tr><td>Diferença</td><td class="r num ${META - minimo < 0 ? "neg" : "pos"}">${brl(META - minimo)}</td></tr>` : ""}
        ${r ? `<tr><td>No ritmo das primeiras semanas (${brl(r.porDia)} por dia)<div class="sub">estimativa</div></td><td class="r num">${brl(r.projecao)}</td></tr>` : ""}
      </tbody></table>
      ${AB.transacoes && AB.transacoes.length ? `<div class="label" style="margin:14px 0 4px">Vistas no app em ${dBR(AB.data)}</div>
        <div class="scroll"><table><tbody>${AB.transacoes.map(t => `<tr><td class="num muted" style="padding-right:10px">${dBR(t.data)}</td><td>${esc(t.nome)}<div class="sub">${esc(t.obs || "")}</div></td><td class="r num">${n(t.valor)}</td></tr>`).join("")}</tbody></table></div>` : ""}`;
  }

  // ---------- Faturas: a mesma análise para o dono do painel e para a outra pessoa do arquivo ----------
  const PESSOAS = {
    dono: {nome: DONO, titulo: TEM_NOME ? `Fatura de ${DONO}` : "Sua fatura", cartao: D.cartao, relatorios: D.relatorios, cartaoNome: D.cartao_nome || ""},
  };
  if (OUTRA) {
    const o = D[OUTRA.chave];
    PESSOAS.outra = {nome: OUTRA.nome, titulo: `Fatura de ${OUTRA.nome}`, cartao: {...VAZIO, ...(o.cartao || {})}, relatorios: o.relatorios || [], cartaoNome: o.cartao_nome || ""};
  }
  let QUEM = "dono";
  { const s = lembrar("fatura-de"); if (!SO_FATURAS && PESSOAS[s]) QUEM = s; }
  const FC = () => PESSOAS[QUEM].cartao;
  // Chave de cada lançamento das faturas (a outra pessoa tem prefixo próprio), para a classificação feita no site
  chavesFatura(PESSOAS.dono.cartao.lancamentos, "c").forEach((k, i) => { PESSOAS.dono.cartao.lancamentos[i].chave = k; });
  if (PESSOAS.outra) chavesFatura(PESSOAS.outra.cartao.lancamentos, "co").forEach((k, i) => { PESSOAS.outra.cartao.lancamentos[i].chave = k; });

  const fatSel = {};
  function renderFaturaAnalise() {
    const box = $id("fatura-analise");
    const C = FC(), F = C.faturas;
    if (!F.length) { box.innerHTML = `<h2>Análise da fatura</h2><p class="muted" style="margin:0">Nenhuma fatura ${QUEM === "dono" && !TEM_NOME ? "sua" : `de ${esc(PESSOAS[QUEM].nome)}`} processada ainda.</p>`; return; }
    const f = F.find(x => x.mes === fatSel[QUEM]) || F.at(-1);
    const doMes = C.lancamentos.filter(l => l.mes === f.mes);
    // Categorias somadas dos lançamentos com a classificação feita no site (sem lançamentos, as do projeto)
    const somaCat = {};
    doMes.forEach(l => { const k = ef(l).categoria; somaCat[k] = (somaCat[k] || 0) + l.valor; });
    const cats = Object.entries(doMes.length ? somaCat : C.categorias[f.mes] || {}).sort((a, b) => b[1] - a[1]);
    const maxc = Math.max(1, ...cats.map(c => c[1]));
    const segs = divisaoEssencial(doMes), totSegs = sum(segs, s => s[0]);
    const contas = porConta(doMes);
    const al = C.alertas.filter(a => a.mes === f.mes);
    const prio = {"Alta": "bad", "Média": "warn", "Media": "warn", "Baixa": "neutral", "Info": "info"};
    const top = [...doMes].sort((a, b) => b.valor - a.valor).slice(0, 6);
    const kv = [["Total a pagar", brl(f.total)], ["Vencimento", dataLonga(f.vencimento)],
      ["À vista (nacional)", brl(f.avista)], ["Parcelas", brl(f.parcelas)], ["Internacional", brl(f.internacional)], ["Encargos e IOF", brl(f.encargos)],
      ["Lançamentos", f.n_lanc != null ? esc(f.n_lanc) : "—"], ["Pagamento mínimo", brl(f.minimo)],
      ["Fatura anterior", brl(f.anterior)], ["Limite usado", f.limite ? `${brl(f.limite_usado)} (${Math.round(f.limite_usado / f.limite * 100)}%)` : "—"]];
    box.innerHTML = `
      <h2>Análise da fatura ${esc(f.mes)}</h2>
      ${F.length > 1 ? `<div class="months" style="margin-bottom:10px">${F.map(x => `<button type="button" aria-pressed="${x.mes === f.mes}" data-fat="${esc(x.mes)}">${esc(x.mes)}</button>`).join("")}</div>` : ""}
      <div class="kv">${kv.map(([k, v]) => `<div><span class="label">${k}</span><b>${v}</b></div>`).join("")}</div>
      ${META != null && QUEM === "dono" && !SO_FATURAS ? `<p class="sub" style="margin:10px 0 0">${f.total > META ? `Ficou <b class="num" style="color:var(--bad)">${brl(f.total - META)}</b> acima da sua previsão de ${brl(META)}.` : `Ficou ${brl(META - f.total)} abaixo da sua previsão de ${brl(META)}.`}${f.conferencia === "OK" ? " A soma dos lançamentos confere com o total da fatura." : ""}</p>` : ""}
      <div class="label" style="margin:16px 0 6px">Categorias</div>
      ${cats.map(([k, v]) => `<div class="cat"><span>${esc(k)}</span><span class="num">${brl(v)} <span class="muted">${f.gastos ? Math.round(v / f.gastos * 100) + "%" : ""}</span></span><div class="track"><span style="width:${v / maxc * 100}%"></span></div></div>`).join("")}
      ${totSegs > 0 ? `<div class="label" style="margin:16px 0 6px">Essencial e não essencial</div>
        <div class="stack" role="img" aria-label="Essencial e não essencial na fatura">${segs.map(s => `<span style="width:${s[0] / totSegs * 100}%;background:${s[1]}"></span>`).join("")}</div>
        <div class="legend">${segs.map(s => `<span><i style="background:${s[1]}"></i>${s[2]} <span class="num">${brl(s[0])}</span> (${Math.round(s[0] / totSegs * 100)}%)</span>`).join("")}</div>` : ""}
      ${contas.length ? `<div class="label" style="margin:16px 0 6px">Por conta</div>
        <div class="scroll"><table><tbody>${contas.map(([c, v]) => `<tr><td>${esc(nomeDaConta(c))}</td><td class="r num">${n(v)}</td></tr>`).join("")}</tbody></table></div>` : ""}
      ${al.length ? `<div class="label" style="margin:16px 0 6px">Pontos de atenção</div>
        <div class="scroll"><table><tbody>${al.map(a => `<tr><td><span class="chip ${prio[a.prioridade] || "neutral"}">${esc(a.prioridade || "")}</span> ${esc(a.tipo || "")}<div class="sub">${esc(a.nome || "")}${a.detalhe ? ` · ${esc(a.detalhe)}` : ""}</div></td><td class="r num">${a.valor != null ? n(a.valor) : ""}</td></tr>`).join("")}</tbody></table></div>` : ""}
      <div class="label" style="margin:16px 0 6px">Maiores lançamentos</div>
      <div class="scroll"><table><tbody>${top.map(l => { const e = ef(l); return `<tr><td>${esc(l.nome)}${e.complemento ? `<div class="compl">${esc(e.complemento)}</div>` : ""}<div class="sub">${esc(e.categoria)}${e.subcategoria ? ` › ${esc(e.subcategoria)}` : ""}${l.parcela ? ` · parcela ${esc(l.parcela)}` : ""}${l.data ? ` · ${dBR(l.data)}` : ""}</div></td><td class="r num">${n(l.valor)}</td></tr>`; }).join("")}</tbody></table></div>
      <p class="sub" style="margin:10px 0 0">Os lançamentos completos estão no fim desta página.</p>`;
    box.querySelectorAll("[data-fat]").forEach(b => b.onclick = () => {
      fatSel[QUEM] = b.dataset.fat; renderFaturaAnalise();
      const nb = box.querySelector(`[data-fat="${CSS.escape(b.dataset.fat)}"]`); if (nb) nb.focus();
    });
  }

  function renderCartao() {
    const recCartao = D.recorrentes.filter(r => card(r.forma) && r.valor != null);
    const fech = D.cartao.faturas.map(f => ({mes: f.mes, total: f.total, venc: f.vencimento}));
    const fechadas = new Set(fech.map(p => p.mes));
    const futuras = D.meses.filter(mm => !fechadas.has(mm.fatura)).map(mm => {
      const c = calc(mm);
      if (c.snap) return {mes: mm.fatura, segs: [[c.snap.total, "var(--parc)"], [c.linhas.find(l => l.leg === "Compras novas").v, "var(--gasto)"], [c.fixosCartao, "var(--rec)"]], total: c.cartao,
        meta: `Aberta no app em ${dBR(c.snap.data)}: ${brl(c.snap.total)} + fixos a cair ${brl(c.fixosCartao)} · vence ${dataLonga(c.snap.vencimento)}`};
      const compras = sum(mm.lancamentos.filter(l => card(l.forma)), l => l.valor);
      return {mes: mm.fatura, segs: [[c.parcelas, "var(--parc)"], [compras, "var(--gasto)"], [c.fixosCartao, "var(--rec)"]], total: c.cartao,
        meta: `Compras de ${esc(mm.rotulo)}: parcelas ${brl(c.parcelas)} + lançadas ${brl(compras)} + fixos ${brl(c.fixosCartao)}`};
    });
    Object.entries(D.cartao.comprometido).forEach(([mes, v]) => {
      if (!futuras.some(f => f.mes === mes) && !fech.some(p => p.mes === mes)) {
        const fx = sum(recCartao, r => r.valor);
        futuras.push({mes, segs: [[v, "var(--parc)"], [fx, "var(--rec)"]], total: v + fx, meta: `Parcelas ${brl(v)} + fixos ${brl(fx)}, sem as compras do mês`});
      }
    });
    const max = Math.max(META || 0, ...futuras.map(f => f.total), ...fech.map(p => p.total)) * 1.02;
    const w = v => `${(Math.max(0, v) / max * 100).toFixed(2)}%`;
    const metaLine = META != null ? `<span class="metaline" style="left:${w(META)}" title="Previsão ${brl(META)}"></span>` : "";
    const flag = t => (META == null ? "" : t > META ? ` <span class="chip bad">${brl(t - META)} acima</span>` : ` <span class="chip">cabe ${brl(META - t)}</span>`);
    const ult = D.cartao.faturas.at(-1);
    $id("cartao").innerHTML = `
      <h2>Cartão${PESSOAS.dono.cartaoNome ? ` ${esc(PESSOAS.dono.cartaoNome)}` : ""}: faturado e a cair</h2>
      <div class="legend" style="margin-bottom:6px"><span><i style="background:var(--parc)"></i>Fatura aberta / parcelas</span><span><i style="background:var(--gasto)"></i>Compras lançadas</span><span><i style="background:var(--rec)"></i>Fixos previstos</span>${META != null ? `<span><i style="background:var(--ink);width:2px"></i>Sua previsão ${brl(META)}</span>` : ""}</div>
      ${fech.map(p => `<div class="bill"><div class="m">${esc(p.mes)}</div><div class="barwrap"><div class="bar"><span style="width:${w(p.total)};background:var(--muted)"></span></div>${metaLine}</div><div class="num">${brl(p.total)}</div>
        <div class="meta">Fechada, venceu em ${dataLonga(p.venc)}${flag(p.total)}</div></div>`).join("")}
      ${futuras.map(f => `<div class="bill"><div class="m">${esc(f.mes)}</div>
        <div class="barwrap"><div class="bar">${f.segs.filter(([v]) => v > 0).map(([v, cor]) => `<span style="width:${w(v)};background:${cor}"></span>`).join("")}</div>${metaLine}</div>
        <div class="num">${brl(f.total)}</div><div class="meta">${f.meta}${flag(f.total)}</div></div>`).join("")}
      ${ult ? `<p class="muted" style="font-size:.85rem;margin:10px 0 0">Limite usado na última fatura fechada: <span class="num">${brl(ult.limite_usado)}</span> de <span class="num">${brl(ult.limite)}</span>.${AB && Object.keys(AB.proximas || {}).length ? ` As faturas de ${Object.keys(AB.proximas).map(esc).join(" e ")} vêm do app; as seguintes somam as parcelas conhecidas.` : ""}</p>` : ""}`;
  }

  // Parceladas lançadas pelo site: só as parcelas das faturas que ainda não fecharam
  function parceladasDoSite() {
    if (QUEM !== "dono" || SO_FATURAS) return [];
    const fechadas = new Set(D.cartao.faturas.map(f => f.mes));
    return parcelasSite.map(p => {
      const resta = p.faturas.filter(f => f && !fechadas.has(f));
      return resta.length ? {nome: p.nome, prox: resta[0], valor: p.valor, saldo: Math.round(p.valor * resta.length * 100) / 100, ultima: p.faturas.at(-1), site: true} : null;
    }).filter(Boolean);
  }

  function renderParcelas() {
    const p = [...FC().parcelamentos, ...parceladasDoSite()];
    if (!p.length) { $id("parcelas").innerHTML = `<h2>Compras parceladas a vencer</h2><p class="muted" style="margin:0">${FC().faturas.length ? "Nenhuma compra parcelada a vencer." : "Aparecem aqui depois da primeira fatura processada."}</p>`; return; }
    $id("parcelas").innerHTML = `
      <h2>Compras parceladas a vencer</h2>
      <div class="scroll"><table><thead><tr><th>Compra</th><th class="hide-sm">Próx.</th><th class="r">Parcela</th><th class="r">Falta pagar</th><th class="r">Última</th></tr></thead><tbody>
      ${p.map(x => `<tr><td>${esc(x.nome)}${x.site ? ' <span class="chip info">lançado no site</span>' : ""}</td><td class="num hide-sm">${esc(x.prox)}</td><td class="r num">${n(x.valor)}</td><td class="r num">${n(x.saldo)}</td><td class="r">${esc(x.ultima)}</td></tr>`).join("")}
      <tr class="total"><td>Total</td><td class="hide-sm"></td><td class="r num">${n(sum(p, x => x.valor))}</td><td class="r num">${n(sum(p, x => x.saldo))}</td><td></td></tr>
      </tbody></table></div>
      <p class="muted" style="font-size:.85rem;margin:10px 0 0">${QUEM === "dono" && !SO_FATURAS ? "Posição da última fatura fechada mais as parceladas novas vistas no app." : "Posição da última fatura fechada."}</p>`;
  }

  function renderFaturaLanc() {
    const T = FC().lancamentos;
    document.querySelector("#fatura-lanc .filters").hidden = !T.length;
    const meses = [...new Set(T.map(l => l.mes))];
    const selM = $id("f-fmes");
    const antes = selM.value;
    selM.innerHTML = meses.map(mm => `<option value="${esc(mm)}">${esc(mm)}</option>`).join("");
    if (meses.includes(antes)) selM.value = antes; else if (meses.length) selM.value = meses.at(-1);
    opcoes($id("f-fcat"), [...new Set(T.filter(l => l.mes === selM.value).map(l => ef(l).categoria))].sort(), "Todas");
    renderFaturaLista();
  }

  let fatTodos = false;
  let listaFatura = [];
  function renderFaturaLista() {
    const mm = $id("f-fmes").value, fc = $id("f-fcat").value, q = semAcento($id("f-busca").value.trim());
    const L = FC().lancamentos.filter(l => {
      const e = ef(l);
      return l.mes === mm && (!fc || e.categoria === fc)
        && (!q || semAcento(`${l.nome} ${l.cidade} ${e.categoria} ${e.subcategoria || ""} ${e.complemento || ""} ${nomeDaConta(e.conta)}`).includes(q));
    }).sort((a, b) => (b.data || "").localeCompare(a.data || ""));
    const corta = !fatTodos && !fc && !q && L.length > 30;
    const V = corta ? L.slice(0, 25) : L;
    listaFatura = V;
    $id("f-itens").innerHTML = L.length ? `<div class="scroll"><table><thead><tr><th>Data</th><th>Lançamento</th><th class="r">Valor</th></tr></thead><tbody>${V.map((l, i) => { const e = ef(l); return `<tr><td class="num muted" style="padding-right:10px">${l.data ? dBR(l.data) : ""}</td>
      <td>${esc(l.nome)}${e.complemento ? `<div class="compl">${esc(e.complemento)}</div>` : ""}<div class="sub">${esc(e.categoria)}${e.subcategoria ? ` › ${esc(e.subcategoria)}` : ""}${l.cidade ? ` · ${esc(l.cidade)}` : ""}${l.parcela ? ` · parcela ${esc(l.parcela)}` : ""}${l.tipo && l.tipo !== "Nacional" ? ` · ${esc(l.tipo)}` : ""}${rotuloEssencial(e)}${chipConta(e)}</div></td>
      <td class="r num">${n(l.valor)}${aoClassificar ? `<div class="acoes-lanc"><button type="button" class="btn sec mini" data-classificar-f="${i}">Classificar</button></div>` : ""}</td></tr>`; }).join("")}</tbody></table></div>
      ${corta ? `<button type="button" class="btn sec mini" id="f-todos" style="margin-top:10px">Mostrar todos os ${L.length} lançamentos</button>` : ""}
      <p class="sub" style="margin:10px 0 0">${corta ? `Mostrando os 25 mais recentes de ${L.length}` : `${L.length} ${L.length === 1 ? "lançamento" : "lançamentos"}`} · total da seleção ${brl(sum(L, l => l.valor))}</p>`
      : `<p class="muted" style="margin:6px 0 0">${FC().lancamentos.length ? "Nenhum lançamento com esses filtros." : "Nenhuma fatura processada ainda."}</p>`;
    if (corta) $id("f-todos").onclick = () => { fatTodos = true; renderFaturaLista(); const t = $id("f-itens"); t.tabIndex = -1; t.focus(); };
    $id("f-itens").querySelectorAll("[data-classificar-f]").forEach(b => { b.onclick = () => aoClassificar(paraClassificar(listaFatura[Number(b.dataset.classificarF)], "fatura")); });
  }

  // ---------- Abas: visão geral, gastos do dia a dia, cartão e faturas, investimentos, lista de desejos ----------
  const ABAS = ["geral", "gastos", "cartao", "investimentos", "desejos"];
  function irPara(aba, rolar) {
    if (SO_FATURAS && aba !== "investimentos" && aba !== "desejos") aba = "cartao";
    if (!ABAS.includes(aba) || (aba === "investimentos" && !CARTEIRA) || (aba === "desejos" && !comDesejos)) aba = SO_FATURAS ? "cartao" : "geral";
    document.querySelectorAll("#fin-abas [role=tab]").forEach(t => {
      const sel = t.dataset.aba === aba;
      t.setAttribute("aria-selected", String(sel));
      t.tabIndex = sel ? 0 : -1;
    });
    ["geral", "gastos", "cartao", "desejos"].forEach(k => { $id("view-" + k).hidden = k !== aba; });
    $id("fin-root").hidden = aba === "investimentos";
    $id("view-inv").hidden = aba !== "investimentos";
    if (!SO_FATURAS || CARTEIRA || comDesejos) {
      guardar("aba", aba);
      try { if (location.hash !== "#" + aba) history.replaceState(null, "", "#" + aba); } catch (e) { /* sem histórico */ }
    }
    // O gráfico dos investimentos se redesenha quando a largura muda; avisa ao mostrar a aba
    if (aba === "investimentos") requestAnimationFrame(() => window.dispatchEvent(new Event("resize")));
    if (rolar) window.scrollTo({top: 0});
  }

  function iniciarAbas() {
    const barra = $id("fin-abas");
    const tabs = [...barra.querySelectorAll("[role=tab]")];
    const quem = {geral: DONO, gastos: DONO, cartao: OUTRA ? `${DONO} e ${OUTRA.nome}` : DONO, investimentos: TITULARES || DONO, desejos: "Prioridades e projeção"};
    tabs.forEach(t => { const s = t.querySelector("small"); if (s) s.textContent = quem[t.dataset.aba]; });
    $id("tab-inv").hidden = !CARTEIRA;
    $id("tab-desejos").hidden = !comDesejos;
    document.querySelectorAll("[data-dono]").forEach(el => { el.textContent = DONO; });
    if (SO_FATURAS) {
      $id("tab-geral").hidden = true;
      $id("tab-gastos").hidden = true;
      if (!CARTEIRA && !comDesejos) { barra.hidden = true; irPara("cartao", false); return; }
    }
    const visiveis = () => tabs.filter(t => !t.hidden);
    tabs.forEach(t => t.addEventListener("click", () => irPara(t.dataset.aba, true)));
    barra.addEventListener("keydown", e => {
      const lista = visiveis();
      const i = lista.findIndex(t => t.getAttribute("aria-selected") === "true");
      const j = e.key === "ArrowRight" ? (i + 1) % lista.length : e.key === "ArrowLeft" ? (i - 1 + lista.length) % lista.length
        : e.key === "Home" ? 0 : e.key === "End" ? lista.length - 1 : -1;
      if (j < 0) return;
      irPara(lista[j].dataset.aba, false); lista[j].focus(); e.preventDefault();
    });
    window.addEventListener("hashchange", () => { const a = location.hash.slice(1); if (ABAS.includes(a)) irPara(a, false); });
    const pedida = location.hash.slice(1);
    irPara(ABAS.includes(pedida) ? pedida : lembrar("aba") || (SO_FATURAS ? "cartao" : "geral"), false);
  }

  // ---------- Relatórios das faturas (os PDFs podem ser guardados no quadro de PDFs, logo abaixo) ----------
  function renderRelatorios() {
    const P = PESSOAS[QUEM];
    const fat = Object.fromEntries(P.cartao.faturas.map(f => [f.mes, f]));
    const rels = [...P.relatorios].reverse();
    $id("relatorios").innerHTML = `
      <h2>Relatórios das faturas</h2>
      ${P.cartaoNome ? `<p class="sub" style="margin:-4px 0 10px">Cartão ${esc(P.cartaoNome)}</p>` : ""}
      ${rels.length ? `<div class="reports">${rels.map(r => `<div class="report"><span>Relatório da fatura ${esc(r.mes)}${fat[r.mes] ? ` <span class="muted">· vence ${dataLonga(fat[r.mes].vencimento)}</span>` : ""}</span><span class="num">${fat[r.mes] ? brl(fat[r.mes].total) : ""}</span></div>`).join("")}</div>`
        : '<p class="muted" style="margin:0">Nenhum relatório ainda.</p>'}
      <p class="sub" style="margin:10px 0 0">Os PDFs das faturas e dos relatórios ficam no quadro abaixo. As faturas do Nubank são lidas pelo próprio site (botão Processar); as dos outros cartões continuam no projeto Financeiro${linkClaude ? `: <a href="${esc(linkClaude)}" target="_blank" rel="noopener">abrir no Claude</a>` : ""}.</p>`;
  }

  function rodape() {
    $id("rodape").textContent = `Dados gerados pelo projeto Financeiro em ${D.gerado_em || "data não informada"}.`;
  }

  iniciarAbas();

  function renderQuem() {
    const box = $id("quem");
    if (SO_FATURAS || !PESSOAS.outra) { box.hidden = true; return; }
    box.innerHTML = Object.entries(PESSOAS).map(([k, p]) => {
      const u = p.cartao.faturas.at(-1);
      return `<button type="button" data-quem="${k}" aria-pressed="${k === QUEM}"><span class="label">${p.titulo}</span><span class="tv">${u ? brl(u.total) : "—"}</span><span class="sub">${u ? `Última fechada: ${esc(u.mes)}${p.cartaoNome ? ` · ${esc(p.cartaoNome)}` : ""}` : "Nenhuma fatura ainda"}</span></button>`;
    }).join("");
    box.querySelectorAll("[data-quem]").forEach(b => b.onclick = () => trocarQuem(b.dataset.quem));
  }

  function trocarQuem(q) {
    if (!PESSOAS[q] || q === QUEM) return;
    QUEM = q; fatTodos = false;
    guardar("fatura-de", q);
    mostrarQuem();
    const b = document.querySelector(`#quem [data-quem="${q}"]`); if (b) b.focus();
  }

  function mostrarQuem() {
    const soCartao = QUEM !== "dono" || SO_FATURAS;
    $id("cartao-quem").textContent = PESSOAS[QUEM].nome;
    ["fatura-aberta", "cartao"].forEach(id => { $id(id).hidden = soCartao; });
    seguro("quem", renderQuem);
    seguro("fatura-analise", renderFaturaAnalise);
    seguro("parcelas", renderParcelas);
    seguro("f-itens", renderFaturaLanc);
    seguro("relatorios", renderRelatorios);
  }

  // Cada painel é desenhado à parte: se um falhar com dados inesperados, os outros aparecem
  function seguro(id, f) {
    try { f(); }
    catch (e) {
      console.error(e);
      const el = id && $id(id);
      if (el) el.innerHTML = `<p class="muted" style="margin:0">Esta parte não carregou (${esc(e.message)}).</p>`;
    }
  }

  function render() {
    seguro(null, renderMonths);
    seguro("previsao", renderPrevisao);
    seguro("fatura-aberta", renderFaturaAberta);
    seguro("cartao", renderCartao);
    seguro("rodape", rodape);
    if (!atual) { $id("hero").innerHTML = '<p class="muted" style="margin:0">Nenhuma planilha de gastos encontrada.</p>'; return; }
    seguro("g-resumo", () => renderGastosView(atual));
    let c;
    try { c = calc(atual); } catch (e) { seguro("hero", () => { throw e; }); return; }
    seguro("alertas", () => alertas(atual, c));
    seguro("g-termometro", () => renderTermometro(atual, c));
    seguro("hero", () => renderHero(atual, c));
    seguro("comparativo", () => renderComparativo(atual, c));
    seguro("recorrentes", () => renderRecorrentes(atual, c));
    seguro("atalhos", () => renderAtalhos(atual, c));
  }
  if (SO_FATURAS) seguro("rodape", rodape);
  else seguro(null, render);
  mostrarQuem();

  // Filtros das listas e o botão da lista de categorias
  ["g-fcat", "g-fforma", "g-fconta"].forEach(id => $id(id).addEventListener("change", () => seguro("g-itens", () => renderGastosLista(atual))));
  document.querySelectorAll("[data-editar-categorias]").forEach(b => {
    b.hidden = !aoEditarCategorias;
    b.onclick = () => aoEditarCategorias();
  });
  $id("g-busca").addEventListener("input", () => seguro("g-itens", () => renderGastosLista(atual)));
  $id("f-fmes").addEventListener("change", () => seguro("f-itens", renderFaturaLanc));
  $id("f-fcat").addEventListener("change", () => seguro("f-itens", renderFaturaLista));
  $id("f-busca").addEventListener("input", () => seguro("f-itens", renderFaturaLista));

  // ---------- Investimentos ----------
  if (CARTEIRA) {
    try {
      desenharInvestimentos(CARTEIRA);
    } catch (e) {
      console.error(e);
      $id("cj-app").innerHTML = `<p class="muted">A carteira de investimentos não carregou (${esc(e.message)}).</p>`;
    }
  }

  return {
    atualizarGastos(lista) {
      mesclarGastosSite(lista);
      if (SO_FATURAS) return;
      seguro(null, render);
      seguro("parcelas", renderParcelas);
    },
    // Depois de classificar um lançamento ou de mudar a lista de categorias
    atualizarClassificacao({ajustes: novos, categorias: c, contas: cs} = {}) {
      if (novos) AJ = new Map(novos.map(a => [a.chave, a]));
      if (c) CATS = c;
      if (cs) CONTAS = cs;
      if (!SO_FATURAS) seguro(null, render);
      mostrarQuem();
    },
    // Para a lista de desejos: previsão dos próximos meses (só no painel completo, que tem as receitas)
    previsao: n => (SO_FATURAS ? [] : previsaoMeses(n)),
    mediaForaCartao: () => (SO_FATURAS ? 0 : mediaForaCartao()),
    meta: META,
  };
}

// Carteira de investimentos: posição, distribuição, projeção interativa e análise (adaptado do painel da carteira)
function desenharInvestimentos(D) {
  if (!Array.isArray(D.posicoes) || !D.posicoes.length || !D.projecao) {
    document.getElementById("cj-app").innerHTML = '<p class="note">Os dados da carteira vieram incompletos no arquivo importado.</p>';
    return;
  }
  const brl = v => v.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
  const n2 = v => v.toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  const pct = v => v.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:2})+'%';
  const dt = s => s.split('-').reverse().join('/');
  const esc = s => String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  // Valor curto: R$ 5,07 mi / R$ 391 mil
  const curto = v => { const a=Math.abs(v), sinal = v<0 && Math.round(a)>0 ? '−' : '';
    if(a>=1e6 || Math.round(a/1e3)>=1000) return sinal+'R$ '+(a/1e6).toLocaleString('pt-BR',{maximumFractionDigits:2})+' mi';
    if(a>=1e3 || Math.round(a)>=1000) return sinal+'R$ '+Math.round(a/1e3).toLocaleString('pt-BR')+' mil';
    return sinal+'R$ '+Math.round(a).toLocaleString('pt-BR'); };
  // Número no jeito brasileiro: 1.600 / 1.600,50 / 15,1 (também aceita 15.1)
  const lerBR = txt => { let t = String(txt).trim().replace(/\s|R\$|%/g,'');
    if(!t) return null;
    if(t.includes(',')) t = t.replace(/\./g,'').replace(',','.');
    else if(/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g,'');
    if(!/^-?\d*\.?\d+$/.test(t)) return null;
    return parseFloat(t); };
  const fmtBR = (v, dec=0) => v.toLocaleString('pt-BR',{minimumFractionDigits:dec,maximumFractionDigits:2});
  const P = D.posicoes[D.posicoes.length-1];
  const PJ = D.projecao;
  const cores = ['var(--c1)','var(--c2)','var(--c3)','var(--c4)','var(--c5)'];
  const A = D.analise || null;
  const pessoas = Object.keys(D.aportes_mensais || {});
  const aporteMes = pessoas.reduce((s,k)=>s+D.aportes_mensais[k],0);
  const aportes = D.aportes || [];
  const totApor = aportes.reduce((s,a)=>s+a.valor,0);

  let h = `
  <header class="hero">
    <span class="eyebrow">${esc(D.instituicao)} · ${esc(D.titulares)}</span>
    <h1>Carteira conjunta</h1>
    <span class="total">${brl(P.total)}</span>
    <span class="note">Posição de ${dt(P.data)}</span>
  </header>
  <section class="card">
    <div class="kpis">
      <div class="kpi"><span class="eyebrow">Rendimento 2026</span><b class="pos">${brl(P.rendimento_ano)}</b><span class="note">${esc(P.rendimento_periodo)}</span></div>
      <div class="kpi"><span class="eyebrow">Rentabilidade</span><b class="pos">${pct(P.rentab_ano_pct)}</b><span class="note">no ano</span></div>
      <div class="kpi"><span class="eyebrow">% do CDI</span><b>${pct(P.pct_cdi_ano)}</b><span class="note">bruto de IR</span></div>
    </div>
  </section>
  <section class="card">
    <h2>Onde está o dinheiro</h2>
    <div class="bar" role="img" aria-label="Distribuição por classe">${P.classes.map((c,i)=>`<span style="width:${c.saldo/P.total*100}%;background:${cores[i%5]}"></span>`).join('')}</div>
    <div class="scroll"><table><thead><tr><th>Classe</th><th>Saldo R$</th><th>%</th><th>Rend. R$</th></tr></thead><tbody>
    ${P.classes.map((c,i)=>`<tr><td><span class="dot" style="background:${cores[i%5]}"></span>${esc(c.nome)}</td><td class="num">${n2(c.saldo)}</td><td class="num">${pct(c.saldo/P.total*100)}</td><td class="num ${c.rend_ano<0?'neg':'pos'}">${n2(c.rend_ano)}</td></tr>`).join('')}
    </tbody></table></div>
  </section>

  <section class="card" id="cj-projecao">
    <span class="eyebrow">Projeção</span>
    <h2>Quanto a carteira pode virar</h2>
    <p class="note">Parte de ${brl(P.total)} e repete o rendimento de 2026: ${esc(PJ.taxa_origem)}. Juros sobre juros, aporte no fim de cada mês.</p>
    <div class="controls">
      ${pessoas.map(k=>`<div class="field"><label for="cj-ap-${k}">Aporte mensal de ${esc(k)}</label><div class="money"><span>R$</span><input id="cj-ap-${k}" type="text" inputmode="decimal" autocomplete="off" value="${fmtBR(D.aportes_mensais[k])}"></div></div>`).join('')}
      <div class="chips" role="group" aria-label="Aporte igual para os dois">
        ${[1500,1600,1800,2000,2500].map(v=>`<button type="button" class="chip" data-cada="${v}">${v.toLocaleString('pt-BR')} cada</button>`).join('')}
      </div>
      <div class="field"><label for="cj-taxa">Rendimento ao ano (%)</label><div class="money"><input id="cj-taxa" type="text" inputmode="decimal" autocomplete="off" value="${fmtBR(PJ.taxa_anual_padrao,1)}"><span>% a.a.</span></div></div>
      <div class="field"><label for="cj-infl">Inflação ao ano (%)</label><div class="money"><input id="cj-infl" type="text" inputmode="decimal" autocomplete="off" value="${fmtBR(PJ.inflacao_padrao,1)}"><span>% a.a.</span></div></div>
      <div class="chips" role="group" aria-label="Rendimento ao ano">
        ${[[PJ.taxa_anual_padrao,'igual a 2026'],[12,''],[10,''],[8,'']].map(([v,l])=>`<button type="button" class="chip" data-taxa="${v}">${fmtBR(v)}%${l?' ('+l+')':''}</button>`).join('')}
      </div>
      <div class="toggles">
        <label><input type="checkbox" id="cj-ir"> Descontar imposto de renda</label>
        <label><input type="checkbox" id="cj-real"> Mostrar em dinheiro de hoje</label>
      </div>
    </div>
    <p class="headline" id="cj-headline" aria-live="polite"></p>
    <div class="legend" id="cj-legend"></div>
    <div class="chartbox"><svg id="cj-chart" role="img" aria-label=""></svg><div class="tip" id="cj-tip" hidden></div></div>
    <div class="scroll"><table><thead><tr><th>Prazo</th><th>Vocês colocam R$</th><th>Juros R$</th><th>Saldo R$</th></tr></thead><tbody id="cj-tabproj"></tbody></table></div>
    <p class="note" id="cj-projnota"></p>
  </section>

  <section class="card">
    <h2>Aportes</h2>
    <p>Previsto: ${pessoas.map(k=>`<b class="num">${brl(D.aportes_mensais[k])}</b> de ${esc(k)}`).join(' e ')} por mês, <b class="num">${brl(aporteMes)}</b> no total.</p>
    ${aportes.length ? `<div class="scroll"><table><thead><tr><th>Data</th><th>Quem</th><th>Valor</th></tr></thead><tbody>${aportes.map(a=>`<tr><td>${dt(a.data)}</td><td>${esc(a.quem)}</td><td class="num">${brl(a.valor)}</td></tr>`).join('')}<tr><td><b>Total</b></td><td></td><td class="num"><b>${brl(totApor)}</b></td></tr></tbody></table></div>`
     : `<p class="note">Nenhum aporte registrado ainda no projeto Financeiro.</p>`}
  </section>
  ${D.posicoes.length>1?`<section class="card"><h2>Evolução</h2><div class="scroll"><table><thead><tr><th>Data</th><th>Total</th><th>Rend. ano</th><th>% CDI</th></tr></thead><tbody>${D.posicoes.slice().reverse().map(p=>`<tr><td>${dt(p.data)}</td><td class="num">${brl(p.total)}</td><td class="num">${brl(p.rendimento_ano)}</td><td class="num">${pct(p.pct_cdi_ano)}</td></tr>`).join('')}</tbody></table></div></section>`:''}
  ${A ? `<section class="card">
    <span class="eyebrow">Análise do Claude · ${dt(A.data)}</span>
    <h2>Parecer sobre a carteira</h2>
    <div class="verdict">${esc(A.veredito)}</div>
    <h3>O que está bom</h3>
    <ul>${A.pontos_fortes.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>
    <h3>Críticas</h3>
    <div class="crit">${A.criticas.map(c=>`<div><b>${esc(c.titulo)}</b><p>${esc(c.texto)}</p></div>`).join('')}</div>
    <h3>O que eu faria</h3>
    <ul>${A.sugestoes.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>
    ${A.observacao?`<p class="note">${esc(A.observacao)}</p>`:''}
  </section>` : ''}
  ${(D.perguntas_abertas || []).length?`<section class="card q"><h2>Para afinar a análise</h2><ul>${D.perguntas_abertas.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></section>`:''}
  <p class="note">Fonte: ${esc(P.fonte)}. Projeção e análise são educativas, não são recomendação formal de investimento.</p>`;
  document.getElementById('cj-app').innerHTML = h;

  /* ---------- Projeção ---------- */
  const MESES = Math.max(...PJ.horizontes_anos)*12;
  // IR regressivo pelo prazo de cada aplicação: até 180 dias 22,5%; até 360 dias 20%; até 720 dias 17,5%; acima 15%.
  // Em meses de calendário: 6 meses ≈ 182 dias (20%), 12 ≈ 365 (17,5%), 24 ≈ 730 (15%).
  const aliquota = m => m<=5?0.225 : m<=11?0.20 : m<=23?0.175 : 0.15;
  const G0 = PJ.ganho_embutido || 0, IDADE0 = PJ.idade_inicial_meses || 0;

  // Simula mês a mês. Cada aporte é um "lote" com sua idade, para o IR sair pela alíquota certa.
  function projetar(P0, aporte, taxaAnual, inflAnual, comIR, real){
    const rm = Math.pow(1+taxaAnual/100, 1/12) - 1;
    const fi = Math.pow(1+inflAnual/100, 1/12);
    const g = Array.from({length:MESES+1}, (_,m)=>Math.pow(1+rm, m)); // fator de crescimento por idade
    const out = [];
    for(let m=0;m<=MESES;m++){
      // lote inicial (idade m) + aportes feitos nos meses 1..m (idade m-k)
      // o saldo atual já carrega G0 de rendimento ainda não tributado e tem IDADE0 meses de aplicação
      let bruto = P0*g[m], ir = comIR ? aliquota(m+IDADE0)*(P0*(g[m]-1) + G0) : 0;
      for(let k=1;k<=m;k++){ const age=m-k; bruto += aporte*g[age]; if(comIR) ir += aliquota(age)*aporte*(g[age]-1); }
      // Em dinheiro de hoje, cada aporte é corrigido pela inflação até a data em que entrou.
      let colocado = P0;
      for(let k=1;k<=m;k++) colocado += real ? aporte/Math.pow(fi, k) : aporte;
      const saldo = (bruto - ir)/(real ? Math.pow(fi, m) : 1);
      out.push({m, saldo, colocado, juros: saldo - colocado});
    }
    return out;
  }

  const $ = id => document.getElementById('cj-'+id);
  const validos = {};
  const LIMITE = {taxa:40, infl:30};
  function num(chave, padrao){
    const el = $(chave), v = lerBR(el.value), lim = LIMITE[chave] ?? 1e7;
    const ok = v!==null && isFinite(v) && v>=0 && v<=lim;
    el.closest('.money').classList.toggle('erro', !ok);
    el.setAttribute('aria-invalid', String(!ok));
    if(ok) validos[chave] = v;
    return ok ? v : (validos[chave] ?? padrao);
  }
  const STORE = 'mz-fin-carteira';
  function carregar(){ try{ const s = JSON.parse(localStorage.getItem(STORE)||'null'); if(!s) return;
    pessoas.forEach(k=>{ if(s['ap-'+k]!=null) $('ap-'+k).value = s['ap-'+k]; });
    ['taxa','infl'].forEach(k=>{ if(s[k]!=null) $(k).value = s[k]; });
    ['ir','real'].forEach(k=>{ if(s[k]!=null) $(k).checked = s[k]; });
  }catch(e){} }
  function salvar(){ try{ const s={}; pessoas.forEach(k=>s['ap-'+k]=$('ap-'+k).value);
    s.taxa=$('taxa').value; s.infl=$('infl').value; s.ir=$('ir').checked; s.real=$('real').checked;
    localStorage.setItem(STORE, JSON.stringify(s)); }catch(e){} }

  let estado = null;
  function calcular(){
    const aportes = pessoas.map(k=>num('ap-'+k, D.aportes_mensais[k]));
    const aporte = aportes.reduce((a,b)=>a+b,0);
    const base = PJ.aporte_base_por_pessoa*pessoas.length;
    const taxa = num('taxa', PJ.taxa_anual_padrao), infl = num('infl', PJ.inflacao_padrao), ir = $('ir').checked, real = $('real').checked;
    const serie = projetar(P.total, aporte, taxa, infl, ir, real);
    const serieBase = projetar(P.total, base, taxa, infl, ir, real);
    estado = {aportes, aporte, base, taxa, infl, ir, real, serie, serieBase, difere: Math.abs(aporte-base)>0.005};
    document.querySelectorAll('[data-cada]').forEach(b=>b.setAttribute('aria-pressed', aportes.every(v=>Math.abs(v-+b.dataset.cada)<0.005)));
    document.querySelectorAll('[data-taxa]').forEach(b=>b.setAttribute('aria-pressed', Math.abs(taxa-+b.dataset.taxa)<0.005));
    salvar(); textos(); tabela(); grafico();
  }

  function textos(){
    const e = estado, f = e.serie[MESES], anos = MESES/12;
    const qual = (e.ir?'líquidos de IR':'brutos') + (e.real?', em dinheiro de hoje':'');
    $('headline').innerHTML = `Com <b>${brl(e.aporte)}</b> por mês somando os dois, em ${anos} anos vocês teriam <b>${curto(f.saldo)}</b>. `
      + (f.juros>=0 ? `Desse total, <b>${curto(f.juros)}</b> seriam juros.` : `Isso é <b>${curto(-f.juros)}</b> a menos do que vocês colocaram, uma perda${e.real?' real':''}.`);
    const leg = [`<span><i style="background:var(--s-aporte)"></i>Vocês colocam</span>`,`<span><i style="background:var(--s-juros)"></i>Juros</span>`];
    if(e.difere) leg.push(`<span><i class="dash"></i>Com R$ ${PJ.aporte_base_por_pessoa.toLocaleString('pt-BR')} cada</span>`);
    $('legend').innerHTML = leg.join('');
    $('projnota').textContent = `Valores ${qual}. `
      + (e.ir?`IR de CDB e Tesouro pela tabela regressiva (22,5% a 15%) sobre o rendimento de cada aporte e sobre os ${brl(G0)} de rendimento que já estão no saldo, como se tudo fosse resgatado no fim do prazo. LCI e LCA seriam isentas. `:'Sem desconto de imposto de renda; marque a opção acima para ver o líquido. ')
      + (e.real?`Inflação de ${fmtBR(e.infl)}% ao ano descontada; os aportes ficam fixos, sem reajuste. `:'')
      + (e.taxa>12 ? `Um rendimento de ${fmtBR(e.taxa)}% ao ano por 20 anos é otimista: reflete os juros altos de 2026. Teste 10% ou 12% para um cenário mais conservador.` : '');
  }

  const semRS = v => curto(v).replace('R$ ','');
  function tabela(){
    const e = estado;
    $('tabproj').innerHTML = PJ.horizontes_anos.map(a=>{
      const r = e.serie[a*12], b = e.serieBase[a*12];
      const dif = r.saldo - b.saldo;
      const sub = e.difere ? `<small>${dif>=0?'+':'−'}${curto(Math.abs(dif))} vs ${PJ.aporte_base_por_pessoa.toLocaleString('pt-BR')} cada</small>` : '';
      return `<tr><td>${a} ${a===1?'ano':'anos'}</td><td class="num">${semRS(r.colocado)}</td><td class="num ${r.juros<0?'neg':'pos'}">${semRS(r.juros)}</td><td class="num"><b>${semRS(r.saldo)}</b>${sub}</td></tr>`;
    }).join('');
  }

  function ticks(max){
    const passo0 = max/4, p = Math.pow(10, Math.floor(Math.log10(passo0||1)));
    const passo = [1,2,2.5,5,10].map(x=>x*p).find(x=>x>=passo0);
    const t=[]; for(let v=0; v<=max+1e-6; v+=passo) t.push(v); return t;
  }

  function grafico(){
    const e = estado, svg = $('chart');
    const W = svg.clientWidth || 600, H = 260, ml = 64, mr = 14, mt = 18, mb = 26;
    const pw = W-ml-mr, ph = H-mt-mb;
    const maxV = Math.max(...e.serie.map(p=>Math.max(p.saldo,p.colocado)), ...(e.difere?e.serieBase.map(p=>p.saldo):[0]));
    const tk = ticks(maxV), top = tk[tk.length-1] < maxV ? tk[tk.length-1] + (tk[1]-tk[0]) : tk[tk.length-1];
    if(tk[tk.length-1] < top) tk.push(top);
    const x = m => ml + m/MESES*pw, y = v => mt + ph - Math.max(0,v)/top*ph;
    const linha = (pts, f) => pts.map((p,i)=>(i?'L':'M')+x(p.m).toFixed(1)+','+y(f(p)).toFixed(1)).join('');
    const base0 = `L${x(MESES).toFixed(1)},${y(0).toFixed(1)}L${x(0).toFixed(1)},${y(0).toFixed(1)}Z`;
    // área de baixo: dinheiro colocado; área de cima: juros (entre colocado e saldo)
    const colocadoTop = p => Math.min(p.colocado, p.saldo);
    const aArea = linha(e.serie, colocadoTop) + base0;
    const jArea = linha(e.serie, p=>p.saldo) + e.serie.slice().reverse().map(p=>'L'+x(p.m).toFixed(1)+','+y(colocadoTop(p)).toFixed(1)).join('') + 'Z';
    let s = '';
    tk.forEach(v=>{ s += `<line x1="${ml}" x2="${W-mr}" y1="${y(v)}" y2="${y(v)}" stroke="var(--grid)" stroke-width="1"/>`
      + `<text x="${ml-8}" y="${y(v)+4}" text-anchor="end">${v===0?'0':curto(v).replace('R$ ','')}</text>`; });
    [0,5,10,15,20].forEach(a=>{ s += `<text x="${x(a*12)}" y="${H-6}" text-anchor="${a===0?'start':a===20?'end':'middle'}">${a===0?'hoje':a+'a'}</text>`; });
    s += `<path class="area" d="${aArea}" fill="var(--s-aporte)"/>`;
    s += `<path class="area" d="${jArea}" fill="var(--s-juros)"/>`;
    s += `<path d="${linha(e.serie,colocadoTop)}" fill="none" stroke="var(--card)" stroke-width="2"/>`;
    if(e.difere) s += `<path d="${linha(e.serieBase,p=>p.saldo)}" fill="none" stroke="var(--mute)" stroke-width="2" stroke-dasharray="5 4"/>`;
    PJ.horizontes_anos.forEach(a=>{ const p=e.serie[a*12]; s += `<circle cx="${x(p.m)}" cy="${y(p.saldo)}" r="4.5" fill="var(--ink)" stroke="var(--card)" stroke-width="2"/>`; });
    const fim = e.serie[MESES];
    s += `<text class="endlabel" x="${x(MESES)-8}" y="${Math.max(12,y(fim.saldo)-10)}" text-anchor="end">${curto(fim.saldo)}</text>`;
    s += `<line id="cj-cross" x1="0" x2="0" y1="${mt}" y2="${mt+ph}" stroke="var(--ink)" stroke-width="1" opacity="0"/>`;
    s += `<rect id="cj-hit" x="${ml}" y="${mt}" width="${pw}" height="${ph}" fill="transparent" tabindex="0"/>`;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('aria-label', `Projeção em ${MESES/12} anos: saldo de ${curto(fim.saldo)}, sendo ${curto(fim.colocado)} colocados e ${curto(fim.juros)} de juros.`);
    svg.innerHTML = s;
    const hit = $('hit'), cross = $('cross'), tip = $('tip');
    const mostrar = m => {
      m = Math.max(0, Math.min(MESES, Math.round(m/12)*12));
      const p = e.serie[m], b = e.serieBase[m];
      cross.setAttribute('x1', x(m)); cross.setAttribute('x2', x(m)); cross.setAttribute('opacity', .35);
      tip.innerHTML = '';
      const t = document.createElement('div'); t.className='t'; t.textContent = m===0?'Hoje':`Em ${m/12} ${m===12?'ano':'anos'}`; tip.appendChild(t);
      const row = (cor, valor, nome, dash) => { const d=document.createElement('div'); const l=document.createElement('span');
        const i=document.createElement('i'); i.style.borderTopColor=cor; if(dash) i.style.borderTopStyle='dashed'; l.appendChild(i); l.appendChild(document.createTextNode(' '+nome));
        const bb=document.createElement('b'); bb.textContent=valor; d.appendChild(bb); d.appendChild(l); tip.appendChild(d); };
      row('var(--ink)', curto(p.saldo), 'saldo');
      row('var(--s-aporte)', curto(p.colocado), 'colocado');
      row('var(--s-juros)', curto(p.juros), 'juros');
      if(e.difere) row('var(--mute)', curto(b.saldo), `com ${PJ.aporte_base_por_pessoa.toLocaleString('pt-BR')} cada`, true);
      tip.hidden = false;
      const box = svg.getBoundingClientRect(), px = x(m)/W*box.width, tw = tip.offsetWidth;
      tip.style.left = Math.max(0, Math.min(box.width - tw, px < box.width/2 ? px + 12 : px - tw - 12)) + 'px';
    };
    const esconder = () => { tip.hidden = true; cross.setAttribute('opacity', 0); };
    const doPonteiro = ev => { const box = svg.getBoundingClientRect(); const vx = (ev.clientX-box.left)/box.width*W; mostrar((vx-ml)/pw*MESES); };
    hit.addEventListener('pointermove', doPonteiro);
    hit.addEventListener('pointerdown', doPonteiro);
    hit.addEventListener('pointerleave', esconder);
    let foco = MESES;
    hit.addEventListener('focus', ()=>mostrar(foco));
    hit.addEventListener('blur', esconder);
    hit.addEventListener('keydown', ev=>{ if(ev.key==='ArrowRight'){foco=Math.min(MESES,foco+12);mostrar(foco);ev.preventDefault();} if(ev.key==='ArrowLeft'){foco=Math.max(0,foco-12);mostrar(foco);ev.preventDefault();} });
  }

  carregar();
  pessoas.forEach(k=>$('ap-'+k).addEventListener('input', calcular));
  ['taxa','infl'].forEach(k=>$(k).addEventListener('input', calcular));
  ['ir','real'].forEach(k=>$(k).addEventListener('change', calcular));
  document.querySelectorAll('[data-cada]').forEach(b=>b.addEventListener('click',()=>{ pessoas.forEach(k=>$('ap-'+k).value=fmtBR(+b.dataset.cada)); calcular(); }));
  document.querySelectorAll('[data-taxa]').forEach(b=>b.addEventListener('click',()=>{ $('taxa').value=fmtBR(+b.dataset.taxa); calcular(); }));
  // Redesenha quando a largura muda (inclusive quando a aba fica visível depois de escondida).
  let rz, larg = 0;
  const redesenhar = () => { const w = $('chart').clientWidth; if(w && w!==larg){ larg = w; grafico(); } };
  if(window.ResizeObserver) new ResizeObserver(()=>{ clearTimeout(rz); rz=setTimeout(redesenhar, 60); }).observe($('chart'));
  else window.addEventListener('resize', ()=>{ clearTimeout(rz); rz=setTimeout(redesenhar, 120); });
  calcular();
}
