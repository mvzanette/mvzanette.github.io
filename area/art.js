// Área restrita – Controle de ART
import { abrirPagina } from "./sessao.js";
import * as R from "./regras.js";
import { extrairLinhas } from "./pdf-texto.js";
import { lerPdf } from "./leitores.js";
import { conferirPdf } from "./ui.js";

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const moeda = (n) => (n == null ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));

const TOS_DESC = new Map((typeof TOS_MECANICA !== "undefined" ? TOS_MECANICA : []).map(([c, , d]) => [c, d]));
const descricaoTos = (a) => {
  const d = TOS_DESC.get(a.tos) || a.descricao || "";
  return d.charAt(0).toUpperCase() + d.slice(1);
};

let armazem;
let arts = [];
let empresas = []; // empresas cadastradas (os nomes vêm do banco)
let tratados = new Set();
// situacao vazia: em aberto (sem as baixadas e as arquivadas)
const filtro = { busca: "", crea: "", situacao: "", para: "", cliente: "", ano: "", acao: "" };
const selecionadas = new Set(); // ARTs marcadas na lista para mudar a ação de uma vez
const hoje = R.hojeISO();
const semAcento = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

// Cliente da ART: pelo CNPJ (a raiz, que junta matriz e filiais) ou pelo CPF; sem documento, pelo nome. O nome
// mostrado é o da ART mais recente do cliente.
const chaveCliente = (a) => {
  const d = String(a.contratante_doc || "").replace(/\D/g, "");
  return d.length === 14 ? `cnpj:${d.slice(0, 8)}` : d.length === 11 ? `cpf:${d}` : `nome:${semAcento(a.contratante || "não informado")}`;
};
const anoDe = (a) => (a.registrada || a.inicio || "").slice(0, 4) || null;
let clientes = new Map(); // chave → { nome, data, n }
function montarClientes() {
  clientes = new Map();
  for (const a of arts) {
    const k = chaveCliente(a), data = a.registrada || a.inicio || "";
    const c = clientes.get(k) || { nome: a.contratante || "Não informado", data: "", n: 0 };
    c.n++;
    if (data >= c.data && a.contratante) { c.nome = a.contratante; c.data = data; }
    clientes.set(k, c);
  }
}
const nomeCliente = (k) => (clientes.get(k) || {}).nome || "Não informado";

// Para quem a ART foi tirada: uma empresa (que paga a taxa) ou um cliente particular
const nomeEmpresa = (id) => (empresas.find((e) => e.id === id) || {}).nome || null;
const paraDe = (a) => (a.vinculo === "empresa" && a.empresa_id ? `e:${a.empresa_id}` : a.vinculo === "particular" ? "particular" : "");
const vinculoDe = (para) => ({
  vinculo: para.startsWith("e:") ? "empresa" : para === "particular" ? "particular" : null,
  empresa_id: para.startsWith("e:") ? para.slice(2) : null,
});
const opcoesPara = (atual, rotuloVazio = "Não informado") =>
  [["", rotuloVazio], ["particular", "Cliente particular (você paga a taxa)"], ...empresas.map((e) => [`e:${e.id}`, `${e.nome} (a empresa paga a taxa)`])]
    .map(([v, r]) => `<option value="${esc(v)}"${v === atual ? " selected" : ""}>${esc(r)}</option>`)
    .join("");
function chipVinculo(a) {
  if (a.vinculo === "empresa") return `<span class="vinculo vinculo-empresa">${esc(nomeEmpresa(a.empresa_id) || "Empresa removida")}</span>`;
  if (a.vinculo === "particular") return '<span class="vinculo">Particular</span>';
  return '<span class="dica">—</span>';
}

// ---------------------------------------------------------------- utilidades
let tempoToast;
function avisar(texto) {
  const t = $("#toast");
  t.textContent = texto;
  t.hidden = false;
  clearTimeout(tempoToast);
  tempoToast = setTimeout(() => (t.hidden = true), 4000);
}

function textoDias(art) {
  const s = R.situacao(art, hoje);
  if (s === "baixada") return `em ${R.dataBR(art.baixa_data)}`;
  if (s === "arquivada") return art.arquivada_em ? `em ${R.dataBR(art.arquivada_em)}` : "";
  const d = R.diasAte(art.fim, hoje);
  if (d === null) return "";
  if (d > 0) return `em ${d} dia${d === 1 ? "" : "s"}`;
  if (d === 0) return "hoje";
  return `há ${-d} dia${d === -1 ? "" : "s"}`;
}

function etiqueta(art) {
  const s = R.situacao(art, hoje);
  const dias = textoDias(art);
  const rotulo = s === "baixada" && art.baixa_motivo === "substituicao" ? "Substituída" : R.ROTULO_SITUACAO[s];
  return `<span class="etiqueta s-${s}">${esc(rotulo)}${dias ? `<small>${esc(dias)}</small>` : ""}</span>`;
}

// Caixa de seleção da ação: na ART vencida, que vence nos próximos 90 dias ou que já tem uma ação (a arquivada
// também, para voltar a acompanhá-la). A baixada no CREA não tem mais ação.
// A baixa tem dois passos: sinalizar ("Dar baixa": a ART fica no indicador "a dar baixa") e, depois de dar a baixa no
// portal do CREA, registrar aqui a data (a ART fica baixada e sai dos vencimentos, dos alertas e do indicador). Quem já
// deu a baixa no CREA escolhe "Registrar a baixa agora" e faz os dois de uma vez.
const REGISTRAR_BAIXA = "registrar-baixa";
const opcoesAcao = (atual, vazio = "Definir ação…") =>
  `<option value="">${esc(vazio)}</option>${Object.entries(R.ACOES).map(([v, t]) => `<option value="${v}"${atual === v ? " selected" : ""}>${esc(t)}</option>`).join("")}
  <option value="${REGISTRAR_BAIXA}">✓ Registrar a baixa agora (já feita no CREA)</option>`;
function selectAcao(art) {
  const faixa = R.faixaVencimento(art, hoje);
  if (art.baixa_data || (!faixa && !art.acao)) return '<span class="dica">—</span>';
  // sem ação, fica em destaque na vencida e na que vence em até 30 dias
  const destaque = !art.acao && (faixa === "vencida" || faixa === "30");
  const sel = `<select class="sel-acao${destaque ? " sem-acao" : ""}" data-acao="${esc(art.id)}" aria-label="Ação para a ART ${esc(art.numero)}">${opcoesAcao(art.acao)}</select>`;
  // Sinalizada para dar baixa: o botão conclui a baixa
  return art.acao === "baixa"
    ? `<div class="acao-cel">${sel}<button class="btn btn-dark mini" type="button" data-registrar-baixa="${esc(art.id)}">Registrar baixa</button></div>`
    : sel;
}

// Arquivar guarda o dia; qualquer outra ação tira a ART do arquivo
const comAcao = (art, acao) => ({ ...art, acao: acao || null, arquivada_em: acao === "arquivada" ? art.arquivada_em || hoje : null });
const textoAcao = (acao) => (acao === "arquivada" ? "arquivada" : acao ? R.ACOES[acao].toLowerCase() : "ação desmarcada");

async function salvarAcao(id, acao, select = null) {
  const art = arts.find((a) => a.id === id);
  if (!art) return;
  if (acao === REGISTRAR_BAIXA) {
    if (select) select.value = art.acao || ""; // só muda depois de confirmar
    abrirBaixa([art]);
    return;
  }
  try {
    const salvo = await armazem.salvar(comAcao(art, acao));
    arts = arts.map((a) => (a.id === id ? { ...a, ...salvo } : a));
    renderizar();
    if ($("#dlg-vencimentos").open) renderVencimentos();
    avisar(`ART ${art.numero}: ${textoAcao(acao)}.`);
  } catch (err) {
    avisar("Não foi possível salvar a ação: " + err.message);
  }
}

// Registrar a baixa (uma ART, pelo pop-up ou pela lista, ou várias, pela ação em lote): data e motivo, com a
// confirmação de que a baixa já foi dada no portal do CREA
function abrirBaixa(lista) {
  const dlg = $("#dlg-baixa");
  const uma = lista.length === 1 ? lista[0] : null;
  const sinalizadas = lista.filter((a) => a.acao === "baixa").length;
  dlg.innerHTML = `<form id="form-baixa" novalidate>
    <div class="dlg-cab"><h2 id="titulo-baixa">Registrar baixa${uma ? ` da ART nº ${esc(uma.numero)}` : ` de ${lista.length} ARTs`}</h2><button class="btn-link" data-fechar type="button">Fechar</button></div>
    <div class="dlg-corpo">
      ${uma ? `<p>${esc(uma.contratante || "Cliente não informado")}${uma.fim ? ` · fim previsto em ${R.dataBR(uma.fim)}` : ""}</p>`
        : `<p class="lista-baixa">${lista.map((a) => esc(a.numero)).join(", ")}</p>`}
      <ol class="passos-baixa">
        <li class="${sinalizadas === lista.length ? "feito" : ""}"><b>Sinalizar</b> a ação “Dar baixa”${sinalizadas === lista.length ? " (feito)" : " (feito agora, junto com o registro)"}</li>
        <li><b>Dar a baixa no portal do CREA</b> (obra ou serviço concluído, ou interrompido)</li>
        <li><b>Registrar aqui</b> a data da baixa: a ART sai dos vencimentos, dos alertas e do indicador de ação</li>
      </ol>
      <div class="campos">
        <label class="c3">Data da baixa no CREA<input type="date" name="data" value="${hoje}" max="${hoje}" required></label>
        <label class="c3">Motivo<select name="motivo"><option value="conclusao">Conclusão</option><option value="interrupcao">Interrupção</option></select></label>
      </div>
      <label class="opcao-linha confirma-baixa"><input type="checkbox" name="confirmo"> <span>Já dei a baixa ${uma ? "desta ART" : "destas ARTs"} no portal do CREA</span></label>
      <p class="erro" id="erro-baixa" role="alert" hidden></p>
    </div>
    <div class="dlg-rodape">
      <button class="btn btn-claro" type="button" data-fechar>Cancelar</button>
      <button class="btn btn-primary" type="submit" disabled>Registrar baixa</button>
    </div>
  </form>`;
  const form = $("#form-baixa", dlg);
  const botao = form.querySelector("[type=submit]");
  form.elements.confirmo.addEventListener("change", (e) => { botao.disabled = !e.target.checked; });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = form.elements.data.value;
    const falha = (t) => { $("#erro-baixa", dlg).textContent = t; $("#erro-baixa", dlg).hidden = false; };
    if (!form.elements.confirmo.checked) return falha("Confirme que a baixa já foi dada no portal do CREA.");
    if (!data || data > hoje) return falha("Informe a data em que a baixa foi dada no CREA (hoje ou antes).");
    botao.disabled = true;
    try {
      const motivo = form.elements.motivo.value;
      // A ação fica como "Dar baixa" (o histórico mostra o que foi feito) e a ART sai do arquivo, se estava nele
      const salvos = await armazem.salvarVarios(lista.map((a) => ({ ...a, acao: a.acao && a.acao !== "arquivada" ? a.acao : "baixa", arquivada_em: null,
        baixa_data: data, baixa_motivo: motivo })));
      const porId = new Map(salvos.map((x) => [x.id, x]));
      arts = arts.map((a) => (porId.has(a.id) ? { ...a, ...porId.get(a.id) } : a));
      lista.forEach((a) => selecionadas.delete(a.id));
      $("#lote-acao").value = "";
      dlg.close();
      renderizar();
      if ($("#dlg-vencimentos").open) renderVencimentos();
      avisar(uma ? `Baixa registrada na ART ${uma.numero} (${R.dataBR(data)}).` : `Baixa registrada em ${plural(lista.length, "ART", "ARTs")} (${R.dataBR(data)}).`);
    } catch (err) {
      falha("Não foi possível registrar a baixa: " + err.message);
      botao.disabled = false;
    }
  });
  dlg.showModal();
}

// Ação escolhida para as ARTs marcadas na lista
async function aplicarEmLote() {
  const escolha = $("#lote-acao").value;
  const lista = arts.filter((a) => selecionadas.has(a.id) && !a.baixa_data);
  if (!lista.length || !escolha) return;
  if (escolha === REGISTRAR_BAIXA) {
    abrirBaixa(lista);
    return;
  }
  const acao = escolha === "nenhuma" ? null : escolha;
  const botao = $("#btn-lote-aplicar");
  botao.disabled = true;
  try {
    const salvos = await armazem.salvarVarios(lista.map((a) => comAcao(a, acao)));
    const porId = new Map(salvos.map((x) => [x.id, x]));
    arts = arts.map((a) => (porId.has(a.id) ? { ...a, ...porId.get(a.id) } : a));
    selecionadas.clear();
    $("#lote-acao").value = "";
    renderizar();
    avisar(`${plural(lista.length, "ART", "ARTs")}: ${textoAcao(acao)}.`);
  } catch (err) {
    avisar("Não foi possível aplicar a ação: " + err.message);
  } finally {
    botao.disabled = !$("#lote-acao").value;
  }
}

const ORDEM = { vencida: 0, vencendo: 1, ativa: 2, "sem-data": 3, baixada: 4, arquivada: 5 };
function ordenar(lista) {
  return [...lista].sort((a, b) => {
    const sa = R.situacao(a, hoje), sb = R.situacao(b, hoje);
    if (sa !== sb) return ORDEM[sa] - ORDEM[sb];
    const fa = a.fim || "9999", fb = b.fim || "9999";
    return R.encerrada(a) ? fb.localeCompare(fa) : fa.localeCompare(fb);
  });
}

// ---------------------------------------------------------------- início
// O login, o menu e o aviso do modo demonstração ficam em sessao.js
async function iniciar() {
  const sessao = await abrirPagina("art.html");
  if (!sessao) return;
  armazem = sessao.armazem;
  $("#tela-painel").hidden = false;
  // Vindo das tarefas pendentes (art.html#acao): direto para as ARTs que precisam de baixa ou ação
  if (location.hash === "#acao") filtro.situacao = "acao";
  $("#filtro-situacao").value = filtro.situacao;
  await recarregar();
  if (filtro.situacao !== "acao") abrirVencimentos(true); // sempre ao entrar, quando houver ART vencida ou a vencer em 90 dias
}

async function recarregar() {
  [arts, tratados, empresas] = await Promise.all([armazem.listar(), armazem.tratados(), armazem.empresas.listar().catch(() => [])]);
  const filtroPara = $("#filtro-para");
  filtroPara.innerHTML = [["", "Empresas e particulares"], ["empresas", "Todas as empresas"], ...empresas.map((e) => [`e:${e.id}`, e.nome]),
    ["particular", "Clientes particulares"], ["sem", "Não informado"]]
    .map(([v, r]) => `<option value="${esc(v)}"${v === filtro.para ? " selected" : ""}>${esc(r)}</option>`).join("");
  montarClientes();
  renderizar();
}

function renderFiltros() {
  const op = (lista, atual) => lista.map(([v, r]) => `<option value="${esc(v)}"${v === atual ? " selected" : ""}>${esc(r)}</option>`).join("");
  const cls = [...clientes.entries()].sort((a, b) => b[1].n - a[1].n || a[1].nome.localeCompare(b[1].nome, "pt-BR"));
  $("#filtro-cliente").innerHTML = op([["", "Todos os clientes"], ...cls.map(([k, c]) => [k, `${c.nome} (${c.n})`])], filtro.cliente);
  const anos = [...new Set(arts.map(anoDe).filter(Boolean))].sort().reverse();
  $("#filtro-ano").innerHTML = op([["", "Todos os anos"], ...anos.map((a) => [a, `Registradas em ${a}`])], filtro.ano);
  $("#filtro-acao").innerHTML = op([["", "Todas as ações"], ["sem", "Sem ação definida"], ...Object.entries(R.ACOES)], filtro.acao);
  if (!$("#lote-acao").options.length) {
    $("#lote-acao").innerHTML = opcoesAcao("", "Escolha a ação…") + '<option value="nenhuma">Tirar a ação</option>';
    $("#btn-lote-aplicar").disabled = true;
  }
}

function renderizar() {
  renderFiltros();
  renderResumo();
  renderTabela();
  renderAlertas();
}

// ---------------------------------------------------------------- resumo e tabela
// Indicador das ARTs que precisam de baixa ou de alguma ação (vencidas, vencendo em 30 dias ou com ação a fazer)
function htmlIndicadorAcao(ac) {
  if (!ac.total) return '<p class="ind-ok">Nenhuma ART precisa de baixa ou ação.</p>';
  const partes = [[ac.semAcao, "sem ação definida"], [ac.baixa, "a dar baixa"], [ac.outraArt, "aguardando substituta, complementar ou nova ART"]].filter(([n]) => n);
  return `<div class="ind-numero"><strong>${ac.total}</strong><span>${ac.total === 1 ? "ART precisa" : "ARTs precisam"} de baixa ou ação</span></div>
    <ul class="ind-partes">${partes.map(([n, t]) => `<li><b>${n}</b> ${t}</li>`).join("")}</ul>`;
}

function renderResumo() {
  const ac = R.resumoAcoes(arts, hoje);
  const ind = $("#indicador-acao");
  ind.classList.toggle("com-pendencia", ac.total > 0);
  ind.innerHTML = htmlIndicadorAcao(ac) + (ac.total ? `<div class="ind-botoes">
      <button class="btn btn-primary" type="button" data-situacao="acao" aria-pressed="${filtro.situacao === "acao"}">Ver ${ac.total === 1 ? "a ART" : `as ${ac.total}`}</button>
      ${ac.semAcao && ac.semAcao < ac.total ? `<button class="btn btn-claro" type="button" data-so-sem-acao>Só as sem ação</button>` : ""}</div>` : "");
  const conta = { ativa: 0, vencendo: 0, vencida: 0, baixada: 0, arquivada: 0, "sem-data": 0, vence90: 0 };
  arts.forEach((a) => { conta[R.situacao(a, hoje)]++; if (R.faixaVencimento(a, hoje) === "90") conta.vence90++; });
  conta.encerrada = conta.baixada + conta.arquivada;
  const cards = [
    ["vencida", "Vencidas sem baixa", "var(--erro)"],
    ["vencendo", "Vencem em até 30 dias", "var(--yellow)"],
    ["vence90", "Vencem em 31 a 90 dias", "#e0a100"],
    ["ativa", "Ativas (fim em mais de 30 dias)", "var(--ok)"],
    ["encerrada", "Baixadas ou arquivadas", "var(--gray-500)"],
  ];
  $("#resumo").innerHTML = cards
    .map(
      ([s, rotulo, cor]) =>
        `<button class="indicador" type="button" data-situacao="${s}" style="--cor:${cor}" aria-pressed="${filtro.situacao === s}">
          <strong>${conta[s]}</strong><span>${rotulo}</span></button>`
    )
    .join("");
}

// Na análise, sem situação escolhida, entram também as baixadas e as arquivadas (quantas foram emitidas)
function filtradas(paraAnalise = false) {
  const termo = filtro.busca.toLowerCase();
  return arts.filter((a) => {
    if (filtro.crea && a.crea !== filtro.crea) return false;
    const fs = filtro.situacao;
    if (fs === "vence90") { if (R.faixaVencimento(a, hoje) !== "90") return false; }
    else if (fs === "acao") { if (!R.precisaAcao(a, hoje)) return false; }
    else if (fs === "encerrada") { if (!R.encerrada(a)) return false; }
    else if (fs && fs !== "todas") { if (R.situacao(a, hoje) !== fs) return false; }
    else if (!fs && !paraAnalise && R.encerrada(a)) return false;
    if (filtro.cliente && chaveCliente(a) !== filtro.cliente) return false;
    if (filtro.ano && anoDe(a) !== filtro.ano) return false;
    if (filtro.acao === "sem" && (a.acao || !R.faixaVencimento(a, hoje))) return false;
    if (filtro.acao && filtro.acao !== "sem" && a.acao !== filtro.acao) return false;
    if (filtro.para === "empresas" && a.vinculo !== "empresa") return false;
    if (filtro.para === "particular" && a.vinculo !== "particular") return false;
    if (filtro.para === "sem" && a.vinculo) return false;
    if (filtro.para.startsWith("e:") && a.empresa_id !== filtro.para.slice(2)) return false;
    if (!termo) return true;
    return [a.numero, a.contratante, a.observacao, a.local, (a.tos || []).join(" "), nomeEmpresa(a.empresa_id) || ""].join(" ").toLowerCase().includes(termo);
  });
}

function renderTabela() {
  const lista = ordenar(filtradas());
  // A seleção vale só para o que está na lista
  const visiveis = new Set(lista.filter((a) => !a.baixa_data).map((a) => a.id));
  [...selecionadas].forEach((id) => { if (!visiveis.has(id)) selecionadas.delete(id); });
  $("#tabela tbody").innerHTML = lista
    .map(
      (a) => `<tr class="clicavel${selecionadas.has(a.id) ? " marcada" : ""}" data-id="${esc(a.id)}" tabindex="0">
        <td class="sel-cel">${a.baixa_data ? "" : `<input type="checkbox" data-sel="${esc(a.id)}"${selecionadas.has(a.id) ? " checked" : ""} aria-label="Selecionar a ART ${esc(a.numero)}">`}</td>
        <td class="numero">${esc(a.numero)}</td>
        <td>${esc(a.crea)}</td>
        <td>${esc(a.contratante || "—")}<br><small class="dica">${esc(a.local || "")}</small></td>
        <td>${chipVinculo(a)}</td>
        <td class="servico">${esc((a.observacao || "").slice(0, 110))}${(a.observacao || "").length > 110 ? "…" : ""}
          ${(a.tos || []).length ? `<br><small>TOS ${esc(a.tos.join(", "))}</small>` : ""}</td>
        <td class="data">${R.dataBR(a.inicio)}</td>
        <td class="data">${R.dataBR(a.fim)}</td>
        <td>${etiqueta(a)}</td>
        <td class="acao-cel">${selectAcao(a)}</td>
      </tr>`
    )
    .join("");
  const vazio = $("#vazio");
  vazio.hidden = lista.length > 0;
  if (!lista.length && arts.length) vazio.textContent = "Nenhuma ART encontrada com esses filtros.";
  const todas = $("#sel-todas");
  todas.checked = visiveis.size > 0 && selecionadas.size === visiveis.size;
  todas.indeterminate = selecionadas.size > 0 && selecionadas.size < visiveis.size;
  todas.disabled = !visiveis.size;
  renderLote();
  renderAnalise(filtradas(true));
}

function renderLote() {
  const n = selecionadas.size;
  $("#barra-lote").hidden = !n;
  $("#lote-n").textContent = `${plural(n, "ART selecionada", "ARTs selecionadas")}:`;
}

// ---------------------------------------------------------------- análise (segue os filtros)
function renderAnalise(lista) {
  const box = $("#analise");
  box.hidden = !arts.length;
  if (!arts.length) return;
  const filtrado = lista.length !== arts.length;
  $("#analise-dica").textContent = `${plural(lista.length, "ART", "ARTs")}${filtrado ? ` de ${arts.length}, com os filtros acima` : " no total"}. Clique num cliente para ver só as ARTs dele.`;
  const soma = (xs) => xs.reduce((t, a) => t + (Number(a.valor) || 0), 0);
  // Por cliente
  const porCliente = new Map();
  for (const a of lista) { const k = chaveCliente(a); porCliente.set(k, [...(porCliente.get(k) || []), a]); }
  const cl = [...porCliente.entries()].sort((a, b) => b[1].length - a[1].length || soma(b[1]) - soma(a[1]));
  const max = Math.max(1, ...cl.map(([, xs]) => xs.length));
  const conta = (xs, f) => xs.filter(f).length;
  $("#analise-clientes").innerHTML = cl.length ? `<div class="tabela-wrap"><table class="tabela compacta"><thead><tr><th>Cliente</th><th class="num">ARTs</th><th class="num">Vencidas</th><th class="num">Baixadas ou arquivadas</th><th class="num">Valor dos contratos</th></tr></thead><tbody>
    ${cl.map(([k, xs]) => `<tr class="clicavel-cliente" data-cliente="${esc(k)}" tabindex="0"><td>${esc(nomeCliente(k))}<span class="barra-analise"><span style="width:${(xs.length / max * 100).toFixed(1)}%"></span></span></td>
      <td class="num">${xs.length}</td><td class="num">${conta(xs, (a) => R.situacao(a, hoje) === "vencida") || "—"}</td><td class="num">${conta(xs, R.encerrada) || "—"}</td><td class="num">${moeda(soma(xs))}</td></tr>`).join("")}
    </tbody><tfoot><tr><th>Total</th><th class="num">${lista.length}</th><th class="num">${conta(lista, (a) => R.situacao(a, hoje) === "vencida")}</th><th class="num">${conta(lista, R.encerrada)}</th><th class="num">${moeda(soma(lista))}</th></tr></tfoot></table></div>` : '<p class="dica">Nenhuma ART.</p>';
  // Por ano
  const anos = [...new Set(lista.map((a) => anoDe(a) || "sem data"))].sort().reverse();
  const creas = [...new Set(lista.map((a) => a.crea))].sort();
  $("#analise-anos").innerHTML = anos.length ? `<div class="tabela-wrap"><table class="tabela compacta"><thead><tr><th>Ano</th>${creas.map((c) => `<th class="num">CREA-${esc(c)}</th>`).join("")}<th class="num">Total</th><th class="num">Valor</th></tr></thead><tbody>
    ${anos.map((y) => { const xs = lista.filter((a) => (anoDe(a) || "sem data") === y); return `<tr><td>${esc(y)}</td>${creas.map((c) => `<td class="num">${conta(xs, (a) => a.crea === c) || "—"}</td>`).join("")}<td class="num">${xs.length}</td><td class="num">${moeda(soma(xs))}</td></tr>`; }).join("")}
    </tbody></table></div>` : "";
  // Atividades (cada ART conta uma vez por código)
  const tos = new Map();
  for (const a of lista) for (const c of new Set(a.tos || [])) tos.set(c, (tos.get(c) || 0) + 1);
  const topo = [...tos.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  $("#analise-tos").innerHTML = topo.length ? `<div class="tabela-wrap"><table class="tabela compacta"><tbody>${topo.map(([c, n]) => {
    const d = TOS_DESC.get(c) || ((lista.flatMap((a) => a.atividades || []).find((x) => x.tos === c) || {}).descricao) || "";
    return `<tr><td><b>${esc(c)}</b> ${esc(d.charAt(0).toUpperCase() + d.slice(1))}</td><td class="num">${n}</td></tr>`; }).join("")}</tbody></table></div>` : '<p class="dica">Sem atividades informadas.</p>';
  // Tiradas para
  const para = new Map();
  for (const a of lista) { const k = a.vinculo === "empresa" ? nomeEmpresa(a.empresa_id) || "Empresa removida" : a.vinculo === "particular" ? "Clientes particulares" : "Não informado"; para.set(k, [...(para.get(k) || []), a]); }
  $("#analise-para").innerHTML = `<div class="tabela-wrap"><table class="tabela compacta"><tbody>${[...para.entries()].sort((a, b) => b[1].length - a[1].length).map(([k, xs]) => `<tr><td>${esc(k)}</td><td class="num">${xs.length}</td><td class="num">${moeda(soma(xs))}</td></tr>`).join("")}</tbody></table></div>`;
}

// ---------------------------------------------------------------- resumo dos vencimentos (pop-up ao entrar)
function abrirVencimentos(automatico = false) {
  const r = R.resumoVencimentos(arts, hoje);
  if (automatico && !(r.vencidas.length + r.ate30.length + r.ate90.length)) return;
  renderVencimentos();
  $("#dlg-vencimentos").showModal();
}

function renderVencimentos() {
  const r = R.resumoVencimentos(arts, hoje);
  const linha = (a) => `<tr><td class="numero">${esc(a.numero)}<br><small class="dica">CREA-${esc(a.crea)}</small></td>
      <td>${esc(a.contratante || "—")}<br><small class="dica">${esc((a.observacao || "").slice(0, 70))}${(a.observacao || "").length > 70 ? "…" : ""}</small></td>
      <td class="data">${R.dataBR(a.fim)}<br><small class="dica">${esc(textoDias(a))}</small></td>
      <td>${selectAcao(a)}</td><td><button class="btn-link" type="button" data-ver="${esc(a.id)}">Abrir</button></td></tr>`;
  const grupo = (titulo, lista, classe, aberto) => (lista.length ? `<details class="venc-grupo ${classe}"${aberto ? " open" : ""}><summary>${titulo} <span class="venc-n">${lista.length}</span>${lista.filter((a) => !a.acao).length ? ` <small>${lista.filter((a) => !a.acao).length} sem ação</small>` : ""}</summary>
      <div class="tabela-wrap"><table class="tabela compacta"><thead><tr><th>ART</th><th>Cliente</th><th>Fim previsto</th><th>Ação</th><th></th></tr></thead><tbody>${lista.map(linha).join("")}</tbody></table></div></details>` : "");
  const card = (faixa, n, rotulo, classe) => `<button type="button" class="venc-card ${classe}" data-ver-faixa="${faixa}"${n ? "" : " disabled"}><strong>${n}</strong><span>${rotulo}</span></button>`;
  const nada = !(r.vencidas.length + r.ate30.length + r.ate90.length);
  const ac = R.resumoAcoes(arts, hoje);
  $("#dlg-vencimentos").innerHTML = `<div class="dlg-cab"><h2 id="titulo-vencimentos">Vencimentos das ARTs</h2><button class="btn-link" data-fechar type="button">Fechar</button></div>
    <div class="dlg-corpo">
      <p class="dica">Situação em ${R.dataBR(hoje)}. As ARTs baixadas ou arquivadas não entram: não vencem mais.</p>
      ${ac.total ? `<div class="indicador-acao com-pendencia venc-indicador">${htmlIndicadorAcao(ac)}</div>` : ""}
      <div class="venc-cards">
        ${card("vencida", r.vencidas.length, r.vencidas.length === 1 ? "ART vencida sem baixa" : "ARTs vencidas sem baixa", "vc-vencida")}
        ${card("vencendo", r.ate30.length, "vencem nos próximos 30 dias", "vc-30")}
        ${card("vence90", r.ate90.length, "vencem em 31 a 90 dias (3 meses)", "vc-90")}
      </div>
      ${nada ? '<p class="venc-ok">Nenhuma ART vencida nem a vencer nos próximos 90 dias.</p>' : ""}
      ${r.semAcao ? `<p class="venc-aviso"><b>${plural(r.semAcao, "ART vencida ou a vencer em 30 dias está", "ARTs vencidas ou a vencer em 30 dias estão")} sem ação definida.</b> Escolha para cada uma: dar baixa, emitir ART substituta, complementar ou nova, ou arquivar quando não houver outra ART que a continue.</p>` : ""}
      <p class="dica">Baixa em dois passos: “Dar baixa” sinaliza (a ART fica em “a dar baixa”); depois de dar a baixa no portal do CREA, <b>Registrar baixa</b> conclui. Se já deu a baixa no CREA, escolha “Registrar a baixa agora”.</p>
      ${grupo("Vencidas sem baixa", r.vencidas, "vg-vencida", true)}
      ${grupo("Vencem nos próximos 30 dias", r.ate30, "vg-30", true)}
      ${grupo("Vencem em 31 a 90 dias", r.ate90, "vg-90", !r.vencidas.length && !r.ate30.length)}
    </div>
    <div class="dlg-rodape"><button class="btn btn-primary" type="button" data-fechar>Entendi</button></div>`;
}

// ---------------------------------------------------------------- alertas
function pendentes() {
  return R.alertasPendentes(arts, tratados, hoje);
}

function renderAlertas() {
  const lista = pendentes();
  const contador = $("#contador-alertas");
  contador.hidden = !lista.length;
  contador.textContent = lista.length;

  const faixa = $("#faixa-alertas");
  faixa.hidden = !lista.length;
  if (lista.length) {
    faixa.innerHTML = `<p><b>${lista.length} alerta${lista.length > 1 ? "s" : ""} de ART.</b> ${esc(lista[0].mensagem)}</p>
      <button class="btn-link" type="button" data-abrir-alertas>Ver todos os alertas</button>`;
  }

  $("#lista-alertas").innerHTML = lista.length
    ? lista
        .map(
          (al) => `<div class="alerta${al.dias < 0 ? " atrasado" : ""}">
            <p>${esc(al.mensagem)}</p>
            <div class="alerta-acoes">
              <button class="btn-link" type="button" data-ver="${esc(al.art.id)}">Ver ART</button>
              <button class="btn-link" type="button" data-lido="${esc(al.chave)}">Marcar como lido</button>
            </div>
          </div>`
        )
        .join("")
    : `<p class="dica">Nenhum alerta pendente.</p>`;
}

function alternarAlertas(abrir) {
  const painel = $("#painel-alertas");
  const aberto = abrir ?? painel.hidden;
  painel.hidden = !aberto;
  $("#btn-alertas").setAttribute("aria-expanded", String(aberto));
}

// ---------------------------------------------------------------- detalhe da ART
const CAMPOS = [
  ["numero", "Número da ART", "c2", "text"],
  ["crea", "CREA", "c2", "crea"],
  ["registrada", "Registrada em", "c2", "date"],
  ["para", "Tirada para", "c6", "para"],
  ["contratante", "Contratante", "c4", "text"],
  ["contratante_doc", "CPF/CNPJ", "c2", "text"],
  ["local", "Cidade/UF", "c2", "text"],
  ["endereco", "Endereço da obra/serviço", "c4", "text"],
  ["contrato", "Contrato", "c2", "text"],
  ["valor", "Valor do contrato (R$)", "c2", "number"],
  ["taxa", "Taxa da ART (R$)", "c2", "number"],
  ["taxa_paga", "Taxa já paga", "c2", "checkbox"],
  ["inicio", "Início", "c2", "date"],
  ["fim", "Fim previsto", "c2", "date"],
  ["celebrado", "Celebrado em", "c2", "date"],
  ["observacao", "Serviço / observação", "c6", "textarea"],
  ["notas", "Anotações internas", "c6", "textarea"],
];

function campoHtml([nome, rotulo, cls, tipo], art) {
  const v = art[nome] ?? "";
  let input;
  if (tipo === "checkbox") return `<label class="${cls} opcao-campo"><input type="checkbox" name="${nome}"${v ? " checked" : ""}> ${rotulo}</label>`;
  if (tipo === "textarea") input = `<textarea name="${nome}" rows="3">${esc(v)}</textarea>`;
  else if (tipo === "para") input = `<select name="para">${opcoesPara(paraDe(art))}</select>`;
  else if (tipo === "crea")
    input = `<select name="crea">${["MG", "RJ", "SP", "Outro"].map((c) => `<option${c === v ? " selected" : ""}>${c}</option>`).join("")}</select>`;
  else input = `<input name="${nome}" type="${tipo}"${tipo === "number" ? ' step="0.01" min="0"' : ""} value="${esc(v)}"${nome === "numero" ? " required" : ""}>`;
  return `<label class="${cls}">${rotulo}${input}</label>`;
}

// Ação para a ART que não foi baixada: dar baixa, emitir ART substituta, complementar ou nova, ou arquivar
function blocoAcao(art) {
  const f = R.faixaVencimento(art, hoje);
  const quando = art.acao === "arquivada" ? `Arquivada${art.arquivada_em ? ` em ${R.dataBR(art.arquivada_em)}` : ""}.`
    : f === "vencida" ? `Venceu ${textoDias(art)}.` : f ? `Vence ${textoDias(art)}.` : `Fim previsto em ${R.dataBR(art.fim)}.`;
  return `<div class="bloco destaque" id="bloco-acao">
    <h3>Ação para esta ART</h3>
    <p class="dica">${esc(quando)} O que vai ser feito?</p>
    <div class="opcoes opcoes-coluna" role="radiogroup" aria-label="Ação">${[["", "Ainda não definido"], ...Object.entries(R.ACOES)]
      .map(([v, t]) => `<label><input type="radio" name="acao" value="${v}"${(art.acao || "") === v ? " checked" : ""}> ${esc(t)}</label>`).join("")}</div>
    <div id="passos-acao"></div>
  </div>`;
}

function atualizarPassos(dlg) {
  const acao = ($("input[name=acao]:checked", dlg) || {}).value;
  $("#passos-acao", dlg).innerHTML = acao ? `<div class="recomendacao"><ol>${R.PASSOS_ACAO[acao].map((p) => `<li>${esc(p)}</li>`).join("")}</ol></div>` : "";
}

// Lançamentos da ART: tirada para uma empresa, vão para a página da empresa (ela paga a taxa: reembolso);
// para cliente particular, para o controle financeiro da engenharia
function blocoFinanceiro(art) {
  const empresa = art.vinculo === "empresa" && empresas.find((e) => e.id === art.empresa_id);
  const id = encodeURIComponent(art.id);
  const paga = art.taxa_paga ? '<p class="dica"><b>Taxa já paga</b>: não há reembolso pendente.</p>' : "";
  if (empresa) {
    const pagina = `empresas.html?e=${encodeURIComponent(empresa.id)}`;
    return `<div class="bloco"><h3>Financeiro</h3>${paga}
        <div class="linha-acoes">
          <a class="btn btn-claro" href="${pagina}&amp;novo=despesa&amp;art=${id}&amp;categoria=Taxa%20de%20ART">Taxa paga por você (a reembolsar)</a>
          <a class="btn btn-claro" href="${pagina}&amp;novo=receita&amp;art=${id}">Reembolso da taxa pela empresa</a>
        </div>
        <p class="dica">Tirada para ${esc(empresa.nome)}: a empresa paga a taxa. Os lançamentos ficam em Finanças ${esc(empresa.nome)}.</p>
      </div>`;
  }
  return `<div class="bloco"><h3>Financeiro</h3>${paga}
      <div class="linha-acoes">
        <a class="btn btn-claro" href="financeiro.html?novo=receita&amp;art=${id}">Lançar receita desta ART</a>
        <a class="btn btn-claro" href="financeiro.html?novo=despesa&amp;art=${id}&amp;categoria=Taxa%20de%20ART">Lançar taxa da ART</a>
      </div>
    </div>`;
}

function abrirArt(id, opcoes = {}) {
  const existente = arts.find((a) => a.id === id);
  const art = existente ? { ...existente } : { crea: "MG", atividades: [], tos: [], anterior_id: opcoes.anterior || null };
  const dlg = $("#dlg-art");
  const s = existente ? R.situacao(art, hoje) : null;
  const anterior = art.anterior_id && arts.find((a) => a.id === art.anterior_id);
  const seguintes = existente ? arts.filter((a) => a.anterior_id === art.id) : [];

  dlg.innerHTML = `<form id="form-art" novalidate>
    <div class="dlg-cab">
      <h2>${existente ? `ART nº ${esc(art.numero)}` : "Nova ART"} ${existente ? etiqueta(art) : ""}</h2>
      <button class="btn-link" type="button" data-fechar>Fechar</button>
    </div>
    <div class="dlg-corpo">
      <div class="campos">${CAMPOS.map((c) => campoHtml(c, art)).join("")}</div>

      ${(art.atividades || []).length ? `<div class="bloco"><h3>Atividades técnicas</h3><ul class="lista-atividades">
        ${art.atividades.map((a) => `<li>${a.atividade ? esc(a.atividade) + " – " : ""}<b>${esc(a.tos)}</b> ${esc(descricaoTos(a))}</li>`).join("")}
      </ul></div>` : ""}

      <div class="bloco"><h3>PDF da ART</h3>
        <div class="linha-acoes">
          ${art.pdf_path ? `<button class="btn btn-claro" type="button" id="btn-ver-pdf">Ver PDF</button>` : `<span class="dica">Nenhum PDF anexado.</span>`}
          <label>Anexar ${art.pdf_path ? "outro " : ""}PDF<input type="file" name="pdf" accept="application/pdf"></label>
        </div>
      </div>

      ${existente && s !== "baixada" && art.fim ? blocoAcao(art) : ""}

      ${existente ? `<div class="bloco"><h3>Baixa</h3>
        ${s === "baixada"
          ? `<p>Baixa registrada em <b>${R.dataBR(art.baixa_data)}</b> (${{ interrupcao: "interrupção", substituicao: "substituída por outra ART" }[art.baixa_motivo] || "conclusão"}).</p>
             <button class="btn btn-claro" type="button" id="btn-desfazer-baixa">Desfazer baixa</button>`
          : `<ol class="passos-baixa">
              <li class="${art.acao === "baixa" ? "feito" : ""}"><b>Sinalizar</b> a ação “Dar baixa” acima${art.acao === "baixa" ? " (feito)" : ""}</li>
              <li><b>Dar a baixa no portal do CREA</b></li>
              <li><b>Registrar aqui</b> a data da baixa</li>
            </ol>
            <div class="linha-acoes">
              <label>Data da baixa no CREA<input type="date" name="baixa_data_nova" value="${hoje}" max="${hoje}"></label>
              <label>Motivo<select name="baixa_motivo_novo"><option value="conclusao">Conclusão</option><option value="interrupcao">Interrupção</option><option value="substituicao">Substituição</option></select></label>
            </div>
            <label class="opcao-linha confirma-baixa"><input type="checkbox" name="baixa_confirmo"> <span>Já dei a baixa desta ART no portal do CREA</span></label>
            <div class="linha-acoes"><button class="btn btn-dark" type="button" id="btn-baixa" disabled>Registrar baixa</button></div>`}
      </div>

      ${blocoFinanceiro(art)}

      <div class="bloco"><h3>Renovação e histórico</h3>
        ${anterior ? `<p>ART anterior: <button class="btn-link" type="button" data-ver="${esc(anterior.id)}">${esc(anterior.numero)}</button></p>` : ""}
        ${seguintes.length ? `<p>Nova(s) ART(s) vinculada(s): ${seguintes.map((x) => `<button class="btn-link" type="button" data-ver="${esc(x.id)}">${esc(x.numero)}</button>`).join(", ")}</p>` : ""}
        <div class="linha-acoes">
          <button class="btn btn-claro" type="button" id="btn-copiar">Copiar dados para nova ART</button>
          <button class="btn btn-claro" type="button" id="btn-vincular">Importar nova ART vinculada</button>
        </div>
        <p class="dica">“Copiar dados” leva para a área de transferência contratante, local, atividades e observação, para colar no portal do CREA.</p>
      </div>` : ""}
    </div>
    <div class="dlg-rodape">
      ${existente ? `<button class="btn btn-perigo esquerda" type="button" id="btn-excluir">Excluir</button>` : ""}
      <button class="btn btn-claro" type="button" data-fechar>Cancelar</button>
      <button class="btn btn-primary" type="submit">Salvar</button>
    </div>
  </form>`;

  const form = $("#form-art", dlg);
  if ($("#bloco-acao", dlg)) {
    atualizarPassos(dlg);
    $("#bloco-acao", dlg).addEventListener("change", () => atualizarPassos(dlg));
  }

  const lerFormulario = () => {
    const f = new FormData(form);
    const dados = { ...art };
    for (const [nome, , , tipo] of CAMPOS) {
      if (tipo === "para") continue;
      if (tipo === "checkbox") { dados[nome] = f.get(nome) === "on"; continue; }
      const v = (f.get(nome) ?? "").toString().trim();
      dados[nome] = v === "" ? null : tipo === "number" ? Number(v) : v;
    }
    Object.assign(dados, vinculoDe(String(f.get("para") || "")));
    if ($("#bloco-acao", dlg)) {
      const { acao, arquivada_em } = comAcao(art, f.get("acao"));
      Object.assign(dados, { acao, arquivada_em });
    }
    return dados;
  };

  const salvar = async (extra = {}) => {
    const dados = { ...lerFormulario(), ...extra };
    if (!dados.numero) {
      avisar("Informe o número da ART.");
      return null;
    }
    const duplicada = arts.find((a) => a.numero === dados.numero && a.id !== dados.id);
    if (duplicada) {
      avisar(`Já existe uma ART com o número ${dados.numero}.`);
      return null;
    }
    const arquivo = form.elements.pdf && form.elements.pdf.files[0];
    const problema = arquivo && (await conferirPdf(arquivo));
    if (problema) {
      avisar(problema);
      return null;
    }
    let salvo = await armazem.salvar(dados);
    if (arquivo) salvo = await armazem.salvar({ ...salvo, pdf_path: await armazem.enviarPdf(salvo, arquivo) });
    await recarregar();
    return salvo;
  };

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      if (await salvar()) {
        dlg.close();
        avisar("ART salva.");
      }
    } catch (err) {
      avisar("Erro ao salvar: " + err.message);
    }
  });

  form.elements.baixa_confirmo?.addEventListener("change", (e) => { $("#btn-baixa", dlg).disabled = !e.target.checked; });
  $("#btn-baixa", dlg)?.addEventListener("click", async () => {
    const data = form.elements.baixa_data_nova.value || hoje;
    const motivo = form.elements.baixa_motivo_novo.value;
    if (!form.elements.baixa_confirmo.checked) return avisar("Confirme que a baixa já foi dada no portal do CREA.");
    if (data > hoje) return avisar("A data da baixa é a do CREA: hoje ou antes.");
    // Sem ação escolhida, a ação fica como "Dar baixa" (o histórico mostra o que foi feito)
    const acao = (form.querySelector("input[name=acao]:checked") || {}).value;
    const extra = acao ? {} : { acao: "baixa", arquivada_em: null };
    if (await salvar({ ...extra, baixa_data: data, baixa_motivo: motivo })) {
      dlg.close();
      avisar(`Baixa registrada na ART ${art.numero}.`);
    }
  });
  $("#btn-desfazer-baixa", dlg)?.addEventListener("click", async () => {
    if (await salvar({ baixa_data: null, baixa_motivo: null })) {
      dlg.close();
      avisar("Baixa desfeita.");
    }
  });
  $("#btn-ver-pdf", dlg)?.addEventListener("click", async () => {
    const url = await armazem.urlPdf(art.pdf_path);
    if (url) window.open(url, "_blank", "noopener");
    else avisar("No modo demonstração o PDF fica disponível só até recarregar a página.");
  });
  $("#btn-copiar", dlg)?.addEventListener("click", async () => {
    const texto = R.textoNovaArt(lerFormulario());
    try {
      await navigator.clipboard.writeText(texto);
      avisar("Dados copiados. Cole no portal do CREA ao emitir a nova ART.");
    } catch {
      window.prompt("Copie os dados abaixo:", texto);
    }
  });
  $("#btn-vincular", dlg)?.addEventListener("click", () => {
    dlg.close();
    abrirImportacao({ anterior: art });
  });
  $("#btn-excluir", dlg)?.addEventListener("click", async () => {
    if (!confirm(`Excluir a ART ${art.numero}? Esta ação não pode ser desfeita.`)) return;
    await armazem.remover(art.id);
    dlg.close();
    await recarregar();
    avisar("ART excluída.");
  });

  dlg.showModal();
}

// ---------------------------------------------------------------- importação
let pdfjsLib;
async function carregarPdfjs() {
  if (!pdfjsLib) {
    pdfjsLib = await import("./vendor/pdf.min.mjs");
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdf.worker.min.mjs", import.meta.url).href;
  }
  return pdfjsLib;
}

const NOMES_FORMATO = {
  "art-mg": "ART do CREA-MG",
  "art-rj": "ART do CREA-RJ",
  "relatorio-mg": "relatório de ARTs do CREA-MG",
  "art-sp": "ART do CREA-SP (leitura automática ainda não disponível – cadastre manualmente)",
  desconhecido: "formato não reconhecido – cadastre manualmente",
};

let importacao = { candidatos: [], anterior: null };

function abrirImportacao({ anterior = null } = {}) {
  importacao = { candidatos: [], anterior };
  const dlg = $("#dlg-importar");
  $("#arquivos").value = "";
  $("#status-importacao").innerHTML = "";
  $("#previa").hidden = true;
  $("#previa-linhas").innerHTML = "";
  $("#marcar-vencidas").checked = false;
  $("#import-para").innerHTML = opcoesPara("", "Não informar agora");
  $("#btn-confirmar-importacao").disabled = true;
  const dica = $("#dica-vinculo");
  dica.hidden = !anterior;
  if (anterior) {
    dica.textContent = anterior.acao === "substituta"
      ? `A ART importada agora fica vinculada como substituta da ART ${anterior.numero}, que passa a constar como baixada por substituição.`
      : anterior.acao === "complementar"
        ? `A ART importada agora fica vinculada como complementar da ART ${anterior.numero}, que continua até a baixa.`
        : anterior.acao === "nova"
          ? `A ART importada agora fica vinculada como nova ART da ${anterior.numero}, que passa a constar como arquivada.`
          : `As ARTs importadas agora serão vinculadas à ART ${anterior.numero} (renovação, substituta, complementar ou nova).`;
  }
  dlg.showModal();
}

async function processarArquivos(arquivos) {
  const status = $("#status-importacao");
  status.innerHTML = "<p>Lendo os PDFs…</p>";
  const pdfjs = await carregarPdfjs();
  const mensagens = [];
  for (const arquivo of arquivos) {
    const problema = await conferirPdf(arquivo);
    if (problema) {
      mensagens.push(`<p class="erro">${esc(problema)}</p>`);
      continue;
    }
    try {
      const linhas = await extrairLinhas(pdfjs, new Uint8Array(await arquivo.arrayBuffer()));
      const { formato, arts: lidas } = lerPdf(linhas);
      const individual = formato === "art-mg" || formato === "art-rj";
      for (const a of lidas) {
        importacao.candidatos = importacao.candidatos.filter((c) => c.art.numero !== a.numero);
        importacao.candidatos.push({ art: a, arquivo: individual ? arquivo : null });
      }
      mensagens.push(`<p><b>${esc(arquivo.name)}</b>: ${esc(NOMES_FORMATO[formato])}${lidas.length ? ` – ${lidas.length} ART${lidas.length > 1 ? "s" : ""} encontrada${lidas.length > 1 ? "s" : ""}` : ""}.</p>`);
    } catch (e) {
      mensagens.push(`<p class="erro"><b>${esc(arquivo.name)}</b>: não foi possível ler o PDF (${esc(e.message)}).</p>`);
    }
  }
  status.innerHTML = mensagens.join("");
  renderPrevia();
}

function renderPrevia() {
  const linhas = importacao.candidatos.map((c, i) => {
    const existente = arts.find((a) => a.numero === c.art.numero);
    const vencida = c.art.fim && c.art.fim < hoje;
    const jaBaixada = existente && existente.baixa_data;
    return `<tr>
      <td><input type="checkbox" data-incluir="${i}" checked aria-label="Importar ${esc(c.art.numero)}"></td>
      <td class="numero">${esc(c.art.numero)}<br><small class="dica">CREA-${esc(c.art.crea)}</small></td>
      <td>${esc(c.art.contratante || "—")}<br><small class="dica">${esc((c.art.observacao || "").slice(0, 70))}</small></td>
      <td class="data">${R.dataBR(c.art.fim)}</td>
      <td>${etiqueta({ ...c.art, baixa_data: jaBaixada || null })}</td>
      <td>${jaBaixada ? "Já registrada" : vencida ? `<input type="checkbox" data-baixada="${i}" aria-label="ART ${esc(c.art.numero)} já baixada">` : "—"}</td>
      <td>${existente ? "Atualiza cadastro" : "Nova"}</td>
    </tr>`;
  });
  $("#previa-linhas").innerHTML = linhas.join("");
  $("#previa").hidden = !importacao.candidatos.length;
  $("#marcar-vencidas").closest("label").hidden = !$$("[data-baixada]").length;
  atualizarBotaoImportar();
}

function atualizarBotaoImportar() {
  const n = $$("[data-incluir]:checked").length;
  const botao = $("#btn-confirmar-importacao");
  botao.disabled = !n;
  botao.textContent = n ? `Importar ${n} ART${n > 1 ? "s" : ""}` : "Importar";
}

async function confirmarImportacao() {
  const botao = $("#btn-confirmar-importacao");
  botao.disabled = true;
  botao.textContent = "Importando…";
  try {
    const marcadas = new Set($$("[data-baixada]:checked").map((el) => Number(el.dataset.baixada)));
    const escolhidos = $$("[data-incluir]:checked").map((el) => Number(el.dataset.incluir));
    const para = vinculoDe($("#import-para").value); // vale para as ARTs que ainda não têm essa informação
    const registros = escolhidos.map((i) => {
      const { art } = importacao.candidatos[i];
      const existente = arts.find((a) => a.numero === art.numero);
      const r = existente
        ? { ...existente, ...art, id: existente.id, baixa_data: existente.baixa_data, baixa_motivo: existente.baixa_motivo,
            tipo_servico: existente.tipo_servico, notas: existente.notas, pdf_path: existente.pdf_path, anterior_id: existente.anterior_id }
        : { ...art, anterior_id: importacao.anterior ? importacao.anterior.id : null };
      if (para.vinculo && !r.vinculo) Object.assign(r, para);
      if (marcadas.has(i) && !r.baixa_data) {
        r.baixa_data = art.fim;
        r.baixa_motivo = "conclusao";
        r.notas = [r.notas, "Baixa informada na importação (data de fim usada como referência)."].filter(Boolean).join("\n");
      }
      return r;
    });
    const salvos = await armazem.salvarVarios(registros);
    // ART substituta importada: a anterior fica baixada por substituição
    const ant = importacao.anterior && arts.find((a) => a.id === importacao.anterior.id);
    // Nova ART importada (com a ação "Emitir nova ART"): a anterior fica arquivada
    const novas = registros.filter((r) => !arts.some((a) => a.numero === r.numero)).map((r) => r.numero).join(", ");
    if (ant && ant.acao === "substituta" && !ant.baixa_data && novas) {
      await armazem.salvar({ ...ant, baixa_data: hoje, baixa_motivo: "substituicao", notas: [ant.notas, `Substituída pela ART ${novas}.`].filter(Boolean).join("\n") });
    } else if (ant && ant.acao === "nova" && !R.encerrada(ant) && novas) {
      await armazem.salvar({ ...comAcao(ant, "arquivada"), notas: [ant.notas, `Arquivada: continua na nova ART ${novas}.`].filter(Boolean).join("\n") });
    }
    for (const i of escolhidos) {
      const c = importacao.candidatos[i];
      if (!c.arquivo) continue;
      const salvo = salvos.find((s) => s.numero === c.art.numero);
      if (salvo) await armazem.salvar({ ...salvo, pdf_path: await armazem.enviarPdf(salvo, c.arquivo) });
    }
    $("#dlg-importar").close();
    await recarregar();
    avisar(`${registros.length} ART${registros.length > 1 ? "s importadas" : " importada"}.`);
  } catch (e) {
    avisar("Erro na importação: " + e.message);
    atualizarBotaoImportar();
  }
}

// ---------------------------------------------------------------- exportação
function exportarCsv() {
  const cab = ["Número", "CREA", "Contratante", "Tirada para", "CPF/CNPJ", "Local", "Serviço", "TOS", "Valor", "Taxa paga", "Início", "Fim previsto", "Situação", "Dias para o fim", "Ação", "Baixa", "Motivo da baixa", "Arquivada em"];
  const tiradaPara = (a) => (a.vinculo === "empresa" ? nomeEmpresa(a.empresa_id) || "Empresa removida" : a.vinculo === "particular" ? "Cliente particular" : "");
  const linhas = ordenar(filtradas()).map((a) => [
    a.numero, a.crea, a.contratante, tiradaPara(a), a.contratante_doc, a.local, a.observacao, (a.tos || []).join(", "),
    a.valor == null ? "" : String(a.valor).replace(".", ","), a.taxa_paga ? "Sim" : "Não", R.dataBR(a.inicio), R.dataBR(a.fim),
    R.ROTULO_SITUACAO[R.situacao(a, hoje)], R.diasAte(a.fim, hoje) ?? "", a.acao ? R.ACOES[a.acao] : "", a.baixa_data ? R.dataBR(a.baixa_data) : "",
    { interrupcao: "Interrupção", substituicao: "Substituição", conclusao: "Conclusão" }[a.baixa_motivo] || "",
    a.arquivada_em ? R.dataBR(a.arquivada_em) : "",
  ]);
  const csv = [cab, ...linhas].map((l) => l.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `ARTs-${hoje}.csv` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------- eventos
document.addEventListener("click", async (e) => {
  if (e.target.closest("select, .sel-cel")) return; // a caixa de seleção da ação e a de marcar não abrem a ART
  const alvo = e.target.closest("button, tr.clicavel, tr.clicavel-cliente");
  if (!alvo) return;
  if (alvo.matches("[data-fechar]")) alvo.closest("dialog").close();
  else if (alvo.matches("tr.clicavel-cliente")) {
    filtro.cliente = filtro.cliente === alvo.dataset.cliente ? "" : alvo.dataset.cliente;
    renderizar();
    $("#tabela").scrollIntoView({ behavior: "smooth", block: "start" });
  } else if (alvo.matches("[data-ver-faixa]")) {
    filtro.situacao = alvo.dataset.verFaixa;
    $("#filtro-situacao").value = filtro.situacao;
    $("#dlg-vencimentos").close();
    renderizar();
    $("#tabela").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  else if (alvo.matches("tr.clicavel")) abrirArt(alvo.dataset.id);
  else if (alvo.matches("[data-situacao]")) {
    filtro.situacao = filtro.situacao === alvo.dataset.situacao ? "" : alvo.dataset.situacao;
    if (filtro.acao === "sem" && filtro.situacao !== "acao") filtro.acao = "";
    $("#filtro-situacao").value = filtro.situacao;
    renderizar();
    if (filtro.situacao) $("#tabela").scrollIntoView({ behavior: "smooth", block: "start" });
  } else if (alvo.matches("[data-so-sem-acao]")) {
    filtro.situacao = "acao";
    filtro.acao = "sem";
    $("#filtro-situacao").value = filtro.situacao;
    renderizar();
    $("#tabela").scrollIntoView({ behavior: "smooth", block: "start" });
  } else if (alvo.matches("[data-registrar-baixa]")) {
    const art = arts.find((a) => a.id === alvo.dataset.registrarBaixa);
    if (art) abrirBaixa([art]);
  } else if (alvo.matches("[data-ver]")) {
    alternarAlertas(false);
    if ($("#dlg-vencimentos").open) $("#dlg-vencimentos").close();
    $("#dlg-art").open && $("#dlg-art").close();
    abrirArt(alvo.dataset.ver);
  } else if (alvo.matches("[data-lido]")) {
    const al = pendentes().find((x) => x.chave === alvo.dataset.lido);
    if (al) {
      await armazem.marcarTratado(al);
      tratados.add(al.chave);
      renderAlertas();
    }
  } else if (alvo.matches("[data-abrir-alertas]")) alternarAlertas(true);
});

document.addEventListener("keydown", (e) => {
  const cl = e.target.closest && e.target.closest("tr.clicavel-cliente");
  if (cl && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); cl.click(); }
});
$("#tabela").addEventListener("keydown", (e) => {
  if (e.target.closest("select, input, button")) return;
  const tr = e.target.closest("tr.clicavel");
  if (tr && (e.key === "Enter" || e.key === " ")) {
    e.preventDefault();
    abrirArt(tr.dataset.id);
  }
});

$("#btn-alertas").addEventListener("click", () => alternarAlertas());
$("#fechar-alertas").addEventListener("click", () => alternarAlertas(false));
document.addEventListener("keydown", (e) => e.key === "Escape" && alternarAlertas(false));

$("#busca").addEventListener("input", (e) => {
  filtro.busca = e.target.value;
  renderTabela();
});
$("#filtro-crea").addEventListener("change", (e) => {
  filtro.crea = e.target.value;
  renderTabela();
});
$("#filtro-situacao").addEventListener("change", (e) => {
  filtro.situacao = e.target.value;
  renderResumo();
  renderTabela();
});
// Marcar ARTs na lista e aplicar uma ação a todas (ex.: arquivar as que não têm outra ART que as continue)
$("#tabela").addEventListener("change", (e) => {
  const caixa = e.target.closest("input[data-sel]");
  if (caixa) {
    if (caixa.checked) selecionadas.add(caixa.dataset.sel); else selecionadas.delete(caixa.dataset.sel);
    caixa.closest("tr").classList.toggle("marcada", caixa.checked);
    const total = $$("#tabela input[data-sel]").length;
    $("#sel-todas").checked = total > 0 && selecionadas.size === total;
    $("#sel-todas").indeterminate = selecionadas.size > 0 && selecionadas.size < total;
    renderLote();
  } else if (e.target.id === "sel-todas") {
    $$("#tabela input[data-sel]").forEach((c) => { c.checked = e.target.checked; c.closest("tr").classList.toggle("marcada", c.checked); if (c.checked) selecionadas.add(c.dataset.sel); else selecionadas.delete(c.dataset.sel); });
    renderLote();
  }
});
$("#btn-lote-aplicar").addEventListener("click", aplicarEmLote);
$("#lote-acao").addEventListener("change", (e) => { $("#btn-lote-aplicar").disabled = !e.target.value; });
$("#btn-lote-limpar").addEventListener("click", () => { selecionadas.clear(); renderTabela(); });
$("#filtro-para").addEventListener("change", (e) => {
  filtro.para = e.target.value;
  renderTabela();
});
for (const [id, k] of [["#filtro-cliente", "cliente"], ["#filtro-ano", "ano"], ["#filtro-acao", "acao"]]) {
  $(id).addEventListener("change", (e) => { filtro[k] = e.target.value; renderTabela(); });
}
$("#btn-limpar-filtros").addEventListener("click", () => {
  Object.assign(filtro, { busca: "", crea: "", situacao: "", para: "", cliente: "", ano: "", acao: "" });
  $("#busca").value = ""; $("#filtro-crea").value = ""; $("#filtro-situacao").value = ""; $("#filtro-para").value = "";
  renderizar();
});
// Ação escolhida na lista ou no resumo dos vencimentos
document.addEventListener("change", (e) => { if (e.target.matches("select[data-acao]")) salvarAcao(e.target.dataset.acao, e.target.value, e.target); });
window.addEventListener("hashchange", () => {
  if (location.hash !== "#acao") return;
  filtro.situacao = "acao";
  $("#filtro-situacao").value = "acao";
  renderizar();
});
$("#btn-vencimentos").addEventListener("click", () => abrirVencimentos(false));

$("#btn-importar").addEventListener("click", () => abrirImportacao());
$("#btn-nova").addEventListener("click", () => abrirArt(null));
$("#btn-exportar").addEventListener("click", exportarCsv);
$("#btn-confirmar-importacao").addEventListener("click", confirmarImportacao);
$("#arquivos").addEventListener("change", (e) => e.target.files.length && processarArquivos([...e.target.files]));
$("#previa-linhas").addEventListener("change", atualizarBotaoImportar);
$("#marcar-vencidas").addEventListener("change", (e) => $$("[data-baixada]").forEach((c) => (c.checked = e.target.checked)));

const soltar = $("#soltar");
["dragenter", "dragover"].forEach((ev) =>
  soltar.addEventListener(ev, (e) => {
    e.preventDefault();
    soltar.classList.add("arrastando");
  })
);
["dragleave", "drop"].forEach((ev) => soltar.addEventListener(ev, () => soltar.classList.remove("arrastando")));
soltar.addEventListener("drop", (e) => {
  e.preventDefault();
  const pdfs = [...e.dataTransfer.files].filter((f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
  if (pdfs.length) processarArquivos(pdfs);
});

$$("dialog").forEach((d) => d.addEventListener("click", (e) => e.target === d && d.close()));

iniciar();
