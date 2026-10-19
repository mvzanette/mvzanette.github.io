// Área restrita – Controle financeiro (engenharia) e Finanças das empresas: receitas, despesas, valores a receber
// e resumo mensal. A mesma tela serve às duas páginas: em empresas.html (body com data-livro="empresas") ficam os
// lançamentos da empresa aberta e as ARTs tiradas para ela; os nomes das empresas vêm do banco.
// Nas duas, aparecem também os lançamentos das finanças pessoais marcados com a conta da página.
import { abrirPagina, empresaAberta, paginaEmpresa } from "./sessao.js";
import { pode } from "./modulos.js";
import { dataBR, hojeISO, situacao as situacaoArt, ROTULO_SITUACAO } from "./regras.js";
import * as G from "./regras-gestao.js";
import { contasDaEmpresa, lancamentosDaConta } from "./financas-classificacao.js";
import { $, esc, moeda, avisar, baixarCsv, opcoes, prepararDialogos, numeroDigitado } from "./ui.js";

const hoje = hojeISO();
const DA_EMPRESA = document.body.dataset.livro === "empresas";
const CATEGORIAS = DA_EMPRESA ? G.CATEGORIAS_EMPRESA : G.CATEGORIAS;
const TEXTO = DA_EMPRESA
  ? { recebido: "Recebido da empresa", gastos: "Pago por você", resultado: "Saldo do período", pessoa: "Fornecedor / referência" }
  : { recebido: "Total recebido", gastos: "Gastos totais", resultado: "Lucro líquido", pessoa: "Cliente / fornecedor" };
let armazem, colecao, perfil;
let empresas = [];
let empresa = null; // empresa aberta (só na página das empresas)
let lancamentos = []; // os desta página: da engenharia (sem empresa) ou da empresa aberta
let arts = [];
let demandas = [];
let pessoais = []; // lançamentos das finanças pessoais marcados com a conta desta página
const filtro = { busca: "", periodo: "ano", tipo: "", situacao: "" };
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

async function recarregar() {
  let todos;
  [todos, arts, demandas] = await Promise.all([
    colecao.listar(),
    pode(perfil, "art") ? armazem.listar() : [],
    !DA_EMPRESA && pode(perfil, "demandas") ? armazem.colecao("demandas").listar() : [],
  ]);
  lancamentos = todos.filter((l) => (DA_EMPRESA ? l.empresa_id === empresa.id : !l.empresa_id));
  renderizar();
}

function renderizar() {
  renderResumo();
  renderTabela();
  renderMensal();
  renderArtsEmpresa();
  renderPessoais();
}

// ---------------------------------------------------------------- resumo
function kpi(rotulo, valor, detalhe = "", acao = "") {
  const tag = acao ? "button" : "div";
  const extra = acao ? ` type="button" data-situacao="${acao}" aria-pressed="${filtro.situacao === acao}"` : "";
  return `<${tag} class="kpi${acao ? " kpi-botao" : ""}"${extra}>
      <span class="kpi-rotulo">${rotulo}</span>
      <strong class="kpi-valor">${valor}</strong>
      ${detalhe ? `<span class="kpi-detalhe">${detalhe}</span>` : ""}
    </${tag}>`;
}

function renderResumo() {
  const p = G.periodo(filtro.periodo, hoje);
  const r = G.resumoFinanceiro(lancamentos, p, hoje);
  const nomePeriodo = G.PERIODOS.find(([k]) => k === filtro.periodo)[1].toLowerCase();
  $("#resumo").innerHTML = [
    kpi(TEXTO.recebido, moeda(r.recebido), nomePeriodo),
    kpi(TEXTO.gastos, moeda(r.gastos), nomePeriodo),
    kpi(TEXTO.resultado, moeda(r.lucro), r.margem == null || DA_EMPRESA ? nomePeriodo : `margem de ${Math.round(r.margem * 100)}%`),
    kpi("A receber", moeda(r.aReceber), "no prazo", "pendente"),
    kpi("Em atraso", moeda(r.atrasado), `${r.qtdAtrasado} ${r.qtdAtrasado === 1 ? "recebimento" : "recebimentos"}`, "atrasado"),
  ].join("");
}

// ---------------------------------------------------------------- lista
function filtrados() {
  const p = G.periodo(filtro.periodo, hoje);
  const termo = filtro.busca.toLowerCase();
  return lancamentos
    .filter((l) => {
      const situacao = G.situacaoLancamento(l, hoje);
      // atrasados e pendentes aparecem mesmo fora do período
      if (situacao === "pago" && !(G.dataReferencia(l) >= p.inicio && G.dataReferencia(l) <= p.fim)) return false;
      if (situacao !== "pago" && filtro.periodo !== "tudo" && G.dataReferencia(l) > p.fim) return false;
      if (filtro.tipo && l.tipo !== filtro.tipo) return false;
      if (filtro.situacao && situacao !== filtro.situacao) return false;
      if (termo && ![l.descricao, l.cliente, l.categoria].join(" ").toLowerCase().includes(termo)) return false;
      return true;
    })
    .sort((a, b) => (G.dataReferencia(b) || "").localeCompare(G.dataReferencia(a) || ""));
}

function etiquetaSituacao(l) {
  const s = G.situacaoLancamento(l, hoje);
  const classe = { pago: "s-ativa", pendente: "s-vencendo", atrasado: "s-vencida" }[s];
  return `<span class="etiqueta ${classe}">${G.ROTULO_SITUACAO_LANC[l.tipo][s]}</span>`;
}

function renderTabela() {
  const lista = filtrados();
  $("#tabela tbody").innerHTML = lista
    .map(
      (l) => `<tr class="clicavel" data-id="${esc(l.id)}" tabindex="0">
        <td class="data">${dataBR(l.competencia)}</td>
        <td><span class="tipo tipo-${l.tipo}">${l.tipo === "receita" ? "Receita" : "Despesa"}</span></td>
        <td>${esc(l.descricao)}</td>
        <td>${esc(l.cliente || "—")}</td>
        <td class="servico">${esc(l.categoria || "—")}</td>
        <td class="data">${l.pago_em ? `pago em ${dataBR(l.pago_em)}` : dataBR(l.vencimento)}</td>
        <td class="num">${l.tipo === "despesa" ? "−" : ""}${moeda(Number(l.valor))}</td>
        <td>${etiquetaSituacao(l)}</td>
      </tr>`
    )
    .join("");
  $("#vazio").hidden = lista.length > 0;
}

function renderMensal() {
  const p = G.periodo(filtro.periodo, hoje);
  const meses = G.porMes(lancamentos, p.meses);
  $("#tabela-mensal tbody").innerHTML = meses
    .map(
      (m) => `<tr><td>${G.rotuloMes(m.mes)}</td><td class="num">${moeda(m.receitas)}</td>
        <td class="num">${moeda(m.despesas)}</td><td class="num${m.resultado < 0 ? " negativo" : ""}">${moeda(m.resultado)}</td></tr>`
    )
    .join("");
  const total = meses.reduce((t, m) => ({ r: t.r + m.receitas, d: t.d + m.despesas }), { r: 0, d: 0 });
  $("#tabela-mensal tfoot").innerHTML = `<tr><th>Total</th><th class="num">${moeda(total.r)}</th>
    <th class="num">${moeda(total.d)}</th><th class="num">${moeda(total.r - total.d)}</th></tr>`;
}

// ---------------------------------------------------------------- ARTs da empresa e gastos pagos com o seu dinheiro
function renderArtsEmpresa() {
  const box = $("#secao-arts");
  if (!box) return;
  if (!DA_EMPRESA || !pode(perfil, "art")) {
    box.hidden = true;
    return;
  }
  const lista = arts.filter((a) => a.empresa_id === empresa.id).sort((a, b) => (b.registrada || b.inicio || "").localeCompare(a.registrada || a.inicio || ""));
  const lancadas = new Set(lancamentos.filter((l) => l.art_id).map((l) => l.art_id));
  const taxas = lista.reduce((t, a) => t + (Number(a.taxa) || 0), 0);
  box.hidden = false;
  box.innerHTML = `<h2 class="subtitulo-area">ARTs tiradas para ${esc(empresa.nome)}</h2>
    <p class="dica">${lista.length
      ? `${plural(lista.length, "ART", "ARTs")}, com taxas que somam ${moeda(taxas)}. A empresa paga a taxa; se você pagou, lance o reembolso.`
      : "Nenhuma ART marcada para esta empresa. No Controle de ART, abra a ART e escolha a empresa em “Tirada para”."}</p>
    ${lista.length ? `<div class="tabela-wrap"><table class="tabela compacta"><thead><tr><th>ART</th><th>Contratante</th><th>Fim previsto</th><th>Situação</th><th class="num">Taxa</th><th></th></tr></thead><tbody>
      ${lista.map((a) => `<tr><td class="numero">${esc(a.numero)}</td><td>${esc(a.contratante || "—")}</td><td class="data">${dataBR(a.fim)}</td>
        <td>${esc(ROTULO_SITUACAO[situacaoArt(a, hoje)])}</td><td class="num">${a.taxa == null ? "—" : moeda(Number(a.taxa))}</td>
        <td>${lancadas.has(a.id) ? '<span class="dica">lançada</span>' : `<button class="btn-link" type="button" data-lancar-art="${esc(a.id)}">Lançar reembolso</button>`}</td></tr>`).join("")}
    </tbody></table></div>` : ""}`;
}

async function carregarPessoais() {
  if (!pode(perfil, "financas")) return [];
  try {
    const [registro, gastos, ajustes, prefs] = await Promise.all([
      armazem.financas.ler(perfil.id),
      armazem.financas.gastos(perfil.id),
      armazem.financas.ajustes(perfil.id),
      armazem.financas.preferencias(perfil.id),
    ]);
    return lancamentosDaConta({ dados: registro && registro.dados, gastos, ajustes, prefs }, DA_EMPRESA ? contasDaEmpresa(prefs, empresa.id) : "engenharia");
  } catch {
    return []; // banco sem as tabelas novas: a seção só não aparece
  }
}

const jaLancado = (p) => lancamentos.some((l) => l.competencia === p.data && Math.abs(Number(l.valor) - p.valor) < 0.01);

function renderPessoais() {
  const box = $("#secao-pessoais");
  if (!box) return;
  box.hidden = !pessoais.length;
  if (!pessoais.length) return;
  const total = pessoais.reduce((t, p) => t + p.valor, 0);
  box.innerHTML = `<h2 class="subtitulo-area">Pagos com o seu dinheiro</h2>
    <p class="dica">Lançamentos das Finanças pessoais (cartão, gastos do dia a dia e lançados no site) que você marcou como
      ${DA_EMPRESA ? "desta empresa" : "da engenharia"}: ${moeda(total)} em ${plural(pessoais.length, "lançamento", "lançamentos")}.
      ${DA_EMPRESA ? "Lance como valor a receber para cobrar o reembolso." : "Lance como despesa da engenharia para entrar no resultado."}</p>
    <div class="tabela-wrap"><table class="tabela compacta"><thead><tr><th>Data</th><th>Lançamento</th><th>Origem</th><th class="num">Valor</th><th></th></tr></thead><tbody>
    ${pessoais.map((p, i) => `<tr><td class="data">${p.data ? dataBR(p.data) : "—"}</td>
      <td>${esc(p.descricao)}${p.complemento ? `<br><small class="dica">${esc(p.complemento)}</small>` : ""}</td>
      <td><small>${esc(p.origem)}</small></td><td class="num">${moeda(p.valor)}</td>
      <td>${jaLancado(p) ? '<span class="dica">já lançado</span>' : `<button class="btn-link" type="button" data-lancar-pessoal="${i}">${DA_EMPRESA ? "Lançar a receber" : "Lançar despesa"}</button>`}</td></tr>`).join("")}
    </tbody></table></div>`;
}

function lancarPessoal(p) {
  const nome = p.complemento ? `${p.descricao} – ${p.complemento}` : p.descricao;
  const observacao = `Pago com dinheiro pessoal · ${p.origem}`;
  if (DA_EMPRESA) {
    abrirLancamento(null, { tipo: "receita", descricao: `Reembolso: ${nome}`, valor: p.valor, competencia: p.data || hoje, categoria: "Reembolso de despesas", observacao });
  } else {
    abrirLancamento(null, { tipo: "despesa", descricao: nome, valor: p.valor, competencia: p.data || hoje, pago_em: p.data || hoje, observacao });
  }
}

// ---------------------------------------------------------------- lançamento
const nomeArt = (a) => `${a.numero}${a.contratante ? " – " + a.contratante : ""}`;
const nomeDemanda = (d) => `${d.titulo}${d.cliente ? " – " + d.cliente : ""}`;
const DICA_TIPO = {
  receita: "Valor que a empresa paga a você: reembolso, taxa de ART, salário, bônus…",
  despesa: "Valor que você pagou pela empresa (a reembolsar) ou para ela.",
};

function abrirLancamento(id, novo = {}) {
  const existente = lancamentos.find((l) => l.id === id);
  const l = existente ? { ...existente } : { tipo: "receita", competencia: hoje, ...novo };
  const dlg = $("#dlg-lanc");
  // Na página da empresa, as ARTs dela vêm primeiro
  const primeiro = (a) => (DA_EMPRESA && a.empresa_id === empresa.id ? 0 : 1);
  const artsOrdenadas = [...arts].sort((a, b) => primeiro(a) - primeiro(b) || (b.registrada || "").localeCompare(a.registrada || ""));
  dlg.innerHTML = `<form id="form-lanc">
    <div class="dlg-cab">
      <h2>${existente ? "Editar lançamento" : l.tipo === "receita" ? "Nova receita" : "Nova despesa"}</h2>
      <button class="btn-link" data-fechar type="button">Fechar</button>
    </div>
    <div class="dlg-corpo">
      <div class="opcoes" role="radiogroup" aria-label="Tipo">
        <label><input type="radio" name="tipo" value="receita"${l.tipo === "receita" ? " checked" : ""}> Receita</label>
        <label><input type="radio" name="tipo" value="despesa"${l.tipo === "despesa" ? " checked" : ""}> Despesa</label>
      </div>
      ${DA_EMPRESA ? `<p class="dica" id="dica-tipo">${DICA_TIPO[l.tipo]}</p>` : ""}
      <div class="campos">
        <label class="c4">Descrição<input name="descricao" value="${esc(l.descricao)}" required></label>
        <label class="c2">Categoria<select name="categoria"></select></label>
        <label class="c4">${TEXTO.pessoa}<input name="cliente" value="${esc(l.cliente)}"></label>
        <label class="c2">Valor (R$)<input name="valor" inputmode="decimal" value="${l.valor == null ? "" : String(l.valor).replace(".", ",")}" required></label>
        <label class="c2">Data do serviço / emissão<input type="date" name="competencia" value="${esc(l.competencia)}" required></label>
        <label class="c2">Vencimento<input type="date" name="vencimento" value="${esc(l.vencimento)}"></label>
        <label class="c2"><span class="rotulo-pago">${l.tipo === "despesa" ? "Pago em" : "Recebido em"}</span><input type="date" name="pago_em" value="${esc(l.pago_em)}"></label>
        <label class="c2">Forma de pagamento<select name="forma"><option value="">—</option>${opcoes(G.FORMAS, l.forma)}</select></label>
        <label class="c2">ART vinculada<select name="art_id"><option value="">Nenhuma</option>${opcoes(artsOrdenadas.map((a) => [a.id, nomeArt(a)]), l.art_id)}</select></label>
        ${DA_EMPRESA ? "" : `<label class="c2">Demanda vinculada<select name="demanda_id"><option value="">Nenhuma</option>${opcoes(demandas.map((d) => [d.id, nomeDemanda(d)]), l.demanda_id)}</select></label>`}
        <label class="c6">Observação<textarea name="observacao" rows="2">${esc(l.observacao)}</textarea></label>
      </div>
      ${l.pago_em ? "" : `<button class="btn btn-claro" type="button" id="btn-pago-hoje">${l.tipo === "despesa" ? "Marcar como pago hoje" : "Marcar como recebido hoje"}</button>`}
    </div>
    <div class="dlg-rodape">
      ${existente ? `<button class="btn btn-perigo esquerda" type="button" id="btn-excluir">Excluir</button>` : ""}
      <button class="btn btn-claro" type="button" data-fechar>Cancelar</button>
      <button class="btn btn-primary" type="submit">Salvar</button>
    </div>
  </form>`;

  const form = $("#form-lanc", dlg);
  const campo = (nome) => form.elements[nome];
  const tipoAtual = () => form.querySelector("input[name=tipo]:checked").value;
  const preencherCategorias = (manter) => {
    const tipo = tipoAtual();
    campo("categoria").innerHTML = `<option value="">—</option>${opcoes(CATEGORIAS[tipo], manter)}`;
    $(".rotulo-pago", form).textContent = tipo === "despesa" ? "Pago em" : "Recebido em";
    const pagoHoje = $("#btn-pago-hoje", form);
    if (pagoHoje) pagoHoje.textContent = tipo === "despesa" ? "Marcar como pago hoje" : "Marcar como recebido hoje";
    const dica = $("#dica-tipo", form);
    if (dica) dica.textContent = DICA_TIPO[tipo];
  };
  preencherCategorias(l.categoria);

  // Ao escolher a ART ou a demanda, completa o que estiver em branco
  const completar = (dados) => {
    for (const [nome, valor] of Object.entries(dados)) {
      if (valor == null || valor === "") continue;
      if (!campo(nome).value) campo(nome).value = nome === "valor" ? String(valor).replace(".", ",") : valor;
    }
  };
  const aoEscolherArt = () => {
    const art = arts.find((a) => a.id === campo("art_id").value);
    if (!art) return;
    if (DA_EMPRESA && tipoAtual() === "receita") {
      if (!campo("categoria").value) campo("categoria").value = "Pagamento de ART";
      completar({ descricao: `Taxa da ART nº ${art.numero} (paga pela empresa)`, valor: art.taxa });
    } else if (tipoAtual() === "despesa") {
      if (!campo("categoria").value) campo("categoria").value = "Taxa de ART";
      if (campo("categoria").value === "Taxa de ART") completar({ descricao: `Taxa da ART nº ${art.numero}`, valor: art.taxa, cliente: `CREA-${art.crea}` });
    } else {
      completar({ descricao: `Serviço – ART nº ${art.numero}`, cliente: art.contratante, valor: art.valor });
    }
  };
  const aoEscolherDemanda = () => {
    const d = demandas.find((x) => x.id === campo("demanda_id").value);
    if (!d) return;
    completar({ descricao: d.titulo, cliente: d.cliente || d.contato, ...(tipoAtual() === "receita" ? { valor: d.valor } : {}) });
    if (tipoAtual() === "receita" && !campo("categoria").value && G.SERVICOS.includes(d.servico)) campo("categoria").value = d.servico;
    if (!campo("art_id").value && d.art_id) campo("art_id").value = d.art_id;
  };
  form.addEventListener("change", (e) => {
    if (e.target.name === "tipo") preencherCategorias(campo("categoria").value);
    if (e.target.name === "art_id") aoEscolherArt();
    if (e.target.name === "demanda_id") aoEscolherDemanda();
  });
  if (!existente) {
    if (novo.art_id) aoEscolherArt();
    if (novo.demanda_id && !DA_EMPRESA) aoEscolherDemanda();
  }

  $("#btn-pago-hoje", form)?.addEventListener("click", (e) => {
    campo("pago_em").value = hoje;
    e.target.remove();
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const valor = numeroDigitado(f.get("valor"));
    if (valor == null || valor < 0) return avisar("Informe um valor válido.");
    const dados = { ...l, tipo: tipoAtual(), valor, empresa_id: DA_EMPRESA ? empresa.id : l.empresa_id || null };
    for (const nome of ["descricao", "categoria", "cliente", "competencia", "vencimento", "pago_em", "forma", "art_id", "demanda_id", "observacao"]) {
      if (!campo(nome)) continue;
      const v = (f.get(nome) ?? "").toString().trim();
      dados[nome] = v === "" ? null : v;
    }
    try {
      await colecao.salvar(dados);
      dlg.close();
      limparEndereco();
      avisar("Lançamento salvo.");
      await recarregar();
    } catch (err) {
      avisar("Não foi possível salvar: " + err.message);
    }
  });

  $("#btn-excluir", form)?.addEventListener("click", async () => {
    if (!confirm("Excluir este lançamento?")) return;
    await colecao.remover(existente.id);
    dlg.close();
    avisar("Lançamento excluído.");
    await recarregar();
  });

  dlg.showModal();
}

// Links de outras páginas: financeiro.html?novo=receita&demanda=<id> ou ?novo=despesa&art=<id>&categoria=Taxa de ART
// (na página da empresa, empresas.html?e=<id>&novo=receita&art=<id>)
function abrirPeloEndereco() {
  const q = new URLSearchParams(location.search);
  const tipo = q.get("novo");
  if (tipo !== "receita" && tipo !== "despesa") return;
  abrirLancamento(null, {
    tipo,
    art_id: q.get("art") || null,
    demanda_id: q.get("demanda") || null,
    categoria: q.get("categoria") || null,
  });
}
const limparEndereco = () => {
  const manter = DA_EMPRESA && empresa ? `?e=${encodeURIComponent(empresa.id)}` : "";
  if (location.search !== manter) history.replaceState(null, "", location.pathname + manter);
};

// ---------------------------------------------------------------- empresas (cadastro)
function abrirEmpresas() {
  const dlg = $("#dlg-empresas");
  const linha = (e) => `<div class="empresa-linha" data-id="${esc(e.id)}">
      <label>Nome<input name="nome" value="${esc(e.nome)}" maxlength="80" required></label>
      <label class="cresce">Observação<input name="observacao" value="${esc(e.observacao || "")}" maxlength="300" placeholder="ex.: onde trabalho; paga as ARTs"></label>
      <div class="linha-acoes"><button type="button" class="btn btn-claro" data-salvar>Salvar</button><button type="button" class="btn btn-perigo" data-remover>Remover</button></div>
    </div>`;
  dlg.innerHTML = `<div class="dlg-cab">
      <h2>Empresas</h2>
      <button class="btn-link" data-fechar type="button">Fechar</button>
    </div>
    <div class="dlg-corpo">
      <p class="dica">Empresas com que você tem movimento financeiro: onde trabalha ou que pagam as ARTs que você tira. Cada uma ganha uma entrada no menu. Os nomes ficam só no banco de dados.</p>
      <div id="lista-empresas">${empresas.map(linha).join("") || '<p class="dica">Nenhuma empresa cadastrada ainda.</p>'}</div>
      <form class="empresa-linha nova" id="form-nova-empresa">
        <label>Nova empresa<input name="nome" maxlength="80" required placeholder="Nome da empresa"></label>
        <label class="cresce">Observação<input name="observacao" maxlength="300"></label>
        <div class="linha-acoes"><button class="btn btn-primary" type="submit">Adicionar</button></div>
      </form>
      <p class="erro" id="erro-empresas" role="alert" hidden></p>
    </div>`;
  const erro = (texto) => {
    $("#erro-empresas", dlg).textContent = texto;
    $("#erro-empresas", dlg).hidden = !texto;
  };
  const salvar = async (dados) => {
    try {
      const salva = await armazem.empresas.salvar(dados);
      location.href = paginaEmpresa(salva); // recarrega: o menu e o início mostram o nome novo
    } catch (err) {
      erro(err.message);
    }
  };
  $("#lista-empresas", dlg).addEventListener("click", async (e) => {
    const div = e.target.closest(".empresa-linha");
    if (!div) return;
    const atual = empresas.find((x) => x.id === div.dataset.id);
    if (e.target.closest("[data-salvar]")) {
      await salvar({ ...atual, nome: $("[name=nome]", div).value, observacao: $("[name=observacao]", div).value });
    } else if (e.target.closest("[data-remover]")) {
      if (!confirm(`Remover a empresa ${atual.nome}? As ARTs marcadas para ela ficam sem empresa.`)) return;
      try {
        await armazem.empresas.remover(atual.id);
        location.href = "empresas.html";
      } catch (err) {
        erro(err.message);
      }
    }
  });
  $("#form-nova-empresa", dlg).addEventListener("submit", async (e) => {
    e.preventDefault();
    await salvar({ nome: e.target.elements.nome.value, observacao: e.target.elements.observacao.value, ordem: empresas.length });
  });
  dlg.showModal();
}

function montarCabecalhoEmpresa() {
  document.title = `Finanças ${empresa.nome} | Área restrita`;
  $("#titulo").textContent = `Finanças ${empresa.nome}`;
  $("#trilha-empresa").textContent = empresa.nome;
  $("#empresa-obs").textContent = empresa.observacao || "";
  $("#empresa-obs").hidden = !empresa.observacao;
  const abas = $("#empresas-abas");
  abas.hidden = empresas.length < 2;
  abas.innerHTML = empresas.map((e) => `<a class="pilula" href="${paginaEmpresa(e)}"${e === empresa ? ' aria-current="page"' : ""}>${esc(e.nome)}</a>`).join("");
}

// ---------------------------------------------------------------- exportação
function exportar() {
  const lista = filtrados();
  if (!lista.length) return avisar("Não há lançamentos para exportar com os filtros atuais.");
  const artPorId = new Map(arts.map((a) => [a.id, a.numero]));
  const demPorId = new Map(demandas.map((d) => [d.id, d.titulo]));
  const nome = DA_EMPRESA ? `empresa-${empresa.nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w]+/g, "-").toLowerCase()}` : "financeiro";
  baixarCsv(
    `${nome}-${hoje}.csv`,
    ["Data", "Tipo", "Descrição", "Categoria", TEXTO.pessoa, "Valor (R$)", "Vencimento", "Recebido/pago em",
      "Situação", "Forma de pagamento", "ART", "Demanda", "Observação"],
    lista.map((l) => [
      dataBR(l.competencia), l.tipo === "receita" ? "Receita" : "Despesa", l.descricao, l.categoria, l.cliente,
      Number(l.valor), l.vencimento ? dataBR(l.vencimento) : "", l.pago_em ? dataBR(l.pago_em) : "",
      G.ROTULO_SITUACAO_LANC[l.tipo][G.situacaoLancamento(l, hoje)], l.forma, artPorId.get(l.art_id) || "",
      demPorId.get(l.demanda_id) || "", l.observacao,
    ])
  );
}

// ---------------------------------------------------------------- eventos
function prepararEventos() {
  prepararDialogos();
  $("#btn-receita").addEventListener("click", () => abrirLancamento(null, { tipo: "receita" }));
  $("#btn-despesa").addEventListener("click", () => abrirLancamento(null, { tipo: "despesa" }));
  $("#btn-exportar").addEventListener("click", exportar);
  $("#busca").addEventListener("input", (e) => {
    filtro.busca = e.target.value;
    renderTabela();
  });
  $("#periodo").addEventListener("change", (e) => {
    filtro.periodo = e.target.value;
    renderizar();
  });
  $("#filtro-tipo").addEventListener("change", (e) => {
    filtro.tipo = e.target.value;
    renderTabela();
  });
  $("#filtro-situacao").addEventListener("change", (e) => {
    filtro.situacao = e.target.value;
    renderizar();
  });
  $("#resumo").addEventListener("click", (e) => {
    const b = e.target.closest("[data-situacao]");
    if (!b) return;
    filtro.situacao = filtro.situacao === b.dataset.situacao ? "" : b.dataset.situacao;
    $("#filtro-situacao").value = filtro.situacao;
    renderizar();
  });
  const abrirLinha = (e) => {
    const tr = e.target.closest("tr[data-id]");
    if (tr) abrirLancamento(tr.dataset.id);
  };
  $("#tabela tbody").addEventListener("click", abrirLinha);
  $("#tabela tbody").addEventListener("keydown", (e) => e.key === "Enter" && abrirLinha(e));
  $("#dlg-lanc").addEventListener("close", limparEndereco);
  $("#secao-pessoais")?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-lancar-pessoal]");
    if (b) lancarPessoal(pessoais[Number(b.dataset.lancarPessoal)]);
  });
  $("#secao-arts")?.addEventListener("click", (e) => {
    const b = e.target.closest("[data-lancar-art]");
    if (b) abrirLancamento(null, { tipo: "receita", art_id: b.dataset.lancarArt });
  });
  $("#btn-empresas")?.addEventListener("click", abrirEmpresas);
  $("#btn-primeira-empresa")?.addEventListener("click", abrirEmpresas);
}

// Início: roda depois de todo o módulo carregado
async function iniciar() {
  const sessao = await abrirPagina(DA_EMPRESA ? "empresas.html" : "financeiro.html");
  if (!sessao) return;
  ({ armazem, perfil, empresas } = sessao);
  colecao = armazem.colecao("lancamentos");
  prepararEventos();
  if (DA_EMPRESA) {
    empresa = empresaAberta(empresas);
    if (!empresa) {
      $("#sem-empresas").hidden = false;
      return;
    }
    montarCabecalhoEmpresa();
  }
  $("#tela").hidden = false;
  $("#periodo").innerHTML = opcoes(G.PERIODOS, filtro.periodo);
  [pessoais] = await Promise.all([carregarPessoais(), recarregar()]);
  renderPessoais();
  abrirPeloEndereco();
}

iniciar();
