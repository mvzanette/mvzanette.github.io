// Área restrita – Controle de demandas: solicitações, propostas, prazos e andamento dos serviços.
import { abrirPagina } from "./sessao.js";
import { dataBR, diasAte, hojeISO } from "./regras.js";
import * as G from "./regras-gestao.js";
import { $, esc, moeda, avisar, baixarCsv, opcoes, prepararDialogos, numeroDigitado } from "./ui.js";

const hoje = hojeISO();
const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");
let armazem, colecao;
let demandas = [];
let arts = [];
let lancamentos = [];
const filtro = { etapa: "abertas", busca: "", origem: "" };


async function recarregar() {
  [demandas, arts, lancamentos] = await Promise.all([
    colecao.listar(),
    armazem.listar(),
    armazem.colecao("lancamentos").listar(),
  ]);
  renderizar();
}

function renderizar() {
  renderEtapas();
  renderTabela();
}

// ---------------------------------------------------------------- etapas (funil)
function renderEtapas() {
  const conta = G.resumoDemandas(demandas, G.periodo("tudo", hoje), hoje).porEtapa;
  const abertas = demandas.filter(G.emAberto).length;
  const botao = (chave, rotulo, n) =>
    `<button class="etapa-filtro" type="button" data-etapa="${chave}" aria-pressed="${filtro.etapa === chave}">
      <strong>${n}</strong><span>${rotulo}</span></button>`;
  $("#etapas").innerHTML = [
    botao("abertas", "Em aberto", abertas),
    ...G.ETAPAS.map(([e, rotulo]) => botao(e, rotulo, conta[e] || 0)),
    botao("todas", "Todas", demandas.length),
  ].join("");
}

// ---------------------------------------------------------------- lista
function filtradas() {
  const termo = filtro.busca.toLowerCase();
  return demandas
    .filter((d) => {
      if (filtro.etapa === "abertas" && !G.emAberto(d)) return false;
      if (!["abertas", "todas"].includes(filtro.etapa) && d.etapa !== filtro.etapa) return false;
      if (filtro.origem && d.origem !== filtro.origem) return false;
      if (termo && ![d.titulo, d.cliente, d.contato, d.cidade, d.servico].join(" ").toLowerCase().includes(termo)) return false;
      return true;
    })
    .sort((a, b) => {
      // prazos mais urgentes primeiro; sem prazo, as mais recentes
      const pa = G.diasPrazo(a, hoje), pb = G.diasPrazo(b, hoje);
      if (pa !== null || pb !== null) return (pa ?? 1e9) - (pb ?? 1e9);
      return (b.recebida_em || "").localeCompare(a.recebida_em || "");
    });
}

function prazoHtml(d) {
  if (!d.prazo) return "—";
  const dias = G.diasPrazo(d, hoje);
  if (dias === null) return `<span class="data">${dataBR(d.prazo)}</span>`;
  const [classe, texto] =
    dias < 0 ? ["s-vencida", `atrasada há ${-dias} ${-dias === 1 ? "dia" : "dias"}`]
    : dias === 0 ? ["s-vencida", "vence hoje"]
    : dias <= 7 ? ["s-vencendo", `vence em ${dias} ${dias === 1 ? "dia" : "dias"}`]
    : ["s-ativa", `em ${dias} dias`];
  return `<span class="etiqueta ${classe}">${dataBR(d.prazo)}<small>${texto}</small></span>`;
}

const etiquetaEtapa = (d) => `<span class="etapa etapa-${d.etapa}">${G.ROTULO_ETAPA[d.etapa]}</span>`;
// Dias corridos desde a chegada (só para as demandas em andamento)
const diasAberta = (d) => {
  const n = Math.max(0, -diasAte(d.recebida_em || hoje, hoje));
  return n ? `aberta há ${G.textoDias(n)}` : "aberta hoje";
};

function renderTabela() {
  const lista = filtradas();
  $("#tabela tbody").innerHTML = lista
    .map(
      (d) => `<tr class="clicavel" data-id="${esc(d.id)}" tabindex="0">
        <td class="data">${dataBR(d.recebida_em)}</td>
        <td><b>${esc(d.titulo)}</b>${d.servico ? `<br><span class="servico">${esc(d.servico)}</span>` : ""}</td>
        <td>${esc(d.cliente || d.contato || "—")}${d.cidade ? `<br><span class="servico">${esc(d.cidade)}${d.uf ? "/" + esc(d.uf) : ""}</span>` : ""}</td>
        <td>${etiquetaEtapa(d)}${G.emAberto(d) ? `<br><small class="servico">${diasAberta(d)}</small>` : ""}</td>
        <td class="num">${d.valor == null ? "—" : moeda(Number(d.valor))}</td>
        <td>${prazoHtml(d)}</td>
        <td>${esc(G.ROTULO_ORIGEM[d.origem] || "—")}</td>
      </tr>`
    )
    .join("");
  $("#vazio").hidden = lista.length > 0;
}

// ---------------------------------------------------------------- demanda
const nomeArt = (a) => `${a.numero}${a.contratante ? " – " + a.contratante : ""}`;
const DATAS_ETAPA = { proposta: "proposta_em", aprovada: "aprovada_em", execucao: "aprovada_em", concluida: "concluida_em" };

function blocoFinanceiro(d) {
  const ligados = lancamentos.filter((l) => l.demanda_id === d.id);
  const receitas = ligados.filter((l) => l.tipo === "receita");
  const recebido = receitas.filter((l) => l.pago_em).reduce((t, l) => t + Number(l.valor), 0);
  const aReceber = receitas.filter((l) => !l.pago_em).reduce((t, l) => t + Number(l.valor), 0);
  const despesas = ligados.filter((l) => l.tipo === "despesa").reduce((t, l) => t + Number(l.valor), 0);
  return `<div class="bloco"><h3>Financeiro</h3>
    ${ligados.length
      ? `<p>Recebido: <b>${moeda(recebido)}</b> · A receber: <b>${moeda(aReceber)}</b> · Despesas: <b>${moeda(despesas)}</b></p>
         <ul class="lista-simples">${ligados
           .map((l) => `<li>${l.tipo === "receita" ? "Receita" : "Despesa"}: ${esc(l.descricao)} – ${moeda(Number(l.valor))} (${G.ROTULO_SITUACAO_LANC[l.tipo][G.situacaoLancamento(l, hoje)].toLowerCase()})</li>`)
           .join("")}</ul>`
      : `<p class="dica">Nenhum lançamento ligado a esta demanda.</p>`}
    <div class="linha-acoes">
      <a class="btn btn-claro" href="financeiro.html?novo=receita&amp;demanda=${encodeURIComponent(d.id)}">Lançar receita</a>
      <a class="btn btn-claro" href="financeiro.html?novo=despesa&amp;demanda=${encodeURIComponent(d.id)}">Lançar despesa</a>
    </div>
  </div>`;
}

function abrirDemanda(id, novo = {}) {
  const existente = demandas.find((d) => d.id === id);
  const d = existente ? { ...existente } : { etapa: "recebida", origem: "site", recebida_em: hoje, ...novo };
  const dlg = $("#dlg-demanda");
  const artsOrdenadas = [...arts].sort((a, b) => (b.registrada || "").localeCompare(a.registrada || ""));
  const data = (nome, rotulo) => `<label class="c2">${rotulo}<input type="date" name="${nome}" value="${esc(d[nome])}"></label>`;
  dlg.innerHTML = `<form id="form-demanda">
    <div class="dlg-cab">
      <h2>${existente ? "Demanda" : "Nova demanda"}</h2>
      <button class="btn-link" data-fechar type="button">Fechar</button>
    </div>
    <div class="dlg-corpo">
      ${existente && G.emAberto(d) ? `<p class="demanda-passo"><b>Próximo passo:</b> ${esc(G.proximoPasso(d))} <small>${diasAberta(d)}${d.origem === "site" && d.contato_id ? " · veio do formulário do site" : ""}</small></p>` : ""}
      <div class="campos">
        <label class="c4">Serviço solicitado<input name="titulo" value="${esc(d.titulo)}" required placeholder="Ex.: Laudo NR-12 de 3 escavadeiras"></label>
        <label class="c2">Tipo de serviço<select name="servico"><option value="">—</option>${opcoes(G.SERVICOS, d.servico)}</select></label>
        <label class="c3">Cliente / empresa<input name="cliente" value="${esc(d.cliente)}"></label>
        <label class="c3">Contato<input name="contato" value="${esc(d.contato)}"></label>
        <label class="c3">E-mail<input type="email" name="email" value="${esc(d.email)}"></label>
        <label class="c3">Telefone / WhatsApp<input name="telefone" value="${esc(d.telefone)}"></label>
        <label class="c4">Cidade<input name="cidade" value="${esc(d.cidade)}"></label>
        <label class="c2">UF<select name="uf"><option value="">—</option>${opcoes(UFS, d.uf)}</select></label>
        <label class="c2">Origem<select name="origem">${opcoes(G.ORIGENS, d.origem)}</select></label>
        <label class="c2">Etapa<select name="etapa">${opcoes(G.ETAPAS, d.etapa)}</select></label>
        <label class="c2">Valor da proposta (R$)<input name="valor" inputmode="decimal" value="${d.valor == null ? "" : String(d.valor).replace(".", ",")}"></label>
        ${data("recebida_em", "Recebida em")}
        ${data("proposta_em", "Proposta enviada em")}
        ${data("prazo", "Prazo / próxima ação")}
        ${data("aprovada_em", "Aprovada em")}
        ${data("concluida_em", "Concluída em")}
        <label class="c2">ART vinculada<select name="art_id"><option value="">Nenhuma</option>${opcoes(artsOrdenadas.map((a) => [a.id, nomeArt(a)]), d.art_id)}</select></label>
        <label class="c6">Observações<textarea name="observacao" rows="4">${esc(d.observacao)}</textarea></label>
      </div>
      <p class="dica">O prazo gera lembrete no painel e no e-mail diário: na véspera, no dia e uma vez por semana enquanto estiver atrasado.</p>
      ${existente ? blocoFinanceiro(d) : ""}
    </div>
    <div class="dlg-rodape">
      ${existente ? `<button class="btn btn-perigo esquerda" type="button" id="btn-excluir">Excluir</button>` : ""}
      <button class="btn btn-claro" type="button" data-fechar>Cancelar</button>
      <button class="btn btn-primary" type="submit">Salvar</button>
    </div>
  </form>`;

  const form = $("#form-demanda", dlg);
  // Ao mudar a etapa, registra a data correspondente se estiver em branco
  form.elements.etapa.addEventListener("change", (e) => {
    const campo = DATAS_ETAPA[e.target.value];
    if (campo && !form.elements[campo].value) form.elements[campo].value = hoje;
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const dados = { ...d };
    for (const nome of ["titulo", "servico", "cliente", "contato", "email", "telefone", "cidade", "uf", "origem", "etapa",
      "recebida_em", "proposta_em", "prazo", "aprovada_em", "concluida_em", "art_id", "observacao"]) {
      const v = (f.get(nome) ?? "").toString().trim();
      dados[nome] = v === "" ? null : v;
    }
    dados.valor = numeroDigitado(f.get("valor"));
    dados.recebida_em = dados.recebida_em || hoje;
    try {
      await colecao.salvar(dados);
      dlg.close();
      avisar("Demanda salva.");
      await recarregar();
    } catch (err) {
      avisar("Não foi possível salvar: " + err.message);
    }
  });

  $("#btn-excluir", form)?.addEventListener("click", async () => {
    if (!confirm("Excluir esta demanda? Os lançamentos ligados a ela continuam no financeiro.")) return;
    await colecao.remover(existente.id);
    dlg.close();
    avisar("Demanda excluída.");
    await recarregar();
  });

  dlg.showModal();
}

// ---------------------------------------------------------------- acompanhamento (pop-up ao entrar)
// Como o resumo dos vencimentos das ARTs: abre ao entrar sempre que houver demanda em andamento, com os dias
// corridos, o prazo e o próximo passo de cada uma. O mesmo resumo chega por e-mail todo dia às 7h.
const CARTOES = [["recebida", "Recebidas"], ["proposta", "Propostas enviadas"], ["aprovada", "Aprovadas"], ["execucao", "Em execução"]];

function textoPrazo(dias) {
  if (dias === null) return "";
  return dias < 0 ? `atrasado há ${G.textoDias(-dias)}` : dias === 0 ? "vence hoje" : dias === 1 ? "vence amanhã" : `em ${G.textoDias(dias)}`;
}

function abrirAcompanhamento(automatico = false) {
  const lista = G.acompanhamentoDemandas(demandas, hoje);
  if (automatico && !lista.length) return;
  const vencidas = lista.filter((i) => i.prazo !== null && i.prazo < 0).length;
  const linha = (i) => `<tr>
      <td><b>${esc(i.d.titulo)}</b><br><small class="dica">${esc(i.d.cliente || i.d.contato || "cliente não informado")}${i.d.cidade ? ` · ${esc(i.d.cidade)}${i.d.uf ? "/" + esc(i.d.uf) : ""}` : ""}</small></td>
      <td>${etiquetaEtapa(i.d)}${i.d.etapa !== "recebida" ? `<br><small class="dica">há ${G.textoDias(i.diasNaEtapa)}</small>` : ""}</td>
      <td class="data">${i.diasAberta ? G.textoDias(i.diasAberta) : "hoje"}<br><small class="dica">desde ${dataBR(i.d.recebida_em)}</small></td>
      <td>${i.prazo === null ? '<small class="dica">sem prazo</small>' : `<span class="etiqueta ${i.prazo < 0 ? "s-vencida" : i.prazo <= 1 ? "s-vencendo" : "s-ativa"}">${dataBR(i.d.prazo)}<small>${textoPrazo(i.prazo)}</small></span>`}</td>
      <td class="passo">${esc(i.passo)}</td>
      <td><button class="btn-link" type="button" data-ver="${esc(i.d.id)}">Abrir</button></td></tr>`;
  const n = (e) => lista.filter((i) => i.d.etapa === e).length;
  $("#dlg-acompanhamento").innerHTML = `<div class="dlg-cab"><h2 id="titulo-acompanhamento">Acompanhamento das demandas</h2><button class="btn-link" data-fechar type="button">Fechar</button></div>
    <div class="dlg-corpo">
      <p class="dica">Situação em ${dataBR(hoje)}. Entram as demandas de recebida até em execução; saem quando ficam concluídas ou não aprovadas. O mesmo resumo chega por e-mail todo dia às 7h.</p>
      <div class="venc-cards acomp-cards">${CARTOES.map(([e, rotulo]) => `<button type="button" class="venc-card ac-${e}" data-ver-etapa="${e}"${n(e) ? "" : " disabled"}><strong>${n(e)}</strong><span>${rotulo}</span></button>`).join("")}</div>
      ${!lista.length ? '<p class="venc-ok">Nenhuma demanda em andamento.</p>' : ""}
      ${vencidas ? `<p class="venc-aviso"><b>${vencidas === 1 ? "1 demanda está" : `${vencidas} demandas estão`} com o prazo vencido.</b> Faça o próximo passo ou mude o prazo na demanda.</p>` : ""}
      ${lista.length ? `<div class="tabela-wrap"><table class="tabela compacta acomp-tabela"><thead><tr><th>Demanda</th><th>Etapa</th><th>Aberta há</th><th>Prazo</th><th>Próximo passo</th><th></th></tr></thead>
        <tbody>${lista.map(linha).join("")}</tbody></table></div>` : ""}
    </div>
    <div class="dlg-rodape"><button class="btn btn-primary" type="button" data-fechar>Entendi</button></div>`;
  if (!$("#dlg-acompanhamento").open) $("#dlg-acompanhamento").showModal();
}

// ---------------------------------------------------------------- e-mail do formulário do site
// O FormSubmit envia uma tabela "campo | valor". Copiada do e-mail, vira "Campo<tab>valor" ou "Campo" e o valor na linha seguinte.
const CAMPOS_EMAIL = {
  nome: ["nome"],
  email: ["email", "e-mail"],
  telefone: ["whatsapp", "telefone"],
  empresa: ["empresa"],
  cidade: ["cidade"],
  uf: ["estado", "uf"],
  documento: ["cpf/cnpj"],
  quantidade: ["quantidade", "nº de equipamentos"],
  servico: ["serviço", "servico"],
  tos: ["código tos", "codigo tos"],
  equipamento: ["equipamento"],
  mensagem: ["mensagem"],
};
const ROTULOS = Object.values(CAMPOS_EMAIL).flat();
const ehRotulo = (linha) => ROTULOS.some((r) => linha.toLowerCase() === r || linha.toLowerCase().startsWith(r + ":") || linha.toLowerCase().startsWith(r + "\t"));
const escRegex = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");

export function lerEmailSite(texto) {
  const linhas = texto.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const r = {};
  linhas.forEach((linha, i) => {
    for (const [campo, nomes] of Object.entries(CAMPOS_EMAIL)) {
      if (r[campo]) continue;
      for (const nome of nomes) {
        const m = linha.match(new RegExp(`^${escRegex(nome)}\\s*(?::|\\t)\\s*(.+)$`, "i"));
        if (m) r[campo] = m[1].trim();
        else if (linha.toLowerCase() === nome && linhas[i + 1] && !ehRotulo(linhas[i + 1])) r[campo] = linhas[i + 1];
        if (r[campo]) break;
      }
    }
  });
  // A mensagem pode ter várias linhas: junta até o próximo campo ou o rodapé do e-mail
  const ini = linhas.findIndex((l) => /^mensagem\b/i.test(l));
  if (ini >= 0) {
    const resto = [];
    const primeira = linhas[ini].replace(/^mensagem\s*(?::|\t)?\s*/i, "");
    if (primeira) resto.push(primeira);
    for (const l of linhas.slice(ini + 1)) {
      if (ehRotulo(l) || /formsubmit|submitted|enviado por/i.test(l)) break;
      resto.push(l);
    }
    if (resto.length) r.mensagem = resto.join("\n");
  }
  return r;
}

// Opção escolhida no formulário do site → tipo de serviço usado nas demandas e no financeiro
const MAPA_SERVICO = [
  [/nr-?12/i, "Laudo NR-12"],
  [/nr-?13/i, "Laudo NR-13"],
  [/pmoc|climatiza|ar-condicionado/i, "PMOC e climatização"],
  [/eletrifica/i, "Eletrificação de frota"],
  [/treinamento/i, "Treinamentos técnicos"],
  [/insumo/i, "Indicação de serviços técnicos"],
  [/industri/i, "Manutenção industrial"],
  [/frota/i, "Consultoria em gestão de frotas e ativos"],
  [/laudo/i, "Laudos mecânicos e eletromecânicos"],
];

function demandaDoEmail(texto) {
  const e = lerEmailSite(texto);
  if (!e.nome && !e.email && !e.servico) return null;
  const servico = (MAPA_SERVICO.find(([re]) => re.test(e.servico || "")) || [])[1];
  const observacao = [
    e.equipamento && `Equipamento: ${e.equipamento}`,
    e.quantidade && `Nº de equipamentos: ${e.quantidade}`,
    e.documento && `CPF/CNPJ: ${e.documento}`,
    e.tos && `Código TOS: ${e.tos}`,
    e.mensagem && `Mensagem: ${e.mensagem}`,
  ].filter(Boolean).join("\n");
  return {
    titulo: e.servico || "Solicitação de proposta pelo site",
    servico: servico || null,
    cliente: e.empresa || e.nome || null,
    contato: e.nome || null,
    email: e.email || null,
    telefone: e.telefone || null,
    cidade: e.cidade || null,
    uf: UFS.includes((e.uf || "").toUpperCase()) ? e.uf.toUpperCase() : null,
    origem: "site",
    etapa: "recebida",
    recebida_em: hoje,
    observacao: observacao || null,
  };
}

// ---------------------------------------------------------------- exportação
function exportar() {
  const lista = filtradas();
  if (!lista.length) return avisar("Não há demandas para exportar com os filtros atuais.");
  const artPorId = new Map(arts.map((a) => [a.id, a.numero]));
  baixarCsv(
    `demandas-${hoje}.csv`,
    ["Recebida em", "Serviço", "Tipo de serviço", "Cliente", "Contato", "E-mail", "Telefone", "Cidade", "UF", "Origem",
      "Etapa", "Valor (R$)", "Proposta enviada em", "Aprovada em", "Concluída em", "Prazo", "ART", "Observações"],
    lista.map((d) => [
      dataBR(d.recebida_em), d.titulo, d.servico, d.cliente, d.contato, d.email, d.telefone, d.cidade, d.uf,
      G.ROTULO_ORIGEM[d.origem], G.ROTULO_ETAPA[d.etapa], d.valor == null ? "" : Number(d.valor),
      d.proposta_em ? dataBR(d.proposta_em) : "", d.aprovada_em ? dataBR(d.aprovada_em) : "",
      d.concluida_em ? dataBR(d.concluida_em) : "", d.prazo ? dataBR(d.prazo) : "", artPorId.get(d.art_id) || "", d.observacao,
    ])
  );
}

// ---------------------------------------------------------------- eventos
function prepararEventos() {
  prepararDialogos();
  $("#btn-nova").addEventListener("click", () => abrirDemanda(null, { origem: "whatsapp" }));
  $("#btn-colar").addEventListener("click", () => {
    $("#texto-email").value = "";
    $("#dlg-colar").showModal();
  });
  $("#form-colar").addEventListener("submit", (e) => {
    e.preventDefault();
    const nova = demandaDoEmail($("#texto-email").value);
    if (!nova) return avisar("Não encontrei os campos do formulário nesse texto. Confira se copiou o e-mail inteiro.");
    $("#dlg-colar").close();
    abrirDemanda(null, nova);
  });
  $("#btn-exportar").addEventListener("click", exportar);
  $("#btn-acompanhamento").addEventListener("click", () => abrirAcompanhamento(false));
  $("#dlg-acompanhamento").addEventListener("click", (e) => {
    const ver = e.target.closest("[data-ver]");
    const etapa = e.target.closest("[data-ver-etapa]");
    if (ver) {
      $("#dlg-acompanhamento").close();
      abrirDemanda(ver.dataset.ver);
    } else if (etapa) {
      $("#dlg-acompanhamento").close();
      filtro.etapa = etapa.dataset.verEtapa;
      renderizar();
    }
  });
  $("#etapas").addEventListener("click", (e) => {
    const b = e.target.closest("[data-etapa]");
    if (!b) return;
    filtro.etapa = b.dataset.etapa;
    renderizar();
  });
  $("#busca").addEventListener("input", (e) => {
    filtro.busca = e.target.value;
    renderTabela();
  });
  $("#filtro-origem").addEventListener("change", (e) => {
    filtro.origem = e.target.value;
    renderTabela();
  });
  const abrirLinha = (e) => {
    const tr = e.target.closest("tr[data-id]");
    if (tr) abrirDemanda(tr.dataset.id);
  };
  $("#tabela tbody").addEventListener("click", abrirLinha);
  $("#tabela tbody").addEventListener("keydown", (e) => e.key === "Enter" && abrirLinha(e));
}

// Início: roda depois de todo o módulo carregado
async function iniciar() {
  const sessao = await abrirPagina("demandas.html");
  if (!sessao) return;
  armazem = sessao.armazem;
  colecao = armazem.colecao("demandas");
  $("#tela").hidden = false;
  $("#filtro-origem").innerHTML = `<option value="">Todas as origens</option>${opcoes(G.ORIGENS)}`;
  prepararEventos();
  await recarregar();
  // Ao entrar, sempre que houver demanda em andamento (e por demandas.html#acompanhamento, mesmo sem nenhuma)
  abrirAcompanhamento(location.hash !== "#acompanhamento");
  window.addEventListener("hashchange", () => {
    if (location.hash === "#acompanhamento") abrirAcompanhamento(false);
  });
}

iniciar();
