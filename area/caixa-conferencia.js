// Caixa das empresas: conferência com a planilha de controle paralelo (o "fluxo de caixa" em Excel). A planilha tem,
// numa aba, blocos lado a lado, um por acerto: "INICIAL" (o saldo no começo do bloco), "DESPESAS notinha" (cada valor
// com o tipo ao lado: "RDV V", "FC T", "Empréstimo"; e uma nota: o colaborador do empréstimo, o nº da ART...) e
// "SALDO ATUAL". Vale o último bloco (o mais à direita) da última aba que tem esse modelo. Os empréstimos são o que
// está com cada colaborador; o saldo atual é o disponível (o que deveria estar na conta), como no site.
// Procura os rótulos, não posições fixas. Nenhum nome de empresa ou de colaborador aqui: vêm do banco e da planilha.
import { nomeColaborador, resumoCaixa } from "./caixa-documentos.js";

const semAcento = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const centavos = (v) => Math.round(v * 100) / 100;
const ehTexto = (v) => typeof v === "string" && v.trim() !== "";
const PALAVRAS = new Set(["saldo", "inicial", "despesas", "vectra", "traxterra", "rdv", "pendente", "entregue", "atual", "total", "custo", "ficha", "emprestimo", "acerto"]);

// Colaborador de uma nota da planilha ("R", "rob", "Robson"): o conhecido (do site ou dos nomes escritos na planilha)
// que começa igual; sem nenhum, a própria nota
export function nomePorNota(nota, conhecidos = [], nomesPlanilha = []) {
  const n = semAcento(nota).replace(/[^a-z ]/g, "").trim();
  if (!n) return null;
  const casa = (nome) => { const x = semAcento(nome); const k = Math.min(n.length, 3); return x.slice(0, k) === n.slice(0, k) && (n.length <= 3 || x.startsWith(n.slice(0, 3))); };
  return conhecidos.find(casa) || nomesPlanilha.find(casa) || String(nota).trim();
}

function classificar(tipo) {
  const t = semAcento(tipo).replace(/\s+/g, " ");
  if (/^empr/.test(t)) return { tipo: "emprestimo" };
  const m = t.match(/^(rdv|fc|f de custo|ficha de custo)\s*([a-z])?$/);
  if (m) return { tipo: "despesa", classificacao: m[1] === "rdv" ? "rdv" : "fc", sigla: m[2] ? m[2].toUpperCase() : null };
  return { tipo: "despesa", classificacao: "outro", sigla: null };
}

// Lê o resumo do último bloco. planilha: o resultado de lerPlanilha. conhecidos: colaboradores já no site.
export function lerResumo(planilha, { conhecidos = [] } = {}) {
  const ehInicial = (c) => ehTexto(c.valor) && semAcento(c.valor) === "inicial";
  const aba = [...planilha.abas].reverse().find((a) => a.celulas.some(ehInicial));
  if (!aba) throw new Error("Não encontrei o resumo nesta planilha: falta uma aba com as colunas INICIAL, DESPESAS e SALDO ATUAL.");
  const inicio = aba.celulas.filter(ehInicial).sort((a, b) => b.coluna - a.coluna || a.linha - b.linha)[0];
  const naLinha = (re) => aba.celulas.filter((c) => c.linha === inicio.linha && c.coluna > inicio.coluna && ehTexto(c.valor) && re.test(semAcento(c.valor))).sort((a, b) => a.coluna - b.coluna)[0];
  const cDesp = naLinha(/^despesas/), cSaldo = naLinha(/^saldo atual/);
  if (!cDesp) throw new Error(`Na aba ${aba.nome}, não achei a coluna DESPESAS ao lado de INICIAL.`);
  const num = (l, c) => { const v = aba.valor(l, c); return typeof v === "number" && Number.isFinite(v) ? v : null; };
  const inicial = num(inicio.linha + 1, inicio.coluna);
  if (inicial == null) throw new Error(`Na aba ${aba.nome}, o valor abaixo de INICIAL não é um número.`);
  // Nomes escritos na planilha (para entender "R", "H" das notas dos empréstimos)
  const contagem = new Map();
  for (const c of aba.celulas) {
    if (!ehTexto(c.valor)) continue;
    const p = c.valor.trim();
    if (/^[A-ZÀ-Ú][a-zà-ú]{2,14}$/.test(p) && !PALAVRAS.has(semAcento(p))) contagem.set(p, (contagem.get(p) || 0) + 1);
  }
  const nomesPlanilha = [...contagem.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n);
  const itens = [];
  const ultima = Math.max(...aba.celulas.map((c) => c.linha));
  for (let l = inicio.linha + 2; l <= ultima; l++) {
    const v = num(l, cDesp.coluna);
    if (v == null || Math.abs(v) < 0.005) continue;
    const tipoTexto = aba.valor(l, cDesp.coluna + 1);
    const nota = aba.valor(l, cDesp.coluna + 2);
    const k = classificar(tipoTexto);
    const item = { linha: l, valor: centavos(v), tipoTexto: ehTexto(tipoTexto) ? tipoTexto.trim() : "", nota: nota == null ? "" : String(nota).trim(), ...k };
    if (k.tipo === "emprestimo") item.colaborador = nomePorNota(item.nota, conhecidos, nomesPlanilha);
    itens.push(item);
  }
  const total = centavos(itens.reduce((t, i) => t + i.valor, 0));
  const saldoPlanilha = cSaldo ? num(inicio.linha + 1, cSaldo.coluna) : null;
  const disponivel = centavos(inicial - total);
  const emprestimos = new Map();
  for (const i of itens.filter((x) => x.tipo === "emprestimo")) {
    const nome = nomeColaborador(i.colaborador || "?", [...emprestimos.keys()]);
    emprestimos.set(nome, centavos((emprestimos.get(nome) || 0) + i.valor));
  }
  const avisos = [];
  if (saldoPlanilha != null && Math.abs(saldoPlanilha - disponivel) > 0.01) avisos.push(`O SALDO ATUAL da planilha (${saldoPlanilha.toFixed(2)}) é diferente de INICIAL − DESPESAS (${disponivel.toFixed(2)}). Vale a conta.`);
  return {
    aba: aba.nome, linha: inicio.linha, coluna: inicio.coluna, inicial: centavos(inicial), itens, total, disponivel, saldoPlanilha,
    emprestimos: [...emprestimos.entries()].map(([nome, valor]) => ({ nome, valor })), totalEmprestimos: centavos([...emprestimos.values()].reduce((t, v) => t + v, 0)),
    nomesPlanilha, avisos,
  };
}

// Compara o resumo com o site. sig: sigla de cada empresa do caixa (Map id → "V"). Devolve as despesas da planilha que
// não estão no site, as do site que não estão na planilha, o empréstimo de cada colaborador e o disponível dos dois lados.
export function conferir(resumo, { config, movimentos, sig }) {
  const r = resumoCaixa(config, movimentos);
  const desde = (config && config.data_inicial) || null;
  const porSigla = new Map([...sig.entries()].map(([id, s]) => [s, id]));
  const doSite = movimentos.filter((m) => m.tipo === "despesa" && (!desde || m.data >= desde));
  const usados = new Set();
  const faltando = [];
  for (const i of resumo.itens.filter((x) => x.tipo === "despesa")) {
    const empresa_id = i.sigla ? porSigla.get(i.sigla) || null : null;
    const achado = doSite.find((m) => !usados.has(m.id) && Math.abs(Number(m.valor) - i.valor) < 0.005
      && (m.classificacao || "outro") === i.classificacao && (!empresa_id || m.empresa_id === empresa_id));
    if (achado) usados.add(achado.id);
    else faltando.push({ ...i, empresa_id });
  }
  const soNoSite = doSite.filter((m) => !usados.has(m.id));
  const nomes = [...new Set([...resumo.emprestimos.map((e) => e.nome), ...r.colaboradores.filter((p) => Math.abs(p.saldo) > 0.005).map((p) => p.nome)])];
  const colaboradores = nomes.map((nome) => {
    const p = r.colaboradores.find((x) => nomeColaborador(x.nome, [nome]) === nome || nomeColaborador(nome, [x.nome]) === x.nome);
    const planilha = (resumo.emprestimos.find((e) => e.nome === nome) || {}).valor || 0;
    const site = p ? p.saldo : 0;
    return { nome: p ? p.nome : nome, planilha, site, diferenca: centavos(planilha - site) };
  });
  return { resumoSite: r, faltando, soNoSite, colaboradores, disponivel: { planilha: resumo.disponivel, site: r.emCaixa, diferenca: centavos(resumo.disponivel - r.emCaixa) } };
}

// Movimentos que deixam o site igual à planilha: as despesas escolhidas, o acerto de cada colaborador e, por último, o
// ajuste do disponível (o que sobrar de diferença depois dos dois). hoje: a data dos lançamentos.
export function ajustes(resumo, c, { config, movimentos, despesas = [], colaboradores = true, disponivel = true, hoje, descricao = "Conferência com a planilha" }) {
  const novos = [];
  for (const d of despesas) {
    novos.push({ tipo: "despesa", classificacao: d.classificacao, empresa_id: d.empresa_id || null, valor: d.valor, data: hoje, aprovado: true, colaborador: null,
      descricao: `Da planilha${d.nota ? `: ${d.nota}` : ` (${d.tipoTexto || "despesa"})`}`.slice(0, 200), detalhes: { conferencia: true, aba: resumo.aba, linha: d.linha } });
  }
  if (colaboradores) {
    for (const p of c.colaboradores.filter((x) => Math.abs(x.diferenca) > 0.005)) {
      novos.push({ tipo: p.diferenca > 0 ? "adiantamento" : "devolucao", valor: Math.abs(p.diferenca), data: hoje, aprovado: true, colaborador: p.nome, classificacao: null, empresa_id: null,
        descricao: p.diferenca > 0 ? `Empréstimo pela planilha (${descricao.toLowerCase()})` : `Acerto pela planilha (${descricao.toLowerCase()})`, detalhes: { conferencia: true, aba: resumo.aba } });
    }
  }
  if (disponivel) {
    const depois = resumoCaixa(config, [...movimentos, ...novos.map((n, i) => ({ ...n, id: `novo-${i}` }))]);
    const dif = centavos(resumo.disponivel - depois.emCaixa);
    if (Math.abs(dif) > 0.005) {
      novos.push(dif > 0
        ? { tipo: "entrada", valor: dif, data: hoje, aprovado: true, classificacao: null, empresa_id: null, colaborador: null, descricao: `Ajuste do saldo disponível (${descricao.toLowerCase()})`, detalhes: { conferencia: true, ajuste: true, aba: resumo.aba } }
        : { tipo: "despesa", classificacao: "outro", valor: -dif, data: hoje, aprovado: true, empresa_id: null, colaborador: null, descricao: `Ajuste do saldo disponível (${descricao.toLowerCase()})`, detalhes: { conferencia: true, ajuste: true, aba: resumo.aba } });
    }
  }
  return novos;
}
