// Finanças pessoais (area/financas.html): o painel do projeto Financeiro (visão geral do mês, gastos do dia a dia,
// cartão e faturas e investimentos), desenhado com os dados importados do arquivo do painel e guardados no banco.
// Os cálculos são os do painel original do projeto. O que depende do Claude (pasta do computador, envio do PDF
// da fatura) continua no painel original, aberto pelo botão "Abrir no Claude".
// Nenhum dado pessoal fica neste código: nomes, valores e cartões vêm todos dos dados importados.
import { outrasPessoas } from "./financas-importar.js";
import { chavesFatura, chavesGastos, efetivo, lerCategorias, nomeConta, partesDe, textoPartes } from "./financas-classificacao.js";
import { ordemFatura } from "./financas-previa.js";
import { mudancas, primeiroMes, rotuloMes as rotuloPlano, textoPrevistoFeito, vigenteNoMes } from "./financas-plano.js";
import { calcular as calcularCaixinha, ehDeposito, movimentosDe, parteDe, valorNoMes } from "./financas-caixinhas.js";

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
  entradasSite = [], aoLancarEntrada = null, aoApagarEntrada = null,
  categorias = null, ajustes = [], contas = [], aoClassificar = null, aoEditarCategorias = null, comDesejos = false, comInvestimentos = false,
  comMeses = false, somenteCalculo = false, caixa: caixaPrefs = null, aoSalvarSaldo = null, aoMudarRecebimento = null,
  recorrentes: recorrentesSite = [], aoPagarRecorrente = null, aoDesmarcarRecorrente = null, aoEditarRecorrente = null, aoValorRecorrente = null,
  aoMudarPendencias = null, aoEditarGasto = null, aoPagarGasto = null, aoEditarMetas = null,
  aoEditarEntrada = null, aoReceberEntrada = null, outroAporte = null, investimentosCasal = null,
  planoAporte = null, planoCasal = null, caixinhas = null }) {
  const D = completar(dados);
  let CATS = categorias || lerCategorias(null, dados);
  let AJ = new Map(ajustes.map(a => [a.chave, a]));
  let CONTAS = contas;
  // Compra da fatura conferida com um gasto do dia a dia (chave de um → o outro): os dois são o mesmo lançamento
  let PAR = new Map();
  // Classificação que vale para o lançamento. Na compra conferida com um gasto vale a mesma para os dois: a feita no
  // site (a mais recente, se houver nas duas), depois a do gasto lançado no site, depois a que não está pendente;
  // empatadas, a do gasto do dia a dia.
  const ef = l => {
    const proprio = efetivo(l, AJ.get(l.chave), CATS);
    const p = l.chave ? PAR.get(l.chave) : null;
    if (!p) return proprio;
    const doPar = efetivo(p, AJ.get(p.chave), CATS);
    const peso = (x, e) => (AJ.has(x.chave) ? 3 : x.origem === "site" && !e.pendente ? 2 : e.pendente ? 0 : 1);
    const a = peso(l, proprio), b = peso(p, doPar);
    const quando = x => String((AJ.get(x.chave) || {}).atualizado_em || "");
    const vencePar = b > a || (b === a && (a === 3 && quando(p) !== quando(l) ? quando(p) > quando(l) : !!p.naFatura));
    return vencePar ? {...doPar, ajustado: proprio.ajustado} : proprio;
  };
  // Conta como aparece no painel: a empresa que entrou numa conta unida (Cadastros) aparece pela conta unida
  const unificada = c => (CONTAS.find(x => x.id === c && x.agrupada) || {}).agrupada || c;
  const nomeDaConta = c => (CONTAS.find(x => x.id === unificada(c)) || {}).nome || nomeConta(c);
  const SO_FATURAS = modo === "faturas";
  // Visão geral e gastos do mês: no painel completo e, no painel só de faturas, quando dá para lançar pelo site
  // (os meses vêm das entradas e dos gastos lançados)
  const COM_MESES = !SO_FATURAS || !!aoLancarGasto || comMeses;
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
  // Mês somado (aceita negativo): "2026-10" + 1 → "2026-11"
  const somarChave = (chave, k) => { const [a, m] = chave.split("-").map(Number); const t = a * 12 + m - 1 + k; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`; };
  const dBR = iso => esc(`${String(iso).slice(8, 10)}/${String(iso).slice(5, 7)}`);
  const dataLonga = iso => new Date(iso + "T12:00").toLocaleDateString("pt-BR");
  const $id = id => document.getElementById(id);
  const semAcento = s => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const hoje = new Date();
  const hojeKey = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  const card = f => /cart/i.test(f || "");
  // Previsões do mês (do projeto Financeiro, alteradas no site em Cadastros): fatura do cartão e investimento mensal
  // Sem previsão de investimento no painel, vale o aporte mensal da pessoa na carteira conjunta do projeto (uma fonte só)
  let META = null, INV = 0, INV_NOME = "", INV_DA_CARTEIRA = false;
  const chaveNomeIgual = (obj, nome) => Object.keys(obj || {}).find(k => String(k).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase() === String(nome).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase());
  const aporteDaCarteira = () => { const k = CARTEIRA && TEM_NOME ? chaveNomeIgual(CARTEIRA.aportes_mensais, DONO) : null; return k ? Number(CARTEIRA.aportes_mensais[k]) || 0 : 0; };
  const lerMetas = c => {
    const m = {...(D.metas || {}), ...((c && c.metas) || {})};
    META = m.cartao_mensal != null && m.cartao_mensal !== "" ? Number(m.cartao_mensal) : null;
    const temInv = m.investimento_mensal != null && m.investimento_mensal !== "";
    INV = temInv ? Number(m.investimento_mensal) || 0 : aporteDaCarteira();
    INV_DA_CARTEIRA = !temInv && INV > 0;
    INV_NOME = m.investimento_nome || (INV_DA_CARTEIRA ? "Aporte na carteira conjunta" : "");
  };
  lerMetas(caixaPrefs);
  // Plano de aportes com datas (Cadastros): do primeiro degrau em diante, o investimento previsto de cada mês é o valor
  // vigente naquele mês; antes dele (e sem plano) continua a previsão do mês (Investimento mensal)
  let PLANO = Array.isArray(planoAporte) ? planoAporte : [];
  let PLANO_CASAL = planoCasal || null;
  let PARCEIRO = null; // { nome, aporte(chave) → { previsto, feito } } da outra pessoa do casal, quando carregada
  const comPlano = chave => PLANO.length > 0 && chave >= primeiroMes(PLANO);
  const invDoMes = chave => (comPlano(chave) ? vigenteNoMes(PLANO, chave).total : INV);
  const nomeInvDoMes = chave => {
    if (!comPlano(chave)) return INV_NOME || "Investimento";
    const itens = vigenteNoMes(PLANO, chave).itens;
    return itens.length === 1 ? `Aporte: ${itens[0].destino}` : "Aportes do plano";
  };
  // Caixinhas de provisão (aba Caixinhas): as de quem é o painel e as do casal. O depósito (categoria Caixinhas) sai do
  // caixa como caixinha, não como gasto; o gasto pago com o dinheiro da caixinha não entra nos gastos nem no caixa
  let CXS = caixinhas && Array.isArray(caixinhas.lista) ? caixinhas.lista : [];
  const COM_CAIXINHAS = !!caixinhas;
  const PERFIL_ID = caixinhas ? caixinhas.perfilId : null;
  let MOV_OUTRO = []; // movimentos das caixinhas lançados no painel da outra pessoa do casal
  let memoCx = null;
  let PAGOS_CX = []; // gastos do site pagos com uma caixinha (fora dos gastos do mês)
  // Gastos lançados no site ainda a pagar (ids) e fixos do projeto trocados por um recorrente do site ou tirados
  let APAGAR = new Set((caixaPrefs && caixaPrefs.aPagar) || []);
  let OCULTOS = new Set((caixaPrefs && caixaPrefs.fixosOcultos) || []);
  const aPagar = l => !!l && l.origem === "site" && !card(l.forma) && APAGAR.has(l.id);
  // Prévias das faturas que ainda não fecharam, importadas do CSV ou do OFX do app do banco
  const PREVIAS = (D.cartao.previas || []).filter(p => p && Array.isArray(p.lancamentos) && !D.cartao.faturas.some(f => f.mes === p.mes));
  // Um print antigo de uma fatura que já foi processada (ou que tem prévia mais nova) não conta mais como fatura aberta
  const AB = D.aberta && !D.cartao.faturas.some(f => f.mes === D.aberta.fatura)
    && !PREVIAS.some(p => p.mes === D.aberta.fatura && String(p.ate) >= String(D.aberta.data)) ? D.aberta : null;
  // Faturas conhecidas do cartão: as fechadas (PDF ou projeto) e as prévias. Com elas os gastos do dia a dia são
  // conferidos e as parcelas de compras antigas de cada fatura são conhecidas.
  const parcelaDe = l => { const x = String(l.parcela || "").match(/(\d+)\s*\/\s*(\d+)/); return x ? {k: Number(x[1]), n: Number(x[2])} : null; };
  const FATURAS = new Map();
  {
    const chaves = chavesFatura(D.cartao.lancamentos, "c");
    D.cartao.faturas.forEach(f => FATURAS.set(f.mes, {mes: f.mes, fechada: true, periodo: f.periodo || null, itens: []}));
    D.cartao.lancamentos.forEach((l, i) => { const f = FATURAS.get(l.mes); if (f) f.itens.push({...l, chave: chaves[i]}); });
    PREVIAS.forEach(p => {
      const ls = p.lancamentos.map(l => ({...l, mes: p.mes}));
      const ch = chavesFatura(ls, "c");
      FATURAS.set(p.mes, {mes: p.mes, fechada: false, previa: p, periodo: null, itens: ls.map((l, i) => ({...l, chave: ch[i]}))});
    });
    for (const f of FATURAS.values()) {
      f.itens.forEach(l => { l.parc = parcelaDe(l); l.valor = Number(l.valor) || 0; });
      const antiga = l => l.parc && l.parc.k >= 2;
      f.parcelasAnteriores = Math.round(sum(f.itens.filter(antiga), l => l.valor) * 100) / 100;
      f.compras = f.itens.filter(l => !antiga(l) && l.valor && /^\d{4}-\d{2}-\d{2}/.test(l.data || ""));
      const datas = f.compras.filter(l => l.tipo !== "Encargo").map(l => l.data).sort();
      f.periodo = {inicio: (f.periodo && f.periodo.inicio) || datas[0] || null, fim: (f.periodo && f.periodo.fim) || datas.at(-1) || null};
    }
  }
  // Parcelas de compras antigas que caem numa fatura: as da fatura conhecida ou as agendadas pelo projeto
  const parcelasDaFatura = fat => (FATURAS.has(fat) ? FATURAS.get(fat).parcelasAnteriores : D.cartao.comprometido[fat] ?? null);
  // Salário e outras receitas de um mês normal, como no último mês em que apareceram (refeito ao lançar entradas)
  let SAL_NORMAL = 0, OUTRAS_NORMAL = 0, RECEITA_PREVISTA = 0;
  function receitasNormais() {
    SAL_NORMAL = (() => { for (const m of [...D.meses].reverse()) { const s = m.receitas.find(r => r.fonte === "Empresa" && r.liquido != null); if (s) return s.liquido; } return 0; })();
    OUTRAS_NORMAL = (() => { for (const m of [...D.meses].reverse()) { const o = m.receitas.filter(r => r.fonte !== "Empresa" && r.liquido != null); if (o.length) return sum(o, r => r.liquido); } return 0; })();
    RECEITA_PREVISTA = SAL_NORMAL + OUTRAS_NORMAL;
  }

  // ---------- Gastos lançados pelo site: entram nos meses como os do projeto (os de cartão, na fatura) ----------
  const ORIGINAL = {meses: structuredClone(D.meses), comprometido: structuredClone(D.cartao.comprometido)};
  const FORMAS_SITE = {cartao: "Cartão de crédito", pix: "Pix", debito: "Débito", dinheiro: "Dinheiro", outro: "Boleto ou outro"};
  const faturaSeguinte = (rotulo, k) => {
    const [mm, yy] = String(rotulo || "").split("/");
    const i = MES.indexOf(mm);
    if (i < 0 || !yy) return null;
    const [a, m] = nextYM(2000 + Number(yy), i + 1, k);
    return lbl(a, m);
  };
  let duplicados = 0;
  const memoCaixa = new Map(); // fluxo de caixa de cada mês, refeito a cada desenho
  let entradasRepetidas = 0;
  let parcelasSite = []; // compras parceladas lançadas pelo site, para a lista de parceladas a vencer
  let atual = null;
  let GASTOS_SITE = gastosSite, ENTRADAS_SITE = entradasSite, REC_SITE = recorrentesSite || [];
  let PAGOS = new Map(); // pagamento recorrente marcado como pago ("chave|AAAA-MM") → gasto lançado ao marcar
  const mesDe = chave => {
    let m = D.meses.find(x => x.chave === chave);
    if (!m) {
      const [a, mes] = chave.split("-").map(Number);
      const [fa, fm] = nextYM(a, mes);
      m = {chave, rotulo: lbl(a, mes), ano: a, mes, fatura: lbl(fa, fm), lancamentos: [], receitas: [], compromissos: []};
      D.meses.push(m);
      D.meses.sort((x, y) => x.chave.localeCompare(y.chave));
    }
    return m;
  };
  // ---------- Conferência dos gastos do dia a dia com as faturas do cartão ----------
  // Cada compra das faturas conhecidas procura o mesmo gasto nos gastos do dia a dia (mesmo valor, até 3 dias de
  // diferença; lançado em outra forma, só no mesmo dia e com nome parecido). A que não está lá entra nos gastos,
  // marcada "da fatura". O gasto no cartão que não aparece na fatura do período fica marcado para conferir, e o
  // lançado depois da última compra conhecida vai entrar na próxima fatura. O ajuste de "gastos no cartão não
  // anotados" de um período que a fatura detalha sai, porque ela traz cada compra.
  let CONC = null;
  const palavras = s => new Set(semAcento(s).replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(t => t.length > 2));
  function conciliar() {
    CONC = {faturas: [], daFatura: 0, conferidos: 0, fimConhecido: null, ajustes: 0, pares: []};
    if (!COM_MESES || !FATURAS.size) return;
    const periodos = [...FATURAS.values()].map(f => f.periodo).filter(p => p.inicio && p.fim);
    const coberto = d => periodos.some(p => d >= p.inicio && d <= p.fim);
    CONC.fimConhecido = periodos.reduce((x, p) => (p.fim > x ? p.fim : x), "") || null;
    const ajuste = l => /^ajuste/i.test(l.desc || "");
    D.meses.forEach(m => {
      const antes = m.lancamentos.length;
      m.lancamentos = m.lancamentos.filter(l => !(ajuste(l) && card(l.forma) && l.data && coberto(l.data)));
      CONC.ajustes += antes - m.lancamentos.length;
    });
    const doDia = D.meses.flatMap(m => m.lancamentos).filter(l => /^\d{4}-\d{2}-\d{2}/.test(l.data || "") && !ajuste(l));
    const nomes = new Map(doDia.map(l => [l, palavras(l.desc)]));
    const dia = iso => Date.parse(iso.slice(0, 10) + "T12:00:00Z") / 864e5;
    const usados = new Set();
    const formaCartao = D.cartao_nome ? `Cartão ${D.cartao_nome}` : (doDia.find(l => card(l.forma)) || {}).forma || "Cartão de crédito";
    for (const f of [...FATURAS.values()].sort((a, b) => ordemFatura(a.mes) - ordemFatura(b.mes))) {
      const r = {mes: f.mes, fechada: f.fechada, previa: f.previa || null, compras: f.compras.length, conferidos: 0, entraram: 0};
      for (const it of f.compras) {
        const doItem = palavras(it.nome);
        let melhor = null, nota = Infinity;
        for (const l of doDia) {
          if (usados.has(l) || Math.abs(l.valor - it.valor) >= 0.01) continue;
          const dd = Math.abs(dia(l.data) - dia(it.data));
          if (dd > 3) continue;
          let comum = 0;
          nomes.get(l).forEach(p => { if (doItem.has(p)) comum++; });
          if (!card(l.forma) && (dd > 1 || !comum)) continue;
          const pts = (card(l.forma) ? 0 : 10) + dd - Math.min(comum, 2) * 0.6;
          if (pts < nota) { nota = pts; melhor = l; }
        }
        if (melhor) {
          usados.add(melhor);
          CONC.pares.push([melhor, it]);
          melhor.naFatura = f.mes;
          if (!card(melhor.forma)) melhor.outraForma = true;
          r.conferidos++;
        } else {
          mesDe(it.data.slice(0, 7)).lancamentos.push({data: it.data.slice(0, 10), desc: it.nome, valor: it.valor, forma: formaCartao, cat: it.cat || "Outros",
            sub: it.sub || null, parcelas: it.parc && it.parc.n > 1 ? `${it.parc.k}/${it.parc.n}` : null, obs: "", origem: "fatura", fatura: f.mes, chave: it.chave});
          r.entraram++;
        }
      }
      CONC.daFatura += r.entraram;
      CONC.conferidos += r.conferidos;
      CONC.faturas.push(r);
    }
    for (const l of doDia) {
      if (usados.has(l) || !card(l.forma)) continue;
      if (coberto(l.data)) l.foraDaFatura = true;
      else if (CONC.fimConhecido && l.data > CONC.fimConhecido) l.aEntrar = true;
    }
  }

  function mesclarSite() {
    D.meses = structuredClone(ORIGINAL.meses);
    D.cartao.comprometido = structuredClone(ORIGINAL.comprometido);
    duplicados = 0;
    entradasRepetidas = 0;
    parcelasSite = [];
    memoCaixa.clear();
    memoCx = null;
    PAGOS = new Map((GASTOS_SITE || []).filter(g => g.recorrente).map(g => [g.recorrente, {id: g.id, valor: Number(g.valor) || 0, data: g.data}]));
    PAGOS_CX = (GASTOS_SITE || []).filter(g => g.caixinha_id && !ehDeposito(g.categoria) && g.forma !== "cartao");
    // O mês atual e o seguinte (a previsão do caixa) sempre aparecem, mesmo sem nada lançado
    if (COM_MESES) { mesDe(hojeKey); mesDe(somarChave(hojeKey, 1)); }
    // Entradas lançadas pelo site: o salário lançado substitui o do projeto no mesmo mês (que pode ser só uma
    // estimativa); outro recebimento igual a um do projeto no mesmo mês não conta de novo
    for (const e of ENTRADAS_SITE || []) {
      const m = mesDe(String(e.data).slice(0, 7));
      const salario = e.tipo === "salario";
      if (salario) m.receitas = m.receitas.filter(r => r.origem === "site" || r.fonte !== "Empresa");
      else {
        // Recebimento igual a um do projeto: a estimativa do projeto sai (a entrada do site confirma o recebimento);
        // um recebimento já registrado no projeto não conta de novo
        const igual = m.receitas.find(r => r.origem !== "site" && r.fonte !== "Empresa" && r.liquido != null && Math.abs(r.liquido - e.liquido) < 0.01);
        if (igual && !/estimativa/i.test(igual.obs || "")) { entradasRepetidas++; continue; }
        if (igual) m.receitas = m.receitas.filter(r => r !== igual);
      }
      m.receitas.push({desc: e.descricao, fonte: salario ? "Empresa" : "Outros", liquido: e.liquido, obs: e.observacao || "", origem: "site", id: e.id,
        bruto: e.bruto, descontos: e.descontos || [], data: e.data, conta: e.conta || null,
        recebimento: e.recebimento || null, referencia: e.referencia || null, repete: !!e.repete});
    }
    for (const g of GASTOS_SITE || []) {
      if (PAGOS_CX.includes(g)) continue; // pago com o dinheiro de uma caixinha: só tira do saldo dela
      const m = mesDe(String(g.data).slice(0, 7));
      const parcelas = g.forma === "cartao" ? Math.max(1, g.parcelas || 1) : 1;
      const valor = Math.round(g.valor / parcelas * 100) / 100;
      // O mesmo gasto já anotado no projeto (mesma data e mesmo valor) não conta de novo
      if (m.lancamentos.some(l => l.origem !== "site" && l.data === g.data && Math.abs(l.valor - valor) < 0.01)) { duplicados++; continue; }
      m.lancamentos.push({data: g.data, desc: g.descricao, valor, forma: FORMAS_SITE[g.forma] || "Outro", cat: g.categoria || "Outros",
        parcelas: parcelas > 1 ? `1/${parcelas}` : null, obs: g.observacao || "",
        essencial: g.essencial === true ? "Essencial" : g.essencial === false ? "Não essencial" : null, origem: "site", id: g.id,
        sub: g.subcategoria || null, conta: g.conta || null, recorrente: g.recorrente || null, total: parcelas > 1 ? Number(g.valor) : null,
        partes: g.partes || null, caixinha_id: g.caixinha_id || null});
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
    conciliar();
    D.meses.forEach(x => x.lancamentos.sort((p, q) => String(p.data).localeCompare(String(q.data))));
    // Chave de cada lançamento, para achar a classificação feita no site
    D.meses.forEach(x => chavesGastos(x.lancamentos).forEach((k, i) => { x.lancamentos[i].chave = k; }));
    PAR = new Map();
    for (const [g, it] of (CONC && CONC.pares) || []) if (g.chave && it.chave) { PAR.set(it.chave, g); PAR.set(g.chave, it); }
    if (atual) atual = D.meses.find(x => x.chave === atual.chave) || atual;
    receitasNormais();
  }
  mesclarSite();

  atual = D.meses.find(m => m.chave === hojeKey) || [...D.meses].reverse().find(m => m.chave <= hojeKey) || D.meses[0];
  { const s = lembrar("mes"); if (s && D.meses.some(m => m.chave === s) && s >= hojeKey) atual = D.meses.find(m => m.chave === s); }

  const snapDe = m => (AB && AB.mes_compras === m.chave ? AB : null);

  // Pagamentos recorrentes: os gastos fixos do projeto Financeiro e os cadastrados no site (do mês de início ao último
  // mês, com o valor do mês quando ele foi mudado só naquele mês). Cada um fica pendente no mês até ser marcado como
  // pago, o que lança um gasto com a chave do recorrente e o mês ("chave|AAAA-MM"), mesmo pago no mês seguinte.
  const chaveRec = r => (r.site ? r.id : `p:${String(r.nome || "").slice(0, 100)}`);
  // Parcela do recorrente no mês: pelo primeiro e o último mês, ou pelo "1/15" do nome (com o primeiro mês). O "1/15"
  // escrito no nome não avança sozinho; a parcela calculada avança todo mês e o recorrente acaba na última.
  const NOME_PARCELA = /\s*\(?\b(\d{1,3})\s*\/\s*(\d{1,3})\)?\s*$/;
  const totalParcelasRec = r => { if (r.inicio && r.fim) return mesesEntre(r.inicio, r.fim) + 1; const x = String(r.nome || "").match(NOME_PARCELA); return x && r.inicio ? Number(x[2]) : null; };
  const fimRec = r => r.fim || (totalParcelasRec(r) && r.inicio ? somarChave(r.inicio, totalParcelasRec(r) - 1) : null);
  const parcelaRec = (r, chave) => { const nTot = totalParcelasRec(r); return nTot && r.inicio ? {k: mesesEntre(r.inicio, chave) + 1, n: nTot} : null; };
  const nomeSemParcela = nome => String(nome || "").replace(NOME_PARCELA, "").trim() || String(nome || "");
  function recorrentesDe(chave) {
    const site = REC_SITE.filter(r => r && r.id && r.nome && (!r.inicio || r.inicio <= chave) && (!fimRec(r) || fimRec(r) >= chave)).map(r => {
      const doMes = r.valores && r.valores[chave] != null && Number.isFinite(Number(r.valores[chave]));
      const forma = FORMAS_SITE[r.forma] || FORMAS_SITE.outro;
      return {id: r.id, nome: r.nome, valor: doMes ? Number(r.valores[chave]) : r.valor != null ? Number(r.valor) : null, editado: doMes, dia: Number(r.dia) || null,
        forma, formaSite: r.forma || "outro", categoria: r.categoria || "", subcategoria: r.subcategoria || null, conta: r.conta || null,
        // No cartão, a cobrança chega pela fatura: o lançamento com o nome dele conta como lançado (o fixo que veio do
        // projeto guarda os nomes que ele procurava)
        busca: Array.isArray(r.busca) && r.busca.length ? r.busca.map(b => String(b).toLowerCase()) : card(forma) ? [String(r.nome).toLowerCase()] : [],
        variavel: !!r.variavel, site: true, inicio: r.inicio || null, fim: r.fim || null, parcela: parcelaRec(r, chave)};
    });
    return [...D.recorrentes.filter(r => !OCULTOS.has(chaveRec(r))), ...site];
  }

  // Liga cada gasto fixo a um lançamento já registrado, para não contar duas vezes.
  // Com a fatura aberta do app, fixos de cartão cujo dia já passou estão dentro dela.
  function statusRecorrentes(m) {
    const usados = new Set(), snap = snapDe(m);
    const snapDia = snap ? Number(snap.data.slice(8, 10)) : null;
    const corrente = m.chave === hojeKey, passado = m.chave < hojeKey;
    return recorrentesDe(m.chave).map(r => {
      const chave = chaveRec(r);
      const pago = PAGOS.get(`${chave}|${m.chave}`);
      if (pago && APAGAR.has(pago.id)) return {...r, chave, st: {t: `lançado, a pagar em ${dBR(pago.data)}`, c: "warn"}, pendente: 0, pago};
      if (pago) return {...r, chave, st: {t: `pago em ${dBR(pago.data)}`, c: ""}, pendente: 0, pago};
      // O gasto lançado ao marcar outro recorrente não serve para este
      const bate = l => !l.recorrente && r.busca.some(b => l.desc.toLowerCase().includes(b));
      if (r.variavel) {
        let gasto = 0;
        m.lancamentos.forEach((l, i) => { if (!usados.has(i) && bate(l)) { usados.add(i); gasto += l.valor; } });
        if (snap) gasto += sum((snap.transacoes || []).filter(t => r.busca.some(b => t.nome.toLowerCase().includes(b)) && !m.lancamentos.some(l => l.data === t.data && Math.abs(l.valor - t.valor) < 0.01)), t => t.valor);
        const falta = r.valor != null ? Math.max(0, r.valor - gasto) : 0;
        const st = r.valor == null ? {t: "informar valor", c: "bad"}
          : gasto >= r.valor ? {t: `${brl(gasto)} no mês`, c: ""}
          : gasto > 0 ? {t: `${brl(gasto)} até agora`, c: "warn"}
          : {t: "previsto no mês", c: "warn"};
        return {...r, chave, st, pendente: falta};
      }
      let idx = -1;
      if (r.valor != null) idx = m.lancamentos.findIndex((l, i) => !usados.has(i) && bate(l) && Math.abs(l.valor - r.valor) <= Math.max(5, r.valor * 0.15));
      if (idx >= 0) usados.add(idx);
      let st, pend = 0;
      if (idx >= 0) st = {t: "lançado", c: "", auto: true};
      else if (r.valor == null) st = {t: "informar valor", c: "bad"};
      else if (snap && card(r.forma) && r.dia && r.dia <= snapDia) st = {t: "na fatura aberta", c: "", auto: true};
      else if (passado || (corrente && r.dia && r.dia < hoje.getDate())) { st = {t: r.dia ? `venceu dia ${r.dia}` : "pendente", c: "warn"}; pend = r.valor; }
      else { st = {t: r.dia ? `vence dia ${r.dia}` : "pendente", c: "neutral"}; pend = r.valor; }
      return {...r, chave, st, pendente: pend};
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
    if (invDoMes(m.chave)) linhas.push({t: nomeInvDoMes(m.chave), v: invDoMes(m.chave), cor: "var(--inv)", leg: "Investimento"});
    let cartao, parcelas = parcelasDaFatura(m.fatura);
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

  // ---------- Fluxo de caixa e gastos do mês ----------
  // Duas visões de cada mês. Fluxo de caixa: o dinheiro que entra e sai da conta, pela data em que entra ou sai. As
  // entradas pela data de recebimento; a fatura do cartão inteira na data de vencimento (as compras no cartão só
  // mexem no caixa quando a fatura é paga); Pix, débito e dinheiro na data do gasto; os fixos fora do cartão e o
  // investimento do mês. Realizado é o que tem data até hoje (ou é de mês que já passou); o resto é previsto.
  // Gastos pagos no mês: a mesma base do fluxo de caixa, sem o investimento. A fatura que vence no mês entra com os
  // lançamentos dela (as mesmas categorias da aba Cartão e faturas), mais Pix, débito, dinheiro e fixos fora do cartão.
  // As compras feitas no mês (pela data, o que no cartão vai para a fatura seguinte) ficam em "Comprado em".
  const hojeIso = `${hojeKey}-${String(hoje.getDate()).padStart(2, "0")}`;
  const diasDoMes = chave => { const [a, m] = chave.split("-").map(Number); return new Date(a, m, 0).getDate(); };
  const rotuloDe = chave => { const [a, m] = chave.split("-").map(Number); return lbl(a, m); };
  const chaveDoRotulo = rot => { const [mm, yy] = String(rot || "").split("/"); const i = MES.indexOf(mm); return i < 0 || !yy ? null : `${2000 + Number(yy)}-${String(i + 1).padStart(2, "0")}`; };
  const diaDe = (chave, dia) => `${chave}-${String(Math.min(Math.max(1, dia), diasDoMes(chave))).padStart(2, "0")}`;
  const mesesEntre = (a, b) => { const [x, y] = a.split("-").map(Number), [z, w] = b.split("-").map(Number); return (z - x) * 12 + (w - y); };
  const FORMA_CAIXA = f => (/pix/i.test(f || "") ? "Pix" : /d[ée]bito/i.test(f || "") ? "Débito" : /dinheiro|saque/i.test(f || "") ? "Dinheiro" : "Boleto e outros");
  let SALDOS = {...((caixaPrefs && caixaPrefs.saldos) || {})};
  // Dia do vencimento do cartão: o da fatura conhecida mais recente, para as faturas que ainda não têm data
  const DIA_VENC = (() => {
    const vs = [...D.cartao.faturas.map(f => f.vencimento), AB && AB.vencimento, ...PREVIAS.map(p => p.vencimento)].filter(v => /^\d{4}-\d{2}-\d{2}/.test(v || "")).sort();
    return vs.length ? Number(vs.at(-1).slice(8, 10)) : null;
  })();

  // Fatura do cartão pelo rótulo ("nov/26"): a fechada pelo total; a aberta pelo print do app ou pela prévia; a que
  // ainda não fechou pelas parcelas agendadas, as compras no cartão do mês da compra e os fixos que ainda vão cair
  function faturaDoCartao(rot) {
    const chave = chaveDoRotulo(rot);
    const venc = v => v || (DIA_VENC && chave ? diaDe(chave, DIA_VENC) : null);
    const f = D.cartao.faturas.find(x => x.mes === rot);
    if (f) return {rotulo: rot, valor: Number(f.total) || 0, venc: venc(f.vencimento), situacao: "fechada", segs: [[Number(f.total) || 0, "var(--muted)"]], meta: "Fechada"};
    const mm = D.meses.find(x => x.fatura === rot);
    const pv = (FATURAS.get(rot) || {}).previa;
    const fixos = sum(recorrentesDe(chave || hojeKey).filter(r => card(r.forma) && r.valor != null), r => r.valor);
    if (mm) {
      const c = calc(mm);
      if (c.snap) return {rotulo: rot, valor: c.cartao, venc: venc(c.snap.vencimento), situacao: "aberta",
        segs: [[c.snap.total, "var(--parc)"], [(c.linhas.find(l => l.leg === "Compras novas") || {}).v || 0, "var(--gasto)"], [c.fixosCartao, "var(--rec)"]],
        meta: `Aberta no app em ${dBR(c.snap.data)}: ${brl(c.snap.total)} + fixos a cair ${brl(c.fixosCartao)}${c.snap.vencimento ? ` · vence ${dataLonga(c.snap.vencimento)}` : ""}`};
      if (pv) {
        const depois = pv === previaAberta() ? sum(D.meses.flatMap(x => x.lancamentos).filter(l => l.aEntrar), l => l.valor) : 0;
        return {rotulo: rot, valor: pv.total + depois + c.fixosCartao, venc: venc(pv.vencimento), situacao: "aberta",
          segs: [[pv.total, "var(--parc)"], [depois, "var(--gasto)"], [c.fixosCartao, "var(--rec)"]],
          meta: `Prévia do app até ${dBR(pv.ate)}: ${brl(pv.total)}${depois ? ` + lançadas depois ${brl(depois)}` : ""} + fixos ${brl(c.fixosCartao)}`};
      }
      // As compras que vieram de uma fatura conhecida ficam nela, não na fatura seguinte ao mês da compra
      const compras = sum(mm.lancamentos.filter(l => card(l.forma) && l.origem !== "fatura"), l => l.valor);
      return {rotulo: rot, valor: c.parcelas + compras + c.fixosCartao, venc: venc(null), situacao: "prevista",
        segs: [[c.parcelas, "var(--parc)"], [compras, "var(--gasto)"], [c.fixosCartao, "var(--rec)"]],
        meta: `Compras de ${esc(mm.rotulo)}: parcelas ${brl(c.parcelas)} + lançadas ${brl(compras)} + fixos ${brl(c.fixosCartao)}`};
    }
    if (pv) return {rotulo: rot, valor: pv.total + fixos, venc: venc(pv.vencimento), situacao: "aberta", segs: [[pv.total, "var(--parc)"], [fixos, "var(--rec)"]],
      meta: `Prévia do app: ${brl(pv.total)} em ${pv.n_lanc} lançamentos + fixos ${brl(fixos)}`};
    const v = parcelasDaFatura(rot);
    if (v == null) return null;
    return {rotulo: rot, valor: v + fixos, venc: venc(null), situacao: "prevista", segs: [[v, "var(--parc)"], [fixos, "var(--rec)"]],
      meta: `Parcelas ${brl(v)} + fixos ${brl(fixos)}, sem as compras do mês`};
  }

  // Mês de trabalho da entrada: o escolhido ao lançar ou o da observação do projeto ("competência 09/2026")
  const referenciaDe = r => r.referencia || (() => { const x = String(r.obs || "").match(/compet[êe]ncia\s+(\d{2})\/(\d{4})/i); return x ? `${x[2]}-${x[1]}` : null; })();
  // Entradas que se repetem todo mês: a próxima de cada uma fica prevista nos meses seguintes, no mesmo dia do mês
  const serieDe = r => `${r.fonte}|${semAcento(r.desc)}|${r.conta || ""}`;
  function entradasPrevistas(chave) {
    if (chave < hojeKey) return [];
    const ultimas = new Map();
    for (const m of D.meses) for (const r of m.receitas) {
      if (r.origem !== "site" || !r.data) continue;
      const u = ultimas.get(serieDe(r));
      if (!u || r.data > u.data) ultimas.set(serieDe(r), r);
    }
    const doMes = (D.meses.find(x => x.chave === chave) || {receitas: []}).receitas;
    const lista = [];
    for (const [k, r] of ultimas) {
      if (!r.repete || r.data.slice(0, 7) >= chave || doMes.some(x => x.origem === "site" && serieDe(x) === k)) continue;
      const passos = mesesEntre(r.data.slice(0, 7), chave);
      lista.push({...r, id: null, data: diaDe(chave, Number(r.data.slice(8, 10))), referencia: r.referencia ? somarChave(r.referencia, passos) : null});
    }
    return lista;
  }

  const ehInvestimento = l => /^investiment/.test(semAcento(ef(l).categoria));
  // Depósito numa caixinha (categoria Caixinhas): sai do caixa como caixinha, à parte dos gastos (como o investimento)
  const ehCaixinha = l => ehDeposito(ef(l).categoria);
  const ehReserva = l => ehInvestimento(l) || ehCaixinha(l);
  // Entradas do mês pelo caixa (sem as saídas). Também é a renda do mês que divide as caixinhas do casal.
  function entradasDoMes(chave) {
    const m = D.meses.find(x => x.chave === chave) || null;
    const passado = chave < hojeKey, futuro = chave > hojeKey;
    const situacao = data => (data ? (data <= hojeIso ? "realizado" : "previsto") : passado ? "realizado" : "previsto");
    const entradas = [];
    for (const r of m ? m.receitas : []) {
      if (r.liquido == null) continue;
      const st = /estimativa/i.test(r.obs || "") ? "previsto" : r.data ? situacao(r.data) : futuro ? "previsto" : "realizado";
      entradas.push({desc: r.desc, valor: r.liquido, data: r.data || null, st, ref: referenciaDe(r), r});
    }
    for (const r of entradasPrevistas(chave)) entradas.push({desc: r.desc, valor: r.liquido, data: r.data, st: "previsto", ref: r.referencia, r, prevista: true});
    if (!m && !entradas.length && RECEITA_PREVISTA > 0) entradas.push({desc: "Receitas previstas (como no último mês)", valor: RECEITA_PREVISTA, data: null, st: "previsto", r: null});
    return entradas;
  }
  const receitasDoMes = chave => Math.round(sum(entradasDoMes(chave), e => e.valor) * 100) / 100;
  // Contas de cada caixinha hoje (com os movimentos dos dois painéis) e o que cada caixinha pede no mês para esta pessoa
  const movimentosCx = () => [...movimentosDe(GASTOS_SITE, PERFIL_ID), ...MOV_OUTRO];
  function contasCx() {
    if (!memoCx) { const movs = movimentosCx(); memoCx = new Map(CXS.map(cx => [cx.id, calcularCaixinha(cx, movs, hojeIso)])); }
    return memoCx;
  }
  const rendaOutro = chave => (PARCEIRO && PARCEIRO.receitas ? PARCEIRO.receitas(chave) : null);
  function caixinhasDoMes(chave) {
    if (!CXS.length) return [];
    const contas = contasCx(), movs = movimentosCx();
    const rEu = receitasDoMes(chave), rOutro = rendaOutro(chave);
    return CXS.filter(cx => cx.ativa !== false).map(cx => {
      const conta = contas.get(cx.id);
      const total = valorNoMes(cx, chave, conta, hojeKey);
      const parte = parteDe(cx, PERFIL_ID, rEu, rOutro);
      const minha = Math.round(total * parte * 100) / 100;
      const feito = Math.round(sum(movs.filter(x => x.caixinha_id === cx.id && x.deposito && x.perfil_id === PERFIL_ID && x.data.slice(0, 7) === chave), x => x.valor) * 100) / 100;
      return {cx, conta, total, parte, minha, feito, falta: Math.max(0, Math.round((minha - feito) * 100) / 100)};
    });
  }
  function caixa(chave) {
    if (memoCaixa.has(chave)) return memoCaixa.get(chave);
    const m = D.meses.find(x => x.chave === chave) || null;
    const passado = chave < hojeKey;
    const situacao = data => (data ? (data <= hojeIso ? "realizado" : "previsto") : passado ? "realizado" : "previsto");
    const entradas = entradasDoMes(chave);
    const saidas = [];
    const fatura = faturaDoCartao(rotuloDe(chave));
    if (fatura && fatura.valor > 0) saidas.push({tipo: "fatura", desc: `Fatura ${fatura.rotulo} do cartão`, valor: fatura.valor, data: fatura.venc, st: situacao(fatura.venc), fatura});
    // O que foi lançado na categoria Investimentos (Pix para a corretora, aplicação) sai como investimento, não como gasto
    // O gasto marcado como a pagar fica previsto até ser pago, mesmo com a data já passada
    // O pagamento de um recorrente (aluguel, escola, assinatura) sai como fixo, não como Pix do dia a dia
    for (const l of m ? m.lancamentos : []) if (!card(l.forma)) saidas.push({tipo: ehInvestimento(l) ? "investimento" : ehCaixinha(l) ? "caixinha" : l.recorrente ? "fixo" : "dia", forma: FORMA_CAIXA(l.forma), desc: l.desc, valor: l.valor, data: l.data || null, st: aPagar(l) ? "previsto" : situacao(l.data), aPagar: aPagar(l), l});
    const rec = m ? statusRecorrentes(m) : recorrentesDe(chave).map(r => ({...r, pendente: r.valor || 0}));
    for (const r of rec) if (!card(r.forma) && r.pendente > 0) saidas.push({tipo: "fixo", desc: r.nome, valor: r.pendente, data: r.dia ? diaDe(chave, r.dia) : null, st: passado ? "realizado" : "previsto", r});
    // A previsão de investimento do mês (plano de aportes ou previsão do mês) só conta no que ainda não foi lançado
    const investido = sum(saidas.filter(x => x.tipo === "investimento"), x => x.valor);
    const invMes = invDoMes(chave);
    if (invMes && invMes - investido > 0.005) saidas.push({tipo: "investimento", desc: nomeInvDoMes(chave), valor: Math.round((invMes - investido) * 100) / 100, data: null, st: passado ? "realizado" : "previsto", meta: true, plano: comPlano(chave)});
    // Caixinhas: a parte desta pessoa no que guardar em cada uma no mês, menos o que ela já depositou (do mês atual em diante)
    if (!passado) for (const x of caixinhasDoMes(chave)) if (x.falta > 0.005) saidas.push({tipo: "caixinha", desc: `Guardar na caixinha ${x.cx.nome}`, valor: x.falta, data: null, st: "previsto", meta: true, cx: x.cx, parte: x.parte});
    const total = (lista, st) => Math.round(sum(lista.filter(x => x.st === st), x => x.valor) * 100) / 100;
    const ent = {realizado: total(entradas, "realizado"), previsto: total(entradas, "previsto")};
    const sai = {realizado: total(saidas, "realizado"), previsto: total(saidas, "previsto")};
    const saldoMes = Math.round((ent.realizado + ent.previsto - sai.realizado - sai.previsto) * 100) / 100;
    const ini = saldoInicialDe(chave), base = ini ? ini.valor : 0;
    const r = {chave, rotulo: rotuloDe(chave), entradas, saidas, ent, sai, saldoMes, ini, inicial: ini ? ini.valor : null,
      hoje: Math.round((base + ent.realizado - sai.realizado) * 100) / 100, fim: Math.round((base + saldoMes) * 100) / 100,
      fatura, proxima: faturaDoCartao(rotuloDe(somarChave(chave, 1)))};
    memoCaixa.set(chave, r);
    return r;
  }
  // Saldo da conta no início do mês: o informado ou o fim do mês anterior, a partir do primeiro saldo informado
  function saldoInicialDe(chave) {
    if (SALDOS[chave] != null && Number.isFinite(Number(SALDOS[chave]))) return {valor: Number(SALDOS[chave]), origem: "informado"};
    const ant = somarChave(chave, -1);
    if (!Object.keys(SALDOS).some(k => k <= ant && Number.isFinite(Number(SALDOS[k])))) return null;
    const c = caixa(ant);
    return {valor: Math.round(((c.inicial ?? 0) + c.saldoMes) * 100) / 100, origem: "calculado", de: ant};
  }

  const parcelaTexto = s => { const x = String(s || "").match(/(\d+)\s*\/\s*(\d+)/); return x ? {k: Number(x[1]), n: Number(x[2])} : null; };
  const compraParcelada = l => card(l.forma) && (parcelaTexto(l.parcelas) || {n: 1}).n > 1;
  // Parcelas de compras antigas numa fatura que ainda não chegou: as da lista de parceladas (contadas a partir da
  // última fatura processada) e as das compras parceladas lançadas pelo site; o que faltar para o total agendado
  // aparece como "outras parcelas agendadas"
  function parcelasAgendadas(rot) {
    const lista = [];
    const base = D.cartao.faturas.at(-1);
    const j = base ? ordemFatura(rot) - ordemFatura(base.mes) : NaN;
    if (j >= 1) for (const p of D.cartao.parcelamentos || []) {
      const x = parcelaTexto(p.prox);
      const k = x ? x.k + j - 1 : 0;
      if (x && k >= 2 && k <= x.n) lista.push({desc: p.nome, valor: Number(p.valor) || 0, parcela: `${k}/${x.n}`});
    }
    parcelasSite.forEach(p => { const i = p.faturas.indexOf(rot); if (i >= 1) lista.push({desc: p.nome, valor: p.valor, parcela: `${i + 1}/${p.faturas.length}`}); });
    const agendado = parcelasDaFatura(rot);
    const resto = agendado != null ? Math.round((agendado - sum(lista, p => p.valor)) * 100) / 100 : 0;
    if (resto > 0.01) lista.push({desc: "Outras parcelas agendadas", valor: resto, parcela: ""});
    return lista;
  }
  // Categoria e subcategoria de uma parcela agendada: as da mesma compra numa fatura já lida
  function categoriaPeloNome(nome) {
    const alvo = semAcento(nome);
    const l = [...D.cartao.lancamentos].reverse().find(x => semAcento(x.nome) === alvo);
    if (!l) return {cat: "Parcelas agendadas", sub: null};
    const e = ef(l);
    return {cat: e.categoria, sub: e.subcategoria};
  }
  const subDe = l => (ehAjuste(l) ? null : ef(l).subcategoria || null);
  // Lançamento dividido em categorias: uma linha por parte, com o valor, a categoria, a conta e o essencial dela
  // (total: o valor da linha, como o total da compra parcelada; as partes ficam na mesma proporção)
  const explodir = (item, l, total = item.valor) => {
    const e = l && !ehAjuste(l) ? ef(l) : null;
    if (!e || !e.partes) return [item];
    return partesDe(e, total).map(p => ({...item, valor: p.valor, cat: p.categoria, sub: p.subcategoria || null, conta: p.conta, essencial: p.essencial,
      parte: `${p.k + 1} de ${p.n}`, dividido: true}));
  };
  // Partes de um lançamento com o valor dele (sem divisão, uma parte só)
  const partesL = l => partesDe(ef(l), l.valor);

  // Lançamentos da fatura que vence no mês. Fechada ou com a prévia do app: os lançamentos dela. Ainda aberta: as
  // compras no cartão do mês da compra, as parcelas de compras antigas e os fixos no cartão que vão cair. O que o total
  // da fatura tem a mais (o valor visto no app, sem o detalhe, como o ajuste do projeto) fica como "não detalhado".
  const NAO_DETALHADO = "Não detalhado";
  function itensDaFatura(rot, fat) {
    if (!fat || !(fat.valor > 0)) return [];
    const itens = [];
    const fk = FATURAS.get(rot);
    if (fk && fk.itens.length) {
      fk.itens.forEach(l => { const e = ef(l); const parc = l.parc && l.parc.n > 1;
        itens.push(...explodir({desc: l.nome, valor: l.valor, cat: e.categoria, sub: e.subcategoria || null, data: l.data, parcela: parc ? `${l.parc.k}/${l.parc.n}` : null, grupo: parc ? "Cartão parcelado" : "Cartão à vista", ref: l, tipo: "fatura"}, l)); });
    } else {
      const mm = D.meses.find(x => x.fatura === rot);
      for (const l of mm ? mm.lancamentos : []) {
        if (!card(l.forma) || ehAjuste(l) || l.origem === "fatura" || ehInvestimento(l)) continue;
        const parc = compraParcelada(l);
        itens.push(...explodir({desc: l.desc, valor: l.valor, cat: catDe(l), sub: subDe(l), data: l.data, parcela: parc ? l.parcelas : null, grupo: parc ? "Cartão parcelado" : "Cartão à vista", ref: l, tipo: "gasto"}, l));
      }
      parcelasAgendadas(rot).forEach(p => itens.push({...p, ...(p.parcela ? categoriaPeloNome(p.desc) : {cat: "Parcelas agendadas", sub: null}), grupo: "Cartão parcelado"}));
      if (mm) statusRecorrentes(mm).filter(r => card(r.forma) && r.pendente > 0).forEach(r => itens.push({desc: r.nome, valor: r.pendente, cat: r.categoria || "Fixos", sub: r.subcategoria || null, data: null, grupo: "Fixo no cartão a cair"}));
    }
    const resto = Math.round((fat.valor - sum(itens, i => i.valor)) * 100) / 100;
    if (resto > 0.5) itens.push({desc: fat.situacao === "fechada" ? "Lançamentos da fatura sem detalhe" : "Compras no cartão sem detalhe (o total visto no app menos o que está anotado)",
      valor: resto, cat: NAO_DETALHADO, sub: null, data: null, grupo: "Cartão à vista", semDetalhe: true});
    return itens;
  }

  function gastosDoMes(chave) {
    const m = D.meses.find(x => x.chave === chave);
    const rot = rotuloDe(chave);
    const fatura = faturaDoCartao(rot);
    const cartao = itensDaFatura(rot, fatura);
    const itens = [...cartao];
    const investimentos = [];
    for (const l of m ? m.lancamentos : []) {
      if (card(l.forma)) continue;
      if (ehInvestimento(l)) investimentos.push({desc: l.desc, valor: l.valor, data: l.data});
      else if (ehCaixinha(l)) continue; // depósito em caixinha: à parte, não é gasto
      else itens.push(...explodir({desc: l.desc, valor: l.valor, grupo: l.recorrente ? "Fixos fora do cartão" : FORMA_CAIXA(l.forma), cat: catDe(l), sub: subDe(l), data: l.data, ref: l, tipo: "gasto"}, l));
    }
    // Fixos fora do cartão ainda não pagos (os mesmos do fluxo de caixa)
    caixa(chave).saidas.filter(x => x.tipo === "fixo" && !x.l).forEach(x => itens.push({desc: x.desc, valor: x.valor, grupo: "Fixos fora do cartão", cat: (x.r && x.r.categoria) || "Fixos", sub: (x.r && x.r.subcategoria) || null, data: x.data, conta: (x.r && x.r.conta) || undefined}));
    const fk = FATURAS.get(rot);
    return {chave, rotulo: rot, fatura, periodo: fk && fk.fechada && fk.periodo && fk.periodo.inicio ? fk.periodo : null, itens, cartao,
      parcelas: cartao.filter(i => i.parcela), semDetalhe: sum(cartao.filter(i => i.semDetalhe), i => i.valor), investimentos,
      totalCartao: Math.round(sum(cartao, i => i.valor) * 100) / 100, total: Math.round(sum(itens, i => i.valor) * 100) / 100};
  }

  // Compras lançadas no mês pela data (o que no cartão vai para a fatura seguinte), sem os investimentos
  const comprasLancadas = m => sum(m.lancamentos.filter(l => !ehReserva(l)), l => l.valor);

  // Compras feitas no mês, pelo valor inteiro: a parcelada no cartão entra com o total da compra (10x de 100 = 1.000)
  // no mês em que foi comprada. Investimentos não são compras.
  function comprasDoMes(chave) {
    const m = D.meses.find(x => x.chave === chave);
    const itens = [];
    for (const l of m ? m.lancamentos : []) {
      if (ehReserva(l)) continue;
      const p = compraParcelada(l) ? parcelaTexto(l.parcelas) : null;
      if (p && p.k > 1) continue; // parcela de compra antiga anotada no mês
      const total = p ? (l.total != null ? l.total : Math.round(l.valor * p.n * 100) / 100) : l.valor;
      itens.push(...explodir({desc: l.desc, data: l.data, valor: total, cat: catDe(l), grupo: p ? "Cartão parcelado" : card(l.forma) ? "Cartão à vista" : FORMA_CAIXA(l.forma),
        parcela: p ? {n: p.n, valor: l.valor, fatura: l.fatura || m.fatura} : null, ref: ehAjuste(l) ? null : l, tipo: l.origem === "fatura" ? "fatura" : "gasto"}, l, total).map(i => (i.parte && i.parcela ? {...i, parcela: {...i.parcela, valor: Math.round(i.valor / p.n * 100) / 100}} : i)));
    }
    const parceladas = itens.filter(i => i.parcela);
    const total = Math.round(sum(itens, i => i.valor) * 100) / 100;
    const ajustes = (m ? m.lancamentos : []).filter(ehAjuste);
    return {itens, parceladas, total, parcelado: Math.round(sum(parceladas, i => i.valor) * 100) / 100,
      noMes: Math.round(sum(parceladas, i => i.parcela.valor) * 100) / 100,
      ajuste: Math.round(sum(ajustes, l => l.valor) * 100) / 100, ajustes: ajustes.map(l => l.desc.replace(/^ajuste:\s*/i, ""))};
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
    // O caixa do mês vem antes dos outros: fecha negativo, ou as saídas já são 85% ou mais do que há no caixa
    const cx = caixa(m.chave);
    const disponivel = (cx.inicial ?? 0) + cx.ent.realizado + cx.ent.previsto, saidas = cx.sai.realizado + cx.sai.previsto;
    const semInicial = cx.inicial == null ? " (sem contar o saldo do início do mês)" : "";
    if (cx.fim < 0 && (disponivel > 0 || cx.entradas.length)) a.unshift({c: "bad", h: `O caixa de ${m.rotulo} fecha negativo${semInicial}.`,
      t: `Faltam ${brl(-cx.fim)} para pagar o que sai da conta no mês: a fatura que vence, Pix, débito, dinheiro, fixos e investimento.`});
    else if (disponivel > 0 && saidas / disponivel >= 0.85) {
      a.unshift({c: "warn", h: `As saídas de ${m.rotulo} já são ${porcento(saidas / disponivel)} do que há no caixa${semInicial}.`,
        t: `Sobram ${brl(cx.fim)} até o fim do mês${c.dias ? `, ${brl(cx.fim / c.dias)} por dia` : ""}.`});
    }
    return a;
  }
  const htmlAlertas = a => a.map(x => `<div class="alert ${x.c}" role="${x.c === "bad" ? "alert" : "status"}"><span class="sev"></span><div><b>${esc(x.h)}</b> ${esc(x.t)}</div></div>`).join("");
  function alertas(m, c) {
    const html = htmlAlertas(listaAlertas(m, c));
    $id("alertas").innerHTML = html;
    $id("g-alertas").innerHTML = html;
  }

  // ---------- Fechamento do mês (topo dos gastos do dia a dia): o que ainda dá para gastar, pelo caixa ----------
  // Quanto sobra na conta no fim do mês: o saldo do início, mais o que entra, menos o que sai (a fatura que vence no
  // mês, Pix, débito, dinheiro, fixos e investimento). É o que ainda dá para gastar no Pix, no débito e no dinheiro;
  // as compras no cartão vão para a fatura seguinte e saem do caixa do mês em que ela vence.
  let fluxo = null; // o que o gráfico do mês aberto precisa para ser redesenhado quando a largura muda
  let obsFluxo = null, larguraFluxo = 0;
  const curtoBRL = v => (Math.abs(v) >= 1000 ? `R$ ${(v / 1000).toLocaleString("pt-BR", {maximumFractionDigits: 1})} mil` : v ? `R$ ${Math.round(v)}` : "0");
  // Marcas do eixo entre o menor e o maior valor (o saldo pode ficar negativo)
  function marcasFaixa(min, max) {
    const bruto = Math.max(max - min, 1) / 5, pot = 10 ** Math.floor(Math.log10(bruto));
    const passo = [1, 2, 2.5, 5, 10].map(f => f * pot).find(p => p >= bruto);
    const t = [];
    for (let v = Math.floor(min / passo) * passo; ; v += passo) { t.push(Math.round(v * 100) / 100); if (v >= max - 1e-9) break; }
    if (t.length < 2) t.push(t[0] + passo);
    return t;
  }
  const COR_SAIDA = {fatura: "var(--parc)", dia: "var(--gasto)", fixo: "var(--rec)", investimento: "var(--inv)"};
  const NOME_SAIDA = {fatura: "Fatura do cartão", dia: "Pix, débito e dinheiro", fixo: "Fixos fora do cartão", investimento: "Investimento"};

  function renderTermometro(m) {
    const box = $id("g-termometro");
    const botao = !aoLancarGasto ? "" : `<div class="termometro-acoes"><button type="button" class="btn" id="btn-lancar-gasto">Lançar gasto ou Pix</button>${aoImportarExtrato ? '<button type="button" class="btn btn-claro" id="btn-extrato-gastos">Importar extrato</button>' : ""}</div>`;
    const cx = caixa(m.chave);
    const corrente = m.chave === hojeKey, futuro = m.chave > hojeKey, neg = cx.fim < 0;
    const entra = cx.ent.realizado + cx.ent.previsto, sai = cx.sai.realizado + cx.sai.previsto;
    const disponivel = (cx.inicial ?? 0) + entra;
    const dias = corrente ? diasDoMes(m.chave) - hoje.getDate() + 1 : null;
    const kpi = (rotulo, valor, sub, mov) => (mov && $id("dlg-mov")
      ? `<button type="button" class="fech-kpi fech-kpi-botao" data-abrir-mov="${mov}" title="Abrir e editar"><span class="label">${rotulo}</span><b>${valor}</b><span class="sub">${sub}</span><span class="fech-abrir">abrir e editar</span></button>`
      : `<div class="fech-kpi"><span class="label">${rotulo}</span><b>${valor}</b><span class="sub">${sub}</span></div>`);
    const kpis = `<div class="fech-kpis">
        ${kpi("Entradas no caixa", brl(entra), cx.ent.previsto ? `${brl(cx.ent.realizado)} recebidos · ${brl(cx.ent.previsto)} previstos` : `${cx.entradas.length} ${cx.entradas.length === 1 ? "recebimento" : "recebimentos"} no mês`, "entradas")}
        ${kpi("Saídas do caixa", brl(sai), cx.sai.previsto ? `${brl(cx.sai.realizado)} pagos · ${brl(cx.sai.previsto)} previstos` : "fatura, Pix, débito, dinheiro e fixos", "saidas")}
        ${kpi("Compras do mês", brl(comprasLancadas(m)), `${m.lancamentos.length} ${m.lancamentos.length === 1 ? "lançamento" : "lançamentos"} · pela data da compra${m.fatura ? ` · no cartão, vão para a fatura ${esc(m.fatura)}` : ""}`)}
      </div>`;
    const doSite = m.lancamentos.filter(l => l.origem === "site").length;
    const daFatura = m.lancamentos.filter(l => l.origem === "fatura").length;
    const rodape = doSite || daFatura ? `<p class="sub" style="margin:0">${doSite ? `${doSite} ${doSite === 1 ? "gasto lançado" : "gastos lançados"} pelo site neste mês.${duplicados ? ` ${duplicados === 1 ? "Um já estava" : `${duplicados} já estavam`} no projeto Financeiro e não contou de novo.` : ""}` : ""}${daFatura ? ` ${daFatura} ${daFatura === 1 ? "compra veio" : "compras vieram"} da fatura do cartão (não estavam nos gastos do dia a dia).` : ""}</p>` : "";
    const prox = cx.proxima, mesSeguinte = rotuloDe(somarChave(m.chave, 1));
    const proxima = prox && prox.valor > 0 ? `<p class="sub" style="margin:0">Compras no cartão em ${esc(m.rotulo)} entram na fatura ${esc(prox.rotulo)}${prox.venc ? `, que vence em ${dBR(prox.venc)}` : ""}, e saem do caixa de ${esc(mesSeguinte)} (${prox.situacao === "fechada" ? "fechada em" : "prevista em"} ${brl(prox.valor)} até agora).</p>` : "";
    const semInicial = cx.inicial == null ? `<div class="note" style="margin:0"><b>Falta o saldo do início do mês.</b> O Pix do começo do mês sai do que sobrou do mês anterior. Informe o saldo da conta em 01/${String(m.mes).padStart(2, "0")} no fluxo de caixa da Visão geral.</div>` : "";
    const verFluxo = '<button type="button" class="btn-link" data-ver-fluxo>Ver o fluxo de caixa completo</button>';
    fluxo = null;
    if (!(disponivel > 0) && !sai) {
      box.innerHTML = `<div class="termometro-topo"><div><div class="label">Fechamento de ${esc(m.rotulo)}</div><div class="fech-rot">Ainda pode gastar</div>
          <p class="muted" style="margin:4px 0 0">Aparece quando as entradas do mês ou o saldo da conta no início do mês estiverem lançados${aoLancarEntrada ? " (botão Lançar entrada, no topo)" : ""}.</p></div>${botao}</div>
        ${kpis}${rodape}`;
    } else {
      const rotulo = corrente ? (neg ? "Faltam para fechar o mês" : "Ainda pode gastar") : futuro ? (neg ? "Deve faltar no mês" : "Deve sobrar no mês") : neg ? "Faltou no mês" : "Sobrou no mês";
      const ritmo = corrente ? (neg ? "o que sai da conta no mês passa do que há nela" : dias === 1 ? "para hoje, o último dia do mês" : `${brl(cx.fim / dias)} por dia nos ${dias} dias que faltam`)
        : futuro ? "previsão do caixa" : "mês encerrado";
      const tipos = ["fatura", "dia", "fixo", "investimento"].map(t => [t, sum(cx.saidas.filter(s => s.tipo === t), s => s.valor)]).filter(([, v]) => v > 0);
      const escala = Math.max(disponivel, sai, 1);
      const w = v => `${(Math.max(0, v) / escala * 100).toFixed(2)}%`;
      const ult = diasDoMes(m.chave);
      const hojeDia = corrente ? hoje.getDate() : null;
      const ate = corrente ? hojeDia : futuro ? 0 : ult;
      const entrou = Array(ult + 1).fill(0), saiu = Array(ult + 1).fill(0), qtd = Array(ult + 1).fill(0), previsto = Array(ult + 1).fill(false);
      // Dia de cada movimento: o da data; sem data, a entrada realizada no dia 1º e o resto no fim do mês
      const diaDo = (x, entrada) => {
        let d = x.data && x.data.slice(0, 7) === m.chave ? Number(x.data.slice(8, 10)) : x.data ? (x.data < m.chave ? 1 : ult) : x.st === "realizado" && entrada ? 1 : ult;
        if (x.st === "previsto" && hojeDia && d < hojeDia) d = hojeDia;
        return d;
      };
      cx.entradas.forEach(e => { const d = diaDo(e, true); entrou[d] += e.valor; qtd[d]++; if (e.st === "previsto") previsto[d] = true; });
      cx.saidas.forEach(s => { const d = diaDo(s, false); saiu[d] += s.valor; qtd[d]++; if (s.st === "previsto") previsto[d] = true; });
      const saldos = [];
      let corre = cx.inicial ?? 0;
      for (let d = 0; d <= ult; d++) { corre += entrou[d] - saiu[d]; saldos.push(Math.round(corre * 100) / 100); }
      const iso = d => `${m.chave}-${String(d).padStart(2, "0")}`;
      const diaMes = d => `${String(d).padStart(2, "0")}/${String(m.mes).padStart(2, "0")}`;
      const tabela = [`<tr><td>Início do mês</td><td class="r num">—</td><td class="r num">—</td><td class="r num">${cx.inicial == null ? "não informado" : n(cx.inicial)}</td></tr>`];
      for (let d = 1; d <= ult; d++) if (qtd[d]) tabela.push(`<tr><td>${diaMes(d)} · ${diaSemana(iso(d))}${previsto[d] ? ' <span class="chip neutral">previsto</span>' : ""}</td><td class="r num">${entrou[d] ? n(entrou[d]) : "—"}</td><td class="r num">${saiu[d] ? n(saiu[d]) : "—"}</td><td class="r num">${n(saldos[d])}</td></tr>`);
      const aria = `Saldo na conta em ${m.rotulo}: começa em ${cx.inicial == null ? "R$ 0 (saldo inicial não informado)" : brl(cx.inicial)}${corrente ? `, está em ${brl(saldos[ate])} hoje` : ""} e ${futuro || corrente ? "deve terminar" : "terminou"} em ${brl(saldos[ult])}.`;
      box.innerHTML = `
        <div class="termometro-topo">
          <div>
            <div class="label">Fechamento de ${esc(m.rotulo)} · caixa</div>
            <div class="fech-rot">${rotulo}</div>
            <div class="fech-valor${neg ? " neg" : ""}">${brl(Math.abs(cx.fim))}</div>
            <div class="sub">${ritmo} no Pix, no débito e no dinheiro${disponivel > 0 ? ` · saídas de ${porcento(sai / disponivel)} do que há no caixa` : ""}</div>
          </div>
          ${botao}
        </div>
        ${semInicial}
        ${kpis}
        <div class="meter termometro-barra" role="img" aria-label="Saídas de ${brl(sai)} para ${brl(disponivel)} no caixa (saldo do início e entradas); ${neg ? `faltam ${brl(-cx.fim)}` : `sobram ${brl(cx.fim)}`}">
          <div class="bar">${tipos.map(([t, v]) => `<span style="width:${w(v)};background:${COR_SAIDA[t]}"></span>`).join("")}</div>
          <span class="metaline" style="left:${w(disponivel * 0.85)}"></span><span class="metalbl" style="left:${w(disponivel * 0.85)}">85%</span>
        </div>
        <div class="legend">${tipos.map(([t, v]) => `<span><i style="background:${COR_SAIDA[t]}"></i>${NOME_SAIDA[t]} <span class="num">${brl(v)}</span></span>`).join("")}<span><i style="background:var(--line)"></i>${neg ? "Falta" : "Sobra"} <span class="num">${brl(Math.abs(cx.fim))}</span></span></div>
        ${proxima}
        <figure class="fech-grafico">
          <figcaption><b>Saldo na conta, dia a dia</b><span class="sub">Começa no saldo do início do mês, sobe com o que entra e desce com o que sai. A linha tracejada é o que ainda está previsto.</span></figcaption>
          <div class="legend"><span><i class="linha" style="border-top-color:var(--parc)"></i>Realizado</span><span><i class="linha tracejada" style="border-top-color:var(--parc)"></i>Previsto</span></div>
          <div class="fg-caixa"><svg id="fg-svg" role="img" aria-label="${esc(aria)}"></svg><div class="fg-tip" id="fg-tip" hidden></div></div>
          <details class="fg-tabela"><summary>Ver os dias em tabela</summary><div class="scroll"><table>
            <thead><tr><th>Dia</th><th class="r">Entrou</th><th class="r">Saiu</th><th class="r">Saldo no fim do dia</th></tr></thead>
            <tbody>${tabela.join("")}</tbody></table></div></details>
        </figure>
        <p class="sub" style="margin:0">${verFluxo}</p>
        ${rodape}`;
      fluxo = {ult, ate, hojeDia, saldos, entrou, saiu, qtd, previsto, iso, diaMes, inicialInformado: cx.inicial != null};
      larguraFluxo = 0;
      if (window.ResizeObserver) {
        if (!obsFluxo) { let rz; obsFluxo = new ResizeObserver(() => { clearTimeout(rz); rz = setTimeout(() => desenharFluxo(false), 60); }); }
        obsFluxo.disconnect();
        obsFluxo.observe($id("fg-svg"));
      }
      desenharFluxo(true);
    }
    const b = $id("btn-lancar-gasto");
    if (b) b.onclick = aoLancarGasto;
    const x = $id("btn-extrato-gastos");
    if (x) x.onclick = aoImportarExtrato;
    const v = box.querySelector("[data-ver-fluxo]");
    if (v) v.onclick = () => { irPara("geral", true); $id("hero").scrollIntoView({block: "start"}); };
  }

  // Desenha o gráfico com a largura da tela (com a aba escondida a largura é zero: desenha quando ela aparecer)
  function desenharFluxo(forcar) {
    const svg = $id("fg-svg"), tip = $id("fg-tip");
    if (!fluxo || !svg) return;
    const W = svg.clientWidth;
    if (!W || (!forcar && W === larguraFluxo)) return;
    larguraFluxo = W;
    const F = fluxo, H = 220, ml = 66, mr = 14, mt = 22, mb = 24, pw = W - ml - mr, ph = H - mt - mb;
    const tk = marcasFaixa(Math.min(0, ...F.saldos), Math.max(0, ...F.saldos)), lo = tk[0], hi = tk.at(-1);
    const x = d => ml + d / F.ult * pw;
    const y = v => mt + ph - (Math.max(lo, Math.min(hi, v)) - lo) / (hi - lo) * ph;
    const f1 = v => v.toFixed(1);
    const halo = 'paint-order="stroke" stroke="var(--surface)" stroke-width="4" stroke-linejoin="round"';
    let s = "";
    tk.forEach(v => { s += `<line x1="${ml}" x2="${W - mr}" y1="${f1(y(v))}" y2="${f1(y(v))}" stroke="${v === 0 ? "var(--muted)" : "var(--line)"}" stroke-width="1"/><text x="${ml - 8}" y="${f1(y(v) + 4)}" text-anchor="end">${curtoBRL(v)}</text>`; });
    const marcas = [...new Set([1, 5, 10, 15, 20, 25, F.ult])].filter(d => !F.hojeDia || d === F.hojeDia || Math.abs(d - F.hojeDia) > 1);
    if (F.hojeDia && !marcas.includes(F.hojeDia)) marcas.push(F.hojeDia);
    marcas.forEach(d => { s += `<text x="${f1(x(d))}" y="${H - 6}" text-anchor="middle"${d === F.hojeDia ? ' class="fg-rot"' : ""}>${d === F.hojeDia ? "hoje" : d}</text>`; });
    const caminho = (de, ate) => { let p = ""; for (let d = de; d <= ate; d++) p += `${d === de ? "M" : "L"}${f1(x(d))},${f1(y(F.saldos[d]))}`; return p; };
    if (F.ate > 0) s += `<path d="${caminho(0, F.ate)}" fill="none" stroke="var(--parc)" stroke-width="2" stroke-linejoin="round"/>`;
    if (F.ate < F.ult) s += `<path d="${caminho(F.ate, F.ult)}" fill="none" stroke="var(--parc)" stroke-opacity=".75" stroke-width="2" stroke-dasharray="5 4" stroke-linejoin="round"/>`;
    const fim = F.saldos[F.ult], xF = x(F.ult);
    s += `<text class="fg-rot" x="${f1(xF)}" y="${f1(Math.max(mt + 10, y(fim) - 8))}" text-anchor="end" ${halo}>${F.hojeDia || F.ate === 0 ? "fim do mês" : "no fim"} ${curtoBRL(fim)}</text>`;
    if (F.hojeDia) {
      const xh = x(F.ate), yh = y(F.saldos[F.ate]);
      s += `<circle cx="${f1(xh)}" cy="${f1(yh)}" r="4.5" fill="var(--parc)" stroke="var(--surface)" stroke-width="2"/>`;
      if (xF - xh > 120 || xh - ml > 120) s += `<text class="fg-rot" x="${f1(xh > ml + 120 ? xh - 8 : xh + 8)}" y="${f1(yh > mt + 30 ? yh - 10 : yh + 18)}" text-anchor="${xh > ml + 120 ? "end" : "start"}" ${halo}>hoje ${curtoBRL(F.saldos[F.ate])}</text>`;
    }
    s += `<line id="fg-cruz" x1="0" x2="0" y1="${mt}" y2="${mt + ph}" stroke="var(--ink)" stroke-width="1" opacity="0"/>`;
    s += `<rect id="fg-alvo" x="${ml}" y="${mt}" width="${f1(pw)}" height="${ph}" fill="transparent" tabindex="0" aria-label="Saldo de cada dia: use as setas"/>`;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.innerHTML = s;

    const alvo = $id("fg-alvo"), cruz = $id("fg-cruz");
    const mostrar = d => {
      d = Math.max(1, Math.min(F.ult, Math.round(d)));
      cruz.setAttribute("x1", x(d)); cruz.setAttribute("x2", x(d)); cruz.setAttribute("opacity", .35);
      tip.replaceChildren();
      const t = document.createElement("div"); t.className = "t"; t.textContent = `${diaSemana(F.iso(d))}, ${F.diaMes(d)}${F.previsto[d] || d > F.ate ? " (previsto)" : ""}`; tip.append(t);
      const linhaTip = (valor, nome, cor) => {
        const div = document.createElement("div"), rot = document.createElement("span"), b = document.createElement("b");
        if (cor) { const i = document.createElement("i"); i.style.borderTopColor = cor; rot.append(i); }
        rot.append(nome); b.textContent = valor; div.append(b, rot); tip.append(div);
      };
      linhaTip(brl(F.saldos[d]), "saldo no fim do dia", "var(--parc)");
      if (F.entrou[d]) linhaTip(brl(F.entrou[d]), "entrou");
      if (F.saiu[d]) linhaTip(brl(F.saiu[d]), "saiu");
      if (!F.qtd[d]) linhaTip("—", "sem movimento");
      tip.hidden = false;
      const caixaSvg = svg.getBoundingClientRect(), px = x(d) / W * caixaSvg.width, tw = tip.offsetWidth;
      tip.style.left = `${Math.max(0, Math.min(caixaSvg.width - tw, px < caixaSvg.width / 2 ? px + 12 : px - tw - 12))}px`;
    };
    const esconder = () => { tip.hidden = true; cruz.setAttribute("opacity", 0); };
    const doPonteiro = ev => { const r = svg.getBoundingClientRect(); mostrar(((ev.clientX - r.left) / r.width * W - ml) / pw * F.ult); };
    alvo.addEventListener("pointermove", doPonteiro);
    alvo.addEventListener("pointerdown", doPonteiro);
    alvo.addEventListener("pointerleave", esconder);
    let foco = F.ate || 1;
    alvo.addEventListener("focus", () => mostrar(foco));
    alvo.addEventListener("blur", esconder);
    alvo.addEventListener("keydown", ev => {
      const passo = {ArrowRight: 1, ArrowLeft: -1}[ev.key];
      if (passo) foco = Math.max(1, Math.min(F.ult, foco + passo));
      else if (ev.key === "Home") foco = 1;
      else if (ev.key === "End") foco = F.ult;
      else return;
      ev.preventDefault();
      mostrar(foco);
    });
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

  // ---------- Visão geral: fluxo de caixa do mês ----------
  const RECEBIMENTO = {depois: "trabalha e recebe depois", antes: "recebe antes e usa no mês", avulso: "avulso"};
  const dataDoMes = (iso, chave) => (iso && iso.slice(0, 7) === chave ? dBR(iso) : iso ? dataLonga(iso) : "");
  // Entrada prevista que já dá para dar como recebida: a que repete todo mês (prevista a partir da última), a lançada
  // com data depois de hoje e a estimativa do projeto, no mês atual ou em mês que já passou
  const recebivel = (e, chave) => !!(aoReceberEntrada && e.st === "previsto" && e.r && chave <= hojeKey);
  // O que gravar ao dar a entrada como recebida: a lançada no site muda só a data; a prevista vira uma entrada nova
  function modeloEntrada(e, chave) {
    const r = e.r || {};
    const data = e.data && e.data <= hojeIso ? e.data : chave === hojeKey ? hojeIso : diaDe(chave, e.data ? Number(e.data.slice(8, 10)) : diasDoMes(chave));
    const salario = r.fonte === "Empresa" || (r.bruto != null && (r.descontos || []).length > 0);
    const entrada = {tipo: salario ? "salario" : "outro", descricao: r.desc || e.desc, bruto: r.bruto ?? null, descontos: r.descontos || [], liquido: e.valor, data,
      conta: r.conta || null, observacao: /estimativa/i.test(r.obs || "") ? "" : r.obs || "", recebimento: r.recebimento || (salario ? "depois" : "avulso"),
      referencia: e.ref || r.referencia || null, repete: e.prevista ? true : !!r.repete};
    return {id: r.origem === "site" && r.id && !e.prevista ? r.id : null, entrada, rotulo: rotuloDe(chave)};
  }
  let HERO_ENT = []; // entradas do mês no balanço (índice dos botões)
  function linhaEntrada(e, chave, i) {
    const r = e.r || {};
    const site = r.origem === "site" && r.id;
    const quando = e.data ? (e.st === "previsto" ? `previsto para ${dataDoMes(e.data, chave)}` : `recebido em ${dataDoMes(e.data, chave)}`) : e.st === "previsto" ? "previsto no mês" : "recebido no mês";
    const partes = [quando];
    if (e.ref) partes.push(`trabalho de ${rotuloDe(e.ref)}`);
    if (e.prevista) partes.push("repete todo mês");
    const chip = /estimativa/i.test(r.obs || "") ? ' <span class="chip warn">estimado</span>' : site ? ' <span class="chip info">lançado no site</span>' : e.prevista ? ' <span class="chip neutral">previsto</span>' : "";
    const conta = r.conta && r.conta !== "pessoal" ? ` <span class="chip conta">${esc(nomeDaConta(r.conta))}</span>` : "";
    const holerite = site && (r.bruto != null || (r.descontos || []).length)
      ? `<div class="sub">${r.bruto != null ? `Bruto ${brl(r.bruto)}` : ""}${(r.descontos || []).map(d => ` − ${esc(d.nome)} ${brl(d.valor)}`).join("")}</div>` : "";
    const receber = recebivel(e, chave) ? `<button type="button" class="btn mini cx-recebida" data-receber-ent="${i}" title="Dar como recebida${e.data && e.data > hojeIso ? " hoje" : ""}">✓ Recebida</button>` : "";
    const editar = aoEditarEntrada && (site && !e.prevista) ? `<button type="button" class="btn-link" data-editar-ent="${i}">Editar</button>`
      : aoEditarEntrada && e.prevista && chave <= hojeKey ? `<button type="button" class="btn-link" data-editar-ent="${i}">Mudar o valor e confirmar</button>` : "";
    const controles = site && aoMudarRecebimento ? `<div class="cx-receb">
        ${receber}
        <select data-recebimento="${esc(r.id)}" aria-label="Como é o recebimento de ${esc(r.desc)}"${r.recebimento ? "" : ' class="falta"'}>${r.recebimento ? "" : '<option value="" selected disabled>Como é esse recebimento?</option>'}${Object.entries(RECEBIMENTO).map(([v, t]) => `<option value="${v}"${r.recebimento === v ? " selected" : ""}>${t}</option>`).join("")}</select>
        <label class="cx-repete"><input type="checkbox" data-repete="${esc(r.id)}"${r.repete ? " checked" : ""}> repete todo mês</label>
        ${editar}
        ${aoApagarEntrada ? `<button type="button" class="btn-link" data-apagar-entrada="${esc(r.id)}">Apagar</button>` : ""}
      </div>` : receber || editar ? `<div class="cx-receb">${receber}${editar}</div>` : "";
    return `<tr data-mov="entradas"><td>${esc(e.desc)}${chip}${conta}<div class="sub">${esc(partes.join(" · "))}</div>${holerite}${controles}</td>
      <td class="r num">${e.st === "realizado" ? brl(e.valor) : ""}</td><td class="r num prev">${e.st === "previsto" ? brl(e.valor) : ""}</td></tr>`;
  }

  const investido = cx => cx.saidas.some(x => x.tipo === "investimento" && x.l);
  // Aporte do mês: o previsto (plano de aportes ou previsão do mês) e o feito (investimentos lançados no mês)
  function aporteDoMes(chave) {
    const cx = caixa(chave);
    return {previsto: invDoMes(chave), feito: Math.round(sum(cx.saidas.filter(x => x.tipo === "investimento" && x.l), x => x.valor) * 100) / 100, plano: comPlano(chave)};
  }
  function renderHero(m) {
    const cx = caixa(m.chave);
    HERO_ENT = cx.entradas;
    const passado = m.chave < hojeKey, futuro = m.chave > hojeKey;
    const dia1 = `01/${String(m.mes).padStart(2, "0")}`;
    const cel = (v, st, alvo) => (st === alvo ? brl(v) : "");
    const linha = (rotulo, sub, valor, st, mov = "saidas") => `<tr data-mov="${mov}"><td>${rotulo}${sub ? `<div class="sub">${sub}</div>` : ""}</td><td class="r num">${cel(valor, st, "realizado")}</td><td class="r num prev">${cel(valor, st, "previsto")}</td></tr>`;
    const temJanela = !!$id("dlg-mov");
    const grupo = (rotulo, a, b, mov) => `<tr class="cx-grupo${mov && temJanela ? " cx-abre" : ""}"${mov && temJanela ? ` data-mov="${mov}" title="Dois cliques para abrir e editar"` : ""}><th scope="row">${rotulo}${mov && temJanela ? ` <button type="button" class="btn-link cx-abrir" data-abrir-mov="${mov}">abrir e editar</button>` : ""}</th><td class="r num">${brl(a)}</td><td class="r num prev">${b ? brl(b) : "—"}</td></tr>`;
    // Saídas em dois grupos: os gastos pagos no mês (a fatura, Pix, débito e dinheiro por forma de pagamento e os fixos
    // fora do cartão, a mesma conta do quadro "Gastos pagos") e o investimento
    const saidas = [];
    for (const s of cx.saidas.filter(x => x.tipo === "fatura")) {
      const f = s.fatura;
      const quando = f.venc ? (s.st === "realizado" ? `paga em ${dBR(f.venc)}` : `vence em ${dataDoMes(f.venc, m.chave)}`) : "vence no mês";
      const per = (FATURAS.get(f.rotulo) || {}).periodo;
      const compras = f.situacao === "fechada" && per && per.inicio ? `compras de ${dBR(per.inicio)} a ${dBR(per.fim)}` : f.situacao === "aberta" ? "aberta, valor até agora" : "prevista: parcelas, compras lançadas e fixos";
      saidas.push(linha(esc(s.desc), `${compras} · ${quando}`, s.valor, s.st));
    }
    const porForma = new Map();
    cx.saidas.filter(x => x.tipo === "dia").forEach(s => { const k = `${s.forma}|${s.st}`; const o = porForma.get(k) || {forma: s.forma, st: s.st, v: 0, q: 0, ap: 0}; o.v += s.valor; o.q++; if (s.aPagar) o.ap++; porForma.set(k, o); });
    [...porForma.values()].sort((a, b) => b.v - a.v).forEach(o => saidas.push(linha(esc(o.forma), `${o.q} ${o.q === 1 ? "gasto" : "gastos"}${o.st === "previsto" ? (o.ap === o.q ? " a pagar" : o.ap ? `, ${o.ap} a pagar` : " com data futura") : ""}`, o.v, o.st)));
    cx.saidas.filter(x => x.tipo === "fixo").forEach(s => saidas.push(linha(esc(s.desc), s.l ? `recorrente ${s.aPagar ? "lançado, a pagar" : "pago"}${s.data ? ` em ${dBR(s.data)}` : ""} · ${esc(s.forma)}` : `${s.r && s.r.site ? "recorrente ainda não pago" : "fixo fora do cartão"}${s.data ? ` · dia ${dBR(s.data)}` : ""}`, s.valor, s.st)));
    const alterar = aoEditarMetas ? ' · <button type="button" class="btn-link" data-editar-metas>alterar</button>' : "";
    const investimentos = cx.saidas.filter(x => x.tipo === "investimento").map(s => linha(esc(s.desc), s.l ? `investimento lançado${s.data ? ` em ${dBR(s.data)}` : ""}`
      : `${s.plano ? (investido(cx) ? "previsto no plano de aportes, menos o já lançado" : "previsto no plano de aportes") : investido(cx) ? "previsão de investimento do mês, menos o já lançado" : "investimento mensal previsto"}${alterar}`, s.valor, s.st, "investimento"));
    // Previsto × feito do mês (plano de aportes): quanto já foi lançado contra o previsto
    const aporteMes = aporteDoMes(m.chave);
    const caixinhasLinhas = cx.saidas.filter(x => x.tipo === "caixinha").map(s => linha(esc(s.desc), s.l ? `depósito lançado${s.data ? ` em ${dBR(s.data)}` : ""} · ${esc(s.forma || "")}`
      : `sua parte do que guardar no mês${s.cx && s.cx.dono === "casal" ? ` (${Math.round((s.parte || 0) * 100)}%)` : ""}, menos o já guardado`, s.valor, s.st, "caixinha"));
    if (investimentos.length && comPlano(m.chave) && !passado) investimentos.unshift(`<tr class="cx-aporte"><td colspan="3">Aporte de ${esc(m.rotulo)}: ${esc(textoPrevistoFeito(aporteMes.feito, aporteMes.previsto))}</td></tr>`);
    const somaSt = (tipos, st) => Math.round(sum(cx.saidas.filter(x => tipos.includes(x.tipo) && x.st === st), x => x.valor) * 100) / 100;
    const GASTOS = ["fatura", "dia", "fixo"];
    // Saldo do início do mês: informado, continuação do mês anterior ou ainda sem valor
    const ini = cx.ini;
    const editavel = !!aoSalvarSaldo;
    const form = `<form class="saldo-form" data-saldo-form="${esc(m.chave)}"><input name="saldo" inputmode="decimal" autocomplete="off" value="${ini && ini.origem === "informado" ? n(ini.valor) : ""}" placeholder="0,00" aria-label="Saldo em conta em ${dia1}">
        <button type="submit" class="btn sec mini">Salvar</button>${ini && ini.origem === "informado" ? '<button type="button" class="btn-link" data-apagar-saldo>Apagar</button>' : ""}<p class="erro" role="alert" hidden></p></form>`;
    const inicial = `<tr class="cx-inicial"><td>Saldo em conta em ${dia1}<div class="sub">${ini ? (ini.origem === "informado" ? "informado por você" : `continua do fim de ${esc(rotuloDe(ini.de))}`) : "ainda não informado"}</div>
        ${editavel ? `<details class="saldo-editar"${ini ? "" : " open"}><summary>${ini ? (ini.origem === "informado" ? "Corrigir" : "Informar outro valor") : "Informar"}</summary>${form}</details>` : ""}</td>
      <td class="r num" colspan="2">${ini ? brl(ini.valor) : "—"}</td></tr>`;
    const prox = cx.proxima, mesSeguinte = rotuloDe(somarChave(m.chave, 1));
    const titulo = passado ? "Saldo no fim do mês" : "Saldo previsto no fim do mês";
    $id("hero").innerHTML = `
      <div class="label">Balanço de ${esc(m.rotulo)} · o que entra e sai da conta</div>
      <div class="big num ${cx.fim < 0 ? "neg" : ""}">${brl(cx.fim)}</div>
      <div class="sub">${titulo}${cx.inicial == null ? " (sem o saldo do início do mês)" : ""}${!passado && !futuro ? ` · até hoje entrou ${brl(cx.ent.realizado)}, gastou ${brl(somaSt(GASTOS, "realizado"))}${somaSt(["investimento"], "realizado") ? `${somaSt(["caixinha"], "realizado") ? "," : " e"} investiu ${brl(somaSt(["investimento"], "realizado"))}` : ""}${somaSt(["caixinha"], "realizado") ? ` e guardou ${brl(somaSt(["caixinha"], "realizado"))} nas caixinhas` : ""}` : ""}</div>
      <div class="scroll"><table class="calc caixa-tabela" style="margin-top:14px">
        <thead><tr><th>${esc(m.rotulo)}</th><th class="r">Realizado</th><th class="r">Previsto</th></tr></thead>
        <tbody>
          ${inicial}
          ${grupo("Entradas", cx.ent.realizado, cx.ent.previsto, "entradas")}
          ${cx.entradas.map((e, i) => linhaEntrada(e, m.chave, i)).join("") || `<tr><td class="muted" colspan="3">Nenhuma entrada no mês.</td></tr>`}
          ${grupo("(−) Gastos pagos no mês", somaSt(GASTOS, "realizado"), somaSt(GASTOS, "previsto"), "saidas")}
          ${saidas.join("") || `<tr><td class="muted" colspan="3">Nenhum gasto pago no mês.</td></tr>`}
          ${investimentos.length ? `${grupo("(−) Investimento", somaSt(["investimento"], "realizado"), somaSt(["investimento"], "previsto"), "investimento")}${investimentos.join("")}` : ""}
          ${caixinhasLinhas.length ? `${grupo("(−) Caixinhas", somaSt(["caixinha"], "realizado"), somaSt(["caixinha"], "previsto"), "caixinha")}${caixinhasLinhas.join("")}` : ""}
          <tr class="total"><td>(=) Saldo do mês</td><td class="r num">${brl(cx.ent.realizado - cx.sai.realizado)}</td><td class="r num prev">${brl(cx.ent.previsto - cx.sai.previsto)}</td></tr>
          <tr class="total cx-fim"><td>${titulo}</td><td class="r num${cx.fim < 0 ? " neg" : ""}" colspan="2">${brl(cx.fim)}</td></tr>
        </tbody>
      </table></div>
      ${aoLancarEntrada ? '<div class="acoes-lanc" style="margin-top:10px"><button type="button" class="btn sec mini" data-lancar-entrada>Lançar entrada</button></div>' : ""}
      <details class="como"><summary>Como o balanço é calculado?</summary><p>O que entra e sai da conta, pela data. Realizado é o que tem data até hoje; o resto é previsto. O cartão entra pela fatura paga no mês${cx.fatura ? ` (${esc(cx.fatura.rotulo)})` : ""}, com os lançamentos dela no quadro “Gastos pagos em ${esc(m.rotulo)}”.${prox && prox.valor > 0 ? ` As compras no cartão feitas em ${esc(m.rotulo)} vão para a fatura ${esc(prox.rotulo)}${prox.venc ? `, que vence em ${dataLonga(prox.venc)}` : ""} (${prox.situacao === "fechada" ? "fechada em" : "até agora"} ${brl(prox.valor)}), e entram no balanço de ${esc(mesSeguinte)}.` : ""} O pagamento de um recorrente conta como fixo; o investimento e o depósito nas caixinhas ficam à parte, não são gastos. O gasto pago com o dinheiro de uma caixinha não entra aqui: só tira do saldo dela.</p></details>
      ${!passado ? caixinhasDoMes(m.chave).filter(x => x.conta.alerta).map(x => `<div class="note"><b>Caixinha ${esc(x.cx.nome)} atrasada.</b> Faltam ${x.conta.mesesAte <= 0 ? "menos de um mês" : `${x.conta.mesesAte} ${x.conta.mesesAte === 1 ? "mês" : "meses"}`} para ${dataLonga(x.cx.data_alvo)} e ela tem ${brl(x.conta.saldo)} de ${brl(x.cx.meta)} (pelo tempo, deveria ter ${brl(x.conta.esperado)}). <button type="button" class="btn-link" data-ir-caixinhas>Abrir Caixinhas</button></div>`).join("") : ""}
      ${cx.inicial == null && editavel ? `<div class="note"><b>Informe o saldo da conta em ${dia1}.</b> O Pix do começo do mês sai do que sobrou do mês anterior; com o saldo do início, o caixa mostra quanto há de verdade.</div>` : ""}
      ${entradasRepetidas ? `<p class="sub" style="margin:8px 0 0">${entradasRepetidas === 1 ? "Uma entrada lançada pelo site já estava" : `${entradasRepetidas} entradas lançadas pelo site já estavam`} no projeto Financeiro e não contou de novo.</p>` : ""}
      ${!cx.entradas.length ? `<div class="note"><b>Nenhuma entrada em ${esc(m.rotulo)}.</b> ${aoLancarEntrada ? "Lance o salário ou outro recebimento pelo botão Lançar entrada." : "As receitas entram pelo projeto Financeiro."}</div>` : ""}
      ${cx.entradas.some(e => e.r && e.r.origem === "site" && e.r.id && !e.r.recebimento) ? '<div class="note"><b>Como é cada recebimento?</b> Escolha em cada entrada se você trabalha o mês e recebe depois (como o salário) ou recebe antes e usa no mês (como o ticket). Com isso, o painel prevê os próximos meses.</div>' : ""}`;
  }


  // ---------- Janela das entradas e das saídas do mês (dois cliques no grupo do balanço ou "abrir e editar") ----------
  // Lista tudo o que entra (ou sai) no mês, com a situação de cada um e os botões para dar como recebida, pagar,
  // editar, classificar e apagar. Fica aberta e se redesenha depois de cada mudança.
  let MOV = null; // {tipo: "entradas" | "saidas", chave, filtro}
  let MOV_ITENS = [];
  const MOV_FILTROS = {entradas: [["todas", "Todas"], ["realizado", "Recebidas"], ["previsto", "Previstas"]], saidas: [["todas", "Todas"], ["realizado", "Pagas"], ["previsto", "A pagar e previstas"]]};
  function abrirMov(tipo, secao = null) {
    const dlg = $id("dlg-mov");
    if (!dlg || !atual) return;
    MOV = {tipo, chave: atual.chave, filtro: MOV && MOV.tipo === tipo && MOV.chave === atual.chave ? MOV.filtro : "todas"};
    seguro(null, renderMov);
    if (!dlg.open) dlg.showModal();
    const alvo = secao && dlg.querySelector(`[data-mov-secao="${secao}"]`);
    if (alvo) alvo.scrollIntoView({block: "start"});
  }
  const chipSt = (t, c) => `<span class="chip ${c} mov-st">${t}</span>`;
  const botaoMov = (acao, i, texto, classe = "btn sec mini") => `<button type="button" class="${classe}" data-mov-acao="${acao}" data-i="${i}">${texto}</button>`;
  function linhaMovEntrada(e, m) {
    const i = MOV_ITENS.push({tipo: "entrada", e}) - 1;
    const r = e.r || {};
    const site = r.origem === "site" && r.id && !e.prevista;
    const quem = e.prevista ? "repete todo mês (prevista pela última)" : site ? "lançada no site" : /estimativa/i.test(r.obs || "") ? "estimativa do projeto Financeiro" : r.origem ? "do projeto Financeiro" : "previsão do mês";
    const detalhes = [r.fonte === "Empresa" || (r.bruto != null && (r.descontos || []).length) ? "salário" : "outro recebimento", RECEBIMENTO[r.recebimento] || "", e.ref ? `trabalho de ${rotuloDe(e.ref)}` : "",
      r.conta && r.conta !== "pessoal" ? nomeDaConta(r.conta) : "", quem].filter(Boolean);
    const holerite = r.bruto != null || (r.descontos || []).length ? `<div class="sub">${r.bruto != null ? `Bruto ${brl(r.bruto)}` : ""}${(r.descontos || []).map(d => ` − ${esc(d.nome)} ${brl(d.valor)}`).join("")}</div>` : "";
    const acoes = [
      recebivel(e, m.chave) ? botaoMov("receber", i, e.data && e.data > hojeIso && m.chave === hojeKey ? "✓ Recebida hoje" : "✓ Recebida", "btn mini") : "",
      aoEditarEntrada && site ? botaoMov("editar-ent", i, "Editar") : aoEditarEntrada && e.r && e.st === "previsto" && m.chave <= hojeKey ? botaoMov("editar-ent", i, "Mudar e confirmar") : "",
      aoApagarEntrada && site ? botaoMov("apagar-ent", i, "Apagar", "btn-link") : "",
    ].join("");
    return `<tr class="${e.st === "previsto" ? "mov-prev" : ""}"><td class="num">${e.data ? dBR(e.data) : "—"}</td>
      <td>${esc(e.desc)}<div class="sub">${esc(detalhes.join(" · "))}</div>${holerite}${r.obs && !/estimativa/i.test(r.obs) ? `<div class="compl">${esc(r.obs)}</div>` : ""}</td>
      <td>${e.st === "realizado" ? chipSt("Recebida", "ok") : chipSt("Prevista", "warn")}</td>
      <td class="r num">${n(e.valor)}</td><td class="mov-acoes-td"><div class="mov-acoes">${acoes || (e.st === "previsto" && m.chave > hojeKey ? '<span class="muted">mês ainda não começou</span>' : "")}</div></td></tr>`;
  }
  function linhaMovSaida(s, m) {
    const i = MOV_ITENS.push({tipo: "saida", s}) - 1;
    const l = s.l || null;
    let sub = "", st = s.st === "realizado" ? chipSt(s.tipo === "investimento" ? "Aplicado" : "Pago", "ok") : chipSt("Previsto", "neutral");
    const acoes = [];
    if (s.tipo === "fatura") {
      const f = s.fatura, per = (FATURAS.get(f.rotulo) || {}).periodo;
      sub = [f.situacao === "fechada" ? (per && per.inicio ? `fechada, compras de ${dBR(per.inicio)} a ${dBR(per.fim)}` : "fechada") : f.situacao === "aberta" ? "aberta, valor até agora" : "prevista: parcelas, compras e fixos",
        f.venc ? (s.st === "realizado" ? `paga em ${dBR(f.venc)}` : `vence em ${dBR(f.venc)}`) : ""].filter(Boolean).join(" · ");
      if (s.st !== "realizado") st = chipSt(f.situacao === "fechada" ? "A vencer" : "Prevista", "warn");
      acoes.push(botaoMov("ver-fatura", i, "Ver lançamentos"));
    } else if (l) {
      const e = ef(l);
      sub = [e.partes ? `dividido: ${textoPartes(e, l.valor)}` : `${e.categoria}${e.subcategoria ? ` › ${e.subcategoria}` : ""}`, s.forma || l.forma || "", e.conta !== "pessoal" ? nomeDaConta(e.conta) : ""].filter(Boolean).map(esc).join(" · ");
      if (s.aPagar) st = chipSt("A pagar", "warn");
      if (s.aPagar && aoPagarGasto) acoes.push(botaoMov("pagar", i, "Pagar", "btn mini"));
      if (l.origem === "site" && aoEditarGasto) acoes.push(botaoMov("editar-gasto", i, "Editar"));
      else if (aoClassificar && !ehAjuste(l)) acoes.push(botaoMov("classificar", i, e.pendente ? "Classificar" : "Editar a categoria"));
    } else if (s.tipo === "fixo") {
      const r = s.r || {};
      sub = [r.site ? "recorrente do site" : "fixo do projeto Financeiro", r.dia ? `dia ${r.dia}` : "", r.categoria || "", r.forma || ""].filter(Boolean).map(esc).join(" · ");
      st = chipSt(s.st === "realizado" ? "Não pago" : "Pendente", "warn");
      if (aoPagarRecorrente && !r.variavel && r.valor != null) acoes.push(botaoMov("rec-pagar", i, "Marcar pago", "btn mini"));
      if (aoEditarRecorrente) acoes.push(botaoMov("rec-editar", i, "Editar"));
    } else if (s.tipo === "investimento") {
      sub = s.meta ? (s.plano ? "previsto no plano de aportes (Cadastros)" : "previsão de investimento do mês (Cadastros)") : "";
      if (s.meta && aoEditarMetas) acoes.push(botaoMov("metas", i, "Alterar a previsão"));
    } else if (s.tipo === "caixinha") {
      sub = `sua parte do que guardar no mês${s.cx && s.cx.dono === "casal" ? ` (${Math.round((s.parte || 0) * 100)}%)` : ""} · aba Caixinhas`;
    }
    return `<tr class="${s.st === "previsto" || s.aPagar ? "mov-prev" : ""}"><td class="num">${s.data ? dBR(s.data) : "—"}</td>
      <td>${esc(s.desc)}${l && ef(l).complemento ? `<div class="compl">${esc(ef(l).complemento)}</div>` : ""}<div class="sub">${sub}</div></td>
      <td>${st}</td><td class="r num">${n(s.valor)}</td><td class="mov-acoes-td"><div class="mov-acoes">${acoes.join("")}</div></td></tr>`;
  }
  function renderMov() {
    const dlg = $id("dlg-mov");
    if (!dlg || !MOV) return;
    const m = D.meses.find(x => x.chave === MOV.chave) || atual;
    const cx = caixa(m.chave);
    MOV_ITENS = [];
    const entradas = MOV.tipo === "entradas";
    const passa = x => MOV.filtro === "todas" || (MOV.filtro === "previsto" ? x.st === "previsto" || x.aPagar : x.st === "realizado" && !x.aPagar);
    const tot = entradas ? cx.ent : cx.sai;
    const kpi = (t, v, sub) => `<div class="mov-kpi"><span class="label">${t}</span><b class="num">${brl(v)}</b>${sub ? `<span class="sub">${sub}</span>` : ""}</div>`;
    const cab = `<thead><tr><th>Data</th><th>${entradas ? "Entrada" : "Saída"}</th><th>Situação</th><th class="r">Valor</th><th><span class="vh">Ações</span></th></tr></thead>`;
    let corpo;
    if (entradas) {
      const lista = cx.entradas.filter(passa).sort((a, b) => String(a.data || "9").localeCompare(String(b.data || "9")));
      corpo = lista.length ? `<div class="scroll"><table class="mov-tabela">${cab}<tbody>${lista.map(e => linhaMovEntrada(e, m)).join("")}</tbody></table></div>`
        : `<p class="muted">${cx.entradas.length ? "Nenhuma entrada com esse filtro." : `Nenhuma entrada em ${esc(m.rotulo)}.`}</p>`;
    } else {
      const secoes = [["fatura", "Fatura do cartão"], ["dia", "Pix, débito e dinheiro"], ["fixo", "Fixos fora do cartão"], ["investimento", "Investimento"], ["caixinha", "Caixinhas"]];
      corpo = secoes.map(([t, nome]) => {
        const doTipo = cx.saidas.filter(x => x.tipo === t);
        const lista = doTipo.filter(passa).sort((a, b) => String(a.data || "9").localeCompare(String(b.data || "9")));
        if (!doTipo.length) return "";
        return `<div class="mov-secao" data-mov-secao="${t}"><h3>${nome} <span class="num">${brl(sum(doTipo, x => x.valor))}</span></h3>
          ${lista.length ? `<div class="scroll"><table class="mov-tabela">${cab}<tbody>${lista.map(x => linhaMovSaida(x, m)).join("")}</tbody></table></div>` : '<p class="muted">Nada com esse filtro.</p>'}</div>`;
      }).join("") || `<p class="muted">Nenhuma saída em ${esc(m.rotulo)}.</p>`;
    }
    const filtros = MOV_FILTROS[MOV.tipo].map(([k, t]) => `<button type="button" class="pilula" data-mov-filtro="${k}" aria-pressed="${MOV.filtro === k}">${t}</button>`).join("");
    const lancar = entradas ? (aoLancarEntrada ? '<button type="button" class="btn btn-claro esquerda" data-mov-lancar>Lançar entrada</button>' : "")
      : (aoLancarGasto ? '<button type="button" class="btn btn-claro esquerda" data-mov-lancar>Lançar gasto ou Pix</button>' : "");
    const previstasAgora = entradas ? cx.entradas.filter(e => recebivel(e, m.chave)).length : 0;
    dlg.innerHTML = `
      <div class="dlg-cab"><h2 id="titulo-mov">${entradas ? "Entradas" : "Saídas"} de ${esc(m.rotulo)}</h2><button class="btn-link" type="button" data-fechar>Fechar</button></div>
      <div class="dlg-corpo">
        <div class="mov-kpis">${kpi(entradas ? "Recebido" : "Pago", tot.realizado)}${kpi(entradas ? "Previsto" : "A pagar e previsto", tot.previsto)}${kpi("Total do mês", tot.realizado + tot.previsto)}</div>
        <div class="mov-filtros" role="group" aria-label="Filtrar">${filtros}</div>
        ${previstasAgora ? `<p class="dica" style="margin:0">${previstasAgora === 1 ? "Uma entrada prevista já pode ser dada como recebida" : `${previstasAgora} entradas previstas já podem ser dadas como recebidas`}: use <b>✓ Recebida</b> (com o valor previsto) ou <b>Mudar e confirmar</b> (para corrigir o valor ou a data).</p>` : ""}
        ${corpo}
      </div>
      <div class="dlg-rodape">${lancar}<button class="btn btn-claro" type="button" data-fechar>Fechar</button></div>`;
    dlg.setAttribute("aria-labelledby", "titulo-mov");
  }

  // ---------- Visão geral: gastos do mês (pela data da compra, parcelas no mês da fatura) ----------
  // Cada categoria abre nas subcategorias, e cada subcategoria nos gastos dela. O que fica aberto é lembrado ao redesenhar.
  const GM_ABERTAS = new Set();
  // Cada lançamento das listas da visão geral tem o botão Editar (categoria, subcategoria, essencial, conta e
  // observação), que abre a mesma classificação das outras abas; a observação aparece embaixo do lançamento
  let GM_ITENS = [], CM_ITENS = []; // itens com Editar em "Gastos pagos" e em "Comprado em"
  let GM_FOCO = null; // chave do lançamento editado: depois de salvar, a categoria nova dele abre com ele em destaque
  const editarItem = (i, lista, attr) => {
    if (!i.ref || !aoClassificar) return "";
    lista.push(i);
    return `<button type="button" class="btn-link gm-editar" data-${attr}="${lista.length - 1}" aria-label="Editar a categoria e a observação de ${esc(i.desc)}">Editar</button>`;
  };
  const obsDe = i => { const c = i.ref ? ef(i.ref).complemento : null; return c ? `<span class="compl">${esc(c)}</span>` : ""; };
  const itemGasto = i => `<li${i.ref && GM_FOCO && i.ref.chave === GM_FOCO ? ' class="gm-destaque"' : ""}><span>${esc(i.desc)}${i.parte ? ` <span class="chip neutral" title="Lançamento dividido em categorias">parte ${esc(i.parte)}</span>` : ""}<span class="sub"> · ${[i.data && !i.parcela ? dBR(i.data) : "", esc(i.grupo), i.parcela ? `parcela ${esc(i.parcela)}` : ""].filter(Boolean).join(" · ")}</span>${obsDe(i)}</span><span class="gm-valor"><span class="num">${n(i.valor)}</span>${editarItem(i, GM_ITENS, "classificar-gm")}</span></li>`;
  function categoriaExpansivel(cat, total, itens, pct, maxc, extra = "") {
    const subs = new Map();
    itens.forEach(i => { const k = i.sub || ""; const o = subs.get(k) || {v: 0, itens: []}; o.v += i.valor; o.itens.push(i); subs.set(k, o); });
    const ordem = [...subs.entries()].sort((a, b) => (a[0] === "") - (b[0] === "") || b[1].v - a[1].v);
    const so = ordem.length === 1 && ordem[0][0] === "";
    const lista = o => `<ul class="gm-itens">${[...o.itens].sort((a, b) => b.valor - a.valor).map(itemGasto).join("")}</ul>`;
    const corpo = so ? lista(ordem[0][1]) : ordem.map(([sub, o]) => {
      const chave = `${cat}|${sub}`;
      return `<details class="gm-sub" data-gm="${esc(chave)}"${GM_ABERTAS.has(chave) ? " open" : ""}><summary><span>${esc(sub || "Sem subcategoria")} <span class="muted">(${o.itens.length})</span></span><span class="num">${n(o.v)} <span class="muted">${pct(o.v)}</span></span></summary>${lista(o)}</details>`;
    }).join("");
    return `<details class="gm-cat" data-gm="${esc(cat)}"${GM_ABERTAS.has(cat) ? " open" : ""}><summary class="cat"><span>${esc(cat)} <span class="muted">(${itens.length})</span>${extra}</span><span class="num">${brl(total)} <span class="muted">${pct(total)}</span></span><div class="track"><span style="width:${(total / maxc * 100).toFixed(1)}%"></span></div></summary>
      <div class="gm-cat-corpo">${corpo}</div></details>`;
  }
  function renderGastosMes(m) {
    GM_ITENS = [];
    const g = gastosDoMes(m.chave);
    const editado = GM_FOCO && g.itens.find(i => i.ref && i.ref.chave === GM_FOCO);
    if (editado) { GM_ABERTAS.add(editado.cat); if (editado.sub) GM_ABERTAS.add(`${editado.cat}|${editado.sub}`); }
    const pct = v => (g.total > 0 ? `${Math.round(v / g.total * 100)}%` : "—");
    const f = g.fatura;
    // Por forma de pagamento: a fatura do cartão numa linha só (com as parcelas e o sem detalhe) e o resto por forma
    const porGrupo = new Map();
    g.itens.filter(i => !g.cartao.includes(i)).forEach(i => { const o = porGrupo.get(i.grupo) || {v: 0, q: 0}; o.v += i.valor; o.q++; porGrupo.set(i.grupo, o); });
    const linhasForma = [];
    if (g.cartao.length) {
      const parc = sum(g.parcelas, p => p.valor);
      const partes = [`${g.cartao.length} ${g.cartao.length === 1 ? "lançamento" : "lançamentos"}`, f.situacao === "fechada" ? "fechada" : f.situacao === "aberta" ? "aberta, até agora" : "prevista"];
      if (parc) partes.push(`parcelas ${n(parc)}`);
      if (g.semDetalhe) partes.push(`sem detalhe ${n(g.semDetalhe)}`);
      linhasForma.push([`Fatura ${f.rotulo} do cartão`, partes.join(" · "), g.totalCartao]);
    }
    [...porGrupo.entries()].sort((a, b) => b[1].v - a[1].v).forEach(([k, o]) => linhasForma.push([k, `${o.q} ${o.q === 1 ? "item" : "itens"}`, o.v]));
    const porCat = new Map();
    g.itens.forEach(i => porCat.set(i.cat, (porCat.get(i.cat) || 0) + i.valor));
    const cats = [...porCat.entries()].sort((a, b) => (a[0] === NAO_DETALHADO) - (b[0] === NAO_DETALHADO) || b[1] - a[1]);
    const maxc = Math.max(1, ...cats.map(c => c[1]));
    // Mês anterior, para comparar cada categoria (só quando ele tem gastos)
    const chaveAnt = somarChave(m.chave, -1);
    const anterior = new Map();
    try { gastosDoMes(chaveAnt).itens.forEach(i => anterior.set(i.cat, (anterior.get(i.cat) || 0) + i.valor)); } catch { /* sem o mês anterior */ }
    const temAnterior = [...anterior.values()].some(v => v > 0);
    const rotAnt = rotuloDe(chaveAnt);
    const compara = (cat, v) => {
      if (!temAnterior) return "";
      const a = anterior.get(cat) || 0;
      if (a < 0.01) return ` <span class="chip neutral" title="não teve em ${esc(rotAnt)}">novo</span>`;
      const d = (v - a) / a;
      if (Math.abs(d) < 0.05) return ` <span class="chip neutral" title="${esc(rotAnt)}: ${esc(brl(a))}">igual a ${esc(rotAnt.slice(0, 3))}</span>`;
      return ` <span class="chip ${d > 0 ? "warn" : "ok-chip"}" title="${esc(rotAnt)}: ${esc(brl(a))}">${d > 0 ? "+" : "−"}${Math.round(Math.abs(d) * 100)}% vs ${esc(rotAnt.slice(0, 3))}</span>`;
    };
    const CORES_CAT = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#7b6bb8", "#e87ba4"];
    const topoCats = cats.filter(([k]) => k !== NAO_DETALHADO).slice(0, 6);
    const restoCats = g.total - sum(topoCats, c => c[1]);
    const maiorCat = topoCats[0];
    const resumoCats = maiorCat && g.total > 0 ? `<div class="cat-resumo">
        <p class="cat-maior">Maior categoria: <b>${esc(maiorCat[0])}</b>, ${brl(maiorCat[1])} (${pct(maiorCat[1])})${compara(maiorCat[0], maiorCat[1])}</p>
        <div class="cat-pilha" role="img" aria-label="${esc(topoCats.map(([k, v]) => `${k} ${pct(v)}`).join(", "))}">${topoCats.map(([k, v], i) => `<span style="flex:${v} 1 0;background:${CORES_CAT[i]}" title="${esc(k)}: ${esc(brl(v))}"></span>`).join("")}${restoCats > 0.01 ? `<span style="flex:${restoCats} 1 0;background:var(--line)" title="Outras: ${esc(brl(restoCats))}"></span>` : ""}</div>
        <div class="legend">${topoCats.map(([k, v], i) => `<span><i style="background:${CORES_CAT[i]}"></i>${esc(k)} <span class="num">${pct(v)}</span></span>`).join("")}${restoCats > 0.01 ? `<span><i style="background:var(--line)"></i>Outras <span class="num">${pct(restoCats)}</span></span>` : ""}</div>
      </div>` : "";
    const somaParc = sum(g.parcelas, p => p.valor);
    const periodo = g.periodo ? `, com as compras de ${dBR(g.periodo.inicio)} a ${dBR(g.periodo.fim)}` : "";
    $id("gastos-mes").innerHTML = `
      <h2>Gastos pagos em ${esc(m.rotulo)}</h2>
      <div class="tv-big num">${brl(g.total)}</div>
      <p class="sub" style="margin:2px 0 6px">${f ? `Fatura ${esc(f.rotulo)}` : "Sem fatura"} + Pix, débito, dinheiro e fixos fora do cartão. Sem o investimento${g.investimentos.length ? ` (${brl(sum(g.investimentos, i => i.valor))} no mês, à parte)` : ""}.</p>
      <details class="como" style="margin-bottom:12px"><summary>Como é calculado?</summary><p>A mesma conta do balanço, sem o investimento: ${f ? `a fatura ${esc(f.rotulo)} do cartão${periodo}, com os lançamentos e as categorias da aba Cartão e faturas, ` : ""}mais o Pix, o débito, o dinheiro e os fixos fora do cartão do mês.${m.fatura ? ` As compras no cartão feitas em ${esc(m.rotulo)} vão para a fatura ${esc(m.fatura)}: estão em “Comprado em ${esc(m.rotulo)}”.` : ""} O lançamento dividido em categorias entra com cada parte na dela.</p></details>
      ${g.itens.length ? `<div class="label">Por forma de pagamento</div>
      <div class="scroll"><table><tbody>${linhasForma.map(([k, sub, v]) =>
        `<tr><td>${esc(k)}<div class="sub">${esc(sub)}</div></td><td class="r num">${n(v)}</td><td class="r num muted">${pct(v)}</td></tr>`).join("")}</tbody></table></div>
      <div class="gm-cats-topo"><div class="label">Por categoria</div>${cats.length ? `<button type="button" class="btn-link" data-gm-tudo>${cats.every(([k]) => GM_ABERTAS.has(k)) ? "Recolher tudo" : "Expandir tudo"}</button>` : ""}</div>
      ${resumoCats}
      <div class="gm-cats">${cats.map(([k, v]) => categoriaExpansivel(k, v, g.itens.filter(i => i.cat === k), pct, maxc, compara(k, v))).join("")}</div>
      ${g.semDetalhe ? `<div class="note"><b>${brl(g.semDetalhe)} da fatura ${esc(f.rotulo)} sem detalhe.</b> ${f.situacao === "fechada" ? "A fatura fechada tem lançamentos que não vieram no arquivo." : "É o total que o app mostrou para a fatura menos as compras e as parcelas que estão anotadas. Some quando a fatura (ou a prévia do app) for importada com os lançamentos."}</div>` : ""}
      ${g.parcelas.length ? `<details class="gm-parcelas"><summary>Parcelas na fatura ${esc(f.rotulo)}: ${brl(somaParc)} (${g.parcelas.length})</summary>
        <div class="scroll"><table><tbody>${g.parcelas.map(p => `<tr><td>${esc(p.desc)}<div class="sub">${esc(p.cat)}${p.parcela ? ` · parcela ${esc(p.parcela)}` : ""}</div></td><td class="r num">${n(p.valor)}</td></tr>`).join("")}</tbody></table></div></details>` : ""}`
      : `<p class="muted" style="margin:0">Nenhum gasto pago em ${esc(m.rotulo)}.</p>`}`;
  }

  // ---------- Visão geral: compras feitas no mês (valor inteiro de cada compra) ----------
  let CM_ABERTA = false; // "Ver todas as compras" continua aberta depois de editar um lançamento
  function renderComprasMes(m) {
    CM_ITENS = [];
    const c = comprasDoMes(m.chave);
    const box = $id("compras-mes");
    box.hidden = !c.itens.length;
    if (box.hidden) return;
    const avista = c.total - c.parcelado;
    box.innerHTML = `
      <h2>Comprado em ${esc(m.rotulo)}</h2>
      <div class="tv-big num">${brl(c.total)}</div>
      <p class="sub" style="margin:2px 0 6px">Pela data da compra e pelo valor inteiro (a parcelada entra com o total).</p>
      <details class="como" style="margin-bottom:12px"><summary>Como é calculado?</summary><p>O que foi no cartão vai para a fatura ${esc(m.fatura || "seguinte")} e entra nos gastos pagos do mês em que ela vence, uma parcela por fatura. Investimentos não são compras.</p></details>
      ${c.ajuste ? `<div class="note"><b>Inclui ${brl(c.ajuste)} de compras no cartão sem detalhe</b> (ajuste ${esc(c.ajustes.map(a => `“${a}”`).join("; "))}). O projeto Financeiro somou de uma vez as compras que apareciam na fatura aberta do app e não estavam anotadas uma a uma. Some quando a fatura ${esc(m.fatura || "")} for importada com os lançamentos.</div>` : ""}
      <div class="scroll"><table><tbody>
        <tr><td>À vista (Pix, débito, dinheiro e cartão à vista)<div class="sub">${c.itens.length - c.parceladas.length} ${c.itens.length - c.parceladas.length === 1 ? "compra" : "compras"}</div></td><td class="r num">${n(avista)}</td></tr>
        <tr><td>Parcelado no cartão<div class="sub">${c.parceladas.length} ${c.parceladas.length === 1 ? "compra" : "compras"}${c.parceladas.length ? ` · ${brl(c.noMes)} por mês nas faturas` : ""}</div></td><td class="r num">${n(c.parcelado)}</td></tr>
      </tbody></table></div>
      ${c.parceladas.length ? `<div class="label" style="margin:14px 0 6px">Compras parceladas</div>
      <ul class="gm-itens cm-parceladas">${c.parceladas.sort((a, b) => b.valor - a.valor).map(i => `<li><span>${esc(i.desc)}<span class="sub"> · ${dBR(i.data)} · ${i.parcela.n}x de ${n(i.parcela.valor)}${i.parcela.fatura ? ` · 1ª na fatura ${esc(i.parcela.fatura)}` : ""}</span></span><span class="num">${n(i.valor)}</span></li>`).join("")}</ul>` : ""}
      <details class="gm-parcelas" data-cm-todas${CM_ABERTA ? " open" : ""}><summary>Ver todas as compras de ${esc(m.rotulo)} (${c.itens.length})</summary>
        <ul class="gm-itens">${[...c.itens].sort((a, b) => String(a.data).localeCompare(String(b.data))).map(i => `<li><span>${esc(i.desc)}<span class="sub"> · ${[i.data ? dBR(i.data) : "", esc(i.cat), esc(i.grupo)].filter(Boolean).join(" · ")}</span>${obsDe(i)}</span><span class="gm-valor"><span class="num">${n(i.valor)}</span>${editarItem(i, CM_ITENS, "classificar-cm")}</span></li>`).join("")}</ul></details>`;
  }

  // Previsão x hoje pelo caixa: a fatura que vence no mês contra a sua previsão para o cartão
  function renderComparativo(m) {
    if (META == null) { $id("comparativo").hidden = true; return; }
    const cx = caixa(m.chave);
    const entra = cx.ent.realizado + cx.ent.previsto;
    const tipo = t => sum(cx.saidas.filter(x => x.tipo === t), x => x.valor);
    const recPrev = RECEITA_PREVISTA || entra;
    const linhas = [
      {t: "Entradas", p: recPrev, h: entra},
      {t: `Fatura ${cx.fatura ? cx.fatura.rotulo : m.rotulo} (vence no mês)`, p: META, h: tipo("fatura"), gasto: true},
      {t: nomeInvDoMes(m.chave), p: invDoMes(m.chave), h: tipo("investimento"), gasto: true},
      {t: "Pix, débito, dinheiro e fixos fora do cartão", p: null, h: tipo("dia") + tipo("fixo"), gasto: true},
    ];
    const prevSobra = recPrev - META - invDoMes(m.chave);
    const dif = l => (l.p == null ? null : l.gasto ? l.p - l.h : l.h - l.p);
    const cel = v => (v == null ? '<td class="r num muted">—</td>' : `<td class="r num ${v < -0.005 ? "neg" : v > 0.005 ? "pos" : ""}">${n(v)}</td>`);
    $id("comparativo").hidden = false;
    $id("comparativo").innerHTML = `
      <h2>Sua previsão x hoje</h2>
      <div class="scroll"><table><thead><tr><th>${esc(m.rotulo)}</th><th class="r">Previsto</th><th class="r">Hoje</th><th class="r"><span class="lg">Diferença</span><span class="sm">Dif.</span></th></tr></thead><tbody>
      ${linhas.map(l => `<tr><td>${esc(l.t)}</td><td class="r num">${n(l.p)}</td><td class="r num">${n(l.h)}</td>${cel(dif(l))}</tr>`).join("")}
      <tr class="total"><td>Sobra do mês no caixa</td><td class="r num">${n(prevSobra)}</td><td class="r num">${n(cx.saldoMes)}</td>${cel(cx.saldoMes - prevSobra)}</tr>
      </tbody></table></div>
      <p class="muted" style="font-size:.85rem;margin:10px 0 0">Pelo caixa: sai inteira a fatura que vence no mês, e as compras no cartão de ${esc(m.rotulo)} vão para a fatura ${esc(m.fatura)}. A sua previsão é ${brl(META)} por fatura e ${brl(invDoMes(m.chave))} de investimento em ${esc(m.rotulo)}${comPlano(m.chave) ? " (plano de aportes)" : ""}. A sobra aqui não conta o saldo do início do mês.</p>`;
  }

  // Pagamentos recorrentes do mês: marcar como pago lança o gasto (com o valor para conferir); desmarcar apaga esse
  // gasto. O valor de um recorrente do site pode ser mudado só no mês (conta de luz, por exemplo).
  let REC_TELA = {mes: null, lista: []};
  const formaDoProjeto = f => (/pix/i.test(f || "") ? "pix" : /d[ée]bito/i.test(f || "") ? "debito" : card(f) ? "cartao" : /dinheiro/i.test(f || "") ? "dinheiro" : "outro");
  function renderRecorrentes(m, c) {
    const box = $id("recorrentes");
    box.hidden = !c.rec.length && !aoEditarRecorrente; // o painel só de faturas não tem gastos fixos do projeto
    if (box.hidden) return;
    REC_TELA = {mes: m.chave, lista: c.rec};
    const feito = r => !!r.pago || !!r.st.auto;
    const valorDe = r => (r.pago ? r.pago.valor : r.valor);
    const pagos = sum(c.rec.filter(feito), valorDe), pendentes = sum(c.rec, r => r.pendente);
    const semValor = c.rec.filter(r => r.valor == null).length;
    const linhas = c.rec.map((r, i) => {
      const ok = feito(r);
      const check = aoPagarRecorrente && !r.variavel
        ? `<input type="checkbox" data-rec-pago="${i}"${ok ? " checked" : ""}${r.st.auto ? " disabled" : ""} aria-label="${esc(r.nome)}: ${ok ? (r.st.auto ? "já lançado" : "pago, desmarcar") : "marcar como pago"}">` : "";
      const valor = r.site && !ok && aoValorRecorrente
        ? `<input class="rec-valor" data-rec-valor="${i}" inputmode="decimal" autocomplete="off" value="${r.valor != null ? n(r.valor) : ""}" aria-label="Valor de ${esc(r.nome)} em ${esc(m.rotulo)}">${r.editado ? '<div class="sub">só neste mês</div>' : ""}`
        : n(valorDe(r));
      const detalhe = [r.parcela ? `parcela ${r.parcela.k} de ${r.parcela.n}${r.parcela.k === r.parcela.n ? " (a última)" : ""}` : "", r.categoria, r.forma, r.dia && !r.st.t.includes("dia") ? `dia ${r.dia}` : "", r.site ? "" : r.origem || "projeto Financeiro"].filter(Boolean).map(esc).join(" · ");
      return `<tr class="${ok ? "rec-ok" : ""}"><td class="rec-check">${check}</td>
        <td>${esc(r.parcela ? nomeSemParcela(r.nome) : r.nome)}${r.site && r.conta && r.conta !== "pessoal" ? ` <span class="chip conta">${esc(nomeDaConta(r.conta))}</span>` : ""}<div class="sub">${detalhe}</div>
          ${aoEditarRecorrente ? (r.site ? `<button type="button" class="btn-link" data-rec-editar="${esc(r.id)}">Editar</button>` : `<button type="button" class="btn-link" data-rec-editar-p="${i}">Editar</button>`) : ""}</td>
        <td><span class="chip ${r.st.c}">${esc(r.st.t)}</span></td><td class="r num">${valor}</td></tr>`;
    }).join("");
    box.innerHTML = `
      <div class="panel-topo"><h2>Pagamentos recorrentes</h2>${aoEditarRecorrente ? '<button type="button" class="btn sec mini" data-rec-novo>Novo recorrente</button>' : ""}</div>
      ${c.rec.length ? `<p class="sub" style="margin:-4px 0 10px">${brl(pagos)} ${c.rec.filter(feito).length === 1 ? "pago" : "pagos"} · ${brl(pendentes)} ${pendentes ? "pendentes" : "pendente"} em ${esc(m.rotulo)}.${aoPagarRecorrente ? " Marque quando o pagamento for feito." : ""}</p>
      <div class="scroll"><table class="rec-tabela"><thead><tr><th class="rec-check"><span class="sr-only">Pago</span></th><th>Pagamento</th><th>Situação</th><th class="r">Valor</th></tr></thead><tbody>
      ${linhas}
      <tr class="total"><td></td><td>Total do mês</td><td></td><td class="r num">${n(sum(c.rec, r => valorDe(r) || 0))}</td></tr>
      </tbody></table></div>` : `<p class="muted" style="margin:0">Nenhum pagamento recorrente. Cadastre aluguel, condomínio, escola, plano de saúde ou assinaturas: cada mês ele fica pendente até você marcar como pago.</p>`}
      <p class="erro" role="alert" hidden></p>
      ${semValor || invDoMes(m.chave) || aoEditarMetas ? `<p class="muted" style="font-size:.85rem;margin:10px 0 0">${semValor ? "Falta o valor de algum gasto fixo. " : ""}${invDoMes(m.chave) ? `O investimento ${comPlano(m.chave) ? "do plano de aportes" : "mensal"} de ${brl(invDoMes(m.chave))} aparece separado, no balanço.` : ""}${aoEditarMetas ? ` <button type="button" class="btn-link" data-editar-metas>${invDoMes(m.chave) ? "Alterar o investimento e a previsão do cartão" : "Previsões do mês (investimento e cartão)"}</button>` : ""}</p>` : ""}`;
  }
  // Data sugerida para o pagamento: hoje no mês atual; nos outros meses, o dia do vencimento
  const dataDoPagamento = (r, chave) => (chave === hojeKey ? hojeIso : diaDe(chave, r.dia || (chave < hojeKey ? diasDoMes(chave) : 1)));
  function renderAtalhos(m, c) {
    const semInv = m.lancamentos.filter(l => !ehReserva(l));
    const investido = sum(m.lancamentos.filter(ehInvestimento), l => l.valor);
    const guardado = sum(m.lancamentos.filter(ehCaixinha), l => l.valor);
    const tiles = [];
    tiles.push({aba: "gastos", t: "Gastos do dia a dia", v: brl(sum(semInv, l => l.valor)), s: `${semInv.length} lançamentos em ${esc(m.rotulo)}${investido ? ` · investimentos de ${brl(investido)} à parte` : ""}${guardado ? ` · ${brl(guardado)} nas caixinhas, à parte` : ""}`});
    if (AB) tiles.push({aba: "cartao", t: "Cartão e faturas", v: brl(AB.total), s: `Fatura ${AB.fatura} aberta no app em ${dBR(AB.data)}${META != null ? (AB.total > META ? ` · ${brl(AB.total - META)} acima da previsão` : ` · cabem ${brl(META - AB.total)}`) : ""}`});
    else { const ult = D.cartao.faturas.at(-1); if (ult) tiles.push({aba: "cartao", t: "Cartão e faturas", v: brl(ult.total), s: `Última fatura fechada (${ult.mes})`}); }
    const I = D.investimentos;
    if (investimentosCasal && investimentosCasal.total > 0) tiles.push({aba: "investimentos", t: "Carteira conjunta", v: brl(investimentosCasal.total), s: `${investimentosCasal.n} investimentos · saldos de ${rotuloDe(investimentosCasal.mes)}`});
    else if (I && CARTEIRA) tiles.push({aba: "investimentos", t: TITULARES ? `Investimentos (${TITULARES})` : "Investimentos", v: brl(I.total), s: `Carteira${I.data ? ` em ${dBR(I.data)}` : ""}${I.rentab_ano_pct != null ? ` · ${String(I.rentab_ano_pct).replace(".", ",")}% no ano` : ""}`});
    $id("atalhos").innerHTML = `<h2>Resumo das áreas</h2><div class="tiles">${tiles.map(x =>
      `<button type="button" class="tile" data-ir="${x.aba}"><span class="label">${esc(x.t)}</span><span class="tv">${x.v}</span><span class="sub">${esc(x.s)}</span><span class="go" aria-hidden="true">Abrir →</span></button>`).join("")}</div>`;
    $id("atalhos").querySelectorAll("[data-ir]").forEach(b => b.onclick = () => irPara(b.dataset.ir, true));
  }

  // Previsão mês a mês pelo caixa: o que entra, a fatura que vence no mês (a prevista pelo menos na sua previsão
  // para o cartão), o investimento e os fixos fora do cartão; a sobra é o que fica para Pix, débito e dinheiro.
  // "Livre no cartão" é quanto ainda cabe em compras no mês (elas vão para a fatura seguinte). Também usada pela
  // lista de desejos.
  function previsaoMeses(n = 7) {
    const linhas = [];
    for (let i = 0; i < n; i++) {
      const chave = somarChave(hojeKey, i);
      const cx = caixa(chave);
      const fat = cx.fatura, prox = cx.proxima;
      const tipo = t => sum(cx.saidas.filter(x => x.tipo === t), x => x.valor);
      const pagaFatura = fat ? (fat.situacao === "fechada" || META == null ? fat.valor : Math.max(META, fat.valor)) : META || 0;
      const receita = cx.ent.realizado + cx.ent.previsto;
      // Sobra = entradas − fatura que vence − investimento (lançado ou previsto) − fixos fora do cartão (pagos ou não),
      // a mesma conta em todos os meses
      const inv = tipo("investimento"), fixos = tipo("fixo"), caixinhas = tipo("caixinha");
      linhas.push({chave, mes: rotuloDe(chave), fat: fat ? fat.rotulo : rotuloDe(chave), parc: fat ? fat.valor : 0, nota: fat ? fat.situacao : "", receita, cartao: pagaFatura,
        inv, fixos, caixinhas, livre: META != null ? META - (prox ? prox.valor : 0) : null, sobra: Math.round((receita - pagaFatura - inv - caixinhas - fixos) * 100) / 100});
    }
    return linhas;
  }
  // Gasto médio fora do cartão (Pix, débito, dinheiro) por mês, para estimar o que sobra de verdade: os últimos três
  // meses fechados com algum gasto ou, sem eles, o mês atual até agora. Sem os investimentos e sem os pagamentos de
  // recorrentes (os fixos já saem da sobra da previsão). null quando não há nenhum gasto fora do cartão lançado.
  const foraDoCartao = m => sum(m.lancamentos.filter(l => !card(l.forma) && !ehReserva(l) && !l.recorrente), l => l.valor);
  const mediaForaCartaoInfo = () => {
    const comGasto = D.meses.filter(m => m.chave <= hojeKey && foraDoCartao(m) > 0);
    const fechados = comGasto.filter(m => m.chave < hojeKey).slice(-3);
    const base = fechados.length ? fechados : comGasto.filter(m => m.chave === hojeKey);
    if (!base.length) return {media: null, meses: [], parcial: false};
    return {media: Math.round(sum(base, foraDoCartao) / base.length * 100) / 100, meses: base.map(m => m.rotulo), parcial: !fechados.length};
  };
  const mediaForaCartao = () => mediaForaCartaoInfo().media || 0;

  function renderPrevisao() {
    const temEntradas = !SO_FATURAS || (ENTRADAS_SITE || []).length > 0;
    $id("previsao").hidden = !temEntradas;
    if (!temEntradas) return;
    const linhas = previsaoMeses(7);
    const comCx = linhas.some(l => l.caixinhas > 0.004);
    const cel = v => `<td class="r num" style="color:${v < 0 ? "var(--bad)" : "var(--ok)"};font-weight:600">${n(v)}</td>`;
    // Gráfico de linha da sobra mês a mês (mesma escala, zero marcado)
    const W = 640, H = 170, ml = 58, mr = 12, mt = 16, mb = 24;
    const vs = linhas.map(l => l.sobra), lo = Math.min(0, ...vs), hi = Math.max(0, ...vs), tk = marcasFaixa(lo, hi);
    const x = i => ml + (linhas.length > 1 ? i / (linhas.length - 1) : 0.5) * (W - ml - mr), y = v => mt + (tk.at(-1) - v) / ((tk.at(-1) - tk[0]) || 1) * (H - mt - mb);
    const grade = tk.map(v => `<line x1="${ml}" x2="${W - mr}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" stroke="${v === 0 ? "var(--muted)" : "var(--line)"}"/><text x="${ml - 6}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${curtoBRL(v)}</text>`).join("");
    const caminho = linhas.map((l, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(l.sobra).toFixed(1)}`).join("");
    const pontos = linhas.map((l, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(l.sobra).toFixed(1)}" r="4" fill="${l.sobra < 0 ? "var(--bad)" : "var(--ok)"}" stroke="var(--surface)" stroke-width="2"><title>${esc(l.mes)}: sobra ${brl(l.sobra)}</title></circle><text x="${x(i).toFixed(1)}" y="${H - 6}" text-anchor="middle">${esc(l.mes)}</text>`).join("");
    $id("previsao").innerHTML = `
      <h2>Previsão dos próximos meses</h2>
      <p class="muted" style="margin:0 0 8px;font-size:.85rem">Sobra = entradas − fatura que vence − investimento${comCx ? " − caixinhas" : ""} − fixos fora do cartão. É o que fica para Pix, débito e dinheiro.</p>
      <svg class="prev-grafico" viewBox="0 0 ${W} ${H}" role="img" aria-label="Sobra prevista: ${esc(linhas.map(l => `${l.mes} ${brl(l.sobra)}`).join(", "))}">${grade}<path d="${caminho}" fill="none" stroke="var(--ok)" stroke-width="2" stroke-linejoin="round"/>${pontos}</svg>
      <div class="scroll"><table><thead><tr><th>Mês</th><th class="r">Fatura que vence</th><th class="r">Investimento</th>${comCx ? '<th class="r">Caixinhas</th>' : ""}<th class="r">Fixos</th>${META != null ? '<th class="r">Livre no cartão</th>' : ""}<th class="r">Sobra</th></tr></thead><tbody>
      ${linhas.map(l => `<tr><td>${esc(l.mes)}<div class="muted" style="font-size:.75rem">entradas <span class="num">${n(l.receita)}</span></div></td><td class="r num">${n(l.cartao)}<div class="muted" style="font-size:.75rem">${esc(l.fat)}${l.nota ? ` · ${l.nota}` : ""}${l.cartao > l.parc + 0.005 ? `<br>até agora ${n(l.parc)}; conta a previsão` : ""}</div></td><td class="r num">${n(l.inv)}</td>${comCx ? `<td class="r num">${n(l.caixinhas)}</td>` : ""}<td class="r num">${n(l.fixos)}</td>${META != null ? (l.livre == null ? "<td></td>" : cel(l.livre)) : ""}${cel(l.sobra)}</tr>`).join("")}
      </tbody></table></div>
      <details class="como"><summary>Como é calculado?</summary><p>Pelo caixa de cada mês. <b>Entradas:</b> as lançadas, as que repetem todo mês ou, sem elas, ${brl(RECEITA_PREVISTA)} como no último mês. <b>Fatura que vence:</b> a fechada pelo total${META != null ? `; a que ainda não fechou conta pelo menos os ${brl(META)} da sua previsão do cartão` : ""}. <b>Investimento:</b> o lançado no mês ou, sem ele, a previsão de ${INV ? brl(INV) : "investimento"}${INV_DA_CARTEIRA ? " (o seu aporte na carteira conjunta)" : ""}. ${comCx ? "<b>Caixinhas:</b> a sua parte do que guardar em cada caixinha no mês (o depositado e o que falta). " : ""}<b>Fixos fora do cartão:</b> os recorrentes pagos e os ainda a pagar. A sobra não conta o saldo do início do mês.${META != null ? " <b>Livre no cartão:</b> quanto ainda cabe em compras no mês, que vão para a fatura seguinte." : ""}</p></details>`;
  }

  // ---------- Gastos do dia a dia ----------
  const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const diaSemana = iso => SEMANA[new Date(iso + "T12:00").getDay()];
  const ehAjuste = l => /^ajuste/i.test(l.desc || "");
  const catDe = l => (ehAjuste(l) ? "Não detalhado (ajuste)" : ef(l).categoria);
  const rotuloEssencial = e => (e.essencial === true ? " · essencial" : e.essencial === false ? " · não essencial" : "");
  const chipConta = e => (e.conta !== "pessoal" ? ` · <span class="chip conta">${esc(nomeDaConta(e.conta))}</span>` : "");
  // Situação de cada gasto na conferência com as faturas do cartão
  const CONF = [["fatura", "Vieram da fatura"], ["conferido", "Conferidos na fatura"], ["nao", "Não achados na fatura"], ["forma", "Em outra forma, mas na fatura"], ["entrar", "Vão entrar na fatura"]];
  const confDe = l => (l.origem === "fatura" ? "fatura" : l.outraForma ? "forma" : l.foraDaFatura ? "nao" : l.aEntrar ? "entrar" : l.naFatura ? "conferido" : "");
  const chipConf = l => ({fatura: ` <span class="chip info">da fatura ${esc(l.fatura)}</span>`, forma: ` <span class="chip warn">está na fatura ${esc(l.naFatura)}</span>`,
    nao: ' <span class="chip warn">não achado na fatura</span>', entrar: ' <span class="chip neutral">vai entrar na fatura</span>'})[confDe(l)] || "";
  // Essencial, não essencial e sem classificação (o ajuste "não detalhado" fica à parte)
  function divisaoEssencial(L) {
    const det = L.filter(l => !ehAjuste(l));
    const ps = det.flatMap(partesL);
    const ess = sum(ps.filter(p => p.essencial === true), p => p.valor);
    const nEss = sum(ps.filter(p => p.essencial === false), p => p.valor);
    return [[ess, "var(--parc)", "Essencial"], [nEss, "var(--inv)", "Não essencial"], [sum(det, l => l.valor) - ess - nEss, "var(--line)", "Sem classificação"],
      [sum(L.filter(ehAjuste), l => l.valor), "var(--muted)", "Não detalhado"]].filter(s => s[0] > 0.004);
  }
  // Total por conta (pessoal, engenharia, empresas), só quando há lançamento fora da conta pessoal
  function porConta(L) {
    const t = {};
    L.forEach(l => partesL(l).forEach(p => { const c = unificada(p.conta); t[c] = (t[c] || 0) + p.valor; }));
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
      if (ehAjuste(l)) { const o = (porCat[catDe(l)] ||= {v: 0, q: 0, subs: {}}); o.v += l.valor; o.q++; return; }
      partesL(l).forEach(p => {
        const o = (porCat[p.categoria] ||= {v: 0, q: 0, subs: {}});
        o.v += p.valor; o.q++;
        if (p.subcategoria) o.subs[p.subcategoria] = (o.subs[p.subcategoria] || 0) + p.valor;
      });
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
    // No mês atual, a linha tracejada mostra quanto cabe por dia daqui até o fim do mês sem passar das entradas
    let cabe = null;
    if (hojeDia) { const cx = caixa(m.chave); if (cx.fim > 0) cabe = cx.fim / (ult - hojeDia + 1); }
    const escalaD = Math.max(maxd, cabe || 0);
    const altura = v => (v / escalaD).toFixed(4);
    const linhaCabe = cabe == null ? "" : `<span class="dlimite" style="left:${((hojeDia - 1) / ult * 100).toFixed(2)}%;bottom:calc(${altura(cabe)} * (100% - 20px))"></span>
        <span class="dlimite-rot" style="${hojeDia > ult * 0.6 ? "right:0" : `left:${((hojeDia - 1) / ult * 100).toFixed(2)}%`};bottom:calc(${altura(cabe)} * (100% - 20px))">cabe ${brl(cabe)} por dia até ${String(ult).padStart(2, "0")}/${String(m.mes).padStart(2, "0")}</span>`;
    $id("g-dias").innerHTML = `<h2>Gasto por dia</h2>
      ${maxd > 0 ? `<div class="daychart" role="img" aria-label="Gasto por dia em ${esc(m.rotulo)}; maior dia ${brl(maxd)}${cabe != null ? `; cabem ${brl(cabe)} por dia até o fim do mês` : ""}">
        <span class="dmax num">${brl(escalaD)}</span>
        ${porDia.map((v, i) => { const d = i + 1; const dd = String(d).padStart(2, "0") + "/" + String(m.mes).padStart(2, "0");
          const lado = d <= 6 ? " l" : d >= ult - 5 ? " rt" : "";
          return `<div class="dcol${lado}" ${v ? `tabindex="0" data-tip="${dd} · ${brl(v)} (${qDia[i]})"` : ""}><span class="dbar" style="height:${v ? Math.max(2, v / escalaD * 100) : 0}%"></span></div>`; }).join("")}
        ${linhaCabe}
      </div>
      <div class="daxis" aria-hidden="true">${porDia.map((v, i) => { const d = i + 1; const mostra = d === hojeDia || (marcas.has(d) && !(hojeDia && Math.abs(d - hojeDia) === 1));
        return `<span class="${d === hojeDia ? "hoje" : ""}">${mostra ? d : ""}</span>`; }).join("")}</div>
      <p class="sub" style="margin:8px 0 0">Toque ou passe o mouse nas barras para ver o valor de cada dia.${cabe != null ? " A linha tracejada é quanto cabe por dia até o fim do mês, pelo caixa." : ""}${totAj ? ` O ajuste de ${brl(totAj)} fica fora do gráfico.` : ""}</p>`
      : '<p class="muted" style="margin:0">Sem gastos detalhados no mês.</p>'}`;

    opcoes($id("g-fcat"), Object.keys(porCat).sort(), "Todas");
    opcoes($id("g-fforma"), Object.keys(porForma).sort(), "Todas");
    const fConta = $id("g-fconta");
    const contasMes = [...new Set(L.flatMap(l => partesL(l).map(p => unificada(p.conta))))];
    fConta.closest("label").hidden = !contasMes.some(c => c !== "pessoal");
    opcoesComRotulo(fConta, contasMes.map(c => [c, nomeDaConta(c)]), "Todas");
    const fConf = $id("g-fconf");
    const situacoes = CONF.filter(([k]) => L.some(l => confDe(l) === k));
    fConf.closest("label").hidden = !situacoes.length;
    opcoesComRotulo(fConf, situacoes, "Todos");
    seguro("g-conciliacao", () => renderConciliacao(m));
    renderGastosLista(m);
  }
  // Quadro da conferência com o cartão: o que cada fatura conhecida trouxe e o que conferir no mês aberto
  function renderConciliacao(m) {
    const box = $id("g-conciliacao");
    box.hidden = !(CONC && CONC.faturas.length);
    if (box.hidden) return;
    const doMes = k => m.lancamentos.filter(l => confDe(l) === k);
    const avisos = [
      ["nao", "warn", q => `${q === 1 ? "Um gasto no cartão não aparece" : `${q} gastos no cartão não aparecem`} na fatura do período (valor ou data diferentes, ou foi em outro cartão).`],
      ["forma", "warn", q => `${q === 1 ? "Um gasto lançado como Pix, débito ou dinheiro está" : `${q} gastos lançados como Pix, débito ou dinheiro estão`} na fatura do cartão. Confira a forma de pagamento.`],
      ["fatura", "info", q => `${q === 1 ? "Uma compra da fatura não estava" : `${q} compras da fatura não estavam`} nos gastos do dia a dia e ${q === 1 ? "entrou" : "entraram"} agora (${brl(sum(doMes("fatura"), l => l.valor))}).`],
      ["entrar", "info", q => `${q === 1 ? "Um gasto no cartão vai entrar" : `${q} gastos no cartão vão entrar`} na próxima fatura (lançados depois de ${dBR(CONC.fimConhecido)}).`],
    ].map(([k, cls, texto]) => { const q = doMes(k).length; return q ? `<div class="alert ${cls}"><span class="sev"></span><div>${esc(texto(q))} <button type="button" class="btn-link" data-ver-conf="${k}">Ver na lista</button></div></div>` : ""; }).join("");
    box.innerHTML = `<h2>Conferência com o cartão</h2>
      <p class="sub" style="margin:-6px 0 10px">Cada compra das faturas é procurada nos gastos do dia a dia (mesmo valor, até 3 dias de diferença). A que faltava entrou nos gastos, marcada “da fatura”.</p>
      <ul class="conf-frases">${[...CONC.faturas].reverse().slice(0, 4).map(r => `<li><b>Fatura ${esc(r.mes)}</b> (${r.fechada ? "fechada" : r.compras ? `prévia até ${dBR(r.previa.ate)}` : "prévia, só parcelas"}): ${!r.compras ? "nenhuma compra para conferir."
        : `${r.compras} ${r.compras === 1 ? "compra" : "compras"}; ${r.conferidos ? `${r.conferidos} já ${r.conferidos === 1 ? "estava" : "estavam"} nos gastos do dia a dia` : "nenhuma estava nos gastos do dia a dia"}${r.entraram ? ` e ${r.entraram} ${r.entraram === 1 ? "foi adicionada" : "foram adicionadas"} aos gastos` : ""}.`}</li>`).join("")}</ul>
      ${avisos ? `<div class="conf-avisos">${avisos}</div>` : `<p class="sub" style="margin:8px 0 0">Em ${esc(m.rotulo)}, os gastos no cartão batem com as faturas.</p>`}
      ${CONC.ajustes ? `<p class="sub" style="margin:8px 0 0">${CONC.ajustes === 1 ? "O ajuste" : `${CONC.ajustes} ajustes`} de gastos no cartão não anotados ${CONC.ajustes === 1 ? "saiu" : "saíram"}: a fatura traz cada compra do período.</p>` : ""}`;
    box.querySelectorAll("[data-ver-conf]").forEach(b => { b.onclick = () => {
      $id("g-fconf").value = b.dataset.verConf;
      seguro("g-itens", () => renderGastosLista(atual));
      $id("g-lista").scrollIntoView({block: "start"});
    }; });
  }
  function opcoesComRotulo(sel, pares, rotuloTodos) {
    const antes = sel.value;
    sel.innerHTML = `<option value="">${rotuloTodos}</option>` + pares.map(([v, r]) => `<option value="${esc(v)}">${esc(r)}</option>`).join("");
    if (pares.some(([v]) => v === antes)) sel.value = antes;
  }

  // O que vai para o diálogo de classificar um lançamento (página financas.js). par: a compra da fatura ou o gasto
  // do dia a dia que é o mesmo lançamento (a classificação é gravada nos dois)
  function paraClassificar(l, tipo) {
    const p = l.chave ? PAR.get(l.chave) : null;
    return {chave: l.chave, tipo, site: l.origem === "site", id: l.id || null, titulo: l.nome || l.desc,
      data: l.data || null, valor: l.valor, mes: l.mes || l.fatura || null, forma: l.forma || null, parcela: l.parcela || l.parcelas || null,
      atual: ef(l), ajuste: AJ.get(l.chave) || null, original: efetivo(l, null, CATS),
      essencialOriginal: efetivo(l, null, null).semAjuste, // o que veio do projeto (sem o padrão da categoria)
      par: p ? {chave: p.chave, site: p.origem === "site", id: p.id || null, original: efetivo(p, null, CATS), ajuste: AJ.get(p.chave) || null} : null};
  }

  // Lançamentos a classificar (sem categoria ou em Outros, fora do ajuste), cada um uma vez: a compra da fatura que
  // virou gasto do dia a dia, ou que foi conferida com um, conta uma vez só. Vão para as tarefas pendentes.
  function pendentes() {
    const vistos = new Set(), lista = [];
    const ver = l => {
      if (!l.chave || vistos.has(l.chave) || ehAjuste(l)) return;
      vistos.add(l.chave);
      const p = PAR.get(l.chave);
      if (p) vistos.add(p.chave);
      if (ef(l).pendente) lista.push(paraClassificar(l, (l.nome || l.origem === "fatura") ? "fatura" : "gasto"));
    };
    D.meses.forEach(m => m.lancamentos.forEach(ver));
    PESSOAS.dono.cartao.lancamentos.forEach(ver);
    return lista.sort((a, b) => String(b.data || "").localeCompare(String(a.data || "")));
  }
  const avisarPendencias = () => { if (aoMudarPendencias) aoMudarPendencias(pendentes()); };

  let listaGastos = [];
  function renderGastosLista(m) {
    const fc = $id("g-fcat").value, ff = $id("g-fforma").value, fco = $id("g-fconta").value, fcf = $id("g-fconf").value, q = semAcento($id("g-busca").value.trim());
    const L = m.lancamentos.filter(l => {
      const e = ef(l);
      const ps = ehAjuste(l) ? [] : partesL(l);
      return (!fc || catDe(l) === fc || ps.some(p => p.categoria === fc)) && (!ff || (l.forma || "Outro") === ff) && (!fco || unificada(e.conta) === fco || ps.some(p => unificada(p.conta) === fco)) && (!fcf || confDe(l) === fcf)
        && (!q || semAcento(`${l.desc} ${l.obs || ""} ${e.categoria} ${e.subcategoria || ""} ${e.complemento || ""} ${nomeDaConta(e.conta)} ${ps.map(p => `${p.categoria} ${p.subcategoria || ""}`).join(" ")}`).includes(q));
    });
    listaGastos = L;
    const indice = new Map(L.map((l, i) => [l, i]));
    const porData = {};
    L.forEach(l => (porData[l.data] ||= []).push(l));
    const datas = Object.keys(porData).sort().reverse();
    $id("g-itens").innerHTML = L.length ? datas.map(d => `<div class="dgroup"><div class="dhead"><span>${dBR(d)} · ${diaSemana(d)}</span><span class="num">${brl(sum(porData[d], l => l.valor))}</span></div>
      <table><tbody>${porData[d].map(l => { const e = ef(l); return `<tr${aPagar(l) ? ' class="a-pagar"' : ""}><td>${esc(l.desc)}${ehAjuste(l) ? ' <span class="chip neutral">ajuste</span>' : ""}${e.pendente ? ' <span class="chip bad">a classificar</span>' : ""}${aPagar(l) ? ' <span class="chip warn">a pagar</span>' : ""}${l.origem === "site" ? ' <span class="chip info">lançado no site</span>' : ""}${l.recorrente ? ' <span class="chip neutral">recorrente</span>' : ""}${chipConf(l)}
        ${e.complemento ? `<div class="compl">${esc(e.complemento)}</div>` : ""}
        <div class="sub">${e.partes ? `<span class="chip neutral">dividido</span> ${esc(textoPartes(e, l.valor))}` : `${esc(catDe(l))}${e.subcategoria && !ehAjuste(l) ? ` › ${esc(e.subcategoria)}` : ""}`} · ${esc(l.forma || "")}${l.parcelas ? ` · parcela ${esc(l.parcelas)}` : ""}${ehAjuste(l) ? "" : rotuloEssencial(e)}${chipConta(e)}${l.obs && !ehAjuste(l) && l.origem !== "site" ? ` · ${esc(l.obs)}` : ""}${confDe(l) === "conferido" ? ` · conferido na fatura ${esc(l.naFatura)}` : ""}</div></td>
        <td class="r num">${n(l.valor)}<div class="acoes-lanc">${aPagar(l) && aoPagarGasto ? `<button type="button" class="btn mini" data-pagar-gasto="${esc(l.id)}">Pagar</button>` : ""}${l.origem === "site" && aoEditarGasto ? `<button type="button" class="btn sec mini" data-editar-gasto="${esc(l.id)}">Editar</button>` : ""}${aoClassificar && !ehAjuste(l) && !(l.origem === "site" && aoEditarGasto) ? `<button type="button" class="btn sec mini" data-classificar-g="${indice.get(l)}">Classificar</button>` : ""}${l.origem === "site" && aoApagarGasto && !aoEditarGasto ? `<button type="button" class="btn sec mini" data-apagar-gasto="${esc(l.id)}">Apagar</button>` : ""}</div></td></tr>`; }).join("")}</tbody></table></div>`).join("")
      + `<p class="sub" style="margin:10px 0 0">${L.length} ${L.length === 1 ? "lançamento" : "lançamentos"} · total ${brl(sum(L, l => l.valor))}</p>`
      : `<p class="muted" style="margin:6px 0 0">${m.lancamentos.length ? "Nenhum lançamento com esses filtros." : `Nenhum gasto lançado em ${esc(m.rotulo)}.`}</p>`;
    $id("g-itens").querySelectorAll("[data-apagar-gasto]").forEach(b => { b.onclick = () => aoApagarGasto(b.dataset.apagarGasto); });
    $id("g-itens").querySelectorAll("[data-editar-gasto]").forEach(b => { b.onclick = () => aoEditarGasto(b.dataset.editarGasto); });
    $id("g-itens").querySelectorAll("[data-pagar-gasto]").forEach(b => { b.onclick = () => aoPagarGasto(b.dataset.pagarGasto); });
    $id("g-itens").querySelectorAll("[data-classificar-g]").forEach(b => { b.onclick = () => aoClassificar(paraClassificar(listaGastos[Number(b.dataset.classificarG)], "gasto")); });
  }

  // ---------- Cartão e faturas ----------
  // Prévia da fatura que ainda não fechou (a primeira que não venceu); as seguintes são as próximas faturas
  function previaAberta() {
    const hojeIso = `${hojeKey}-${String(hoje.getDate()).padStart(2, "0")}`;
    const [fa, fm] = nextYM(hoje.getFullYear(), hoje.getMonth() + 1);
    return PREVIAS.find(p => (p.vencimento ? p.vencimento >= hojeIso : ordemFatura(p.mes) >= ordemFatura(lbl(fa, fm)))) || null;
  }
  function htmlPreviaAberta(p) {
    const pend = D.meses.flatMap(m => m.lancamentos).filter(l => l.aEntrar);
    const totPend = sum(pend, l => l.valor), minimo = p.total + totPend;
    const prox = PREVIAS.filter(x => ordemFatura(x.mes) > ordemFatura(p.mes));
    const escala = Math.max(META || 0, minimo) * 1.08;
    const w = v => `${(Math.max(0, v) / escala * 100).toFixed(2)}%`;
    return `<h2>Fatura aberta ${esc(p.mes)}</h2>
      <div class="tv-big num">${brl(p.total)}</div>
      <p class="sub" style="margin:2px 0 0">Prévia do ${esc(p.formato || "arquivo")} do app${p.banco ? ` do ${esc(p.banco)}` : ""}, com as compras até ${dBR(p.ate)}${p.vencimento ? ` · vence em ${dataLonga(p.vencimento)}` : ""}</p>
      ${META != null ? `<div class="meter" role="img" aria-label="Fatura em relação à sua previsão de ${brl(META)}">
          <div class="bar"><span style="width:${w(p.total)};background:var(--parc)"></span>${totPend > 0 ? `<span style="width:${w(totPend)};background:var(--gasto)"></span>` : ""}</div>
          <span class="metaline" style="left:${w(META)}"></span><span class="metalbl" style="left:${w(META)}">previsão ${brl(META)}</span>
        </div>
        <div class="legend"><span><i style="background:var(--parc)"></i>Na prévia</span>${totPend > 0 ? '<span><i style="background:var(--gasto)"></i>Lançados depois</span>' : ""}</div>` : ""}
      <table class="calc" style="margin-top:12px"><tbody>
        <tr><td>Compras à vista e primeiras parcelas</td><td class="r num">${brl(p.compras)}</td></tr>
        <tr><td>Parcelas de compras anteriores</td><td class="r num">${brl(p.parcelas_anteriores)}</td></tr>
        ${totPend ? `<tr><td>Lançados no dia a dia depois de ${dBR(p.ate)}</td><td class="r num">${brl(totPend)}</td></tr>` : ""}
        <tr class="total"><td>Fecha em pelo menos</td><td class="r num">${brl(minimo)}</td></tr>
        ${META != null ? `<tr><td>Sua previsão</td><td class="r num">${brl(META)}</td></tr><tr><td>Diferença</td><td class="r num ${META - minimo < 0 ? "neg" : "pos"}">${brl(META - minimo)}</td></tr>` : ""}
      </tbody></table>
      ${pend.length ? `<div class="label" style="margin:14px 0 4px">No dia a dia, ainda não na fatura</div>
        <div class="scroll"><table><tbody>${pend.map(l => `<tr><td class="num muted" style="padding-right:10px">${dBR(l.data)}</td><td>${esc(l.desc)}</td><td class="r num">${n(l.valor)}</td></tr>`).join("")}</tbody></table></div>` : ""}
      ${prox.length ? `<div class="label" style="margin:14px 0 4px">Próximas faturas (prévia)</div>
        <div class="scroll"><table><tbody>${prox.map(x => `<tr><td>${esc(x.mes)}<div class="sub">${x.n_lanc} ${x.n_lanc === 1 ? "lançamento" : "lançamentos"} · parcelas de compras anteriores ${brl(x.parcelas_anteriores)}</div></td><td class="r num">${n(x.total)}</td></tr>`).join("")}</tbody></table></div>` : ""}`;
  }

  function renderFaturaAberta() {
    const box = $id("fatura-aberta");
    if (!AB) {
      const p = previaAberta();
      box.innerHTML = p ? htmlPreviaAberta(p) : `<h2>Fatura aberta</h2><p class="muted" style="margin:0">Nenhuma fatura aberta registrada. Importe a fatura parcial do app (CSV ou OFX) no quadro de PDFs.</p>`;
      return;
    }
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
    doMes.forEach(l => partesL(l).forEach(p => { somaCat[p.categoria] = (somaCat[p.categoria] || 0) + p.valor; }));
    const cats = Object.entries(doMes.length ? somaCat : C.categorias[f.mes] || {}).sort((a, b) => b[1] - a[1]);
    const maxc = Math.max(1, ...cats.map(c => c[1]));
    const segs = divisaoEssencial(doMes), totSegs = sum(segs, s => s[0]);
    const contas = porConta(doMes);
    const al = C.alertas.filter(a => a.mes === f.mes);
    const prio = {"Alta": "bad", "Média": "warn", "Media": "warn", "Baixa": "neutral", "Info": "info"};
    // Pontos de atenção: os de prioridade alta e média no topo, com as compras parceladas novas acima do limite; o resto
    // (parcelamentos pequenos, várias compras no mesmo dia, IOF...) fica recolhido, contado por tipo
    const LIMITE_PARC = 1000;
    const parcDe = nome => (C.parcelamentos || []).find(p => semAcento(p.nome).trim() === semAcento(nome).trim());
    const totalParcelado = a => { const p = parcDe(a.nome || ""); const x = p && String(p.prox || "").match(/(\d+)\s*\/\s*(\d+)/); return x ? Math.round(Number(p.valor) * Number(x[2]) * 100) / 100 : null; };
    const grande = a => /nova compra parcelada/i.test(a.tipo || "") && (totalParcelado(a) || 0) >= LIMITE_PARC;
    const ordemPrio = a => ({"Alta": 0, "Média": 1, "Media": 1}[a.prioridade] ?? (grande(a) ? 2 : 3));
    const principais = al.filter(a => ordemPrio(a) <= 2).sort((a, b) => ordemPrio(a) - ordemPrio(b));
    const outrosAl = al.filter(a => ordemPrio(a) > 2);
    const porTipoAl = [...outrosAl.reduce((m, a) => m.set(a.tipo || "Outros", (m.get(a.tipo || "Outros") || 0) + 1), new Map()).entries()];
    const linhaAl = a => { const tot = grande(a) ? totalParcelado(a) : null; return `<tr><td><span class="chip ${tot ? "warn" : prio[a.prioridade] || "neutral"}">${esc(tot ? "Parcelamento alto" : a.prioridade || "")}</span> ${esc(a.tipo || "")}<div class="sub">${esc(a.nome || "")}${tot ? ` · total de ${brl(tot)}` : ""}${a.detalhe ? ` · ${esc(a.detalhe)}` : ""}</div></td><td class="r num">${a.valor != null ? n(a.valor) : ""}</td></tr>`; };
    // Tarifas, juros e IOF: a categoria Tarifas e encargos (anuidade, IOF, juros) ou, sem lançamentos, o que a fatura diz
    const tarifas = sum(doMes.flatMap(partesL).filter(p => /tarifas e encargos/i.test(semAcento(p.categoria))), p => p.valor);
    const top = [...doMes].sort((a, b) => b.valor - a.valor).slice(0, 6);
    const kv = [["Total a pagar", brl(f.total)], ["Vencimento", dataLonga(f.vencimento)],
      ["À vista (nacional)", brl(f.avista)], ["Parcelas", brl(f.parcelas)], ["Internacional", brl(f.internacional)], ["Tarifas, juros e IOF", brl(Math.max(Number(f.encargos) || 0, tarifas))],
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
        ${principais.length ? `<div class="scroll"><table><tbody>${principais.map(linhaAl).join("")}</tbody></table></div>` : '<p class="sub" style="margin:0">Nada importante nesta fatura.</p>'}
        ${outrosAl.length ? `<details class="al-outros"><summary>Ver mais ${outrosAl.length} ${outrosAl.length === 1 ? "aviso" : "avisos"}: ${esc(porTipoAl.map(([t, q]) => `${q} ${t.toLowerCase()}`).join(", "))}</summary>
          <div class="scroll"><table><tbody>${outrosAl.map(linhaAl).join("")}</tbody></table></div></details>` : ""}` : ""}
      <div class="label" style="margin:16px 0 6px">Maiores lançamentos</div>
      <div class="scroll"><table><tbody>${top.map(l => { const e = ef(l); return `<tr><td>${esc(l.nome)}${e.complemento ? `<div class="compl">${esc(e.complemento)}</div>` : ""}<div class="sub">${e.partes ? `dividido: ${esc(textoPartes(e, l.valor))}` : `${esc(e.categoria)}${e.subcategoria ? ` › ${esc(e.subcategoria)}` : ""}`}${l.parcela ? ` · parcela ${esc(l.parcela)}` : ""}${l.data ? ` · ${dBR(l.data)}` : ""}</div></td><td class="r num">${n(l.valor)}</td></tr>`; }).join("")}</tbody></table></div>
      <p class="sub" style="margin:10px 0 0">Os lançamentos completos estão no fim desta página.</p>`;
    box.querySelectorAll("[data-fat]").forEach(b => b.onclick = () => {
      fatSel[QUEM] = b.dataset.fat; renderFaturaAnalise();
      const nb = box.querySelector(`[data-fat="${CSS.escape(b.dataset.fat)}"]`); if (nb) nb.focus();
    });
  }

  function renderCartao() {
    const fech = D.cartao.faturas.map(f => ({mes: f.mes, total: f.total, venc: f.vencimento}));
    const fechadas = new Set(fech.map(p => p.mes));
    const comoFutura = f => ({mes: f.rotulo, segs: f.segs, total: f.valor, meta: f.meta});
    const futuras = D.meses.filter(mm => !fechadas.has(mm.fatura)).map(mm => faturaDoCartao(mm.fatura)).filter(f => f && f.valor > 0).map(comoFutura);
    // Faturas seguintes sem mês nos gastos: a prévia do app, se houver, ou as parcelas agendadas
    const seguintes = new Set([...Object.keys(D.cartao.comprometido), ...PREVIAS.map(p => p.mes)]);
    seguintes.forEach(mes => {
      if (futuras.some(f => f.mes === mes) || fech.some(p => p.mes === mes)) return;
      const f = faturaDoCartao(mes);
      if (f) futuras.push(comoFutura(f));
    });
    if (futuras.every(f => Number.isFinite(ordemFatura(f.mes)))) futuras.sort((a, b) => ordemFatura(a.mes) - ordemFatura(b.mes));
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
    if (QUEM !== "dono" || !COM_MESES) return [];
    const fechadas = new Set(D.cartao.faturas.map(f => f.mes));
    return parcelasSite.map(p => {
      const resta = p.faturas.filter(f => f && !fechadas.has(f));
      return resta.length ? {nome: p.nome, prox: resta[0], valor: p.valor, saldo: Math.round(p.valor * resta.length * 100) / 100, ultima: p.faturas.at(-1), site: true} : null;
    }).filter(Boolean);
  }

  // Número da próxima parcela: "2 de 12" (o "02/12" parecia data); a fatura (dez/26) fica como está
  const proxParcela = t => { const x = String(t || "").match(/^(\d+)\s*\/\s*(\d+)$/); return x ? `${Number(x[1])} de ${Number(x[2])}` : t; };
  // Quanto das próximas faturas já está comprometido com parcelas, mês a mês: mostra quando o cartão alivia
  function graficoComprometido() {
    const c = FC().comprometido || {};
    const meses = Object.keys(c).filter(k => Number.isFinite(ordemFatura(k)) && Number(c[k]) > 0).sort((a, b) => ordemFatura(a) - ordemFatura(b)).slice(0, 12);
    if (meses.length < 2) return "";
    const max = Math.max(...meses.map(k => Number(c[k])));
    return `<div class="comprometido" role="img" aria-label="Parcelas já comprometidas: ${esc(meses.map(k => `${k} ${brl(Number(c[k]))}`).join(", "))}">
        ${meses.map(k => `<div class="comp-col" title="${esc(k)}: ${esc(brl(Number(c[k])))}"><span class="comp-v num">${curtoBRL(Number(c[k]))}</span><span class="comp-barra" style="height:${Math.max(3, Number(c[k]) / max * 100).toFixed(1)}%"></span><span class="comp-m">${esc(k)}</span></div>`).join("")}
      </div>
      <p class="sub" style="margin:4px 0 12px">Já comprometido em parcelas nas próximas faturas: ${brl(meses.reduce((t, k) => t + Number(c[k]), 0))} até ${esc(meses.at(-1))}.</p>`;
  }
  function renderParcelas() {
    const p = [...FC().parcelamentos, ...parceladasDoSite()];
    if (!p.length) { $id("parcelas").innerHTML = `<h2>Compras parceladas a vencer</h2><p class="muted" style="margin:0">${FC().faturas.length ? "Nenhuma compra parcelada a vencer." : "Aparecem aqui depois da primeira fatura processada."}</p>`; return; }
    $id("parcelas").innerHTML = `
      <h2>Compras parceladas a vencer</h2>
      ${graficoComprometido()}
      <div class="scroll"><table><thead><tr><th>Compra</th><th class="hide-sm">Próxima parcela</th><th class="r">Parcela</th><th class="r">Falta pagar</th><th class="r">Última</th></tr></thead><tbody>
      ${p.map(x => `<tr><td>${esc(x.nome)}${x.site ? ' <span class="chip info">lançado no site</span>' : ""}</td><td class="num hide-sm">${esc(proxParcela(x.prox))}</td><td class="r num">${n(x.valor)}</td><td class="r num">${n(x.saldo)}</td><td class="r">${esc(x.ultima)}</td></tr>`).join("")}
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
    opcoes($id("f-fcat"), [...new Set(T.filter(l => l.mes === selM.value).flatMap(l => partesL(l).map(p => p.categoria)))].sort(), "Todas");
    renderFaturaLista();
  }

  let fatTodos = false;
  let listaFatura = [];
  function renderFaturaLista() {
    const mm = $id("f-fmes").value, fc = $id("f-fcat").value, q = semAcento($id("f-busca").value.trim());
    const L = FC().lancamentos.filter(l => {
      const e = ef(l);
      const ps = partesL(l);
      return l.mes === mm && (!fc || ps.some(p => p.categoria === fc))
        && (!q || semAcento(`${l.nome} ${l.cidade} ${ps.map(p => `${p.categoria} ${p.subcategoria || ""}`).join(" ")} ${e.complemento || ""} ${nomeDaConta(e.conta)}`).includes(q));
    }).sort((a, b) => (b.data || "").localeCompare(a.data || ""));
    const corta = !fatTodos && !fc && !q && L.length > 30;
    const V = corta ? L.slice(0, 25) : L;
    listaFatura = V;
    $id("f-itens").innerHTML = L.length ? `<div class="scroll"><table><thead><tr><th>Data</th><th>Lançamento</th><th class="r">Valor</th></tr></thead><tbody>${V.map((l, i) => { const e = ef(l); return `<tr><td class="num muted" style="padding-right:10px">${l.data ? dBR(l.data) : ""}</td>
      <td>${esc(l.nome)}${e.pendente ? ' <span class="chip bad">a classificar</span>' : ""}${e.partes ? ' <span class="chip neutral">dividido</span>' : ""}${e.complemento ? `<div class="compl">${esc(e.complemento)}</div>` : ""}<div class="sub">${e.partes ? esc(textoPartes(e, l.valor)) : `${esc(e.categoria)}${e.subcategoria ? ` › ${esc(e.subcategoria)}` : ""}`}${l.cidade ? ` · ${esc(l.cidade)}` : ""}${l.parcela ? ` · parcela ${esc(l.parcela)}` : ""}${l.tipo && l.tipo !== "Nacional" ? ` · ${esc(l.tipo)}` : ""}${rotuloEssencial(e)}${chipConta(e)}</div></td>
      <td class="r num">${n(l.valor)}${aoClassificar ? `<div class="acoes-lanc"><button type="button" class="btn sec mini" data-classificar-f="${i}">Classificar</button></div>` : ""}</td></tr>`; }).join("")}</tbody></table></div>
      ${corta ? `<button type="button" class="btn sec mini" id="f-todos" style="margin-top:10px">Mostrar todos os ${L.length} lançamentos</button>` : ""}
      <p class="sub" style="margin:10px 0 0">${corta ? `Mostrando os 25 mais recentes de ${L.length}` : `${L.length} ${L.length === 1 ? "lançamento" : "lançamentos"}`} · total da seleção ${brl(sum(L, l => l.valor))}</p>`
      : `<p class="muted" style="margin:6px 0 0">${FC().lancamentos.length ? "Nenhum lançamento com esses filtros." : "Nenhuma fatura processada ainda."}</p>`;
    if (corta) $id("f-todos").onclick = () => { fatTodos = true; renderFaturaLista(); const t = $id("f-itens"); t.tabIndex = -1; t.focus(); };
    $id("f-itens").querySelectorAll("[data-classificar-f]").forEach(b => { b.onclick = () => aoClassificar(paraClassificar(listaFatura[Number(b.dataset.classificarF)], "fatura")); });
  }

  // ---------- Abas: visão geral, gastos do dia a dia, cartão e faturas, investimentos, lista de desejos ----------
  const ABAS = ["geral", "gastos", "cartao", "investimentos", "caixinhas", "desejos", "cadastros"];
  function irPara(aba, rolar) {
    if (!COM_MESES && !["investimentos", "desejos", "cadastros"].includes(aba)) aba = "cartao";
    if (!ABAS.includes(aba) || (aba === "investimentos" && !CARTEIRA && !comInvestimentos) || (aba === "desejos" && !comDesejos) || (aba === "cadastros" && !aoEditarCategorias)
      || (aba === "caixinhas" && !COM_CAIXINHAS)) aba = COM_MESES ? "geral" : "cartao";
    document.querySelectorAll("#fin-abas [role=tab]").forEach(t => {
      const sel = t.dataset.aba === aba;
      t.setAttribute("aria-selected", String(sel));
      t.tabIndex = sel ? 0 : -1;
    });
    ["geral", "gastos", "cartao", "caixinhas", "desejos", "cadastros"].forEach(k => { const v = $id("view-" + k); if (v) v.hidden = k !== aba; });
    $id("fin-root").hidden = aba === "investimentos";
    $id("view-inv").hidden = aba !== "investimentos";
    if (COM_MESES || CARTEIRA || comInvestimentos || comDesejos || aoEditarCategorias) {
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
    // O seletor do topo (Marcos, Maria, Casal) já diz de quem é o painel: as abas não repetem o nome
    const quem = {geral: "", gastos: "", cartao: OUTRA ? `com o de ${OUTRA.nome}` : "", investimentos: "", caixinhas: "", desejos: "Prioridades e projeção", cadastros: "Categorias e contas"};
    tabs.forEach(t => { const s = t.querySelector("small"); if (s) s.textContent = quem[t.dataset.aba]; });
    $id("tab-inv").hidden = !CARTEIRA && !comInvestimentos;
    // Aba Investimentos: os investimentos individuais de quem é o painel e, embaixo, a carteira conjunta do projeto
    $id("inv-pessoal-raiz").hidden = !comInvestimentos;
    $id("cj-raiz").hidden = !CARTEIRA;
    $id("tab-desejos").hidden = !comDesejos;
    if ($id("tab-caixinhas")) $id("tab-caixinhas").hidden = !COM_CAIXINHAS || !COM_MESES;
    $id("tab-cadastros").hidden = !aoEditarCategorias;
    document.querySelectorAll("[data-dono]").forEach(el => { el.textContent = DONO; });
    if (!COM_MESES) {
      $id("tab-geral").hidden = true;
      $id("tab-gastos").hidden = true;
      if (!CARTEIRA && !comInvestimentos && !comDesejos && !aoEditarCategorias) { barra.hidden = true; irPara("cartao", false); return; }
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
    irPara(ABAS.includes(pedida) ? pedida : lembrar("aba") || (COM_MESES ? "geral" : "cartao"), false);
  }

  // ---------- Relatórios das faturas (os PDFs podem ser guardados no quadro de PDFs, logo abaixo) ----------
  function renderRelatorios() {
    const P = PESSOAS[QUEM];
    const fat = Object.fromEntries(P.cartao.faturas.map(f => [f.mes, f]));
    const rels = [...P.relatorios].reverse();
    $id("relatorios").hidden = !rels.length; // sem relatório, o quadro não ocupa espaço
    if (!rels.length) return;
    $id("relatorios").innerHTML = `
      <h2>Relatórios das faturas</h2>
      ${P.cartaoNome ? `<p class="sub" style="margin:-4px 0 10px">Cartão ${esc(P.cartaoNome)}</p>` : ""}
      ${rels.length ? `<div class="reports">${rels.map(r => `<div class="report"><span>Relatório da fatura ${esc(r.mes)}${fat[r.mes] ? ` <span class="muted">· vence ${dataLonga(fat[r.mes].vencimento)}</span>` : ""}</span><span class="num">${fat[r.mes] ? brl(fat[r.mes].total) : ""}</span></div>`).join("")}</div>`
        : '<p class="muted" style="margin:0">Nenhum relatório ainda.</p>'}
      <p class="sub" style="margin:10px 0 0">Os PDFs das faturas e dos relatórios ficam no quadro abaixo. As faturas do Nubank são lidas pelo próprio site (botão Processar); as dos outros cartões continuam no projeto Financeiro${linkClaude ? `: <a href="${esc(linkClaude)}" target="_blank" rel="noopener">abrir no Claude</a>` : ""}.</p>`;
  }

  function rodape() {
    // A data da última atualização fica uma só, no topo da página
    $id("rodape").textContent = "";
    $id("rodape").hidden = true;
  }

  // Números de um mês, para a visão do casal: as receitas, cada parte do que sai e o saldo, como no cálculo do painel
  // Resumo do mês pelo caixa (visão do casal)
  function resumo(chave) {
    const cx = caixa(chave);
    const tipo = t => sum(cx.saidas.filter(x => x.tipo === t), x => x.valor);
    return {receitas: cx.ent.realizado + cx.ent.previsto, entradas: cx.entradas.map(e => ({desc: e.desc, liquido: e.valor, site: !!(e.r && e.r.origem === "site"), previsto: e.st === "previsto"})),
      investimento: tipo("investimento"), investimentoNome: nomeInvDoMes(chave), cartao: tipo("fatura"), fatura: rotuloDe(chave),
      fora: tipo("dia"), fixosFora: tipo("fixo"), caixinhas: tipo("caixinha"), saldo: cx.saldoMes, aporte: aporteDoMes(chave)};
  }
  // Detalhe do mês para a visão do casal: cada entrada, cada gasto pago no mês (uma linha por parte do lançamento
  // dividido, com a categoria, a subcategoria, o essencial e a conta) e cada saída do caixa
  function detalhe(chave) {
    const cx = caixa(chave);
    const g = gastosDoMes(chave);
    const daRef = (i, campo) => (i[campo] !== undefined ? i[campo] : i.ref && !ehAjuste(i.ref) ? ef(i.ref)[campo] : null);
    return {
      entradas: cx.entradas.map(e => ({desc: e.desc, valor: e.valor, data: e.data || null, previsto: e.st === "previsto", ref: e.ref || null,
        conta: (e.r && e.r.conta) || "pessoal", tipo: e.r && (e.r.fonte === "Empresa" || e.r.bruto != null) ? "Salário" : "Outro recebimento",
        origem: e.prevista ? "repete todo mês" : e.r && e.r.origem === "site" ? "lançada no site" : e.r ? "projeto Financeiro" : "previsão"})),
      gastos: g.itens.map(i => ({desc: i.desc, valor: i.valor, cat: i.cat, sub: i.sub || null, grupo: i.grupo, data: i.data || null,
        conta: daRef(i, "conta") || "pessoal", essencial: daRef(i, "essencial"), parte: i.parte || null, parcela: typeof i.parcela === "string" ? i.parcela : null})),
      saidas: cx.saidas.map(x => ({tipo: x.tipo, desc: x.desc, valor: x.valor, data: x.data || null, previsto: x.st === "previsto" || !!x.aPagar, aPagar: !!x.aPagar, meta: !!x.meta})),
      fatura: g.fatura ? {rotulo: g.fatura.rotulo, valor: g.fatura.valor, situacao: g.fatura.situacao, venc: g.fatura.venc || null} : null,
      ent: {...cx.ent}, sai: {...cx.sai}, inicial: cx.inicial, fim: cx.fim, totalGastos: g.total,
    };
  }
  // Caixinhas no mês atual: a conta de cada uma, quanto cabe a cada pessoa no "por mês" e quanto cada uma já guardou
  function estadoCaixinhas() {
    const contas = contasCx(), movs = movimentosCx();
    const outroId = PARCEIRO && PARCEIRO.id ? PARCEIRO.id : null;
    const ids = [PERFIL_ID, ...(outroId ? [outroId] : [])];
    const renda = {[PERFIL_ID]: receitasDoMes(hojeKey), ...(outroId ? {[outroId]: rendaOutro(hojeKey)} : {})};
    const ativas = CXS.filter(cx => cx.ativa !== false).sort((a, b) => String(a.data_alvo).localeCompare(String(b.data_alvo)));
    const linhas = ativas.map(cx => {
      const conta = contas.get(cx.id);
      const porPessoa = {}, feitoPessoa = {};
      for (const id of ids) {
        const outro = ids.find(x => x !== id);
        porPessoa[id] = Math.round(conta.porMes * parteDe(cx, id, renda[id], outro ? renda[outro] : null) * 100) / 100;
        feitoPessoa[id] = Math.round(sum(movs.filter(x => x.caixinha_id === cx.id && x.deposito && x.perfil_id === id && x.data.slice(0, 7) === hojeKey), x => x.valor) * 100) / 100;
      }
      return {cx, conta, porPessoa, feitoPessoa};
    });
    return {linhas, arquivadas: CXS.filter(cx => cx.ativa === false), mes: hojeKey, pagos: PAGOS_CX};
  }
  // Só os números, sem desenhar nada na página (visão do casal)
  // Gastos lançados no site marcados como a pagar com a data até hoje (vencidos ou para hoje)
  const aPagarVencidos = () => D.meses.flatMap(m => m.lancamentos).filter(l => aPagar(l) && l.data && l.data <= hojeIso);
  // A outra pessoa do casal (o painel dela só para cálculo): renda do mês (divisão das caixinhas), gastos ligados às
  // caixinhas e o aporte do mês (previsto × feito)
  function definirParceiroBase(p) {
    PARCEIRO = p;
    MOV_OUTRO = p && p.gastos ? movimentosDe(p.gastos, p.id) : [];
    memoCx = null;
    memoCaixa.clear();
  }
  if (somenteCalculo) return {meses: () => D.meses.map(m => ({chave: m.chave, rotulo: m.rotulo})), resumo, detalhe, investimentos: D.investimentos || null, pendentes, aPagarVencidos,
    aporteDoMes, receitasDoMes, estadoCaixinhas, definirParceiro: definirParceiroBase, metas: {investimento_mensal: INV || 0, investimento_nome: INV_NOME || "", cartao_mensal: META}};

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
    // No painel só de faturas, a fatura aberta e a linha do tempo aparecem quando há prévia importada do app
    const soCartao = QUEM !== "dono" || (SO_FATURAS && !PREVIAS.length);
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
    memoCaixa.clear();
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
    seguro("g-termometro", () => renderTermometro(atual));
    seguro("hero", () => renderHero(atual));
    if (MOV && $id("dlg-mov") && $id("dlg-mov").open) seguro(null, renderMov);
    seguro("gastos-mes", () => renderGastosMes(atual));
    seguro("compras-mes", () => renderComprasMes(atual));
    seguro("comparativo", () => renderComparativo(atual));
    seguro("recorrentes", () => renderRecorrentes(atual, c));
    seguro("atalhos", () => renderAtalhos(atual, c));
  }
  if (!COM_MESES) seguro("rodape", rodape);
  else seguro(null, render);
  mostrarQuem();
  // Fluxo de caixa da visão geral: apagar e lançar entradas, como é cada recebimento e o saldo do início do mês
  const numeroDigitado = t => { const v = String(t || "").replace(/\s|R\$/g, ""); return v ? Number(/,\d{1,2}$/.test(v) ? v.replace(/\./g, "").replace(",", ".") : v.replace(/,/g, "")) : NaN; };
  async function salvarSaldo(chave, valor, form) {
    const botoes = form ? [...form.querySelectorAll("button")] : [];
    botoes.forEach(b => { b.disabled = true; });
    try { await aoSalvarSaldo(chave, valor); }
    catch (err) { const p = form && form.querySelector(".erro"); if (p) { p.textContent = "Não foi possível salvar: " + err.message; p.hidden = false; } }
    finally { botoes.forEach(b => { b.disabled = false; }); }
  }
  $id("hero").addEventListener("click", e => {
    const apagar = e.target.closest("[data-apagar-entrada]");
    if (apagar && aoApagarEntrada) aoApagarEntrada(apagar.dataset.apagarEntrada);
    if (e.target.closest("[data-lancar-entrada]") && aoLancarEntrada) aoLancarEntrada();
    if (e.target.closest("[data-editar-metas]") && aoEditarMetas) aoEditarMetas();
    if (e.target.closest("[data-ir-caixinhas]")) irPara("caixinhas", true);
    const tirar = e.target.closest("[data-apagar-saldo]");
    if (tirar && aoSalvarSaldo) { const f = tirar.closest("[data-saldo-form]"); salvarSaldo(f.dataset.saldoForm, null, f); }
  });
  $id("hero").addEventListener("change", e => {
    if (!aoMudarRecebimento) return;
    if (e.target.matches("[data-recebimento]")) aoMudarRecebimento(e.target.dataset.recebimento, {recebimento: e.target.value});
    if (e.target.matches("[data-repete]")) aoMudarRecebimento(e.target.dataset.repete, {repete: e.target.checked});
  });
  $id("hero").addEventListener("submit", e => {
    const f = e.target.closest("[data-saldo-form]");
    if (!f || !aoSalvarSaldo) return;
    e.preventDefault();
    const v = numeroDigitado(f.elements.saldo.value);
    if (!Number.isFinite(v)) { f.elements.saldo.focus(); return; }
    salvarSaldo(f.dataset.saldoForm, v, f);
  });

  // Entrada prevista dada como recebida, editar entrada e a janela das entradas e saídas
  const receberEntrada = (e, chave) => { if (aoReceberEntrada && e) aoReceberEntrada(modeloEntrada(e, chave)); };
  const editarEntrada = (e, chave) => {
    if (!aoEditarEntrada || !e) return;
    const r = e.r || {};
    if (r.origem === "site" && r.id && !e.prevista) aoEditarEntrada(r.id, null);
    else aoEditarEntrada(null, modeloEntrada(e, chave).entrada);
  };
  $id("hero").addEventListener("click", e => {
    const rec = e.target.closest("[data-receber-ent]");
    if (rec) receberEntrada(HERO_ENT[Number(rec.dataset.receberEnt)], atual.chave);
    const ed = e.target.closest("[data-editar-ent]");
    if (ed) editarEntrada(HERO_ENT[Number(ed.dataset.editarEnt)], atual.chave);
    const ab = e.target.closest("[data-abrir-mov]");
    if (ab) abrirMov(ab.dataset.abrirMov === "investimento" ? "saidas" : ab.dataset.abrirMov, ab.dataset.abrirMov === "investimento" ? "investimento" : null);
  });
  // Dois cliques numa linha do balanço abrem a janela do grupo (menos nos campos e botões da linha)
  $id("hero").addEventListener("dblclick", e => {
    if (e.target.closest("button, a, input, select, label, summary, form")) return;
    const tr = e.target.closest("[data-mov]");
    if (!tr) return;
    const g = tr.dataset.mov;
    window.getSelection && window.getSelection().removeAllRanges();
    abrirMov(g === "investimento" ? "saidas" : g, g === "investimento" ? "investimento" : null);
  });
  $id("g-termometro").addEventListener("click", e => { const b = e.target.closest("[data-abrir-mov]"); if (b) abrirMov(b.dataset.abrirMov); });
  const DLG_MOV = $id("dlg-mov");
  if (DLG_MOV) DLG_MOV.addEventListener("click", e => {
    const f = e.target.closest("[data-mov-filtro]");
    if (f && MOV) { MOV.filtro = f.dataset.movFiltro; seguro(null, renderMov); const nb = DLG_MOV.querySelector(`[data-mov-filtro="${f.dataset.movFiltro}"]`); if (nb) nb.focus(); return; }
    if (e.target.closest("[data-mov-lancar]")) { if (MOV.tipo === "entradas" ? aoLancarEntrada : aoLancarGasto) (MOV.tipo === "entradas" ? aoLancarEntrada : aoLancarGasto)(); return; }
    const b = e.target.closest("[data-mov-acao]");
    if (!b) return;
    const it = MOV_ITENS[Number(b.dataset.i)];
    if (!it) return;
    const chave = MOV.chave, acao = b.dataset.movAcao;
    if (it.tipo === "entrada") {
      const r = it.e.r || {};
      if (acao === "receber") receberEntrada(it.e, chave);
      else if (acao === "editar-ent") editarEntrada(it.e, chave);
      else if (acao === "apagar-ent" && aoApagarEntrada) aoApagarEntrada(r.id);
      return;
    }
    const s = it.s;
    if (acao === "ver-fatura") { DLG_MOV.close(); irPara("cartao", true); return; }
    if (acao === "pagar" && aoPagarGasto) aoPagarGasto(s.l.id);
    else if (acao === "editar-gasto" && aoEditarGasto) aoEditarGasto(s.l.id);
    else if (acao === "classificar" && aoClassificar) aoClassificar(paraClassificar(s.l, "gasto"));
    else if (acao === "metas" && aoEditarMetas) aoEditarMetas();
    else if (acao === "rec-pagar" && aoPagarRecorrente) {
      const r = s.r;
      aoPagarRecorrente({chave: `${r.chave}|${chave}`, nome: r.parcela ? `${nomeSemParcela(r.nome)} ${r.parcela.k}/${r.parcela.n}` : r.nome, valor: r.valor, data: dataDoPagamento(r, chave), forma: r.formaSite || formaDoProjeto(r.forma),
        categoria: r.categoria || null, subcategoria: r.subcategoria || null, conta: r.conta || null, mes: chave, rotulo: rotuloDe(chave)});
    } else if (acao === "rec-editar" && aoEditarRecorrente) {
      const r = s.r;
      if (r.site) aoEditarRecorrente(r.id);
      else aoEditarRecorrente(null, {chave: r.chave, nome: r.nome, valor: r.valor, dia: r.dia || null, forma: formaDoProjeto(r.forma),
        categoria: r.categoria || null, subcategoria: r.subcategoria || null, busca: r.busca || [], variavel: !!r.variavel});
    }
  });

  // Pagamentos recorrentes: marcar e desmarcar como pago, valor do mês, editar e novo
  const REC_BOX = $id("recorrentes");
  REC_BOX.addEventListener("change", e => {
    const r = REC_TELA.lista[Number((e.target.dataset || {}).recPago ?? (e.target.dataset || {}).recValor)];
    if (!r) return;
    const mes = REC_TELA.mes;
    if (e.target.matches("[data-rec-pago]")) {
      e.target.checked = !e.target.checked; // a marca muda quando o gasto for lançado ou apagado
      if (r.pago) { if (aoDesmarcarRecorrente) aoDesmarcarRecorrente(r.pago.id, r.nome); }
      else aoPagarRecorrente({chave: `${r.chave}|${mes}`, nome: r.parcela ? `${nomeSemParcela(r.nome)} ${r.parcela.k}/${r.parcela.n}` : r.nome, valor: r.valor, data: dataDoPagamento(r, mes), forma: r.formaSite || formaDoProjeto(r.forma),
        categoria: r.categoria || null, subcategoria: r.subcategoria || null, conta: r.conta || null, mes, rotulo: rotuloDe(mes)});
    } else if (e.target.matches("[data-rec-valor]") && aoValorRecorrente) {
      const t = e.target.value.trim(), v = numeroDigitado(t);
      if (t && !(v > 0)) { e.target.focus(); return; }
      Promise.resolve(aoValorRecorrente(r.id, mes, t ? Math.round(v * 100) / 100 : null)).catch(err => {
        const p = $id("recorrentes").querySelector(".erro");
        p.textContent = "Não foi possível salvar o valor: " + err.message;
        p.hidden = false;
      });
    }
  });
  REC_BOX.addEventListener("click", e => {
    const ed = e.target.closest("[data-rec-editar]");
    if (ed && aoEditarRecorrente) aoEditarRecorrente(ed.dataset.recEditar);
    // Fixo do projeto Financeiro: ao editar, vira um recorrente do site (o do projeto fica oculto)
    const ep = e.target.closest("[data-rec-editar-p]");
    const rp = ep && REC_TELA.lista[Number(ep.dataset.recEditarP)];
    if (rp && aoEditarRecorrente) aoEditarRecorrente(null, {chave: rp.chave, nome: rp.nome, valor: rp.valor, dia: rp.dia || null, forma: formaDoProjeto(rp.forma),
      categoria: rp.categoria || null, subcategoria: rp.subcategoria || null, busca: rp.busca || [], variavel: !!rp.variavel});
    if (e.target.closest("[data-editar-metas]") && aoEditarMetas) aoEditarMetas();
    if (e.target.closest("[data-rec-novo]") && aoEditarRecorrente) aoEditarRecorrente(null);
  });
  REC_BOX.addEventListener("keydown", e => { if (e.key === "Enter" && e.target.matches("[data-rec-valor]")) { e.preventDefault(); e.target.blur(); } });

  // Gastos do mês: categorias e subcategorias abertas, e o botão de expandir ou recolher tudo
  const GM_BOX = $id("gastos-mes");
  GM_BOX.addEventListener("toggle", e => {
    const d = e.target;
    if (!d.dataset || d.dataset.gm == null) return;
    if (d.open) GM_ABERTAS.add(d.dataset.gm); else GM_ABERTAS.delete(d.dataset.gm);
  }, true);
  // Editar um lançamento da lista (categoria, subcategoria, essencial, conta e observação)
  const editarDaLista = (lista, idx) => {
    const i = lista[Number(idx)];
    if (!i || !i.ref || !aoClassificar) return;
    GM_FOCO = i.ref.chave || null;
    aoClassificar(paraClassificar(i.ref, i.tipo));
  };
  const CM_BOX = $id("compras-mes");
  CM_BOX.addEventListener("toggle", e => { if (e.target.matches && e.target.matches("[data-cm-todas]")) CM_ABERTA = e.target.open; }, true);
  CM_BOX.addEventListener("click", e => { const b = e.target.closest("[data-classificar-cm]"); if (b) editarDaLista(CM_ITENS, b.dataset.classificarCm); });
  GM_BOX.addEventListener("click", e => {
    const ed = e.target.closest("[data-classificar-gm]");
    if (ed) { editarDaLista(GM_ITENS, ed.dataset.classificarGm); return; }
    const b = e.target.closest("[data-gm-tudo]");
    if (!b) return;
    const abrir = [...GM_BOX.querySelectorAll("details.gm-cat")].some(d => !d.open);
    GM_BOX.querySelectorAll("details.gm-cat, details.gm-sub").forEach(d => { d.open = abrir; });
    b.textContent = abrir ? "Recolher tudo" : "Expandir tudo";
  });

  // Filtros das listas e o botão da lista de categorias
  ["g-fcat", "g-fforma", "g-fconta", "g-fconf"].forEach(id => $id(id).addEventListener("change", () => seguro("g-itens", () => renderGastosLista(atual))));
  document.querySelectorAll("[data-editar-categorias]").forEach(b => {
    b.hidden = !aoEditarCategorias;
    b.onclick = () => aoEditarCategorias();
  });
  $id("g-busca").addEventListener("input", () => seguro("g-itens", () => renderGastosLista(atual)));
  $id("f-fmes").addEventListener("change", () => seguro("f-itens", renderFaturaLanc));
  $id("f-fcat").addEventListener("change", () => seguro("f-itens", renderFaturaLista));
  $id("f-busca").addEventListener("input", () => seguro("f-itens", renderFaturaLista));

  // ---------- Investimentos ----------
  function desenharCarteira() {
    if (!CARTEIRA) return;
    try {
      // Aporte previsto de cada um: o plano de aportes (Cadastros) no mês atual; sem plano, a previsão do mês de cada
      // painel; sem ela, o da carteira do projeto
      const previstos = {...(CARTEIRA.aportes_mensais || {})};
      const kDono = TEM_NOME ? chaveNomeIgual(previstos, DONO) : null;
      if (kDono && INV > 0 && !INV_DA_CARTEIRA) previstos[kDono] = INV;
      const kOutro = outroAporte && outroAporte.nome ? chaveNomeIgual(previstos, outroAporte.nome) : null;
      if (kOutro && outroAporte.valor != null && outroAporte.valor !== "") previstos[kOutro] = Number(outroAporte.valor) || 0;
      // Degraus do plano de cada pessoa do casal, pela chave do nome na carteira (quem tem plano e não está na carteira entra)
      const porChave = {}, feitos = {};
      const todos = (PLANO_CASAL && PLANO_CASAL.degraus) || PLANO;
      for (const p of (PLANO_CASAL && PLANO_CASAL.pessoas) || []) {
        const meus = todos.filter(d => d.perfil_id === p.id);
        const k = chaveNomeIgual(previstos, p.nome) || (meus.length ? p.nome : null);
        if (!k) continue;
        if (meus.length) {
          porChave[k] = meus;
          if (hojeKey >= primeiroMes(meus)) previstos[k] = vigenteNoMes(meus, hojeKey).total;
          else if (previstos[k] == null) previstos[k] = 0;
        }
        // Feito no mês: o lançado no painel de cada um (o da outra pessoa quando o painel dela já carregou)
        const ehDono = semAcento(p.nome) === semAcento(DONO);
        const a = ehDono ? aporteDoMes(hojeKey) : PARCEIRO && semAcento(PARCEIRO.nome) === semAcento(p.nome) ? PARCEIRO.aporte(hojeKey) : null;
        if (a) feitos[k] = {feito: a.feito, previsto: previstos[k] != null ? Number(previstos[k]) : a.previsto};
      }
      // Aportes lançados no caixa deste painel (categoria Investimentos) desde o início dos aportes da carteira
      const desde = CARTEIRA.aporte_inicio || "0000-00";
      const lancados = D.meses.flatMap(m => m.lancamentos).filter(l => ehInvestimento(l) && String(l.data || "").slice(0, 7) >= desde)
        .map(l => ({data: l.data, quem: DONO, valor: l.valor, desc: l.desc})).sort((a, b) => String(a.data).localeCompare(String(b.data)));
      desenharInvestimentos(CARTEIRA, {previstos, lancados, atual: investimentosCasal, dono: DONO, hojeKey, plano: porChave, feitos});
    } catch (e) {
      console.error(e);
      $id("cj-app").innerHTML = `<p class="muted">A carteira de investimentos não carregou (${esc(e.message)}).</p>`;
    }
  }
  desenharCarteira();

  avisarPendencias();
  return {
    pendentes,
    aPagarVencidos,
    // Leva a visão geral (e as abas com mês) para um mês: depois de lançar uma entrada ou um gasto em outro mês
    mostrarMes(chave) {
      const m = D.meses.find(x => x.chave === chave);
      if (!m || m === atual) return;
      atual = m;
      guardar("mes", m.chave);
      if (COM_MESES) seguro(null, render);
    },
    atualizarGastos(lista) {
      GASTOS_SITE = lista;
      mesclarSite();
      avisarPendencias();
      desenharCarteira(); // aportes lançados e previsto × feito
      if (!COM_MESES) return;
      seguro(null, render);
      seguro("parcelas", renderParcelas);
    },
    atualizarEntradas(lista) {
      ENTRADAS_SITE = lista;
      mesclarSite();
      if (COM_MESES) seguro(null, render);
    },
    // Depois de classificar um lançamento ou de mudar a lista de categorias
    atualizarClassificacao({ajustes: novos, categorias: c, contas: cs} = {}) {
      if (novos) AJ = new Map(novos.map(a => [a.chave, a]));
      if (c) CATS = c;
      if (cs) CONTAS = cs;
      avisarPendencias();
      if (COM_MESES) seguro(null, render);
      mostrarQuem();
      if (novos) desenharCarteira(); // um lançamento que passou a ser (ou deixou de ser) investimento
    },
    // Depois de cadastrar, mudar ou apagar um pagamento recorrente
    atualizarRecorrentes(lista) {
      REC_SITE = lista || [];
      if (COM_MESES) seguro(null, render);
    },
    // Depois de informar ou apagar o saldo do início de um mês
    atualizarCaixa(c) {
      SALDOS = {...((c && c.saldos) || {})};
      APAGAR = new Set((c && c.aPagar) || []);
      OCULTOS = new Set((c && c.fixosOcultos) || []);
      lerMetas(c);
      memoCaixa.clear();
      if (COM_MESES) seguro(null, render);
    },
    // Depois de mudar o plano de aportes (Cadastros): degraus de quem é o painel e os do casal
    atualizarPlano(degrausDono, casal = null) {
      PLANO = Array.isArray(degrausDono) ? degrausDono : [];
      if (casal) PLANO_CASAL = casal;
      memoCaixa.clear();
      if (COM_MESES) seguro(null, render);
      desenharCarteira();
    },
    // O painel da outra pessoa do casal carregou (só cálculo): o "feito" do mês dela entra no previsto × feito
    definirParceiro(p) {
      definirParceiroBase(p);
      if (COM_MESES) seguro(null, render);
      desenharCarteira();
    },
    // Depois de criar, mudar, arquivar ou atualizar o saldo de uma caixinha
    atualizarCaixinhas(lista) {
      CXS = Array.isArray(lista) ? lista : [];
      memoCx = null;
      memoCaixa.clear();
      if (COM_MESES) seguro(null, render);
    },
    estadoCaixinhas,
    receitasDoMes,
    resumo,
    detalhe,
    aporteDoMes,
    // Para a lista de desejos: previsão dos próximos meses (com as receitas do projeto ou as lançadas no site)
    previsao: n => (SO_FATURAS && !(ENTRADAS_SITE || []).length ? [] : previsaoMeses(n)),
    mediaForaCartao: () => (COM_MESES ? mediaForaCartao() : 0),
    mediaForaCartaoInfo: () => (COM_MESES ? mediaForaCartaoInfo() : {media: null, meses: [], parcial: false}),
    get meta() { return META; },
    // Previsões do mês em uso (as do projeto ou as alteradas em Cadastros) e os fixos do projeto que continuam valendo
    get metas() { return {investimento_mensal: INV || null, investimento_nome: INV_NOME, cartao_mensal: META}; },
    fixosDoProjeto: () => D.recorrentes.filter(r => !OCULTOS.has(chaveRec(r))).map(r => ({chave: chaveRec(r), nome: r.nome, valor: r.valor != null ? Number(r.valor) : null,
      dia: Number(r.dia) || null, forma: formaDoProjeto(r.forma), categoria: r.categoria || null, subcategoria: r.subcategoria || null, busca: r.busca || [], variavel: !!r.variavel})),
  };
}

// Carteira de investimentos: posição, distribuição, projeção interativa e análise (adaptado do painel da carteira)
// extras: previstos (aporte mensal previsto de cada um), lancados (aportes lançados no caixa deste painel), atual (a soma
// dos investimentos conjuntos cadastrados um a um, a fonte do valor da carteira quando existe) e o nome do dono
// plano: degraus do plano de aportes de cada pessoa (pela chave do nome); feitos: previsto × feito do mês de cada uma
function desenharInvestimentos(D, { previstos = null, lancados = [], atual = null, dono = "", hojeKey = "", plano = {}, feitos = {} } = {}) {
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
  // Taxa padrão da projeção: conservadora (11% ao ano), mesmo quando o ano corrente rendeu mais
  const TAXA_PADRAO = Math.min(11, Number(PJ.taxa_anual_padrao) || 11);
  const cores = ['var(--c1)','var(--c2)','var(--c3)','var(--c4)','var(--c5)'];
  const A = D.analise || null;
  const AP = previstos || D.aportes_mensais || {};
  const pessoas = Object.keys(AP);
  const aporteMes = pessoas.reduce((s,k)=>s+(Number(AP[k])||0),0);
  const aportes = [...(D.aportes || []).map(a => ({...a, origem: 'projeto'})), ...lancados.map(a => ({...a, origem: 'caixa'}))].sort((a,b)=>String(a.data).localeCompare(String(b.data)));
  const totApor = aportes.reduce((s,a)=>s+a.valor,0);
  // Valor da carteira: a soma dos investimentos conjuntos cadastrados um a um (atualizada todo mês) ou, sem eles, a foto do projeto
  const usaAtual = !!(atual && atual.total > 0);
  const TOTAL = usaAtual ? atual.total : P.total;
  const dataValor = usaAtual ? (atual.data || `${atual.mes}-01`) : P.data;
  const dias = Math.floor((Date.now() - new Date(dataValor + 'T12:00').getTime()) / 864e5);
  const somaClasses = P.classes.reduce((s,c)=>s+(Number(c.rend_ano)||0),0);
  const difRend = Math.round((Number(P.rendimento_ano||0) - somaClasses)*100)/100;
  const mesAtualK = hojeKey || new Date().toISOString().slice(0,7);
  const doMesLanc = lancados.filter(a => String(a.data).slice(0,7) === mesAtualK).reduce((s,a)=>s+a.valor,0);
  const kDono = pessoas.find(k => k.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase() === String(dono).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase());
  // Plano de aportes: quem tem degraus segue o valor vigente em cada m\u00eas da proje\u00e7\u00e3o
  const comPlano = pessoas.filter(k => Array.isArray(plano[k]) && plano[k].length);
  const somarK = (chave, k) => { const [a, m] = chave.split('-').map(Number); const t = a*12 + m - 1 + k; return `${Math.floor(t/12)}-${String(t%12+1).padStart(2,'0')}`; };
  const aporteDoPlano = (k, chave) => (chave >= primeiroMes(plano[k]) ? vigenteNoMes(plano[k], chave).total : Number(AP[k]) || 0);
  const mesTxt = c => esc(rotuloPlano(c));
  const linhaPlano = k => { const ls = mudancas(plano[k], plano[k][0].perfil_id, mesAtualK);
    return `<b>${esc(k)}</b>: ${brl(ls[0].total)} por m\u00eas${ls.slice(1).map(x => ` \u2192 ${brl(x.total)} a partir de ${mesTxt(x.mes)}`).join('')}`; };
  const pfs = pessoas.filter(k => feitos[k]);

  let h = `
  <header class="hero">
    <span class="eyebrow">${esc(D.instituicao)} · ${esc(D.titulares)}</span>
    <h1>Carteira conjunta</h1>
    <span class="total">${brl(TOTAL)}</span>
    <span class="note">${usaAtual ? `Soma dos ${atual.n} investimentos conjuntos cadastrados um a um, saldos de ${dt(dataValor)}` : `Posição de ${dt(P.data)}`}${dias > 15 ? ` <span class="velho">atualizado há ${dias} dias</span>` : ''}</span>
    ${usaAtual && Math.abs(TOTAL - P.total) > 0.005 ? `<span class="note">A foto do projeto Financeiro (${esc(P.fonte || '')}) era de ${brl(P.total)} em ${dt(P.data)}. As classes e a rentabilidade abaixo são dessa foto.</span>` : ''}
  </header>
  <section class="card">
    <div class="kpis">
      <div class="kpi"><span class="eyebrow">Rendimento 2026</span><b class="pos">${brl(P.rendimento_ano)}</b><span class="note">${esc(P.rendimento_periodo)}</span></div>
      <div class="kpi"><span class="eyebrow">Rentabilidade</span><b class="pos">${pct(P.rentab_ano_pct)}</b><span class="note">no ano</span></div>
      <div class="kpi"><span class="eyebrow">% do CDI</span><b>${pct(P.pct_cdi_ano)}</b><span class="note">bruto de IR</span></div>
    </div>
    ${Math.abs(difRend) > 1 ? `<p class="aviso-cj"><b>Os números não batem:</b> o rendimento do ano é ${brl(P.rendimento_ano)}, mas a soma por classe é ${brl(somaClasses)} (diferença de ${brl(Math.abs(difRend))}). Confira no app do banco; o app às vezes mostra o rendimento de períodos diferentes.</p>` : ''}
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
    <p class="note">Parte de ${brl(TOTAL)}, juros sobre juros, aporte no fim de cada mês. O padrão é conservador: ${fmtBR(TAXA_PADRAO,1)}% ao ano, líquido de IR e em dinheiro de hoje. Em 2026 a carteira rendeu ${esc(PJ.taxa_origem)}, um ano de juros altos.</p>
    ${comPlano.length ? `<div class="cj-plano">
      <label><input type="checkbox" id="cj-plano" checked> Seguir o plano de aportes (os valores mudam nas datas cadastradas)</label>
      <p class="note">${comPlano.map(linhaPlano).join(' · ')}. Desmarque para simular um valor fixo por mês.</p>
    </div>` : ''}
    <div class="controls">
      ${pessoas.map(k=>`<div class="field"><label for="cj-ap-${k}">Aporte mensal de ${esc(k)}</label><div class="money"><span>R$</span><input id="cj-ap-${k}" type="text" inputmode="decimal" autocomplete="off" value="${fmtBR(Number(AP[k])||0)}"></div></div>`).join('')}
      <div class="chips" role="group" aria-label="Aporte igual para os dois">
        ${[1500,1600,1800,2000,2500].map(v=>`<button type="button" class="chip" data-cada="${v}">${v.toLocaleString('pt-BR')} cada</button>`).join('')}
      </div>
      <div class="field"><label for="cj-taxa">Rendimento ao ano (%)</label><div class="money"><input id="cj-taxa" type="text" inputmode="decimal" autocomplete="off" value="${fmtBR(TAXA_PADRAO,1)}"><span>% a.a.</span></div></div>
      <div class="field"><label for="cj-infl">Inflação ao ano (%)</label><div class="money"><input id="cj-infl" type="text" inputmode="decimal" autocomplete="off" value="${fmtBR(PJ.inflacao_padrao,1)}"><span>% a.a.</span></div></div>
      <div class="chips" role="group" aria-label="Rendimento ao ano">
        ${[[8,''],[10,''],[11,'padrão'],[12,''],[PJ.taxa_anual_padrao,'igual a 2026']].map(([v,l])=>`<button type="button" class="chip" data-taxa="${v}">${fmtBR(v)}%${l?' ('+l+')':''}</button>`).join('')}
      </div>
      <div class="toggles">
        <label><input type="checkbox" id="cj-ir" checked> Descontar imposto de renda</label>
        <label><input type="checkbox" id="cj-real" checked> Mostrar em dinheiro de hoje</label>
      </div>
    </div>
    <p class="headline" id="cj-headline" aria-live="polite"></p>
    <div class="legend" id="cj-legend"></div>
    <div class="chartbox"><svg id="cj-chart" role="img" aria-label=""></svg><div class="tip" id="cj-tip" hidden></div></div>
    <div class="scroll"><table><thead><tr><th>Prazo</th><th>Saldo de hoje R$</th><th>Aportes R$</th><th>Juros R$</th><th>Saldo R$</th></tr></thead><tbody id="cj-tabproj"></tbody></table></div>
    <p class="note" id="cj-projnota"></p>
  </section>

  <section class="card">
    <h2>Aportes</h2>
    <p>Previsto em ${mesTxt(mesAtualK)}: ${pessoas.map(k=>`<b class="num">${brl(Number(AP[k])||0)}</b> de ${esc(k)}`).join(' e ')}, <b class="num">${brl(aporteMes)}</b> no total. <span class="note">${comPlano.length ? 'Vem do plano de aportes (Cadastros)' : 'A previsão de cada um vem das Previsões do mês (Cadastros) de cada painel'}${comPlano.length && comPlano.length < pessoas.length ? '; quem não tem plano segue as Previsões do mês' : ''}.</span></p>
    ${comPlano.length ? `<p class="note">Plano: ${comPlano.map(linhaPlano).join(' · ')}.</p>` : ''}
    ${pfs.length ? `<ul class="cj-feito">${pfs.map(k => { const f = feitos[k], ok = f.previsto > 0 && f.feito >= f.previsto - 0.005;
        return `<li class="${ok ? 'ok' : f.feito > 0 ? 'parcial' : ''}"><b>${esc(k)}</b>: ${esc(textoPrevistoFeito(f.feito, f.previsto))}</li>`; }).join('')}</ul>
      <p class="note">Previsto × feito em ${mesTxt(mesAtualK)}: o feito são os investimentos lançados no caixa de cada painel (categoria Investimentos).</p>`
    : kDono ? `<p>Em ${esc(mesAtualK.slice(5,7))}/${esc(mesAtualK.slice(0,4))}, ${esc(kDono)} lançou <b class="num">${brl(doMesLanc)}</b> em investimentos no caixa${Number(AP[kDono]) ? ` (previsto ${brl(Number(AP[kDono]))}${doMesLanc > Number(AP[kDono]) + 0.005 ? `, ${brl(doMesLanc - Number(AP[kDono]))} a mais` : doMesLanc < Number(AP[kDono]) - 0.005 ? `, faltam ${brl(Number(AP[kDono]) - doMesLanc)}` : ''})` : ''}.</p>` : ''}
    ${aportes.length ? `<div class="scroll"><table><thead><tr><th>Data</th><th>Quem</th><th>Lançamento</th><th>Valor</th></tr></thead><tbody>${aportes.map(a=>`<tr><td>${dt(a.data)}</td><td>${esc(a.quem)}</td><td>${esc(a.desc || (a.origem === 'projeto' ? 'projeto Financeiro' : ''))}</td><td class="num">${brl(a.valor)}</td></tr>`).join('')}<tr><td><b>Total</b></td><td></td><td></td><td class="num"><b>${brl(totApor)}</b></td></tr></tbody></table></div>
      <p class="note">Aportes lançados no caixa deste painel (categoria Investimentos)${D.aportes && D.aportes.length ? ' e os registrados no projeto Financeiro' : ''}. Os do outro painel aparecem lá e na visão do casal.</p>`
     : `<p class="note">Nenhum aporte lançado ainda. Lance a transferência para a carteira como gasto na categoria Investimentos: ela sai do caixa como investimento e aparece aqui.</p>`}
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
  // aporte: valor fixo por mês ou a lista do aporte de cada mês (índice 1 = primeiro mês), para seguir o plano de aportes
  function projetar(P0, aporte, taxaAnual, inflAnual, comIR, real){
    const apK = k => (Array.isArray(aporte) ? aporte[k] || 0 : aporte);
    const rm = Math.pow(1+taxaAnual/100, 1/12) - 1;
    const fi = Math.pow(1+inflAnual/100, 1/12);
    const g = Array.from({length:MESES+1}, (_,m)=>Math.pow(1+rm, m)); // fator de crescimento por idade
    const out = [];
    for(let m=0;m<=MESES;m++){
      // lote inicial (idade m) + aportes feitos nos meses 1..m (idade m-k)
      // o saldo atual já carrega G0 de rendimento ainda não tributado e tem IDADE0 meses de aplicação
      let bruto = P0*g[m], ir = comIR ? aliquota(m+IDADE0)*(P0*(g[m]-1) + G0) : 0;
      for(let k=1;k<=m;k++){ const age=m-k, a=apK(k); bruto += a*g[age]; if(comIR) ir += aliquota(age)*a*(g[age]-1); }
      // Em dinheiro de hoje, cada aporte é corrigido pela inflação até a data em que entrou.
      let colocado = P0;
      for(let k=1;k<=m;k++) colocado += real ? apK(k)/Math.pow(fi, k) : apK(k);
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
  const STORE = 'mz-fin-carteira-v2'; // v2: padrão conservador (11% ao ano, líquido de IR, em dinheiro de hoje)
  function carregar(){ try{ const s = JSON.parse(localStorage.getItem(STORE)||'null'); if(!s) return;
    pessoas.forEach(k=>{ if(s['ap-'+k]!=null) $('ap-'+k).value = s['ap-'+k]; });
    if($('plano') && s.plano === false) $('plano').checked = false;
    ['taxa','infl'].forEach(k=>{ if(s[k]!=null) $(k).value = s[k]; });
    ['ir','real'].forEach(k=>{ if(s[k]!=null) $(k).checked = s[k]; });
  }catch(e){} }
  function salvar(){ try{ const s={}; pessoas.forEach(k=>s['ap-'+k]=$('ap-'+k).value);
    s.taxa=$('taxa').value; s.infl=$('infl').value; s.ir=$('ir').checked; s.real=$('real').checked; if($('plano')) s.plano=$('plano').checked;
    localStorage.setItem(STORE, JSON.stringify(s)); }catch(e){} }

  let estado = null;
  function calcular(){
    // Seguindo o plano: quem tem degraus aporta o valor vigente em cada mês (o campo mostra o valor de agora)
    const segue = !!($('plano') && $('plano').checked);
    pessoas.forEach(k=>{ const el = $('ap-'+k), doPlano = segue && comPlano.includes(k);
      if(doPlano) el.value = fmtBR(aporteDoPlano(k, mesAtualK));
      el.disabled = doPlano; el.closest('.field').classList.toggle('do-plano', doPlano); });
    const aportes = pessoas.map(k=>num('ap-'+k, Number(AP[k])||0));
    const aporte = aportes.reduce((a,b)=>a+b,0);
    const porMes = segue ? Array.from({length:MESES+1}, (_,m)=>m ? pessoas.reduce((t,k,i)=>t + (comPlano.includes(k) ? aporteDoPlano(k, somarK(mesAtualK, m)) : aportes[i]), 0) : 0) : null;
    const base = PJ.aporte_base_por_pessoa*pessoas.length;
    const taxa = num('taxa', TAXA_PADRAO), infl = num('infl', PJ.inflacao_padrao), ir = $('ir').checked, real = $('real').checked;
    const serie = projetar(TOTAL, porMes || aporte, taxa, infl, ir, real);
    const serieBase = projetar(TOTAL, base, taxa, infl, ir, real);
    const final = porMes ? porMes[MESES] : aporte;
    estado = {aportes, aporte, base, taxa, infl, ir, real, serie, serieBase, segue, final, difere: segue ? true : Math.abs(aporte-base)>0.005};
    document.querySelectorAll('[data-cada]').forEach(b=>b.setAttribute('aria-pressed', !segue && aportes.every(v=>Math.abs(v-+b.dataset.cada)<0.005)));
    document.querySelectorAll('[data-taxa]').forEach(b=>b.setAttribute('aria-pressed', Math.abs(taxa-+b.dataset.taxa)<0.005));
    salvar(); textos(); tabela(); grafico();
  }

  function textos(){
    const e = estado, f = e.serie[MESES], anos = MESES/12;
    const qual = (e.ir?'líquidos de IR':'brutos') + (e.real?', em dinheiro de hoje':'');
    $('headline').innerHTML = (e.segue ? `Seguindo o plano de aportes (<b>${brl(e.aporte)}</b> por mês agora${Math.abs(e.final-e.aporte)>0.005 ? `, <b>${brl(e.final)}</b> depois do último degrau` : ''}), em ${anos} anos vocês teriam <b>${curto(f.saldo)}</b>. `
      : `Com <b>${brl(e.aporte)}</b> por mês somando os dois, em ${anos} anos vocês teriam <b>${curto(f.saldo)}</b>. `)
      + (f.juros>=0 ? `Desse total, <b>${curto(f.juros)}</b> seriam juros.` : `Isso é <b>${curto(-f.juros)}</b> a menos do que vocês colocaram, uma perda${e.real?' real':''}.`);
    const leg = [`<span><i style="background:var(--s-aporte)"></i>Vocês colocam</span>`,`<span><i style="background:var(--s-juros)"></i>Juros</span>`];
    if(e.difere) leg.push(`<span><i class="dash"></i>Com R$ ${PJ.aporte_base_por_pessoa.toLocaleString('pt-BR')} cada</span>`);
    $('legend').innerHTML = leg.join('');
    $('projnota').textContent = `Valores ${qual}. `
      + (e.ir?`IR de CDB e Tesouro pela tabela regressiva (22,5% a 15%) sobre o rendimento de cada aporte e sobre os ${brl(G0)} de rendimento que já estão no saldo, como se tudo fosse resgatado no fim do prazo. LCI e LCA seriam isentas. `:'Sem desconto de imposto de renda; marque a opção acima para ver o líquido. ')
      + (e.real?`Inflação de ${fmtBR(e.infl)}% ao ano descontada; ${e.segue ? 'os aportes seguem os degraus do plano, sem outro reajuste' : 'os aportes ficam fixos, sem reajuste'}. `:'')
      + (e.taxa>12 ? `Um rendimento de ${fmtBR(e.taxa)}% ao ano por 20 anos é otimista: reflete os juros altos de 2026. Teste 10% ou 12% para um cenário mais conservador.` : '');
  }

  const semRS = v => curto(v).replace('R$ ','');
  function tabela(){
    const e = estado;
    $('tabproj').innerHTML = PJ.horizontes_anos.map(a=>{
      const r = e.serie[a*12], b = e.serieBase[a*12];
      const dif = r.saldo - b.saldo;
      const sub = e.difere ? `<small>${dif>=0?'+':'−'}${curto(Math.abs(dif))} vs ${PJ.aporte_base_por_pessoa.toLocaleString('pt-BR')} cada</small>` : '';
      return `<tr><td>${a} ${a===1?'ano':'anos'}</td><td class="num">${semRS(TOTAL)}</td><td class="num">${semRS(r.colocado - TOTAL)}</td><td class="num ${r.juros<0?'neg':'pos'}">${semRS(r.juros)}</td><td class="num"><b>${semRS(r.saldo)}</b>${sub}</td></tr>`;
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
  document.querySelectorAll('[data-cada]').forEach(b=>b.addEventListener('click',()=>{ if($('plano')) $('plano').checked = false; pessoas.forEach(k=>$('ap-'+k).value=fmtBR(+b.dataset.cada)); calcular(); }));
  if($('plano')) $('plano').addEventListener('change', calcular);
  document.querySelectorAll('[data-taxa]').forEach(b=>b.addEventListener('click',()=>{ $('taxa').value=fmtBR(+b.dataset.taxa); calcular(); }));
  // Redesenha quando a largura muda (inclusive quando a aba fica visível depois de escondida).
  let rz, larg = 0;
  const redesenhar = () => { const w = $('chart').clientWidth; if(w && w!==larg){ larg = w; grafico(); } };
  if(window.ResizeObserver) new ResizeObserver(()=>{ clearTimeout(rz); rz=setTimeout(redesenhar, 60); }).observe($('chart'));
  else window.addEventListener('resize', ()=>{ clearTimeout(rz); rz=setTimeout(redesenhar, 120); });
  calcular();
}
