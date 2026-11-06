// Área restrita – Veículos pessoais: cadastro dos veículos, marcadores (leituras de km e horas), manutenção preventiva
// (por tempo, km ou horas, o que vencer primeiro), serviços e troca de peças, despesas e notas fiscais anexadas.
// As contas ficam em veiculos-regras.js (as mesmas da rotina de e-mails); o banco guarda só o que foi lançado.
import { abrirPagina } from "./sessao.js";
import * as V from "./veiculos-regras.js";
import { $, $$, esc, moeda, avisar, opcoes, prepararDialogos, numeroDigitado, baixarCsv } from "./ui.js";

let armazem, perfil;
let veiculos = [], marcadores = [], planos = [], servicos = [], anexos = [], donos = new Map();
let quadros = [], alertas = [];
let filtroVeiculo = ""; // "" = todos
let aba = "geral";
const hoje = V.hojeISO();
const col = (nome) => armazem.colecao(nome);

const veiculoDe = (id) => veiculos.find((v) => v.id === id);
const nomeVeiculo = (id) => (veiculoDe(id) || {}).nome || "—";
const ativos = () => veiculos.filter((v) => v.ativo !== false);
const noFiltro = (x) => !filtroVeiculo || (x.veiculo_id || x.id) === filtroVeiculo;
const rotuloTipo = (lista, k) => (lista.find(([v]) => v === k) || [, k])[1];
const anexosDe = (filtro) => anexos.filter(filtro);
const numeroOuNull = (v) => numeroDigitado(v);
const num1 = (v) => (v == null ? "" : String(v).replace(".", ","));
const etiqueta = (classe, texto, detalhe = "") => `<span class="etiqueta ${classe}">${esc(texto)}${detalhe ? `<small>${esc(detalhe)}</small>` : ""}</span>`;

// ---------------------------------------------------------------- carregar e calcular
async function recarregar() {
  [veiculos, marcadores, planos, servicos, anexos] = await Promise.all([
    col("veiculos").listar(), col("veiculos_marcadores").listar(), col("veiculos_planos").listar(),
    col("veiculos_servicos").listar(), col("veiculos_anexos").listar(),
  ]);
  veiculos.sort((a, b) => (a.ativo === false) - (b.ativo === false) || a.nome.localeCompare(b.nome, "pt-BR"));
  servicos.sort((a, b) => b.data.localeCompare(a.data) || String(b.criado_em || "").localeCompare(String(a.criado_em || "")));
  if (filtroVeiculo && !veiculoDe(filtroVeiculo)) filtroVeiculo = "";
  calcular();
  renderTudo();
}

function calcular() {
  quadros = veiculos.map((v) => V.quadroVeiculo(v, { marcadores, planos, servicos, hoje }));
  alertas = V.alertasVeiculos(quadros, hoje);
}
const quadroDe = (id) => quadros.find((q) => q.veiculo.id === id);

// Nome do dono (só aparece quando há veículos de mais de uma pessoa: o administrador ou o casal)
const varios = () => new Set(veiculos.map((v) => v.perfil_id)).size > 1;
const deQuem = (v) => (varios() && v.perfil_id !== perfil.id ? ` <small class="dica">de ${esc(donos.get(v.perfil_id) || "outra pessoa")}</small>` : "");

function renderTudo() {
  const vazio = !veiculos.length;
  $("#veic-vazio").hidden = !vazio;
  $("#veic-tela").hidden = vazio;
  for (const id of ["#btn-leitura", "#btn-servico", "#btn-despesa"]) $(id).hidden = vazio;
  if (vazio) return;
  renderFiltro();
  renderFaixa();
  renderGeral();
  renderPreventivas();
  renderMarcadores();
  renderServicos();
  renderDespesas();
  renderVeiculos();
}

function renderFiltro() {
  const lista = ativos();
  $("#veic-filtro").hidden = lista.length < 2 && !filtroVeiculo;
  $("#veic-filtro").innerHTML = [["", "Todos"], ...lista.map((v) => [v.id, v.nome])]
    .map(([id, nome]) => `<button type="button" class="pilula" data-veiculo="${esc(id)}"${id === filtroVeiculo ? ' aria-current="page"' : ""}>${esc(nome)}</button>`).join("");
}

function renderFaixa() {
  const lista = alertas.filter((a) => noFiltro(a.veiculo));
  const venc = lista.filter((a) => a.gravidade === "vencida").length;
  const prox = lista.length - venc;
  $("#veic-faixa").hidden = !lista.length;
  if (!lista.length) return;
  $("#veic-faixa").innerHTML = `<p><b>${venc ? `${venc} ${venc === 1 ? "aviso vencido" : "avisos vencidos"}` : ""}${venc && prox ? " e " : ""}${prox ? `${prox} ${prox === 1 ? "aviso próximo" : "avisos próximos"}` : ""}.</b>
    ${esc(lista.slice(0, 3).map((a) => a.titulo).join(" · "))}${lista.length > 3 ? " …" : ""}</p>
    <button class="btn-link" type="button" data-ir="geral">Ver os avisos</button>`;
}

// ---------------------------------------------------------------- visão geral
function kpi(rotulo, valor, detalhe = "", classe = "", acao = "") {
  const tag = acao ? "button" : "div";
  return `<${tag} class="kpi${classe ? ` ${classe}` : ""}${acao ? " kpi-botao" : ""}"${acao ? ` type="button" data-ir="${acao}"` : ""}>
    <span class="kpi-rotulo">${rotulo}</span><strong class="kpi-valor">${valor}</strong>${detalhe ? `<span class="kpi-detalhe">${detalhe}</span>` : ""}</${tag}>`;
}

function renderGeral() {
  const qs = quadros.filter((q) => q.veiculo.ativo !== false && noFiltro(q.veiculo));
  const prev = qs.flatMap((q) => q.preventivas);
  const venc = prev.filter((p) => p.estado === "vencida").length;
  const prox = prev.filter((p) => p.estado === "proxima").length;
  const leit = qs.filter((q) => q.marcador.estado === "atrasado" || q.marcador.estado === "sem").length;
  const ano = V.resumoDespesas(servicos.filter(noFiltro), { de: `${hoje.slice(0, 4)}-01-01`, ate: hoje });
  $("#geral-kpis").innerHTML = [
    kpi("Veículos", qs.length, filtroVeiculo ? "selecionado" : "ativos", "", "veiculos"),
    kpi("Preventivas vencidas", venc, venc ? "fazer o quanto antes" : "nenhuma", venc ? "kpi-alerta" : "", "preventivas"),
    kpi("Preventivas próximas", prox, prox ? "dentro da antecedência do aviso" : "nenhuma", "", "preventivas"),
    kpi("Leituras atrasadas", leit, leit ? "mais de 3 meses sem km/horas" : "todas em dia", leit ? "kpi-alerta" : "", "marcadores"),
    kpi(`Gasto em ${hoje.slice(0, 4)}`, moeda(ano.total), `${ano.n} ${ano.n === 1 ? "lançamento" : "lançamentos"}`, "", "despesas"),
  ].join("");

  $("#geral-cards").innerHTML = qs.map((q) => {
    const v = q.veiculo;
    const leitura = q.atual ? [V.usaKm(v) && q.atual.km != null ? V.kmBR(q.atual.km) : "", V.usaHoras(v) && q.atual.horas != null ? V.horasBR(q.atual.horas) : ""].filter(Boolean).join(" · ") : "";
    const top = q.preventivas.slice(0, 4);
    return `<article class="veic-card estado-${q.estado}">
      <header><div><h3>${esc(v.nome)}</h3><p>${esc([rotuloTipo(V.TIPOS_VEICULO, v.tipo), v.marca, v.modelo, v.ano].filter(Boolean).join(" · "))}${v.placa ? ` · <b>${esc(v.placa)}</b>` : ""}</p>${deQuem(v)}</div>
        ${etiqueta(V.CLASSE_MARCADOR[q.marcador.estado], V.ROTULO_MARCADOR[q.marcador.estado])}</header>
      <div class="veic-leitura"><strong>${leitura || "Sem leitura"}</strong><span>${q.atual ? `em ${V.dataBR(q.atual.data)}` : "lance a primeira leitura"}${q.uso.kmDia ? ` · ~${V.numBR(q.uso.kmDia * 30)} km/mês` : ""}${q.uso.horasDia ? ` · ~${V.numBR(q.uso.horasDia * 30, 1)} h/mês` : ""}</span></div>
      ${top.length ? `<ul class="veic-prev">${top.map((p) => `<li><span>${esc(p.plano.nome)}<small>${esc(p.texto)}</small></span>${etiqueta(V.CLASSE_ESTADO[p.estado], V.ROTULO_ESTADO[p.estado])}</li>`).join("")}</ul>`
        : '<p class="dica">Nenhuma preventiva cadastrada.</p>'}
      <footer>
        <button class="btn btn-primary" type="button" data-leitura="${esc(v.id)}">Lançar leitura</button>
        <button class="btn btn-claro" type="button" data-servico-veiculo="${esc(v.id)}">Registrar serviço</button>
        <button class="btn-link" type="button" data-plano-veiculo="${esc(v.id)}">Nova preventiva</button>
      </footer>
    </article>`;
  }).join("") || '<p class="vazio">Nenhum veículo ativo.</p>';

  const lista = alertas.filter((a) => noFiltro(a.veiculo));
  $("#geral-alertas").innerHTML = lista.length ? `<ul class="veic-alertas">${lista.map((a) => `<li class="veic-alerta g-${a.gravidade}">
      <div><b>${esc(a.titulo)}</b><p>${esc(a.texto)}</p></div>
      ${a.tipo === "marcador" ? `<button class="btn btn-claro" type="button" data-leitura="${esc(a.veiculo.id)}">Lançar leitura</button>`
        : `<span class="linha-acoes"><button class="btn btn-claro" type="button" data-feita="${esc(a.plano.id)}">Registrar que foi feita</button></span>`}
    </li>`).join("")}</ul>` : '<p class="dica veic-ok">Tudo em dia: nenhuma preventiva vencida ou próxima e as leituras estão dentro dos 3 meses.</p>';
}

// ---------------------------------------------------------------- preventivas
const intervaloTexto = (p, v) => [p.intervalo_meses ? `${V.numBR(p.intervalo_meses, 1)} ${Number(p.intervalo_meses) === 1 ? "mês" : "meses"}` : "",
  V.usaKm(v) && p.intervalo_km ? V.kmBR(p.intervalo_km) : "", V.usaHoras(v) && p.intervalo_horas ? V.horasBR(p.intervalo_horas) : ""].filter(Boolean).join(" ou ");
const marcoTexto = (x) => (x ? [x.data ? V.dataBR(x.data) : "", x.km != null ? V.kmBR(x.km) : "", x.horas != null ? V.horasBR(x.horas) : ""].filter(Boolean).join(" · ") : "");

function renderPreventivas() {
  const filtro = $("#filtro-prev").value;
  const grupos = quadros.filter((q) => noFiltro(q.veiculo)).map((q) => {
    const inativas = planos.filter((p) => p.veiculo_id === q.veiculo.id && p.ativo === false);
    const linhas = [...q.preventivas.filter((p) => !filtro || p.estado === filtro), ...(filtro ? [] : inativas.map((p) => ({ plano: p, inativa: true })))];
    if (!linhas.length) return "";
    return `<tr class="veic-grupo"><th colspan="6">${esc(q.veiculo.nome)}${q.veiculo.ativo === false ? " (inativo)" : ""}</th></tr>` + linhas.map((s) => {
      const p = s.plano;
      if (s.inativa) return `<tr class="clicavel inativa" data-plano="${esc(p.id)}"><td>${esc(p.nome)}</td><td>${esc(intervaloTexto(p, q.veiculo))}</td><td colspan="2" class="dica">Desativada</td><td>${etiqueta("s-baixada", "Inativa")}</td><td></td></tr>`;
      const prox = s.proxima;
      return `<tr class="clicavel" tabindex="0" data-plano="${esc(p.id)}">
        <td><b>${esc(p.nome)}</b>${p.observacao ? `<br><small class="dica">${esc(p.observacao)}</small>` : ""}</td>
        <td>${esc(intervaloTexto(p, q.veiculo))}</td>
        <td>${s.ultima ? `${esc(marcoTexto(s.ultima))}${s.ultima.servico ? '<br><small class="dica">pelo serviço registrado</small>' : '<br><small class="dica">informada no cadastro</small>'}` : '<span class="dica">—</span>'}</td>
        <td>${esc(marcoTexto(prox)) || "—"}${s.previsao && !(prox.data === s.previsao) ? `<br><small class="dica">previsão: ${V.dataBR(s.previsao)}</small>` : ""}</td>
        <td>${etiqueta(V.CLASSE_ESTADO[s.estado], V.ROTULO_ESTADO[s.estado], s.texto)}</td>
        <td class="acao-cel"><button class="btn btn-claro" type="button" data-feita="${esc(p.id)}">Feita</button></td></tr>`;
    }).join("");
  }).join("");
  $("#tab-prev tbody").innerHTML = grupos;
  $("#vazio-prev").hidden = !!grupos;
}

// ---------------------------------------------------------------- marcadores
function renderMarcadores() {
  const qs = quadros.filter((q) => noFiltro(q.veiculo) && q.veiculo.ativo !== false);
  $("#tab-marc tbody").innerHTML = qs.map((q) => {
    const v = q.veiculo, a = q.atual;
    const uso = [q.uso.kmDia ? `${V.numBR(q.uso.kmDia * 30)} km/mês` : "", q.uso.horasDia ? `${V.numBR(q.uso.horasDia * 30, 1)} h/mês` : ""].filter(Boolean).join(" · ") || "—";
    return `<tr><td><b>${esc(v.nome)}</b>${deQuem(v)}</td><td>${a ? V.dataBR(a.data) : "—"}</td>
      <td class="num">${V.usaKm(v) && a ? V.numBR(a.km) : "—"}</td><td class="num">${V.usaHoras(v) && a ? V.numBR(a.horas, 1) : "—"}</td>
      <td>${uso}</td><td>${q.marcador.limite ? V.dataBR(q.marcador.limite) : "hoje"}</td>
      <td>${etiqueta(V.CLASSE_MARCADOR[q.marcador.estado], V.ROTULO_MARCADOR[q.marcador.estado], q.marcador.texto)}</td>
      <td class="acao-cel"><button class="btn btn-primary" type="button" data-leitura="${esc(v.id)}">Lançar</button></td></tr>`;
  }).join("");
  const todas = quadros.filter((q) => noFiltro(q.veiculo)).flatMap((q) => q.leituras.map((l) => ({ ...l, veiculo: q.veiculo })))
    .sort((a, b) => b.data.localeCompare(a.data)).slice(0, 300);
  $("#tab-leituras tbody").innerHTML = todas.map((l) => `<tr><td>${V.dataBR(l.data)}</td><td>${esc(l.veiculo.nome)}</td>
    <td class="num">${l.km == null ? "—" : V.numBR(l.km)}</td><td class="num">${l.horas == null ? "—" : V.numBR(l.horas, 1)}</td>
    <td>${l.origem === "servico" ? "Anotada no serviço" : esc((marcadores.find((m) => m.id === l.id) || {}).observacao || "Leitura")}</td>
    <td class="acao-cel">${l.origem === "marcador" ? `<button class="btn-link" type="button" data-editar-leitura="${esc(l.id)}">Editar</button>` : `<button class="btn-link" type="button" data-servico="${esc(l.id)}">Ver serviço</button>`}</td></tr>`).join("");
  $("#vazio-leituras").hidden = todas.length > 0;
}

// ---------------------------------------------------------------- serviços e despesas
const clipe = (servicoId) => {
  const n = anexos.filter((a) => a.servico_id === servicoId).length;
  return n ? `<span class="veic-clipe" title="${n} ${n === 1 ? "arquivo" : "arquivos"}">📎 ${n}</span>` : '<span class="dica">—</span>';
};
const kmHoras = (s) => [s.km != null ? V.kmBR(s.km) : "", s.horas != null ? V.horasBR(s.horas) : ""].filter(Boolean).join("<br>") || "—";

function servicosFiltrados() {
  const termo = $("#busca-serv").value.trim().toLowerCase();
  const tipo = $("#filtro-tipo").value, ano = $("#filtro-ano").value;
  return servicos.filter((s) => noFiltro(s) && (!tipo || s.tipo === tipo) && (!ano || s.data.startsWith(ano)) && (!termo
    || [s.descricao, s.fornecedor, s.nota, s.observacao, s.categoria, (s.itens || []).map((i) => i.descricao).join(" ")].join(" ").toLowerCase().includes(termo)));
}

function renderServicos() {
  const tipoAtual = $("#filtro-tipo").value, anoAtual = $("#filtro-ano").value;
  $("#filtro-tipo").innerHTML = `<option value="">Todos os tipos</option>${opcoes(V.TIPOS_SERVICO, tipoAtual)}`;
  const anos = [...new Set(servicos.map((s) => s.data.slice(0, 4)))].sort().reverse();
  $("#filtro-ano").innerHTML = `<option value="">Todos os anos</option>${opcoes(anos, anoAtual)}`;
  const lista = servicosFiltrados();
  $("#tab-serv tbody").innerHTML = lista.map((s) => {
    const cumpridas = (s.planos || []).map((id) => (planos.find((p) => p.id === id) || {}).nome).filter(Boolean);
    const itens = (s.itens || []).map((i) => `${i.qtd && i.qtd !== 1 ? `${V.numBR(i.qtd, 2)}× ` : ""}${i.descricao}`);
    return `<tr class="clicavel" tabindex="0" data-servico="${esc(s.id)}">
      <td>${V.dataBR(s.data)}</td>
      <td><b>${esc(s.descricao)}</b>${filtroVeiculo ? "" : `<br><small class="dica">${esc(nomeVeiculo(s.veiculo_id))}</small>`}
        ${cumpridas.length ? `<br><small class="ok-texto">✓ ${esc(cumpridas.join(", "))}</small>` : ""}${itens.length ? `<br><small class="dica">${esc(itens.join(" · "))}</small>` : ""}</td>
      <td><span class="tipo veic-tipo-${esc(s.tipo)}">${esc(s.tipo === "despesa" ? s.categoria || "Despesa" : rotuloTipo(V.TIPOS_SERVICO, s.tipo))}</span></td>
      <td class="num">${kmHoras(s)}</td><td>${esc(s.fornecedor || "—")}${s.nota ? `<br><small class="dica">NF ${esc(s.nota)}</small>` : ""}</td>
      <td class="num">${s.valor != null ? moeda(s.valor) : "—"}</td><td>${clipe(s.id)}</td></tr>`;
  }).join("");
  $("#vazio-serv").hidden = lista.length > 0;
}

const PERIODOS = () => {
  const ano = Number(hoje.slice(0, 4));
  const anos = [...new Set(servicos.map((s) => Number(s.data.slice(0, 4))))].filter((a) => a < ano - 1).sort((a, b) => b - a);
  return [["ano", `Este ano (${ano})`], ["12m", "Últimos 12 meses"], ["anterior", `Ano passado (${ano - 1})`], ...anos.map((a) => [String(a), String(a)]), ["tudo", "Tudo"]];
};
function intervaloPeriodo(p) {
  const ano = Number(hoje.slice(0, 4));
  if (p === "ano") return { de: `${ano}-01-01`, ate: hoje };
  if (p === "12m") return { de: V.somarDias(hoje, -365), ate: hoje };
  if (p === "anterior") return { de: `${ano - 1}-01-01`, ate: `${ano - 1}-12-31` };
  if (/^\d{4}$/.test(p)) return { de: `${p}-01-01`, ate: `${p}-12-31` };
  return { de: null, ate: null };
}

function barras(lista, rotulo) {
  if (!lista.length) return '<p class="dica">Nada no período.</p>';
  const max = Math.max(...lista.map((x) => x.total));
  const total = lista.reduce((t, x) => t + x.total, 0);
  return `<ul class="barras">${lista.map((x) => `<li><span class="barra-rotulo">${esc(rotulo(x.chave))}</span>
    <span class="barra-trilho"><span class="barra serie-1" style="width:${Math.max(2, (x.total / max) * 100)}%"></span>
    <span class="barra-valor">${moeda(x.total)} <small>${Math.round((x.total / total) * 100)}%</small></span></span></li>`).join("")}</ul>`;
}
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesTexto = (am) => `${MESES[Number(am.slice(5, 7)) - 1]}/${am.slice(2, 4)}`;

function despesasDoPeriodo() {
  const { de, ate } = intervaloPeriodo($("#periodo").value);
  return { de, ate, lista: servicos.filter((s) => noFiltro(s) && s.valor != null && (!de || s.data >= de) && (!ate || s.data <= ate)) };
}

function renderDespesas() {
  const atual = $("#periodo").value || "ano";
  $("#periodo").innerHTML = opcoes(PERIODOS(), atual);
  const { de, ate, lista } = despesasDoPeriodo();
  const r = V.resumoDespesas(lista);
  const meses = r.porMes.length || 1;
  const leituras = quadros.filter((q) => noFiltro(q.veiculo)).flatMap((q) => (filtroVeiculo ? q.leituras : []));
  const porKm = filtroVeiculo ? V.custoPorKm(r.total, leituras, de, ate) : null;
  const servicosVal = lista.filter((s) => s.tipo !== "despesa").reduce((t, s) => t + Number(s.valor), 0);
  $("#desp-kpis").innerHTML = [
    kpi("Total no período", moeda(r.total), `${r.n} ${r.n === 1 ? "lançamento" : "lançamentos"}`, "kpi-destaque"),
    kpi("Manutenção", moeda(servicosVal), "preventiva, corretiva e peças"),
    kpi("Outras despesas", moeda(r.total - servicosVal), "combustível, IPVA, seguro..."),
    kpi("Média por mês", moeda(r.total / meses), `em ${meses} ${meses === 1 ? "mês com gasto" : "meses com gasto"}`),
    ...(filtroVeiculo ? [kpi("Custo por km", porKm ? moeda(porKm) : "—", porKm ? "no período, pelas leituras" : "precisa de leituras no período")] : []),
    ...(!filtroVeiculo && ativos().length > 1 ? [kpi("Por veículo", r.porVeiculo.slice(0, 2).map((x) => `${esc(nomeVeiculo(x.chave))}`).join(" · ") || "—",
      r.porVeiculo.slice(0, 2).map((x) => moeda(x.total)).join(" · "))] : []),
  ].join("");
  $("#desp-cat").innerHTML = barras(r.porCategoria, (k) => k);
  $("#desp-mes").innerHTML = barras(r.porMes, mesTexto);
  $("#tab-desp tbody").innerHTML = lista.map((s) => `<tr class="clicavel" tabindex="0" data-servico="${esc(s.id)}">
    <td>${V.dataBR(s.data)}</td><td><b>${esc(s.descricao)}</b>${filtroVeiculo ? "" : `<br><small class="dica">${esc(nomeVeiculo(s.veiculo_id))}</small>`}${s.fornecedor ? `<br><small class="dica">${esc(s.fornecedor)}</small>` : ""}</td>
    <td>${esc(V.categoriaDe(s))}</td><td class="num">${moeda(Number(s.valor))}</td><td>${clipe(s.id)}</td></tr>`).join("");
  $("#vazio-desp").hidden = lista.length > 0;
}

function renderVeiculos() {
  $("#tab-veic tbody").innerHTML = veiculos.map((v) => {
    const q = quadroDe(v.id);
    const docs = anexos.filter((a) => a.veiculo_id === v.id && !a.servico_id).length;
    const nPrev = planos.filter((p) => p.veiculo_id === v.id && p.ativo !== false).length;
    return `<tr class="clicavel${v.ativo === false ? " inativa" : ""}" tabindex="0" data-veiculo-editar="${esc(v.id)}">
      <td><b>${esc(v.nome)}</b>${deQuem(v)}<br><small class="dica">${esc(rotuloTipo(V.TIPOS_VEICULO, v.tipo))}${v.ano ? ` · ${esc(v.ano)}` : ""}</small></td>
      <td>${esc(v.placa || v.chassi || "—")}</td><td>${esc([v.marca, v.modelo].filter(Boolean).join(" ") || "—")}</td>
      <td>${esc(V.medidorTexto(v))}</td><td class="num">${nPrev}</td><td class="num">${docs}</td>
      <td>${v.ativo === false ? etiqueta("s-baixada", "Inativo") : etiqueta(V.CLASSE_ESTADO[q.estado] || "s-ativa", q.estado === "vencida" ? "Pede atenção" : q.estado === "proxima" ? "Próximo aviso" : "Em dia")}</td></tr>`;
  }).join("");
}

// ---------------------------------------------------------------- abas
function irPara(nome) {
  aba = nome;
  for (const b of $$("#veic-abas [role=tab]")) {
    const sel = b.dataset.aba === nome;
    b.setAttribute("aria-selected", String(sel));
    b.tabIndex = sel ? 0 : -1;
    $(`#${b.getAttribute("aria-controls")}`).hidden = !sel;
  }
  if (location.hash.slice(1) !== nome) history.replaceState(null, "", nome === "geral" ? location.pathname + location.search : `#${nome}`);
}

// ---------------------------------------------------------------- anexos (notas fiscais, fotos, documentos)
const tamanho = (b) => (b > 1048576 ? `${(b / 1048576).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
function blocoAnexos(lista, titulo, dica) {
  return `<fieldset class="bloco"><legend>${titulo}</legend>
    ${lista.length ? `<ul class="lista-arquivos">${lista.map((a) => `<li><span>📎 <b>${esc(a.nome)}</b> <small class="dica">${a.tamanho ? tamanho(a.tamanho) : ""}${a.descricao ? ` · ${esc(a.descricao)}` : ""}</small></span>
      <span class="linha-acoes"><button class="btn-link" type="button" data-anexo-abrir="${esc(a.id)}">Abrir</button>
      <button class="btn-link perigo" type="button" data-anexo-apagar="${esc(a.id)}">Apagar</button></span></li>`).join("")}</ul>` : ""}
    <label class="veic-arquivos">Anexar arquivos <small>(PDF, foto ou XML da NF-e, até 20 MB cada; dá para escolher vários)</small>
      <input type="file" name="arquivos" multiple accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif,.xml,application/pdf,image/*,text/xml,application/xml"></label>
    <p class="dica">${dica}</p></fieldset>`;
}
function ligarAnexos(form, depois) {
  form.addEventListener("click", async (e) => {
    const abrir = e.target.closest("[data-anexo-abrir]");
    const apagar = e.target.closest("[data-anexo-apagar]");
    if (abrir) {
      const a = anexos.find((x) => x.id === abrir.dataset.anexoAbrir);
      const janela = window.open("", "_blank");
      try {
        const url = await armazem.veiculos.urlAnexo(a.caminho);
        if (janela) janela.location = url; else location.href = url;
      } catch (err) {
        if (janela) janela.close();
        avisar("Não foi possível abrir: " + err.message);
      }
    }
    if (apagar) {
      const a = anexos.find((x) => x.id === apagar.dataset.anexoApagar);
      if (!confirm(`Apagar o arquivo ${a.nome}?`)) return;
      try {
        await armazem.veiculos.apagarAnexo(a.caminho).catch(() => {});
        await col("veiculos_anexos").remover(a.id);
        anexos = anexos.filter((x) => x.id !== a.id);
        apagar.closest("li").remove();
        avisar("Arquivo apagado.");
        depois && depois();
      } catch (err) {
        avisar("Não foi possível apagar: " + err.message);
      }
    }
  });
}
// Envia os arquivos escolhidos e grava cada um ligado ao veículo (e ao serviço). Devolve quantos falharam.
async function enviarArquivos(arquivos, { veiculo, servicoId = null }) {
  let falhas = 0;
  for (const arq of arquivos) {
    try {
      const caminho = await armazem.veiculos.enviarAnexo(veiculo.perfil_id, arq);
      await col("veiculos_anexos").salvar({ perfil_id: veiculo.perfil_id, veiculo_id: veiculo.id, servico_id: servicoId, nome: arq.name.slice(0, 200),
        caminho, tamanho: arq.size, tipo: arq.type || null });
    } catch (err) {
      falhas += 1;
      avisar(`${arq.name}: ${err.message}`);
    }
  }
  return falhas;
}
async function apagarArquivosDe(filtro) {
  for (const a of anexos.filter(filtro)) await armazem.veiculos.apagarAnexo(a.caminho).catch(() => {});
}

// ---------------------------------------------------------------- diálogo: veículo
function abrirVeiculo(id) {
  const existente = veiculoDe(id);
  const v = existente ? { ...existente } : { tipo: "carro", medidor: "km", ativo: true };
  const docs = existente ? anexos.filter((a) => a.veiculo_id === v.id && !a.servico_id) : [];
  const dlg = $("#dlg-veiculo");
  dlg.innerHTML = `<form id="form-veiculo">
    <div class="dlg-cab"><h2 id="titulo-veiculo">${existente ? esc(v.nome) : "Novo veículo"}</h2><button class="btn-link" data-fechar type="button">Fechar</button></div>
    <div class="dlg-corpo">
      <div class="campos">
        <label class="c3">Nome / apelido<input name="nome" value="${esc(v.nome)}" required maxlength="80" placeholder="Ex.: Hilux, Moto do dia a dia, Trator"></label>
        <label class="c3">Tipo<select name="tipo">${opcoes(V.TIPOS_VEICULO, v.tipo)}</select></label>
        <label class="c2">Marca<input name="marca" value="${esc(v.marca)}" maxlength="60"></label>
        <label class="c2">Modelo<input name="modelo" value="${esc(v.modelo)}" maxlength="80"></label>
        <label class="c2">Ano<input name="ano" value="${esc(v.ano)}" maxlength="20" placeholder="2022/2023"></label>
        <label class="c2">Placa<input name="placa" value="${esc(v.placa)}" maxlength="20"></label>
        <label class="c2">Chassi / nº de série<input name="chassi" value="${esc(v.chassi)}" maxlength="40"></label>
        <label class="c2">Renavam<input name="renavam" value="${esc(v.renavam)}" maxlength="30"></label>
        <label class="c3">O que ele marca<select name="medidor">${opcoes(V.MEDIDORES, v.medidor)}</select></label>
        <label class="c3">Combustível<input name="combustivel" value="${esc(v.combustivel)}" maxlength="30" list="lista-combustivel"></label>
        <datalist id="lista-combustivel"><option>Flex</option><option>Gasolina</option><option>Etanol</option><option>Diesel</option><option>Elétrico</option><option>Híbrido</option><option>GNV</option></datalist>
        <label class="c3">Data de aquisição<input type="date" name="aquisicao" value="${esc(v.aquisicao)}"></label>
        <label class="c3 veic-check"><input type="checkbox" name="ativo"${v.ativo !== false ? " checked" : ""}> Em uso (desmarque quando vender: o histórico fica guardado e os avisos param)</label>
        <label class="c6">Observações<textarea name="observacao" rows="2" maxlength="2000">${esc(v.observacao)}</textarea></label>
        ${existente ? "" : `<label class="c3">Leitura de hoje: km<input name="km0" inputmode="decimal" placeholder="opcional"></label>
        <label class="c3">Leitura de hoje: horas<input name="horas0" inputmode="decimal" placeholder="opcional"></label>`}
      </div>
      ${existente ? blocoAnexos(docs, "Documentos do veículo", "CRLV, manual, apólice do seguro, nota de compra. As notas de cada serviço ficam no próprio serviço.")
        : '<p class="dica">Depois de salvar, anexe os documentos (CRLV, manual, apólice) e cadastre as preventivas.</p>'}
    </div>
    <div class="dlg-rodape">
      ${existente ? '<button class="btn btn-perigo esquerda" type="button" id="btn-excluir-veiculo">Excluir</button>' : ""}
      <button class="btn btn-claro" type="button" data-fechar>Cancelar</button>
      <button class="btn btn-primary" type="submit">Salvar</button>
    </div>
  </form>`;
  const form = $("#form-veiculo", dlg);
  if (existente) ligarAnexos(form, () => renderVeiculos());
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const dados = { ...v, perfil_id: v.perfil_id || perfil.id };
    for (const c of ["nome", "tipo", "marca", "modelo", "ano", "placa", "chassi", "renavam", "medidor", "combustivel", "aquisicao", "observacao"])
      dados[c] = String(f.get(c) || "").trim() || null;
    if (dados.placa) dados.placa = dados.placa.toUpperCase();
    dados.ativo = f.get("ativo") === "on";
    if (!dados.nome) return avisar("Informe o nome do veículo.");
    const km0 = numeroOuNull(f.get("km0")), h0 = numeroOuNull(f.get("horas0"));
    try {
      const salvo = await col("veiculos").salvar(dados);
      if (!existente && (km0 != null || h0 != null)) await col("veiculos_marcadores").salvar({ perfil_id: salvo.perfil_id, veiculo_id: salvo.id, data: hoje, km: km0, horas: h0, observacao: "Leitura do cadastro" });
      const arquivos = existente ? [...(form.arquivos?.files || [])] : [];
      if (arquivos.length) await enviarArquivos(arquivos, { veiculo: salvo });
      avisar(existente ? "Veículo salvo." : "Veículo cadastrado. Agora cadastre as preventivas dele.");
      dlg.close();
      await recarregar();
      if (!existente) { filtroVeiculo = salvo.id; renderTudo(); irPara("preventivas"); }
    } catch (err) {
      avisar("Não foi possível salvar: " + err.message);
    }
  });
  $("#btn-excluir-veiculo", form)?.addEventListener("click", async () => {
    const nServ = servicos.filter((s) => s.veiculo_id === v.id).length;
    if (!confirm(`Excluir ${v.nome} e todo o histórico dele (${nServ} serviços e despesas, leituras, preventivas e arquivos)? Se só vendeu, prefira desmarcar "Em uso".`)) return;
    try {
      await apagarArquivosDe((a) => a.veiculo_id === v.id);
      await col("veiculos").remover(v.id);
      dlg.close();
      avisar("Veículo excluído.");
      await recarregar();
    } catch (err) {
      avisar("Não foi possível excluir: " + err.message);
    }
  });
  dlg.showModal();
}

// ---------------------------------------------------------------- diálogo: leitura (marcador)
const selVeiculo = (atual, { soAtivos = true } = {}) =>
  opcoes((soAtivos ? veiculos.filter((v) => v.ativo !== false || v.id === atual) : veiculos).map((v) => [v.id, v.nome]), atual);

function abrirLeitura(veiculoId, leituraId = null) {
  const m = leituraId ? marcadores.find((x) => x.id === leituraId) : null;
  const vid = (m && m.veiculo_id) || veiculoId || filtroVeiculo || (ativos()[0] || {}).id;
  const dlg = $("#dlg-leitura");
  dlg.innerHTML = `<form id="form-leitura">
    <div class="dlg-cab"><h2 id="titulo-leitura">${m ? "Editar leitura" : "Lançar leitura"}</h2><button class="btn-link" data-fechar type="button">Fechar</button></div>
    <div class="dlg-corpo">
      <div class="campos">
        <label class="c4">Veículo<select name="veiculo_id" required>${selVeiculo(vid)}</select></label>
        <label class="c2">Data<input type="date" name="data" value="${esc((m && m.data) || hoje)}" max="${hoje}" required></label>
        <label class="c3 campo-km">Hodômetro (km)<input name="km" inputmode="decimal" value="${esc(num1(m && m.km))}" autocomplete="off"></label>
        <label class="c3 campo-horas">Horímetro (horas)<input name="horas" inputmode="decimal" value="${esc(num1(m && m.horas))}" autocomplete="off"></label>
        <label class="c6">Observação<input name="observacao" value="${esc(m && m.observacao)}" maxlength="300" placeholder="opcional"></label>
      </div>
      <p class="dica" id="leitura-anterior"></p>
    </div>
    <div class="dlg-rodape">
      ${m ? '<button class="btn btn-perigo esquerda" type="button" id="btn-excluir-leitura">Excluir</button>' : ""}
      <button class="btn btn-claro" type="button" data-fechar>Cancelar</button>
      <button class="btn btn-primary" type="submit">Salvar leitura</button>
    </div>
  </form>`;
  const form = $("#form-leitura", dlg);
  const ajustar = () => {
    const v = veiculoDe(form.veiculo_id.value);
    const q = v && quadroDe(v.id);
    $(".campo-km", form).hidden = !V.usaKm(v);
    $(".campo-horas", form).hidden = !V.usaHoras(v);
    $("#leitura-anterior", form).textContent = q && q.atual
      ? `Última leitura: ${V.dataBR(q.atual.data)}${q.atual.km != null && V.usaKm(v) ? ` · ${V.kmBR(q.atual.km)}` : ""}${q.atual.horas != null && V.usaHoras(v) ? ` · ${V.horasBR(q.atual.horas)}` : ""}.`
      : "Primeira leitura deste veículo.";
  };
  form.veiculo_id.addEventListener("change", ajustar);
  ajustar();
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = veiculoDe(form.veiculo_id.value);
    const km = V.usaKm(v) ? numeroOuNull(form.km.value) : null, horas = V.usaHoras(v) ? numeroOuNull(form.horas.value) : null;
    if (km == null && horas == null) return avisar(`Informe ${V.medidorTexto(v) === "horas" ? "as horas" : "a quilometragem"}.`);
    if ((km != null && km < 0) || (horas != null && horas < 0)) return avisar("A leitura não pode ser negativa.");
    const q = quadroDe(v.id);
    const outras = q.leituras.filter((l) => !(l.origem === "marcador" && l.id === (m && m.id)) && l.data <= form.data.value);
    const maxKm = Math.max(-1, ...outras.map((l) => l.km ?? -1)), maxH = Math.max(-1, ...outras.map((l) => l.horas ?? -1));
    if ((km != null && km < maxKm) || (horas != null && horas < maxH))
      if (!confirm(`A leitura está menor que uma anterior (${km != null && km < maxKm ? V.kmBR(maxKm) : V.horasBR(maxH)}). O hodômetro foi trocado ou houve erro de digitação? Salvar assim mesmo?`)) return;
    try {
      await col("veiculos_marcadores").salvar({ ...(m || {}), perfil_id: v.perfil_id, veiculo_id: v.id, data: form.data.value, km, horas, observacao: form.observacao.value.trim() || null });
      avisar("Leitura salva.");
      dlg.close();
      await recarregar();
    } catch (err) {
      avisar("Não foi possível salvar: " + err.message);
    }
  });
  $("#btn-excluir-leitura", form)?.addEventListener("click", async () => {
    if (!confirm("Excluir esta leitura?")) return;
    await col("veiculos_marcadores").remover(m.id).catch((err) => avisar(err.message));
    dlg.close();
    await recarregar();
  });
  dlg.showModal();
  (V.usaKm(veiculoDe(form.veiculo_id.value)) ? form.km : form.horas).focus();
}

// ---------------------------------------------------------------- diálogo: preventiva
function abrirPlano(id, veiculoId = null) {
  const existente = planos.find((p) => p.id === id);
  const p = existente ? { ...existente } : { veiculo_id: veiculoId || filtroVeiculo || (ativos()[0] || {}).id, ativo: true };
  const dlg = $("#dlg-plano");
  dlg.innerHTML = `<form id="form-plano">
    <div class="dlg-cab"><h2 id="titulo-plano">${existente ? esc(p.nome) : "Nova preventiva"}</h2><button class="btn-link" data-fechar type="button">Fechar</button></div>
    <div class="dlg-corpo">
      <div class="campos">
        <label class="c3">Veículo<select name="veiculo_id" required>${selVeiculo(p.veiculo_id)}</select></label>
        <label class="c3">O que fazer<input name="nome" value="${esc(p.nome)}" required maxlength="120" list="lista-sugestoes" placeholder="Ex.: Troca de óleo do motor e filtro"></label>
        <datalist id="lista-sugestoes">${V.SUGESTOES_PREVENTIVA.map((s) => `<option>${esc(s)}</option>`).join("")}</datalist>
      </div>
      <fieldset class="bloco"><legend>A cada (vale o que vencer primeiro)</legend>
        <div class="campos">
          <label class="c2">Meses<input name="intervalo_meses" inputmode="decimal" value="${esc(num1(p.intervalo_meses))}" placeholder="ex.: 12"></label>
          <label class="c2 campo-km">Quilômetros<input name="intervalo_km" inputmode="decimal" value="${esc(num1(p.intervalo_km))}" placeholder="ex.: 10000"></label>
          <label class="c2 campo-horas">Horas de uso<input name="intervalo_horas" inputmode="decimal" value="${esc(num1(p.intervalo_horas))}" placeholder="ex.: 250"></label>
        </div>
      </fieldset>
      <fieldset class="bloco"><legend>Avisar com antecedência</legend>
        <div class="campos">
          <label class="c2">Dias antes<input name="aviso_dias" inputmode="numeric" value="${esc(p.aviso_dias ?? "")}" placeholder="${V.AVISO_DIAS_PADRAO}"></label>
          <label class="c2 campo-km">Km antes<input name="aviso_km" inputmode="decimal" value="${esc(num1(p.aviso_km))}" placeholder="10% do intervalo"></label>
          <label class="c2 campo-horas">Horas antes<input name="aviso_horas" inputmode="decimal" value="${esc(num1(p.aviso_horas))}" placeholder="10% do intervalo"></label>
        </div>
        <p class="dica">Em branco: ${V.AVISO_DIAS_PADRAO} dias e 10% do intervalo em km ou horas.</p>
      </fieldset>
      <fieldset class="bloco"><legend>Última vez feita (antes de registrar aqui)</legend>
        <div class="campos">
          <label class="c2">Data<input type="date" name="ultima_data" value="${esc(p.ultima_data)}" max="${hoje}"></label>
          <label class="c2 campo-km">Km<input name="ultima_km" inputmode="decimal" value="${esc(num1(p.ultima_km))}"></label>
          <label class="c2 campo-horas">Horas<input name="ultima_horas" inputmode="decimal" value="${esc(num1(p.ultima_horas))}"></label>
        </div>
        <p class="dica" id="plano-ultima"></p>
      </fieldset>
      <div class="campos veic-mt">
        <label class="c6">Observações (óleo, peça, especificação do manual)<textarea name="observacao" rows="2" maxlength="1000">${esc(p.observacao)}</textarea></label>
        <label class="c6 veic-check"><input type="checkbox" name="ativo"${p.ativo !== false ? " checked" : ""}> Ativa (desmarque para parar de avisar sem perder o histórico)</label>
      </div>
    </div>
    <div class="dlg-rodape">
      ${existente ? '<button class="btn btn-perigo esquerda" type="button" id="btn-excluir-plano">Excluir</button><button class="btn btn-claro" type="button" id="btn-plano-feita">Registrar que foi feita</button>' : ""}
      <button class="btn btn-claro" type="button" data-fechar>Cancelar</button>
      <button class="btn btn-primary" type="submit">Salvar</button>
    </div>
  </form>`;
  const form = $("#form-plano", dlg);
  const ajustar = () => {
    const v = veiculoDe(form.veiculo_id.value);
    $$(".campo-km", form).forEach((x) => (x.hidden = !V.usaKm(v)));
    $$(".campo-horas", form).forEach((x) => (x.hidden = !V.usaHoras(v)));
    const ult = existente && V.ultimaDoPlano(existente, servicos);
    $("#plano-ultima", form).textContent = ult && ult.servico
      ? `Já existe serviço registrado com esta preventiva (${V.dataBR(ult.data)}): ele é que vale como a última vez.`
      : "Informe a data e a leitura da última troca para o site calcular a próxima. Depois, cada serviço registrado com esta preventiva passa a valer.";
  };
  form.veiculo_id.addEventListener("change", ajustar);
  ajustar();
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const v = veiculoDe(f.get("veiculo_id"));
    const dados = { ...p, veiculo_id: v.id, perfil_id: v.perfil_id, nome: String(f.get("nome") || "").trim(), observacao: String(f.get("observacao") || "").trim() || null,
      ativo: f.get("ativo") === "on", ultima_data: f.get("ultima_data") || null };
    for (const c of ["intervalo_meses", "intervalo_km", "intervalo_horas", "aviso_km", "aviso_horas", "ultima_km", "ultima_horas"]) dados[c] = numeroOuNull(f.get(c));
    dados.aviso_dias = numeroOuNull(f.get("aviso_dias")) == null ? null : Math.round(numeroOuNull(f.get("aviso_dias")));
    if (!V.usaKm(v)) dados.intervalo_km = dados.aviso_km = dados.ultima_km = null;
    if (!V.usaHoras(v)) dados.intervalo_horas = dados.aviso_horas = dados.ultima_horas = null;
    if (!dados.nome) return avisar("Informe o que fazer.");
    if (!dados.intervalo_meses && !dados.intervalo_km && !dados.intervalo_horas) return avisar("Informe pelo menos um intervalo: meses, km ou horas.");
    if ([dados.intervalo_meses, dados.intervalo_km, dados.intervalo_horas].some((x) => x != null && x <= 0)) return avisar("Os intervalos precisam ser maiores que zero.");
    try {
      await col("veiculos_planos").salvar(dados);
      avisar("Preventiva salva.");
      dlg.close();
      await recarregar();
    } catch (err) {
      avisar("Não foi possível salvar: " + err.message);
    }
  });
  $("#btn-excluir-plano", form)?.addEventListener("click", async () => {
    if (!confirm(`Excluir a preventiva ${p.nome}? Os serviços já registrados continuam no histórico. Para só parar os avisos, desmarque "Ativa".`)) return;
    try {
      await col("veiculos_planos").remover(p.id);
      dlg.close();
      avisar("Preventiva excluída.");
      await recarregar();
    } catch (err) {
      avisar("Não foi possível excluir: " + err.message);
    }
  });
  $("#btn-plano-feita", form)?.addEventListener("click", () => { dlg.close(); abrirServico(null, { planoId: p.id }); });
  dlg.showModal();
}

// ---------------------------------------------------------------- diálogo: serviço, troca de peça ou despesa
function linhaItem(i = {}) {
  return `<div class="veic-item"><input name="item_desc" value="${esc(i.descricao)}" maxlength="120" placeholder="Peça ou serviço (ex.: Filtro de óleo)" aria-label="Peça ou serviço">
    <input name="item_qtd" inputmode="decimal" value="${esc(num1(i.qtd ?? ""))}" placeholder="Qtd." aria-label="Quantidade">
    <input name="item_valor" inputmode="decimal" value="${i.valor != null ? esc(String(i.valor).replace(".", ",")) : ""}" placeholder="Valor total" aria-label="Valor">
    <button class="btn-link perigo" type="button" data-tirar-item aria-label="Tirar">✕</button></div>`;
}

function abrirServico(id, { veiculoId = null, planoId = null, despesa = false } = {}) {
  const existente = servicos.find((s) => s.id === id);
  const plano = planoId && planos.find((p) => p.id === planoId);
  const vid = (existente && existente.veiculo_id) || (plano && plano.veiculo_id) || veiculoId || filtroVeiculo || (ativos()[0] || {}).id;
  const q0 = quadroDe(vid);
  const s = existente ? { ...existente } : { veiculo_id: vid, data: hoje, tipo: despesa ? "despesa" : plano ? "preventiva" : "preventiva", planos: plano ? [plano.id] : [], itens: [],
    descricao: plano ? plano.nome : "", km: q0 && q0.atual && q0.atual.data === hoje ? q0.atual.km : null, horas: q0 && q0.atual && q0.atual.data === hoje ? q0.atual.horas : null };
  const docs = existente ? anexos.filter((a) => a.servico_id === s.id) : [];
  const dlg = $("#dlg-servico");
  dlg.innerHTML = `<form id="form-servico">
    <div class="dlg-cab"><h2 id="titulo-servico">${existente ? esc(s.descricao) : despesa ? "Nova despesa" : "Registrar serviço"}</h2><button class="btn-link" data-fechar type="button">Fechar</button></div>
    <div class="dlg-corpo">
      <div class="campos">
        <label class="c2">Veículo<select name="veiculo_id" required>${selVeiculo(s.veiculo_id, { soAtivos: !existente })}</select></label>
        <label class="c2">Tipo<select name="tipo">${opcoes(V.TIPOS_SERVICO, s.tipo)}</select></label>
        <label class="c2">Data<input type="date" name="data" value="${esc(s.data)}" max="${V.somarDias(hoje, 1)}" required></label>
        <label class="c4 descricao">Descrição<input name="descricao" value="${esc(s.descricao)}" required maxlength="200" placeholder="Ex.: Revisão dos 40.000 km"></label>
        <label class="c2">Valor total (R$)<input name="valor" inputmode="decimal" value="${s.valor != null ? esc(String(s.valor).replace(".", ",")) : ""}"></label>
        <label class="c2 so-despesa">Categoria<select name="categoria">${opcoes(V.CATEGORIAS_DESPESA, s.categoria || "Combustível")}</select></label>
        <label class="c2 campo-km">Km no dia<input name="km" inputmode="decimal" value="${esc(num1(s.km))}"></label>
        <label class="c2 campo-horas">Horas no dia<input name="horas" inputmode="decimal" value="${esc(num1(s.horas))}"></label>
        <span class="c6 veic-quebra" aria-hidden="true"></span>
        <label class="c3">Oficina / loja / posto<input name="fornecedor" value="${esc(s.fornecedor)}" maxlength="120" list="lista-fornecedores"></label>
        <datalist id="lista-fornecedores">${[...new Set(servicos.map((x) => x.fornecedor).filter(Boolean))].map((x) => `<option>${esc(x)}</option>`).join("")}</datalist>
        <label class="c3">Nº da nota fiscal<input name="nota" value="${esc(s.nota)}" maxlength="60"></label>
      </div>
      <fieldset class="bloco nao-despesa" id="bloco-planos"><legend>Preventivas feitas neste serviço</legend><div id="planos-opcoes"></div>
        <p class="dica">As marcadas voltam a contar a partir deste serviço (data, km e horas acima).</p></fieldset>
      <fieldset class="bloco nao-despesa"><legend>Peças e serviços (opcional)</legend>
        <div id="itens">${(s.itens || []).map(linhaItem).join("")}</div>
        <button class="btn btn-claro" type="button" id="btn-item">Adicionar peça ou serviço</button>
        <p class="dica" id="soma-itens"></p></fieldset>
      <div class="campos veic-mt"><label class="c6">Observações<textarea name="observacao" rows="2" maxlength="2000">${esc(s.observacao)}</textarea></label></div>
      ${blocoAnexos(docs, "Nota fiscal, fotos e documentos", "A nota, o orçamento, fotos da peça trocada ou o XML da NF-e.")}
    </div>
    <div class="dlg-rodape">
      ${existente ? '<button class="btn btn-perigo esquerda" type="button" id="btn-excluir-servico">Excluir</button>' : ""}
      <button class="btn btn-claro" type="button" data-fechar>Cancelar</button>
      <button class="btn btn-primary" type="submit">Salvar</button>
    </div>
  </form>`;
  const form = $("#form-servico", dlg);
  if (existente) ligarAnexos(form, () => { renderServicos(); renderDespesas(); });
  let marcados = new Set(s.planos || []);
  const ajustar = () => {
    const v = veiculoDe(form.veiculo_id.value);
    const desp = form.tipo.value === "despesa";
    $$(".campo-km", form).forEach((x) => (x.hidden = !V.usaKm(v)));
    $$(".campo-horas", form).forEach((x) => (x.hidden = !V.usaHoras(v)));
    $$(".so-despesa", form).forEach((x) => (x.hidden = !desp));
    $$(".nao-despesa", form).forEach((x) => (x.hidden = desp));
    const doVeiculo = planos.filter((p) => p.veiculo_id === v.id && (p.ativo !== false || marcados.has(p.id)));
    $("#planos-opcoes", form).innerHTML = doVeiculo.length ? `<div class="opcoes veic-opcoes">${doVeiculo.map((p) => {
      const st = (quadroDe(v.id).preventivas.find((x) => x.plano.id === p.id) || {}).estado;
      return `<label><input type="checkbox" name="planos" value="${esc(p.id)}"${marcados.has(p.id) ? " checked" : ""}> ${esc(p.nome)}${st && st !== "ok" ? ` ${etiqueta(V.CLASSE_ESTADO[st], V.ROTULO_ESTADO[st])}` : ""}</label>`;
    }).join("")}</div>` : '<p class="dica">Este veículo ainda não tem preventivas cadastradas.</p>';
  };
  const somar = () => {
    const vals = $$(".veic-item", form).map((l) => numeroOuNull(l.querySelector("[name=item_valor]").value)).filter((x) => x != null);
    const total = vals.reduce((t, x) => t + x, 0);
    $("#soma-itens", form).textContent = vals.length ? `Soma das peças e serviços: ${moeda(total)}${numeroOuNull(form.valor.value) == null ? " (vira o valor total se ele ficar em branco)" : ""}.` : "";
    return vals.length ? total : null;
  };
  form.addEventListener("change", (e) => {
    if (e.target.name === "planos") e.target.checked ? marcados.add(e.target.value) : marcados.delete(e.target.value);
    if (e.target.name === "veiculo_id" || e.target.name === "tipo") ajustar();
  });
  form.addEventListener("input", (e) => { if (e.target.name === "item_valor" || e.target.name === "valor") somar(); });
  $("#btn-item", form).addEventListener("click", () => { $("#itens", form).insertAdjacentHTML("beforeend", linhaItem()); $("#itens .veic-item:last-child input", form).focus(); });
  form.addEventListener("click", (e) => { if (e.target.closest("[data-tirar-item]")) { e.target.closest(".veic-item").remove(); somar(); } });
  ajustar();
  somar();
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const v = veiculoDe(f.get("veiculo_id"));
    const desp = f.get("tipo") === "despesa";
    const itens = desp ? [] : $$(".veic-item", form).map((l) => ({ descricao: l.querySelector("[name=item_desc]").value.trim().slice(0, 120),
      qtd: numeroOuNull(l.querySelector("[name=item_qtd]").value), valor: numeroOuNull(l.querySelector("[name=item_valor]").value) })).filter((i) => i.descricao);
    const dados = { ...s, veiculo_id: v.id, perfil_id: v.perfil_id, tipo: f.get("tipo"), data: f.get("data"),
      categoria: desp ? f.get("categoria") : null, descricao: String(f.get("descricao") || "").trim(),
      km: V.usaKm(v) ? numeroOuNull(f.get("km")) : null, horas: V.usaHoras(v) ? numeroOuNull(f.get("horas")) : null,
      valor: numeroOuNull(f.get("valor")), fornecedor: String(f.get("fornecedor") || "").trim() || null, nota: String(f.get("nota") || "").trim() || null,
      planos: desp ? [] : [...marcados].filter((id) => planos.some((p) => p.id === id && p.veiculo_id === v.id)), itens,
      observacao: String(f.get("observacao") || "").trim() || null };
    if (!dados.descricao) return avisar("Informe a descrição.");
    if (dados.valor == null && itens.some((i) => i.valor != null)) dados.valor = Math.round(itens.reduce((t, i) => t + (i.valor || 0), 0) * 100) / 100;
    if (dados.valor != null && dados.valor < 0) return avisar("O valor não pode ser negativo.");
    if (desp && dados.valor == null) return avisar("Informe o valor da despesa.");
    if (dados.planos.length && dados.km == null && dados.horas == null && planos.some((p) => dados.planos.includes(p.id) && (p.intervalo_km || p.intervalo_horas))
      && !confirm("Sem o km/horas do dia, a próxima troca por quilometragem ou horas não tem de onde contar. Salvar assim mesmo?")) return;
    const arquivos = [...(form.arquivos?.files || [])];
    try {
      const salvo = await col("veiculos_servicos").salvar(dados);
      const falhas = arquivos.length ? await enviarArquivos(arquivos, { veiculo: v, servicoId: salvo.id }) : 0;
      if (!falhas) avisar(desp ? "Despesa salva." : "Serviço registrado.");
      dlg.close();
      await recarregar();
    } catch (err) {
      avisar("Não foi possível salvar: " + err.message);
    }
  });
  $("#btn-excluir-servico", form)?.addEventListener("click", async () => {
    if (!confirm(`Excluir "${s.descricao}"${docs.length ? ` e ${docs.length} ${docs.length === 1 ? "arquivo anexado" : "arquivos anexados"}` : ""}?`)) return;
    try {
      await apagarArquivosDe((a) => a.servico_id === s.id);
      await col("veiculos_servicos").remover(s.id);
      dlg.close();
      avisar("Excluído.");
      await recarregar();
    } catch (err) {
      avisar("Não foi possível excluir: " + err.message);
    }
  });
  dlg.showModal();
}

// ---------------------------------------------------------------- planilhas
function csvServicos(lista, nome) {
  baixarCsv(nome, ["Data", "Veículo", "Tipo", "Categoria", "Descrição", "Km", "Horas", "Valor", "Oficina / loja", "Nota fiscal", "Preventivas feitas", "Peças e serviços", "Observações"],
    lista.map((s) => [V.dataBR(s.data), nomeVeiculo(s.veiculo_id), rotuloTipo(V.TIPOS_SERVICO, s.tipo), V.categoriaDe(s), s.descricao, s.km, s.horas,
      s.valor == null ? null : Number(s.valor), s.fornecedor, s.nota, (s.planos || []).map((id) => (planos.find((p) => p.id === id) || {}).nome).filter(Boolean).join(", "),
      (s.itens || []).map((i) => `${i.descricao}${i.valor != null ? ` (${moeda(i.valor)})` : ""}`).join("; "), s.observacao]));
}

// ---------------------------------------------------------------- início
async function iniciar() {
  const sessao = await abrirPagina("veiculos.html");
  if (!sessao) return;
  ({ armazem, perfil } = sessao);
  prepararDialogos();
  if (perfil.papel === "adm" && armazem.usuarios) {
    const lista = await armazem.usuarios.listar().catch(() => []);
    donos = new Map(lista.map((u) => [u.id, (u.nome || u.email || "").split(" ")[0]]));
  }
  try {
    await recarregar();
  } catch (err) {
    avisar(err.message);
    $("#conteudo").insertAdjacentHTML("afterbegin", `<p class="cartao erro-geral" role="alert">${esc(err.message)}</p>`);
  }
  $("#conteudo").hidden = false;

  $("#btn-veiculo").addEventListener("click", () => abrirVeiculo(null));
  $("#btn-veiculo-vazio").addEventListener("click", () => abrirVeiculo(null));
  $("#btn-leitura").addEventListener("click", () => abrirLeitura(null));
  $("#btn-servico").addEventListener("click", () => abrirServico(null));
  $("#btn-despesa").addEventListener("click", () => abrirServico(null, { despesa: true }));
  $("#btn-despesa-2").addEventListener("click", () => abrirServico(null, { despesa: true }));
  $("#btn-plano").addEventListener("click", () => abrirPlano(null));
  $("#filtro-prev").addEventListener("change", renderPreventivas);
  for (const id of ["#busca-serv", "#filtro-tipo", "#filtro-ano"]) $(id).addEventListener(id === "#busca-serv" ? "input" : "change", renderServicos);
  $("#periodo").addEventListener("change", renderDespesas);
  $("#btn-csv-serv").addEventListener("click", () => csvServicos(servicosFiltrados(), "veiculos-servicos.csv"));
  $("#btn-csv-desp").addEventListener("click", () => csvServicos(despesasDoPeriodo().lista, "veiculos-despesas.csv"));

  $("#veic-abas").addEventListener("click", (e) => { const b = e.target.closest("[role=tab]"); if (b) irPara(b.dataset.aba); });
  $("#veic-abas").addEventListener("keydown", (e) => {
    if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
    const abas = $$("#veic-abas [role=tab]");
    const i = abas.findIndex((b) => b.dataset.aba === aba);
    const prox = abas[(i + (e.key === "ArrowRight" ? 1 : abas.length - 1)) % abas.length];
    irPara(prox.dataset.aba);
    prox.focus();
  });

  // Cliques nas listas e cards (um ouvinte só para a tela toda)
  $("#conteudo").addEventListener("click", (e) => {
    const el = (sel) => e.target.closest(sel);
    let x;
    if ((x = el("[data-veiculo]"))) { filtroVeiculo = x.dataset.veiculo; renderTudo(); return; }
    if ((x = el("[data-ir]"))) return irPara(x.dataset.ir);
    if ((x = el("[data-leitura]"))) return abrirLeitura(x.dataset.leitura);
    if ((x = el("[data-editar-leitura]"))) return abrirLeitura(null, x.dataset.editarLeitura);
    if ((x = el("[data-feita]"))) return abrirServico(null, { planoId: x.dataset.feita });
    if ((x = el("[data-servico-veiculo]"))) return abrirServico(null, { veiculoId: x.dataset.servicoVeiculo });
    if ((x = el("[data-plano-veiculo]"))) return abrirPlano(null, x.dataset.planoVeiculo);
    if ((x = el("[data-servico]"))) return abrirServico(x.dataset.servico);
    if ((x = el("[data-plano]"))) return abrirPlano(x.dataset.plano);
    if ((x = el("[data-veiculo-editar]"))) return abrirVeiculo(x.dataset.veiculoEditar);
  });
  $("#conteudo").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches("tr.clicavel")) e.target.click();
  });

  const inicial = location.hash.slice(1);
  if ($$("#veic-abas [role=tab]").some((b) => b.dataset.aba === inicial)) irPara(inicial);
}

iniciar();
