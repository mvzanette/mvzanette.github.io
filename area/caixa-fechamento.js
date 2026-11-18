// Caixa das empresas: o resumo do acerto (fechamento) que vai para o financeiro das empresas junto com as notinhas,
// e o lembrete do acerto (até o dia 20 de cada mês). O resumo é montado do sistema e depois pode ser alterado à mão
// (qualquer valor): o relatório sai do que estiver na tela. Separado por empresa e por tipo: RDV (relatório de
// despesas de viagem) e FC (ficha de custo), mais o pendente de acerto (o que está emprestado aos colaboradores).
// O estado do lembrete fica em caixa_config.acerto: { ultimo_acerto, meses: { "2026-11": { estado, adiar_ate, em } },
// historico: [{ inicio, fim, total, em }] }.
import { resumoCaixa } from "./caixa-documentos.js";

const centavos = (v) => Math.round((Number(v) || 0) * 100) / 100;
const somarDias = (iso, n) => { const d = new Date(`${iso}T12:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
export const DIA_ACERTO = 20; // até quando o acerto é feito no financeiro
export const DIAS_EMAIL = [17, 18, 19, 20]; // dias do lembrete no informativo por e-mail (o banco faz a mesma conta)
const NOMES_TIPO = { rdv: "RDV", fc: "Ficha de custo", outro: "Outras despesas" };
export const nomeTipo = (t) => NOMES_TIPO[t] || NOMES_TIPO.outro;

// Período do próximo acerto: do dia seguinte ao último acerto (ou do saldo inicial) até hoje
export function periodoAcerto(config, hoje) {
  const a = (config && config.acerto) || {};
  const desde = config && config.data_inicial;
  const depoisDoUltimo = a.ultimo_acerto ? somarDias(a.ultimo_acerto, 1) : null;
  const inicio = [desde, depoisDoUltimo].filter(Boolean).sort().at(-1) || hoje;
  return { inicio: inicio > hoje ? hoje : inicio, fim: hoje };
}

// Lembrete do acerto deste mês: { ativo, mes, estado, dia }. pagina: "caixa" (do dia 17 em diante) ou "inicio"
// (do dia 20 em diante, na janela de tarefas). "Lembrar amanhã" guarda adiar_ate; realizado e descartado encerram o mês.
export function lembreteAcerto(config, hoje, { desdeDia = DIA_ACERTO } = {}) {
  const mes = hoje.slice(0, 7), dia = Number(hoje.slice(8, 10));
  const m = (((config && config.acerto) || {}).meses || {})[mes] || {};
  const encerrado = m.estado === "realizado" || m.estado === "descartado";
  const adiado = m.adiar_ate && m.adiar_ate > hoje;
  const ativo = !!(config && (config.empresas || []).length) && dia >= desdeDia && !encerrado && !adiado;
  return { ativo, mes, dia, estado: m.estado || null, adiarAte: m.adiar_ate || null, atrasado: dia > DIA_ACERTO };
}

// Novo estado do acerto depois de uma escolha do menu: "amanha", "realizado" ou "descartar"
export function marcarAcerto(config, hoje, escolha, { fechamento = null } = {}) {
  const a = structuredClone((config && config.acerto) || {});
  const mes = hoje.slice(0, 7);
  a.meses = Object.fromEntries(Object.entries(a.meses || {}).sort().slice(-11)); // só o último ano
  if (escolha === "amanha") a.meses[mes] = { ...(a.meses[mes] || {}), adiar_ate: somarDias(hoje, 1) };
  else if (escolha === "descartar") a.meses[mes] = { ...(a.meses[mes] || {}), estado: "descartado", em: hoje };
  else if (escolha === "realizado") {
    a.meses[mes] = { ...(a.meses[mes] || {}), estado: "realizado", em: hoje };
    const ate = (fechamento && fechamento.fim) || hoje;
    if (!a.ultimo_acerto || ate > a.ultimo_acerto) a.ultimo_acerto = ate;
    if (fechamento) a.historico = [...(a.historico || []), { inicio: fechamento.inicio, fim: fechamento.fim, total: fechamento.total, em: hoje }].slice(-24);
  }
  return a;
}

// Resumo montado do sistema. empresas: as do caixa ({ id, nome }). Devolve os dados editáveis.
export function montarResumo(config, movimentos, empresas, { inicio, fim }) {
  const antes = resumoCaixa(config, movimentos.filter((m) => m.data < inicio));
  const ate = movimentos.filter((m) => m.data <= fim);
  const depois = resumoCaixa(config, ate);
  const doPeriodo = ate.filter((m) => m.data >= inicio && (!config.data_inicial || m.data >= config.data_inicial));
  const ultimaEmpresa = (empresas.at(-1) || {}).id || null;
  const empresaDoColab = (nome) => {
    const m = [...movimentos].filter((x) => x.colaborador === nome && x.empresa_id).sort((a, b) => b.data.localeCompare(a.data))[0];
    return m ? m.empresa_id : ultimaEmpresa;
  };
  return {
    inicio, fim,
    saldoInicial: antes.saldoEmpresas,
    entradas: centavos(doPeriodo.filter((m) => m.tipo === "entrada").reduce((t, m) => t + Number(m.valor), 0)),
    linhas: doPeriodo.filter((m) => m.tipo === "despesa" && m.aprovado).sort((a, b) => a.data.localeCompare(b.data))
      .map((m) => ({ classificacao: m.classificacao || "outro", empresa_id: m.empresa_id || null, data: m.data, descricao: m.descricao || "", colaborador: m.colaborador || "", valor: centavos(m.valor) })),
    pendentes: depois.colaboradores.filter((p) => p.saldo > 0.005).map((p) => ({ nome: p.nome, empresa_id: empresaDoColab(p.nome), valor: p.saldo })),
    aAprovar: doPeriodo.filter((m) => m.tipo === "despesa" && !m.aprovado).length,
    conta: config.saldo_conta == null ? null : centavos(config.saldo_conta),
    sistema: { saldoAtual: depois.saldoEmpresas, disponivel: depois.emCaixa },
  };
}

// Totais do resumo (como estiver, depois das alterações)
export function totaisResumo(r, empresas) {
  const porEmpresa = [...empresas, { id: null, nome: "Sem empresa" }].map((e) => {
    const das = (t) => centavos(r.linhas.filter((l) => (l.empresa_id || null) === e.id && (l.classificacao || "outro") === t).reduce((s, l) => s + (Number(l.valor) || 0), 0));
    const pendente = centavos(r.pendentes.filter((p) => (p.empresa_id || null) === e.id).reduce((s, p) => s + (Number(p.valor) || 0), 0));
    const rdv = das("rdv"), fc = das("fc"), outro = das("outro");
    return { id: e.id, nome: e.nome, rdv, fc, outro, despesas: centavos(rdv + fc + outro), pendente, total: centavos(rdv + fc + outro + pendente) };
  }).filter((e) => e.id || e.total);
  const despesas = centavos(r.linhas.reduce((s, l) => s + (Number(l.valor) || 0), 0));
  const comColaboradores = centavos(r.pendentes.reduce((s, p) => s + (Number(p.valor) || 0), 0));
  const saldoAtual = centavos(Number(r.saldoInicial || 0) + Number(r.entradas || 0) - despesas);
  const disponivel = centavos(saldoAtual - comColaboradores);
  const avisos = [];
  if (r.linhas.some((l) => !(Number(l.valor) > 0)) || r.pendentes.some((p) => !(Number(p.valor) > 0))) avisos.push("Há valor zerado ou inválido.");
  if (r.linhas.some((l) => !l.empresa_id)) avisos.push("Há despesa sem empresa: ela não entra no total de nenhuma.");
  if (r.pendentes.some((p) => !p.empresa_id)) avisos.push("Há pendente de acerto sem empresa.");
  if (r.pendentes.some((p) => !String(p.nome || "").trim())) avisos.push("Há pendente de acerto sem o nome do colaborador.");
  if (r.sistema && Math.abs(saldoAtual - r.sistema.saldoAtual) > 0.005) avisos.push(`O saldo atual do resumo (${brl(saldoAtual)}) é diferente do sistema (${brl(r.sistema.saldoAtual)}).`);
  if (r.sistema && Math.abs(disponivel - r.sistema.disponivel) > 0.005 && Math.abs(saldoAtual - r.sistema.saldoAtual) < 0.005) avisos.push(`O disponível do resumo (${brl(disponivel)}) é diferente do sistema (${brl(r.sistema.disponivel)}): confira o pendente de acerto.`);
  if (r.conta != null && Math.abs(Number(r.conta) - disponivel) > 0.005) avisos.push(`A conta tem ${brl(r.conta)} e deveria ter ${brl(disponivel)} (diferença de ${brl(Number(r.conta) - disponivel)}).`);
  if (r.aAprovar) avisos.push(`${r.aAprovar === 1 ? "1 documento do período ainda está" : `${r.aAprovar} documentos do período ainda estão`} a aprovar e fora do resumo.`);
  return { porEmpresa, despesas, comColaboradores, saldoAtual, disponivel, total: centavos(despesas + comColaboradores), avisos };
}

export const brl = (n) => Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");

// Grupos do detalhamento: RDV e FC de cada empresa (como na planilha), depois as outras
export function gruposResumo(r, empresas, sig) {
  const grupos = [];
  for (const e of [...empresas, { id: null, nome: "" }]) {
    for (const t of ["rdv", "fc", "outro"]) {
      const linhas = r.linhas.filter((l) => (l.empresa_id || null) === e.id && (l.classificacao || "outro") === t);
      if (!linhas.length) continue;
      const s = e.id ? sig.get(e.id) : "";
      grupos.push({ rotulo: `${t === "outro" ? "Outras despesas" : t === "rdv" ? "RDV" : "FC"}${s ? ` ${s}` : ""}`, titulo: `${nomeTipo(t)}${e.nome ? ` ${e.nome}` : " sem empresa"}`,
        linhas, total: centavos(linhas.reduce((x, l) => x + (Number(l.valor) || 0), 0)) });
    }
  }
  return grupos;
}

// ---------------------------------------------------------------- o relatório (HTML para imprimir e imagem PNG)
export function relatorioHtml(r, empresas, sig, { titulo, nomes }) {
  const t = totaisResumo(r, empresas);
  const e = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const nomeEmp = (id) => (empresas.find((x) => x.id === id) || {}).nome || "sem empresa";
  return `<div class="rel">
    <h1>${e(titulo)}</h1>
    <p class="rel-sub">Período: ${dataBR(r.inicio)} a ${dataBR(r.fim)}${nomes ? ` · ${e(nomes)}` : ""}</p>
    <div class="rel-kpis">
      <div><span>Saldo inicial</span><b>${brl(r.saldoInicial)}</b></div>
      ${Number(r.entradas) ? `<div><span>Entradas</span><b>${brl(r.entradas)}</b></div>` : ""}
      <div><span>Despesas</span><b>${brl(t.despesas)}</b></div>
      <div><span>Saldo atual</span><b>${brl(t.saldoAtual)}</b></div>
      <div class="rel-destaque"><span>Total do acerto</span><b>${brl(t.total)}</b></div>
    </div>
    <table class="rel-tab"><thead><tr><th>Empresa</th><th>RDV</th><th>Ficha de custo</th>${t.porEmpresa.some((x) => x.outro) ? "<th>Outras</th>" : ""}<th>Pendente de acerto</th><th>Total</th></tr></thead><tbody>
      ${t.porEmpresa.map((x) => `<tr><td><b>${e(x.nome)}</b></td><td>${brl(x.rdv)}</td><td>${brl(x.fc)}</td>${t.porEmpresa.some((y) => y.outro) ? `<td>${brl(x.outro)}</td>` : ""}<td>${brl(x.pendente)}</td><td><b>${brl(x.total)}</b></td></tr>`).join("")}
    </tbody><tfoot><tr><td>Total</td><td>${brl(t.porEmpresa.reduce((s, x) => s + x.rdv, 0))}</td><td>${brl(t.porEmpresa.reduce((s, x) => s + x.fc, 0))}</td>${t.porEmpresa.some((x) => x.outro) ? `<td>${brl(t.porEmpresa.reduce((s, x) => s + x.outro, 0))}</td>` : ""}<td>${brl(t.comColaboradores)}</td><td>${brl(t.total)}</td></tr></tfoot></table>
    ${gruposResumo(r, empresas, sig).map((g) => `<h2>${e(g.titulo)} <small>${brl(g.total)}</small></h2>
      <table class="rel-tab rel-itens"><tbody>${g.linhas.map((l) => `<tr><td class="rel-data">${dataBR(l.data)}</td><td>${e(l.descricao)}${l.colaborador ? ` <small>· ${e(l.colaborador)}</small>` : ""}</td><td class="rel-valor">${brl(l.valor)}</td></tr>`).join("")}</tbody></table>`).join("")}
    ${r.pendentes.length ? `<h2>Pendente de acerto (com colaboradores) <small>${brl(t.comColaboradores)}</small></h2>
      <table class="rel-tab rel-itens"><tbody>${r.pendentes.map((p) => `<tr><td>${e(p.nome)}</td><td>${e(nomeEmp(p.empresa_id))}</td><td class="rel-valor">${brl(p.valor)}</td></tr>`).join("")}</tbody></table>` : ""}
    <p class="rel-conta">Disponível na conta do caixa: <b>${brl(t.disponivel)}</b>${r.conta != null && r.conta !== "" ? ` · saldo informado ${brl(r.conta)}${Math.abs(Number(r.conta) - t.disponivel) > 0.005 ? ` · diferença ${brl(Number(r.conta) - t.disponivel)}` : ""}` : ""}</p>
  </div>`;
}

export const CSS_RELATORIO = `
  .rel { font-family: Arial, Helvetica, sans-serif; color: #1b1d21; max-width: 820px; }
  .rel h1 { font-size: 20px; margin: 0 0 4px; letter-spacing: .02em; text-transform: uppercase; border-left: 6px solid #f5b800; padding-left: 10px; }
  .rel h2 { font-size: 13px; margin: 18px 0 6px; text-transform: uppercase; letter-spacing: .06em; display: flex; justify-content: space-between; border-bottom: 2px solid #111214; padding-bottom: 3px; }
  .rel h2 small { font-size: 13px; }
  .rel-sub { color: #6b6e73; font-size: 12px; margin: 0 0 12px; }
  .rel-kpis { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
  .rel-kpis div { flex: 1 1 120px; background: #f3f4f5; border-top: 4px solid #c9ccd1; padding: 8px 10px; }
  .rel-kpis .rel-destaque { background: #111214; color: #fff; border-top-color: #f5b800; }
  .rel-kpis span { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: .08em; }
  .rel-kpis b { font-size: 17px; }
  .rel-tab { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  .rel-tab th { background: #111214; color: #fff; text-align: right; padding: 6px 8px; font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; }
  .rel-tab th:first-child, .rel-tab td:first-child { text-align: left; }
  .rel-tab td { padding: 5px 8px; border-bottom: 1px solid #e6e6e6; text-align: right; }
  .rel-tab tfoot td { font-weight: bold; border-top: 2px solid #111214; }
  .rel-itens td { text-align: left; }
  .rel-itens .rel-valor { text-align: right; white-space: nowrap; }
  .rel-itens .rel-data { width: 78px; white-space: nowrap; color: #6b6e73; }
  .rel-conta { margin-top: 14px; font-size: 12.5px; background: #fff6d6; padding: 8px 10px; }
  @media print { @page { margin: 14mm; } }`;

// Imagem PNG do relatório, desenhada no canvas (para mandar por WhatsApp ou e-mail junto com as notinhas)
export function relatorioPng(r, empresas, sig, { titulo, nomes }) {
  const t = totaisResumo(r, empresas);
  const W = 900, M = 32, escala = 2;
  const grupos = gruposResumo(r, empresas, sig);
  const temOutro = t.porEmpresa.some((x) => x.outro);
  const alturaLinha = 24;
  const linhasTotal = 7 + t.porEmpresa.length + 2 + grupos.reduce((s, g) => s + g.linhas.length + 2, 0) + (r.pendentes.length ? r.pendentes.length + 2 : 0) + 3;
  const H = M * 2 + linhasTotal * (alturaLinha + 6) + 300;
  const cv = document.createElement("canvas");
  cv.width = W * escala; cv.height = H * escala;
  const g = cv.getContext("2d");
  g.scale(escala, escala);
  g.fillStyle = "#ffffff"; g.fillRect(0, 0, W, H);
  let y = M;
  const fonte = (tam, peso = "normal") => { g.font = `${peso} ${tam}px Arial, Helvetica, sans-serif`; };
  const texto = (s, x, yy, { cor = "#1b1d21", alinhar = "left", tam = 13, peso = "normal", max = null } = {}) => {
    fonte(tam, peso); g.fillStyle = cor; g.textAlign = alinhar; g.textBaseline = "middle";
    let str = String(s ?? "");
    if (max) while (str.length > 3 && g.measureText(str).width > max) str = `${str.slice(0, -2)}…`;
    g.fillText(str, x, yy);
  };
  g.fillStyle = "#f5b800"; g.fillRect(M, y, 6, 26);
  texto(titulo.toUpperCase(), M + 16, y + 13, { tam: 20, peso: "bold" });
  y += 36;
  texto(`Período: ${dataBR(r.inicio)} a ${dataBR(r.fim)}${nomes ? ` · ${nomes}` : ""}`, M, y, { cor: "#6b6e73", tam: 12 });
  y += 22;
  const kpis = [["Saldo inicial", r.saldoInicial], ...(Number(r.entradas) ? [["Entradas", r.entradas]] : []), ["Despesas", t.despesas], ["Saldo atual", t.saldoAtual], ["Total do acerto", t.total]];
  const kw = (W - 2 * M - (kpis.length - 1) * 8) / kpis.length;
  kpis.forEach(([rot, v], i) => {
    const x = M + i * (kw + 8), ult = i === kpis.length - 1;
    g.fillStyle = ult ? "#111214" : "#f3f4f5"; g.fillRect(x, y, kw, 52);
    g.fillStyle = ult ? "#f5b800" : "#c9ccd1"; g.fillRect(x, y, kw, 4);
    texto(rot.toUpperCase(), x + 10, y + 18, { tam: 10, cor: ult ? "#ffffff" : "#1b1d21" });
    texto(brl(v), x + 10, y + 37, { tam: 17, peso: "bold", cor: ult ? "#ffffff" : "#1b1d21" });
  });
  y += 70;
  // tabela por empresa
  const cols = ["Empresa", "RDV", "Ficha de custo", ...(temOutro ? ["Outras"] : []), "Pendente de acerto", "Total"];
  const cw = (W - 2 * M) / cols.length;
  g.fillStyle = "#111214"; g.fillRect(M, y, W - 2 * M, alturaLinha);
  cols.forEach((c, i) => texto(c.toUpperCase(), i ? M + (i + 1) * cw - 8 : M + 8, y + 12, { tam: 10, cor: "#ffffff", alinhar: i ? "right" : "left", peso: "bold" }));
  y += alturaLinha;
  const linhaEmpresa = (vals, negrito) => {
    vals.forEach((v, i) => texto(i ? brl(v) : v, i ? M + (i + 1) * cw - 8 : M + 8, y + 12, { tam: 12.5, alinhar: i ? "right" : "left", peso: negrito || i === vals.length - 1 || !i ? "bold" : "normal" }));
    g.fillStyle = negrito ? "#111214" : "#e6e6e6"; g.fillRect(M, negrito ? y : y + alturaLinha - 1, W - 2 * M, negrito ? 2 : 1);
    y += alturaLinha;
  };
  for (const x of t.porEmpresa) linhaEmpresa([x.nome, x.rdv, x.fc, ...(temOutro ? [x.outro] : []), x.pendente, x.total]);
  const soma = (k) => t.porEmpresa.reduce((s, x) => s + x[k], 0);
  linhaEmpresa(["Total", soma("rdv"), soma("fc"), ...(temOutro ? [soma("outro")] : []), t.comColaboradores, t.total], true);
  y += 8;
  const secao = (tit, total) => {
    y += 8;
    texto(tit.toUpperCase(), M, y + 10, { tam: 12, peso: "bold" });
    texto(brl(total), W - M, y + 10, { tam: 12, peso: "bold", alinhar: "right" });
    g.fillStyle = "#111214"; g.fillRect(M, y + 22, W - 2 * M, 2);
    y += alturaLinha + 4;
  };
  const item = (a, b, valor, cinzaA = true) => {
    if (a) texto(a, M + 4, y + 11, { tam: 12, cor: cinzaA ? "#6b6e73" : "#1b1d21" });
    texto(b, M + (cinzaA ? 92 : 220), y + 11, { tam: 12, max: W - 2 * M - (cinzaA ? 92 : 220) - 120 });
    texto(brl(valor), W - M - 4, y + 11, { tam: 12, alinhar: "right" });
    g.fillStyle = "#e6e6e6"; g.fillRect(M, y + alturaLinha - 2, W - 2 * M, 1);
    y += alturaLinha - 2;
  };
  for (const gr of grupos) {
    secao(gr.titulo, gr.total);
    for (const l of gr.linhas) item(dataBR(l.data), `${l.descricao}${l.colaborador ? ` · ${l.colaborador}` : ""}`, l.valor);
  }
  if (r.pendentes.length) {
    secao("Pendente de acerto (com colaboradores)", t.comColaboradores);
    for (const p of r.pendentes) item(p.nome, (empresas.find((x) => x.id === p.empresa_id) || {}).nome || "sem empresa", p.valor, false);
  }
  y += 14;
  g.fillStyle = "#fff6d6"; g.fillRect(M, y, W - 2 * M, 30);
  texto(`Disponível na conta do caixa: ${brl(t.disponivel)}${r.conta != null && r.conta !== "" ? ` · saldo informado ${brl(r.conta)}${Math.abs(Number(r.conta) - t.disponivel) > 0.005 ? ` · diferença ${brl(Number(r.conta) - t.disponivel)}` : ""}` : ""}`, M + 10, y + 15, { tam: 12.5 });
  y += 44;
  // recorta a altura usada
  const final = document.createElement("canvas");
  final.width = W * escala; final.height = Math.ceil(y + M) * escala;
  const f = final.getContext("2d");
  f.fillStyle = "#ffffff"; f.fillRect(0, 0, final.width, final.height);
  f.drawImage(cv, 0, 0);
  return final;
}
