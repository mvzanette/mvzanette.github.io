// Área restrita – Caixa das empresas: o adiantamento que as empresas escolhidas mandam, num caixa só. Cada despesa
// sai classificada para uma delas (RDV, o relatório de despesas de viagem, ou ficha de custo), mas o saldo é um.
// O painel mostra o saldo estimado das empresas (o que deveria estar na conta mais o antecipado a colaboradores), o
// antecipado a cada colaborador, a conta separada do caixa, o que foi usado no pessoal (a diferença para o que deveria
// estar na conta) e o que falta aprovar. RDV e fichas de custo em planilha são lidos no navegador; o arquivo fica
// anexado e a despesa só conta no saldo depois de marcada como aprovada. A lista mostra o caixa atual (desde o saldo
// inicial); o que é de antes fica no filtro "Caixa anterior".
// Os nomes das empresas e dos colaboradores vêm do banco.
import { abrirPagina, paginaEmpresa } from "./sessao.js";
import { dataBR, hojeISO } from "./regras.js";
import * as G from "./regras-gestao.js";
import { lerPlanilha } from "./planilha.js";
import { lerResumo, conferir, ajustes } from "./caixa-conferencia.js";
import { CSS_RELATORIO, DIA_ACERTO, lembreteAcerto, marcarAcerto, montarResumo, periodoAcerto, relatorioHtml, relatorioPng, totaisResumo, brl } from "./caixa-fechamento.js";
import { CLASSIFICACOES, TIPOS, lerDocumentos, nomeColaborador, resumoCaixa, rotuloMovimento, saldoApos, siglas, empresaNoTexto } from "./caixa-documentos.js";
import { $, esc, moeda, avisar, opcoes, prepararDialogos, numeroDigitado } from "./ui.js";

const hoje = hojeISO();
let armazem, perfil, colecao;
let empresas = []; // todas as cadastradas
let config = null; // { empresas, saldo_inicial, data_inicial, saldo_conta, data_conta }
let movimentos = [];
let sig = new Map(); // sigla de cada empresa do caixa ("V", "T")
const filtro = { periodo: "mes", busca: "", tipo: "", empresa: "", situacao: "" };
const PERIODOS = [["mes", "Este mês"], ["mes-anterior", "Mês passado"], ["ano", "Este ano"], ["caixa", "Desde o saldo inicial"]];
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const ACEITOS = ".xlsx,.xls,.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const doCaixa = () => (config ? empresas.filter((e) => (config.empresas || []).includes(e.id)) : []);
const nomeEmpresa = (id) => (empresas.find((e) => e.id === id) || {}).nome || "";
const juntarNomes = (ns) => (ns.length < 2 ? ns.join("") : `${ns.slice(0, -1).join(", ")} e ${ns.at(-1)}`);
const nomeCaixa = () => (doCaixa().length ? `Caixa ${juntarNomes(doCaixa().map((e) => e.nome))}` : "Caixa das empresas");
const colaboradores = () => [...new Set(movimentos.map((m) => m.colaborador).filter(Boolean).map((n) => nomeColaborador(n, [])))];
const conhecidos = () => colaboradores().reduce((lista, n) => (lista.includes(nomeColaborador(n, lista)) ? lista : [...lista, n]), []);

function intervalo() {
  if (filtro.periodo === "mes-anterior") {
    const d = new Date(`${hoje.slice(0, 7)}-01T12:00`); d.setMonth(d.getMonth() - 1);
    const m = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return { inicio: `${m}-01`, fim: `${m}-31` };
  }
  if (filtro.periodo === "caixa") return { inicio: null, fim: null };
  const p = G.periodo(filtro.periodo, hoje);
  return { inicio: p.inicio, fim: p.fim };
}

async function recarregar() {
  [config, movimentos] = await Promise.all([armazem.caixa.config(), colecao.listar()]);
  sig = siglas(doCaixa());
  renderizar();
}

function renderizar() {
  const novo = !config || !(config.empresas || []).length;
  $("#caixa-novo").hidden = !novo;
  $("#tela").hidden = novo;
  if (novo) return;
  document.title = `${nomeCaixa()} | Área restrita`;
  $("#titulo").textContent = nomeCaixa();
  $("#trilha-caixa").textContent = nomeCaixa();
  $("#caixa-abas").innerHTML = `<a class="pilula" href="caixa.html" aria-current="page">Caixa</a>${doCaixa().map((e) => `<a class="pilula" href="${paginaEmpresa(e)}">Finanças ${esc(e.nome)}</a>`).join("")}`;
  const r = resumoCaixa(config, movimentos, intervalo());
  renderAcerto();
  renderKpis(r);
  renderGastos(r);
  renderColaboradores(r);
  renderPendentes();
  renderFiltros();
  renderTabela();
}

// ---------------------------------------------------------------- painel
function kpi(rotulo, valor, detalhe = "", { classe = "", acao = "" } = {}) {
  const tag = acao ? "button" : "div";
  return `<${tag} class="kpi${classe ? ` ${classe}` : ""}${acao ? " kpi-botao" : ""}"${acao ? ` type="button" data-acao="${acao}"` : ""}>
      <span class="kpi-rotulo">${rotulo}</span><strong class="kpi-valor">${valor}</strong>${detalhe ? `<span class="kpi-detalhe">${detalhe}</span>` : ""}</${tag}>`;
}

function renderKpis(r) {
  const comColab = r.colaboradores.filter((p) => p.saldo > 0.005);
  const nomeP = PERIODOS.find(([k]) => k === filtro.periodo)[1].toLowerCase();
  const porTipo = (cl) => r.periodo.despesas.filter((g) => g.classificacao === cl).reduce((t, g) => t + g.total, 0);
  const dif = r.diferenca;
  // Uso pessoal: a diferença entre o que deveria estar na conta (saldo estimado − antecipado) e o saldo informado
  const pessoal = r.conta == null ? kpi("Usado no pessoal", "—", "informe o saldo da conta separada", { acao: "conta" })
    : Math.abs(dif) < 0.005 ? kpi("Conta em dia", moeda(0), "a conta tem o que deveria ter", { acao: "conta" })
    : dif < 0 ? kpi("Usado no pessoal, a repor", moeda(-dif), `a conta tem ${moeda(r.conta)} e deveria ter ${moeda(r.emCaixa)}`, { classe: "kpi-alerta", acao: "conta" })
    : kpi("A mais na conta", moeda(dif), `a conta tem ${moeda(r.conta)} e deveria ter ${moeda(r.emCaixa)}`, { acao: "conta" });
  $("#caixa-kpis").innerHTML = [
    kpi("Saldo estimado das empresas", moeda(r.saldoEmpresas), `${moeda(r.comColaboradores)} antecipados a colaboradores + ${moeda(r.emCaixa)} que deveriam estar na conta${r.aReembolsar ? ` − a reembolsar ${moeda(r.aReembolsar)}` : ""}`, { classe: "kpi-destaque" }),
    kpi("Antecipado a colaboradores", moeda(r.comColaboradores), comColab.length ? comColab.map((p) => `${esc(p.nome)} ${moeda(p.saldo)}`).join(" · ") + (r.aReembolsar ? ` · a reembolsar ${moeda(r.aReembolsar)}` : "") : r.aReembolsar ? `a reembolsar ${moeda(r.aReembolsar)}` : "nada antecipado"),
    kpi("Na conta do caixa", r.conta == null ? "—" : moeda(r.conta),
      r.conta == null ? "informe o saldo da conta separada" : `deveria ter ${moeda(r.emCaixa)}${r.dataConta ? ` · informado em ${dataBR(r.dataConta)}` : ""}`, { acao: "conta" }),
    pessoal,
    kpi("A aprovar", moeda(r.aAprovar.total), r.aAprovar.n ? `${plural(r.aAprovar.n, "documento", "documentos")} fora do saldo até aprovar` : "nenhuma nota de RDV ou FC pendente", { classe: r.aAprovar.n ? "kpi-alerta" : "", acao: r.aAprovar.n ? "pendentes" : "" }),
    kpi(`Gastos ${nomeP}`, moeda(r.periodo.totalDespesas), `RDV ${moeda(porTipo("rdv"))} · FC ${moeda(porTipo("fc"))}${porTipo("outro") ? ` · outros ${moeda(porTipo("outro"))}` : ""}`),
  ].join("");
}

function renderGastos(r) {
  $("#periodo").innerHTML = opcoes(PERIODOS, filtro.periodo);
  const linhas = [];
  for (const cl of ["rdv", "fc", "outro"]) {
    for (const e of [...doCaixa(), { id: null, nome: "" }]) {
      const g = r.periodo.despesas.find((x) => x.classificacao === cl && (x.empresa_id || null) === e.id);
      if (!g && (cl === "outro" || !e.id)) continue;
      linhas.push(`<tr><td><span class="etiqueta-caixa">${esc(rotuloMovimento({ tipo: "despesa", classificacao: cl, empresa_id: e.id }, sig))}</span> ${esc(cl === "rdv" ? "Relatório de viagem" : cl === "fc" ? "Ficha de custo" : "Outras despesas")}${e.nome ? ` ${esc(e.nome)}` : ""}</td>
        <td class="num">${g ? g.n : 0}</td><td class="num">${moeda(g ? g.total : 0)}</td></tr>`);
    }
  }
  $("#caixa-gastos").innerHTML = `<div class="tabela-wrap"><table class="tabela compacta"><thead><tr><th>Classificação</th><th class="num">Itens</th><th class="num">Total</th></tr></thead>
    <tbody>${linhas.join("")}</tbody><tfoot><tr><th>Despesas aprovadas</th><th></th><th class="num">${moeda(r.periodo.totalDespesas)}</th></tr>
    <tr><th>Entradas no caixa</th><th></th><th class="num">${moeda(r.periodo.entradas)}</th></tr></tfoot></table></div>`;
}

function renderColaboradores(r) {
  const box = $("#caixa-colab");
  if (!r.colaboradores.length) {
    box.innerHTML = '<p class="dica">Nenhum adiantamento a colaborador. Use <b>Adiantar a colaborador</b> quando entregar dinheiro do caixa a alguém; o RDV dele, ao ser aprovado, abate o adiantamento.</p>';
    return;
  }
  box.innerHTML = `<div class="tabela-wrap"><table class="tabela compacta"><thead><tr><th>Colaborador</th><th class="num">Adiantado</th><th class="num">Prestou contas</th><th class="num">Devolveu</th><th class="num">Saldo</th></tr></thead><tbody>
    ${r.colaboradores.map((p) => `<tr><td>${esc(p.nome)}<div class="acoes-colab"><button class="btn-link" type="button" data-colab-adiantar="${esc(p.nome)}">Adiantar</button>${p.saldo > 0.005 ? `<button class="btn-link" type="button" data-colab-devolver="${esc(p.nome)}">Devolução</button>` : ""}${p.saldo < -0.005 ? `<button class="btn-link" type="button" data-colab-reembolsar="${esc(p.nome)}">Reembolsar</button>` : ""}</div></td>
      <td class="num">${moeda(p.adiantado)}</td><td class="num">${moeda(p.prestado)}</td><td class="num">${moeda(p.devolvido)}</td>
      <td class="num${p.saldo < -0.005 ? " negativo" : ""}">${moeda(Math.abs(p.saldo))}<br><small class="dica">${p.saldo > 0.005 ? "com ele" : p.saldo < -0.005 ? "a reembolsar" : "acertado"}</small></td></tr>`).join("")}
    </tbody></table></div>`;
}

const linkDoc = (m) => (m.documento ? `<button class="btn-link doc-link" type="button" data-doc="${esc(m.id)}">${esc(m.documento_nome || "documento")}${m.detalhes && m.detalhes.aba ? ` · ${esc(m.detalhes.aba)}` : ""}</button>` : "");

function renderPendentes() {
  const pend = movimentos.filter((m) => m.tipo === "despesa" && !m.aprovado && (!config.data_inicial || m.data >= config.data_inicial)).sort((a, b) => a.data.localeCompare(b.data));
  $("#caixa-pendentes").hidden = !pend.length;
  $("#caixa-pend").innerHTML = pend.map((m) => `<div class="pendente" data-id="${esc(m.id)}">
      <label class="aprovar"><input type="checkbox" data-aprovar="${esc(m.id)}"> Aprovado</label>
      <div class="pendente-texto"><span class="etiqueta-caixa">${esc(rotuloMovimento(m, sig))}</span> <b>${esc(m.descricao || "")}</b>
        <small class="dica">${dataBR(m.data)}${m.colaborador ? ` · prestação de contas de ${esc(m.colaborador)}` : ""}${m.detalhes && m.detalhes.itens ? ` · ${plural(m.detalhes.itens.length, "item", "itens")}` : ""}</small> ${linkDoc(m)}</div>
      <strong class="num">${moeda(Number(m.valor))}</strong>
      <button class="btn-link" type="button" data-editar="${esc(m.id)}">Conferir</button>
    </div>`).join("");
}

function renderFiltros() {
  const tipos = [["", "Todos os tipos"], ...doCaixa().flatMap((e) => ["rdv", "fc"].map((cl) => [`despesa|${cl}|${e.id}`, `${rotuloMovimento({ tipo: "despesa", classificacao: cl, empresa_id: e.id }, sig)} · ${CLASSIFICACOES[cl] === "RDV" ? "relatório de viagem" : "ficha de custo"} ${e.nome}`])),
    ["despesa|outro|", "Outras despesas"], ["entrada", "Entradas"], ["adiantamento", "Adiantamentos a colaboradores"], ["devolucao", "Devoluções de colaboradores"]];
  $("#filtro-tipo").innerHTML = opcoes(tipos, filtro.tipo);
  $("#filtro-empresa").innerHTML = opcoes([["", "Todas as empresas"], ...doCaixa().map((e) => [e.id, e.nome])], filtro.empresa);
  $("#filtro-situacao").value = filtro.situacao;
}

function filtrados() {
  const termo = filtro.busca.toLowerCase();
  return movimentos.filter((m) => {
    if (filtro.tipo) {
      const [t, cl, emp] = filtro.tipo.split("|");
      if (m.tipo !== t) return false;
      if (cl && (m.classificacao || "outro") !== cl) return false;
      if (cl && cl !== "outro" && m.empresa_id !== emp) return false;
    }
    if (filtro.empresa && m.empresa_id !== filtro.empresa) return false;
    // A lista é a do caixa atual; o que é de antes do saldo inicial fica no filtro "Caixa anterior"
    if ((filtro.situacao === "anterior") !== doAnterior(m)) return false;
    if (filtro.situacao === "aprovado" && m.tipo === "despesa" && !m.aprovado) return false;
    if (filtro.situacao === "pendente" && !(m.tipo === "despesa" && !m.aprovado)) return false;
    if (termo && ![m.descricao, m.colaborador, m.documento_nome, m.observacao, rotuloMovimento(m, sig)].join(" ").toLowerCase().includes(termo)) return false;
    return true;
  }).sort((a, b) => b.data.localeCompare(a.data) || String(b.criado_em || "").localeCompare(String(a.criado_em || "")));
}

const doAnterior = (m) => !!(config && config.data_inicial && m.data < config.data_inicial);

function renderTabela() {
  const saldos = saldoApos(config, movimentos);
  const lista = filtrados();
  const anteriores = filtro.situacao === "anterior" ? 0 : movimentos.filter(doAnterior).length;
  $("#nota-anterior").hidden = !anteriores;
  $("#nota-anterior").textContent = anteriores ? `${plural(anteriores, "movimento do caixa anterior fica", "movimentos do caixa anterior ficam")} fora desta lista (antes do saldo inicial, não contam): escolha “Caixa anterior” em Situação para ver.` : "";
  const sinal = (m) => (m.tipo === "entrada" || m.tipo === "devolucao" ? "+" : m.tipo === "despesa" && m.colaborador ? "" : "−");
  $("#tabela tbody").innerHTML = lista.map((m) => {
    const s = saldos.get(m.id);
    const antes = config.data_inicial && m.data < config.data_inicial;
    return `<tr class="clicavel${m.tipo === "despesa" && !m.aprovado ? " pendente-linha" : ""}${antes ? " fora" : ""}" data-id="${esc(m.id)}" tabindex="0">
      <td class="data">${dataBR(m.data)}</td>
      <td><span class="etiqueta-caixa tipo-${esc(m.tipo)}">${esc(rotuloMovimento(m, sig))}</span> ${esc(m.descricao || "")}
        ${m.colaborador ? `<br><small class="dica">${m.tipo === "despesa" ? "prestação de contas de" : m.tipo === "devolucao" ? "devolvido por" : "entregue a"} ${esc(m.colaborador)}</small>` : ""}
        ${m.tipo !== "despesa" && m.empresa_id ? `<br><small class="dica">${esc(nomeEmpresa(m.empresa_id))}</small>` : ""}${m.documento ? `<br>${linkDoc(m)}` : ""}${antes ? '<br><small class="dica">antes do saldo inicial: não conta</small>' : ""}</td>
      <td>${m.tipo === "despesa" ? `<label class="aprovar"><input type="checkbox" data-aprovar="${esc(m.id)}"${m.aprovado ? " checked" : ""} aria-label="Aprovado"> ${m.aprovado ? "sim" : "a aprovar"}</label>` : '<span class="dica">—</span>'}</td>
      <td class="num">${sinal(m)}${moeda(Number(m.valor))}</td>
      <td class="num">${s && s.mexe ? moeda(s.saldo) : '<span class="dica">—</span>'}</td>
    </tr>`;
  }).join("");
  $("#vazio").hidden = lista.length > 0;
  $("#vazio").textContent = filtro.situacao === "anterior" ? "Nenhum movimento antes do saldo inicial." : "Nenhum movimento com estes filtros.";
}

// ---------------------------------------------------------------- lançar e editar
const OPCOES_DESPESA = () => [...doCaixa().flatMap((e) => ["rdv", "fc", "outro"].map((cl) => [`${cl}|${e.id}`, `${rotuloMovimento({ tipo: "despesa", classificacao: cl, empresa_id: e.id }, sig)} · ${cl === "rdv" ? "relatório de viagem" : cl === "fc" ? "ficha de custo" : "outra despesa"} ${e.nome}`])), ["outro|", "Outra despesa, sem empresa"]];
const DICA = {
  despesa: "Gasto pago com o dinheiro do caixa. Com colaborador, é a prestação de contas do que ele recebeu: abate o adiantamento dele e não sai do caixa de novo.",
  entrada: "Dinheiro que uma empresa mandou para o caixa (adiantamento ou reposição).",
  adiantamento: "Dinheiro do caixa entregue a um colaborador; fica com ele até prestar contas (RDV) ou devolver.",
  devolucao: "Dinheiro que o colaborador devolveu ao caixa.",
};

function abrirMovimento(id, novo = {}) {
  const existente = movimentos.find((m) => m.id === id);
  const m = existente ? { ...existente } : { tipo: "despesa", data: hoje, aprovado: true, classificacao: "rdv", empresa_id: (doCaixa()[0] || {}).id || null, ...novo };
  const dlg = $("#dlg-mov");
  const itens = m.detalhes && Array.isArray(m.detalhes.itens) ? m.detalhes.itens : [];
  dlg.innerHTML = `<form id="form-mov" novalidate>
    <div class="dlg-cab"><h2 id="titulo-mov">${existente ? "Editar movimento" : { despesa: "Nova despesa", entrada: "Nova entrada", adiantamento: "Adiantar a colaborador", devolucao: "Devolução de colaborador" }[m.tipo]}</h2>
      <button class="btn-link" data-fechar type="button">Fechar</button></div>
    <div class="dlg-corpo">
      <div class="opcoes" role="radiogroup" aria-label="Tipo">${Object.entries(TIPOS).map(([k, v]) => `<label><input type="radio" name="tipo" value="${k}"${m.tipo === k ? " checked" : ""}> ${k === "adiantamento" ? "Adiantamento a colaborador" : k === "devolucao" ? "Devolução de colaborador" : v}</label>`).join("")}</div>
      <p class="dica" id="dica-mov">${DICA[m.tipo]}</p>
      <div class="campos">
        <label class="c4" data-so="despesa">Classificação<select name="classif">${opcoes(OPCOES_DESPESA(), `${m.classificacao || "outro"}|${m.empresa_id || ""}`)}</select></label>
        <label class="c4" data-so="entrada">Empresa que mandou<select name="empresa">${opcoes(doCaixa().map((e) => [e.id, e.nome]), m.empresa_id || "")}</select></label>
        <label class="c2">Valor (R$)<input name="valor" inputmode="decimal" autocomplete="off" value="${m.valor == null ? "" : String(Number(m.valor).toFixed(2)).replace(".", ",")}" required></label>
        <label class="c2">Data<input type="date" name="data" value="${esc(m.data)}" required></label>
        <p class="aviso-doc c6" id="aviso-data-mov" hidden></p>
        <label class="c4" data-so="despesa adiantamento devolucao"><span data-rotulo-colab>${m.tipo === "despesa" ? "Gasto por colaborador (prestação de contas)" : "Colaborador"}</span><input name="colaborador" list="lista-colab" maxlength="80" autocomplete="off" value="${esc(m.colaborador || "")}" placeholder="${m.tipo === "despesa" ? "em branco: gasto por você" : "nome"}"></label>
        <datalist id="lista-colab">${conhecidos().map((n) => `<option value="${esc(n)}">`).join("")}</datalist>
        <label class="c6">Descrição<input name="descricao" maxlength="200" autocomplete="off" value="${esc(m.descricao || "")}"></label>
        <label class="c6">Observação<input name="observacao" maxlength="500" autocomplete="off" value="${esc(m.observacao || "")}"></label>
        <label class="c6">Documento (RDV, ficha de custo, nota ou recibo)<input type="file" name="arquivo" accept="${ACEITOS}"></label>
      </div>
      ${m.documento ? `<p class="dica">Anexado: ${linkDoc(m)} <button class="btn-link" type="button" id="btn-tirar-doc">Tirar o anexo</button></p>` : ""}
      ${itens.length ? `<details class="itens-doc"><summary>Itens lidos do documento (${itens.length})</summary><div class="tabela-wrap"><table class="tabela compacta"><tbody>${itens.map((i) => `<tr><td>${esc(i.descricao || (i.centro ? `Centro de custo ${i.centro}` : "Item"))}${i.placa ? ` <small class="dica">${esc(i.placa)}</small>` : ""}</td><td class="num">${moeda(Number(i.total))}</td></tr>`).join("")}</tbody></table></div></details>` : ""}
      <label class="opcao-linha aprovar-linha" data-so="despesa"><input type="checkbox" name="aprovado"${m.aprovado ? " checked" : ""}> Aprovado: entra no saldo do caixa</label>
      <p class="erro" id="erro-mov" role="alert" hidden></p>
    </div>
    <div class="dlg-rodape">
      ${existente ? '<button class="btn btn-perigo esquerda" type="button" id="btn-excluir-mov">Excluir</button>' : ""}
      <button class="btn btn-claro" type="button" data-fechar>Cancelar</button>
      <button class="btn btn-primary" type="submit">Salvar</button>
    </div></form>`;
  const form = $("#form-mov", dlg);
  let tirarDoc = false;
  const tipo = () => form.querySelector("[name=tipo]:checked").value;
  const mostrar = () => {
    const t = tipo();
    form.querySelectorAll("[data-so]").forEach((el) => { el.hidden = !el.dataset.so.split(" ").includes(t); });
    $("#dica-mov", form).textContent = DICA[t];
    $("[data-rotulo-colab]", form).textContent = t === "despesa" ? "Gasto por colaborador (prestação de contas)" : "Colaborador";
    form.elements.colaborador.placeholder = t === "despesa" ? "em branco: gasto por você" : "nome";
  };
  mostrar();
  // Antes do saldo inicial o movimento não conta: avisa na hora, para não parecer que sumiu
  const avisoData = () => {
    const antes = config && config.data_inicial && form.elements.data.value && form.elements.data.value < config.data_inicial;
    $("#aviso-data-mov", form).hidden = !antes;
    $("#aviso-data-mov", form).textContent = antes ? `Data antes do saldo inicial (${dataBR(config.data_inicial)}): este movimento fica no caixa anterior e não conta no saldo. Se o dinheiro já estava com o colaborador nessa data, informe em Configurar → Já com colaboradores.` : "";
  };
  avisoData();
  form.elements.data.addEventListener("input", avisoData);
  form.addEventListener("change", (e) => { if (e.target.name === "tipo") mostrar(); if (e.target.name === "data") avisoData(); });
  $("#btn-tirar-doc", form)?.addEventListener("click", (e) => { tirarDoc = true; e.target.closest("p").remove(); });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const erro = (t) => { $("#erro-mov", form).textContent = t; $("#erro-mov", form).hidden = false; };
    const t = tipo();
    const valor = numeroDigitado(form.elements.valor.value);
    if (!(valor > 0)) return erro("Informe o valor (ex.: 140,36).");
    if (!form.elements.data.value) return erro("Informe a data.");
    const colab = form.elements.colaborador.value.trim();
    if ((t === "adiantamento" || t === "devolucao") && !colab) return erro("Informe o colaborador.");
    const [cl, emp] = form.elements.classif.value.split("|");
    const dados = { ...m, tipo: t, valor: Math.round(valor * 100) / 100, data: form.elements.data.value, descricao: form.elements.descricao.value.trim() || null,
      observacao: form.elements.observacao.value.trim() || null,
      colaborador: t === "entrada" ? null : colab ? nomeColaborador(colab, conhecidos()) : null,
      classificacao: t === "despesa" ? cl : null, empresa_id: t === "despesa" ? emp || null : t === "entrada" ? form.elements.empresa.value || null : null,
      aprovado: t === "despesa" ? form.elements.aprovado.checked : true, detalhes: m.detalhes || {} };
    const botao = form.querySelector("[type=submit]");
    botao.disabled = true;
    try {
      const arquivo = form.elements.arquivo.files[0];
      if (arquivo) {
        if (arquivo.size > 20 * 1024 * 1024) throw new Error("O arquivo passa de 20 MB.");
        dados.documento = await armazem.caixa.enviarDocumento(arquivo);
        dados.documento_nome = arquivo.name.slice(0, 200);
      } else if (tirarDoc) {
        dados.documento = null; dados.documento_nome = null;
      }
      if ((arquivo || tirarDoc) && m.documento && !movimentos.some((x) => x.id !== m.id && x.documento === m.documento)) await armazem.caixa.apagarDocumento(m.documento).catch(() => {});
      await colecao.salvar(dados);
      dlg.close();
      avisar(existente ? "Movimento salvo." : "Movimento lançado.");
      await recarregar();
    } catch (err) {
      erro("Não foi possível salvar: " + err.message);
    } finally {
      botao.disabled = false;
    }
  });
  $("#btn-excluir-mov", form)?.addEventListener("click", async () => {
    if (!confirm("Excluir este movimento?")) return;
    try {
      await colecao.remover(existente.id);
      if (existente.documento && !movimentos.some((x) => x.id !== existente.id && x.documento === existente.documento)) await armazem.caixa.apagarDocumento(existente.documento).catch(() => {});
      dlg.close();
      avisar("Movimento excluído.");
      await recarregar();
    } catch (err) {
      $("#erro-mov", form).textContent = "Não foi possível excluir: " + err.message;
      $("#erro-mov", form).hidden = false;
    }
  });
  dlg.showModal();
  form.elements.valor.focus();
}

async function alternarAprovado(id, aprovado) {
  const m = movimentos.find((x) => x.id === id);
  if (!m) return;
  try {
    await colecao.salvar({ ...m, aprovado });
    avisar(aprovado ? `Aprovado: ${moeda(Number(m.valor))} entram no saldo do caixa.` : "Voltou para a aprovação: fica fora do saldo.");
  } catch (err) {
    avisar("Não foi possível salvar: " + err.message);
  }
  await recarregar();
}

async function abrirDocumento(id) {
  const m = movimentos.find((x) => x.id === id);
  if (!m || !m.documento) return;
  try {
    const url = await armazem.caixa.urlDocumento(m.documento);
    if (!url) throw new Error("O arquivo não está mais disponível.");
    window.open(url, "_blank", "noopener");
  } catch (err) {
    avisar("Não foi possível abrir: " + err.message);
  }
}

// ---------------------------------------------------------------- importar RDV e fichas de custo
let importacao = null; // { arquivo, docs: [...] }

function abrirImportar() {
  importacao = null;
  const dlg = $("#dlg-importar");
  dlg.innerHTML = `<div class="dlg-cab"><h2 id="titulo-importar">Importar RDV ou ficha de custo</h2><button class="btn-link" data-fechar type="button">Fechar</button></div>
    <div class="dlg-corpo">
      <p class="dica">Escolha a planilha do RDV (relatório de despesas de viagem) ou da ficha de custo. O site lê cada aba preenchida, com o valor, a empresa e os itens; você confere, e cada documento fica anexado e a aprovar até marcar Aprovado. PDF e foto também podem ser anexados, com o valor digitado.</p>
      <input type="file" id="arquivo-importar" accept="${ACEITOS}">
      <div id="importar-status" class="dica" role="status" aria-live="polite"></div>
      <div id="importar-docs"></div>
      <p class="erro" id="erro-importar" role="alert" hidden></p>
    </div>
    <div class="dlg-rodape">
      <button class="btn btn-claro" type="button" data-fechar>Cancelar</button>
      <button class="btn btn-primary" type="button" id="btn-confirmar-importar" disabled>Importar</button>
    </div>`;
  $("#arquivo-importar", dlg).addEventListener("change", (e) => lerArquivo(e.target.files[0]));
  $("#btn-confirmar-importar", dlg).addEventListener("click", confirmarImportar);
  $("#importar-docs", dlg).addEventListener("change", atualizarBotaoImportar);
  dlg.showModal();
}

const jaImportado = (doc, nomeArq) => movimentos.find((m) => m.tipo === "despesa" && ((m.documento_nome === nomeArq && m.detalhes && m.detalhes.aba === doc.aba)
  || (Math.abs(Number(m.valor) - doc.total) < 0.005 && (m.descricao || "") === doc.descricao)));

async function lerArquivo(arquivo) {
  const status = $("#importar-status"), box = $("#importar-docs");
  $("#erro-importar").hidden = true;
  box.innerHTML = "";
  importacao = null;
  atualizarBotaoImportar();
  if (!arquivo) return;
  if (arquivo.size > 20 * 1024 * 1024) { status.textContent = "O arquivo passa de 20 MB."; return; }
  const planilha = /\.xlsx$/i.test(arquivo.name) || /spreadsheetml/.test(arquivo.type);
  let docs = [];
  if (planilha) {
    status.textContent = `Lendo ${arquivo.name}…`;
    try {
      const p = await lerPlanilha(await arquivo.arrayBuffer());
      docs = lerDocumentos(p, { nomeArquivo: arquivo.name, empresas: doCaixa(), meuNome: perfil.nome || "", colaboradores: conhecidos() });
    } catch (err) {
      status.textContent = err.message;
      return;
    }
    if (!docs.length) { status.textContent = "Não encontrei RDV nem ficha de custo preenchidos nesta planilha. Confira se é o modelo das empresas, ou lance a despesa à mão."; return; }
    status.textContent = `${plural(docs.length, "documento encontrado", "documentos encontrados")} em ${arquivo.name}.`;
  } else {
    // PDF ou foto: o valor é digitado; a classificação vem do nome do arquivo quando der
    const emp = empresaNoTexto(arquivo.name, doCaixa());
    docs = [{ tipo: /fc|ficha|custo/i.test(arquivo.name) ? "fc" : /rdv|viagem/i.test(arquivo.name) ? "rdv" : "outro", aba: null, empresa_id: emp ? emp.id : null, total: null, itens: [], campos: {}, avisos: [],
      descricao: arquivo.name.replace(/\.[^.]+$/, "").slice(0, 200), colaborador: null }];
    status.textContent = "Arquivo sem leitura automática: confira a classificação e digite o valor.";
  }
  importacao = { arquivo, docs };
  box.innerHTML = docs.map((d, i) => {
    const repetido = jaImportado(d, arquivo.name);
    return `<fieldset class="doc-importar" data-i="${i}">
      <legend><label><input type="checkbox" data-importar${repetido ? "" : " checked"}> ${esc(d.aba ? `Aba ${d.aba}` : arquivo.name)}</label></legend>
      ${repetido ? `<p class="aviso-doc">Parece já importado em ${dataBR(repetido.data)} (${esc(rotuloMovimento(repetido, sig))}, ${moeda(Number(repetido.valor))}). Marque só se for outro documento.</p>` : ""}
      ${d.avisos.map((a) => `<p class="aviso-doc">${esc(a)}</p>`).join("")}
      <div class="campos">
        <label class="c4">Classificação<select data-campo="classif">${opcoes(OPCOES_DESPESA(), `${d.tipo}|${d.empresa_id || ""}`)}</select></label>
        <label class="c2">Valor (R$)<input data-campo="valor" inputmode="decimal" autocomplete="off" value="${d.total == null ? "" : String(d.total.toFixed(2)).replace(".", ",")}"></label>
        <label class="c2">Data<input type="date" data-campo="data" value="${hoje}"></label>
        <label class="c4">Gasto por colaborador<input data-campo="colaborador" list="lista-colab-imp" maxlength="80" autocomplete="off" value="${esc(d.colaborador || "")}" placeholder="em branco: gasto por você"></label>
        <label class="c6">Descrição<input data-campo="descricao" maxlength="200" autocomplete="off" value="${esc(d.descricao)}"></label>
      </div>
      ${d.itens.length ? `<details class="itens-doc"><summary>${plural(d.itens.length, "item lido", "itens lidos")}: ${moeda(d.soma)}</summary><div class="tabela-wrap"><table class="tabela compacta"><tbody>${d.itens.map((it) => `<tr><td>${esc(it.descricao || (it.centro ? `Centro de custo ${it.centro}` : "Item"))}${it.placa ? ` <small class="dica">${esc(it.placa)}</small>` : ""}${it.quantidade > 1 ? ` <small class="dica">${it.quantidade}×</small>` : ""}</td><td class="num">${moeda(it.total)}</td></tr>`).join("")}</tbody></table></div></details>` : ""}
      <label class="opcao-linha aprovar-linha"><input type="checkbox" data-campo="aprovado"> Aprovado: já entra no saldo do caixa</label>
    </fieldset>`;
  }).join("") + `<datalist id="lista-colab-imp">${conhecidos().map((n) => `<option value="${esc(n)}">`).join("")}</datalist>`;
  atualizarBotaoImportar();
}

function atualizarBotaoImportar() {
  const n = importacao ? document.querySelectorAll("#importar-docs [data-importar]:checked").length : 0;
  const b = $("#btn-confirmar-importar");
  if (!b) return;
  b.disabled = !n;
  b.textContent = n > 1 ? `Importar ${n} documentos` : "Importar";
}

async function confirmarImportar() {
  const erro = (t) => { $("#erro-importar").textContent = t; $("#erro-importar").hidden = !t; };
  const escolhidos = [...document.querySelectorAll("#importar-docs .doc-importar")].filter((f) => f.querySelector("[data-importar]").checked);
  const novos = [];
  for (const f of escolhidos) {
    const d = importacao.docs[Number(f.dataset.i)];
    const campo = (k) => f.querySelector(`[data-campo="${k}"]`);
    const valor = numeroDigitado(campo("valor").value);
    if (!(valor > 0)) return erro(`Informe o valor de ${d.aba ? `"${d.aba}"` : "o documento"}.`);
    const [cl, emp] = campo("classif").value.split("|");
    const colab = campo("colaborador").value.trim();
    novos.push({ tipo: "despesa", classificacao: cl, empresa_id: emp || null, valor: Math.round(valor * 100) / 100, data: campo("data").value || hoje,
      descricao: campo("descricao").value.trim() || null, colaborador: colab ? nomeColaborador(colab, conhecidos()) : null, aprovado: campo("aprovado").checked,
      detalhes: { aba: d.aba, itens: d.itens, campos: d.campos, total_lido: d.total } });
  }
  const b = $("#btn-confirmar-importar");
  b.disabled = true;
  erro("");
  try {
    const caminho = await armazem.caixa.enviarDocumento(importacao.arquivo);
    for (const n of novos) await colecao.salvar({ ...n, documento: caminho, documento_nome: importacao.arquivo.name.slice(0, 200) });
    $("#dlg-importar").close();
    const aprovados = novos.filter((n) => n.aprovado).length;
    const pendentes = novos.length - aprovados;
    avisar(`${plural(novos.length, "documento importado", "documentos importados")}${!pendentes ? (novos.length === 1 ? " e aprovado" : " e aprovados")
      : !aprovados ? `: ${novos.length === 1 ? "fica" : "ficam"} a aprovar` : `: ${aprovados} ${aprovados === 1 ? "aprovado" : "aprovados"} e ${pendentes} a aprovar`}.`);
    await recarregar();
  } catch (err) {
    erro("Não foi possível importar: " + err.message);
    b.disabled = false;
  }
}

// ---------------------------------------------------------------- configuração e saldo da conta
// Adiantamentos que já estavam com os colaboradores na data do saldo inicial: movimentos de adiantamento nessa data,
// marcados como "inicial" (saem do disponível e ficam com o colaborador, sem mudar o saldo das empresas)
const iniciais = () => movimentos.filter((m) => m.tipo === "adiantamento" && m.detalhes && m.detalhes.inicial);

function abrirConfig(foco = null) {
  const c = config || { empresas: [], saldo_inicial: 0, data_inicial: hoje, saldo_conta: null, data_conta: null };
  const dlg = $("#dlg-config");
  const valor = (v) => (v == null ? "" : String(Number(v).toFixed(2)).replace(".", ","));
  const linhaColab = (nome = "", v = null) => `<div class="campos linha-colab">
      <label class="c3">Colaborador<input name="colab_nome" list="lista-colab-cfg" maxlength="80" autocomplete="off" value="${esc(nome)}" placeholder="nome"></label>
      <label class="c2">Com ele (R$)<input name="colab_valor" inputmode="decimal" autocomplete="off" value="${valor(v)}" placeholder="0,00"></label>
      <div class="c1 tirar-colab"><button class="btn-link" type="button" data-tirar-colab>Tirar</button></div></div>`;
  const atuais = iniciais();
  dlg.innerHTML = `<form id="form-config" novalidate>
    <div class="dlg-cab"><h2 id="titulo-config">Configurar o caixa</h2><button class="btn-link" data-fechar type="button">Fechar</button></div>
    <div class="dlg-corpo">
      <fieldset class="bloco"><legend>Empresas que mandam adiantamento para este caixa</legend>
        <div class="opcoes">${empresas.map((e) => `<label><input type="checkbox" name="empresa" value="${esc(e.id)}"${(c.empresas || []).includes(e.id) ? " checked" : ""}> ${esc(e.nome)}</label>`).join("") || '<span class="dica">Cadastre as empresas na página Finanças das empresas.</span>'}</div></fieldset>
      <div class="campos">
        <label class="c3">Saldo inicial total das empresas (R$)<input name="saldo_inicial" inputmode="decimal" autocomplete="off" value="${valor(c.saldo_inicial)}" placeholder="0,00"></label>
        <label class="c3">Data do saldo inicial<input type="date" name="data_inicial" value="${esc(c.data_inicial || hoje)}"></label>
      </div>
      <fieldset class="bloco"><legend>Já com colaboradores na data (adiantado)</legend>
        <p class="dica">O que estava adiantado (emprestado) a cada colaborador na data do saldo inicial. Faz parte do saldo total: sai do disponível na conta e fica com ele até prestar contas (RDV) ou devolver.</p>
        <div id="cfg-colabs">${(atuais.length ? atuais.map((m) => linhaColab(m.colaborador, Number(m.valor))) : [linhaColab()]).join("")}</div>
        <datalist id="lista-colab-cfg">${conhecidos().map((n) => `<option value="${esc(n)}">`).join("")}</datalist>
        <button class="btn-link" type="button" id="btn-mais-colab">+ Outro colaborador</button>
        <p class="total-cfg" id="cfg-total" role="status" aria-live="polite"></p>
      </fieldset>
      <div class="campos">
        <label class="c3">Saldo hoje na conta do caixa (R$)<input name="saldo_conta" inputmode="decimal" autocomplete="off" value="${valor(c.saldo_conta)}" placeholder="opcional"></label>
        <label class="c3">Data do saldo da conta<input type="date" name="data_conta" value="${esc(c.data_conta || hoje)}"></label>
      </div>
      <p class="dica">O saldo inicial total é o que as empresas tinham com você na data: o que estava na conta mais o adiantado aos colaboradores, já descontado o que foi gasto. Movimentos antes dessa data não contam. O saldo da conta é o que está de fato na conta separada do caixa (o extrato do banco): a diferença para o disponível é o que foi usado no pessoal.</p>
      <p class="erro" id="erro-config" role="alert" hidden></p>
    </div>
    <div class="dlg-rodape"><button class="btn btn-claro" type="button" data-fechar>Cancelar</button><button class="btn btn-primary" type="submit">Salvar</button></div></form>`;
  const form = $("#form-config", dlg);
  const linhas = () => [...form.querySelectorAll(".linha-colab")].map((l) => ({ nome: l.querySelector("[name=colab_nome]").value.trim(), texto: l.querySelector("[name=colab_valor]").value.trim() }))
    .map((x) => ({ ...x, valor: x.texto ? numeroDigitado(x.texto) : null }));
  const mostrarTotal = () => {
    const total = numeroDigitado(form.elements.saldo_inicial.value) || 0;
    const adiantado = linhas().reduce((t, x) => t + (x.valor > 0 ? x.valor : 0), 0);
    $("#cfg-total", form).textContent = adiantado > 0
      ? `Saldo das empresas ${moeda(total)} = ${moeda(Math.round((total - adiantado) * 100) / 100)} disponível na conta + ${moeda(adiantado)} com colaboradores.`
      : "Nada adiantado na data: todo o saldo inicial é disponível na conta.";
  };
  mostrarTotal();
  form.addEventListener("input", mostrarTotal);
  $("#btn-mais-colab", form).addEventListener("click", () => { $("#cfg-colabs", form).insertAdjacentHTML("beforeend", linhaColab()); form.querySelector(".linha-colab:last-child [name=colab_nome]").focus(); });
  $("#cfg-colabs", form).addEventListener("click", (e) => {
    if (!e.target.closest("[data-tirar-colab]")) return;
    const l = e.target.closest(".linha-colab");
    if (form.querySelectorAll(".linha-colab").length > 1) l.remove();
    else l.querySelectorAll("input").forEach((i) => { i.value = ""; });
    mostrarTotal();
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const erro = (t) => { $("#erro-config", form).textContent = t; $("#erro-config", form).hidden = false; };
    const marcadas = [...form.querySelectorAll("[name=empresa]:checked")].map((x) => x.value);
    if (!marcadas.length) return erro("Escolha pelo menos uma empresa.");
    const inicial = numeroDigitado(form.elements.saldo_inicial.value);
    if (inicial == null) return erro("Informe o saldo inicial (pode ser 0).");
    const conta = form.elements.saldo_conta.value.trim() ? numeroDigitado(form.elements.saldo_conta.value) : null;
    if (form.elements.saldo_conta.value.trim() && conta == null) return erro("O saldo da conta não é um número.");
    const colabs = [];
    for (const x of linhas()) {
      if (!x.nome && !x.texto) continue;
      if (!x.nome) return erro("Informe o nome do colaborador.");
      if (!(x.valor > 0)) return erro(`Informe o valor com ${x.nome} (ex.: 250,00).`);
      const nome = nomeColaborador(x.nome, [...colabs.map((y) => y.nome), ...conhecidos()]);
      if (colabs.some((y) => y.nome === nome)) return erro(`${nome} aparece duas vezes.`);
      colabs.push({ nome, valor: Math.round(x.valor * 100) / 100 });
    }
    const dataInicial = form.elements.data_inicial.value || hoje;
    const botao = form.querySelector("[type=submit]");
    botao.disabled = true;
    try {
      config = await armazem.caixa.salvarConfig({ empresas: marcadas, saldo_inicial: inicial, data_inicial: dataInicial,
        saldo_conta: conta, data_conta: conta == null ? null : form.elements.data_conta.value || hoje });
      // Os adiantamentos da data do saldo inicial: cria, acerta ou tira os movimentos marcados como iniciais
      const existentes = iniciais();
      for (const x of colabs) {
        const m = existentes.find((y) => nomeColaborador(y.colaborador, [x.nome]) === x.nome);
        if (m && Number(m.valor) === x.valor && m.data === dataInicial && m.colaborador === x.nome) continue;
        await colecao.salvar({ ...(m || { tipo: "adiantamento", aprovado: true, classificacao: null, empresa_id: null }), colaborador: x.nome, valor: x.valor, data: dataInicial,
          descricao: "Já estava com o colaborador na data do saldo inicial", detalhes: { ...((m && m.detalhes) || {}), inicial: true } });
      }
      for (const m of existentes.filter((y) => !colabs.some((x) => nomeColaborador(y.colaborador, [x.nome]) === x.nome))) await colecao.remover(m.id);
      dlg.close();
      avisar("Caixa configurado.");
      await recarregar();
    } catch (err) {
      erro("Não foi possível salvar: " + err.message);
    } finally {
      botao.disabled = false;
    }
  });
  dlg.showModal();
  (foco ? form.elements[foco] : form.querySelector("input")).focus();
}

// ---------------------------------------------------------------- conferência com a planilha de controle paralelo
let conf = null; // { arquivo, resumo, c }

function abrirConferir() {
  conf = null;
  const dlg = $("#dlg-conferir");
  dlg.innerHTML = `<div class="dlg-cab"><h2 id="titulo-conferir">Conferir com a planilha</h2><button class="btn-link" data-fechar type="button">Fechar</button></div>
    <div class="dlg-corpo">
      <p class="dica">Escolha a planilha do fluxo de caixa (.xlsx). O site lê o último bloco da aba mais recente (INICIAL, DESPESAS e SALDO ATUAL), compara com o caixa daqui e mostra as diferenças. Você escolhe o que lançar para os empréstimos e o disponível ficarem iguais aos da planilha; a planilha fica anexada aos lançamentos.</p>
      <input type="file" id="arquivo-conferir" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">
      <div id="conferir-status" class="dica" role="status" aria-live="polite"></div>
      <div id="conferir-corpo"></div>
      <p class="erro" id="erro-conferir" role="alert" hidden></p>
    </div>
    <div class="dlg-rodape">
      <button class="btn btn-claro" type="button" data-fechar>Fechar</button>
      <button class="btn btn-primary" type="button" id="btn-aplicar-conferir" disabled>Atualizar o caixa</button>
    </div>`;
  $("#arquivo-conferir", dlg).addEventListener("change", (e) => lerConferencia(e.target.files[0]));
  $("#conferir-corpo", dlg).addEventListener("change", previaConferencia);
  $("#btn-aplicar-conferir", dlg).addEventListener("click", aplicarConferencia);
  dlg.showModal();
}

async function lerConferencia(arquivo) {
  const status = $("#conferir-status"), corpo = $("#conferir-corpo");
  corpo.innerHTML = "";
  $("#erro-conferir").hidden = true;
  conf = null;
  $("#btn-aplicar-conferir").disabled = true;
  if (!arquivo) return;
  if (arquivo.size > 20 * 1024 * 1024) { status.textContent = "O arquivo passa de 20 MB."; return; }
  status.textContent = `Lendo ${arquivo.name}…`;
  try {
    const resumo = lerResumo(await lerPlanilha(await arquivo.arrayBuffer()), { conhecidos: conhecidos() });
    conf = { arquivo, resumo, c: conferir(resumo, { config, movimentos, sig }) };
  } catch (err) {
    status.textContent = err.message;
    return;
  }
  const { resumo, c } = conf;
  status.textContent = `Aba “${resumo.aba}”, último bloco: saldo inicial ${moeda(resumo.inicial)}, ${plural(resumo.itens.length, "lançamento", "lançamentos")} (${moeda(resumo.total)}).`;
  const difCls = (v) => (Math.abs(v) < 0.005 ? "" : " class=\"num negativo\"");
  const dif = (v) => (Math.abs(v) < 0.005 ? '<span class="dica">igual</span>' : `${v > 0 ? "+" : "−"}${moeda(Math.abs(v))}`);
  const rotDesp = (d) => `${esc(d.tipoTexto || "Despesa")}${d.nota ? ` · ${esc(d.nota)}` : ""}`;
  corpo.innerHTML = `${resumo.avisos.map((a) => `<p class="aviso-doc">${esc(a)}</p>`).join("")}
    <div class="tabela-wrap"><table class="tabela compacta"><thead><tr><th></th><th class="num">Planilha</th><th class="num">Site</th><th class="num">Diferença</th></tr></thead><tbody>
      ${c.colaboradores.map((p) => `<tr><td>Empréstimo ${esc(p.nome)}</td><td class="num">${moeda(p.planilha)}</td><td class="num">${moeda(p.site)}</td><td${difCls(p.diferenca) || ' class="num"'}>${dif(p.diferenca)}</td></tr>`).join("")}
      <tr><th>Total emprestado</th><th class="num">${moeda(resumo.totalEmprestimos)}</th><th class="num">${moeda(c.resumoSite.comColaboradores - c.resumoSite.aReembolsar)}</th><th></th></tr>
      <tr><th>Disponível para uso (na conta)</th><th class="num">${moeda(c.disponivel.planilha)}</th><th class="num">${moeda(c.disponivel.site)}</th><th${difCls(c.disponivel.diferenca) || ' class="num"'}>${dif(c.disponivel.diferenca)}</th></tr>
    </tbody></table></div>
    ${c.faltando.length ? `<fieldset class="doc-importar"><legend>Na planilha e não no site</legend>
      <p class="dica">Marque as que devem ser lançadas aqui (entram aprovadas, com a data de hoje).</p>
      ${c.faltando.map((d, i) => `<label class="opcao-linha aprovar-linha"><input type="checkbox" data-conf-desp="${i}" checked> ${rotDesp(d)}: ${moeda(d.valor)}${d.classificacao === "outro" ? ' <small class="dica">sem RDV/FC: entra como outra despesa</small>' : ""}</label>`).join("")}</fieldset>` : ""}
    ${c.soNoSite.length ? `<fieldset class="doc-importar"><legend>No site e não na planilha</legend>
      <p class="dica">Só para conferir: estas despesas do caixa atual não foram achadas na planilha (mesmo valor e tipo).</p>
      <ul class="lista-conf">${c.soNoSite.map((m) => `<li>${dataBR(m.data)} · ${esc(rotuloMovimento(m, sig))} ${esc(m.descricao || "")}: ${moeda(Number(m.valor))}${m.aprovado ? "" : " (a aprovar)"}</li>`).join("")}</ul></fieldset>` : ""}
    <fieldset class="doc-importar"><legend>Atualizar o caixa pela planilha</legend>
      <label class="opcao-linha aprovar-linha"><input type="checkbox" data-conf="colaboradores"${c.colaboradores.some((p) => Math.abs(p.diferenca) > 0.005) ? " checked" : " disabled"}> Deixar o empréstimo de cada colaborador igual ao da planilha</label>
      <label class="opcao-linha aprovar-linha"><input type="checkbox" data-conf="disponivel" checked> Ajustar o disponível para ${moeda(c.disponivel.planilha)}, como na planilha</label>
      <div id="conferir-previa"></div></fieldset>`;
  previaConferencia();
}

function novosDaConferencia() {
  if (!conf) return [];
  const marcado = (k) => { const x = document.querySelector(`#conferir-corpo [data-conf="${k}"]`); return !!(x && x.checked && !x.disabled); };
  const despesas = [...document.querySelectorAll("#conferir-corpo [data-conf-desp]:checked")].map((x) => conf.c.faltando[Number(x.dataset.confDesp)]);
  return ajustes(conf.resumo, conf.c, { config, movimentos, despesas, colaboradores: marcado("colaboradores"), disponivel: marcado("disponivel"), hoje, descricao: `Conferência de ${dataBR(hoje)}` });
}

function previaConferencia() {
  const novos = novosDaConferencia();
  const box = $("#conferir-previa");
  if (box) {
    box.innerHTML = novos.length
      ? `<p class="dica">Vai lançar, com a data de hoje:</p><ul class="lista-conf">${novos.map((n) => `<li><span class="etiqueta-caixa tipo-${esc(n.tipo)}">${esc(rotuloMovimento(n, sig))}</span> ${esc(n.descricao)}${n.colaborador ? ` · ${esc(n.colaborador)}` : ""}: ${moeda(n.valor)}</li>`).join("")}</ul>`
      : '<p class="dica">Nada a lançar: com o que está marcado, o site já bate com a planilha.</p>';
  }
  const b = $("#btn-aplicar-conferir");
  if (b) { b.disabled = !novos.length; b.textContent = novos.length > 1 ? `Lançar ${novos.length} acertos` : "Atualizar o caixa"; }
}

async function aplicarConferencia() {
  const novos = novosDaConferencia();
  if (!novos.length) return;
  const b = $("#btn-aplicar-conferir");
  b.disabled = true;
  $("#erro-conferir").hidden = true;
  try {
    const caminho = await armazem.caixa.enviarDocumento(conf.arquivo);
    for (const n of novos) await colecao.salvar({ ...n, documento: caminho, documento_nome: conf.arquivo.name.slice(0, 200) });
    $("#dlg-conferir").close();
    await recarregar();
    const r = resumoCaixa(config, movimentos);
    avisar(`Caixa atualizado pela planilha: disponível ${moeda(r.emCaixa)}, com colaboradores ${moeda(r.comColaboradores)}.`);
  } catch (err) {
    $("#erro-conferir").textContent = "Não foi possível lançar: " + err.message;
    $("#erro-conferir").hidden = false;
    b.disabled = false;
  }
}

// ---------------------------------------------------------------- acerto de caixa: lembrete e resumo para o financeiro
const nomesEmpresas = () => juntarNomes(doCaixa().map((e) => e.nome));

function renderAcerto() {
  const l = lembreteAcerto(config, hoje, { desdeDia: 17 });
  const box = $("#caixa-acerto");
  box.hidden = !l.ativo;
  if (!l.ativo) return;
  const quando = l.dia < DIA_ACERTO ? `até o dia ${DIA_ACERTO}` : l.dia === DIA_ACERTO ? "hoje é o dia" : `passou do dia ${DIA_ACERTO}`;
  box.innerHTML = `<div class="acerto-texto"><b>Acerto de caixa – financeiro ${esc(nomesEmpresas())}</b><span>${quando}: gere o resumo do período, confira e envie junto com as notinhas e os comprovantes.</span></div>
    <button class="btn btn-primary" type="button" data-acerto-resumo>Gerar o resumo</button>
    <label class="acerto-menu"><span class="sr">Lembrete</span><select data-acerto-escolha aria-label="Lembrete do acerto">
      <option value="">Lembrete…</option><option value="amanha">Lembrar amanhã</option><option value="realizado">Acerto realizado</option><option value="descartar">Descartar lembrete</option></select></label>`;
}

async function escolherAcerto(escolha, fechamento = null) {
  if (!escolha) return;
  try {
    config = await armazem.caixa.salvarConfig({ acerto: marcarAcerto(config, hoje, escolha, { fechamento }) });
    avisar(escolha === "amanha" ? "Combinado: o lembrete volta amanhã." : escolha === "realizado" ? "Acerto registrado. O próximo resumo começa depois desta data." : "Lembrete deste mês descartado.");
  } catch (err) {
    avisar("Não foi possível salvar: " + err.message);
  }
  renderizar();
}

let fech = null; // { r: resumo editável, ver: mostrando o relatório }

function abrirFechamento() {
  fech = { r: montarResumo(config, movimentos, doCaixa(), periodoAcerto(config, hoje)), ver: false };
  $("#dlg-fechamento").showModal();
  desenharFechamento();
}

const v2 = (v) => (v == null || v === "" ? "" : String(Number(v).toFixed(2)).replace(".", ","));

function desenharFechamento() {
  const dlg = $("#dlg-fechamento");
  const r = fech.r;
  if (fech.ver) {
    dlg.innerHTML = `<div class="dlg-cab"><h2 id="titulo-fechamento">Resumo do acerto</h2><button class="btn-link" data-fechar type="button">Fechar</button></div>
      <div class="dlg-corpo"><style>${CSS_RELATORIO}</style>${relatorioHtml(r, doCaixa(), sig, { titulo: `Acerto de caixa – ${nomesEmpresas()}`, nomes: perfil.nome || "" })}</div>
      <div class="dlg-rodape">
        <button class="btn btn-claro esquerda" type="button" data-fech="voltar">Alterar valores</button>
        <button class="btn btn-claro" type="button" data-fech="png">Baixar imagem</button>
        <button class="btn btn-claro" type="button" data-fech="imprimir">Imprimir ou PDF</button>
        <button class="btn btn-primary" type="button" data-fech="realizado">Acerto realizado</button>
      </div>`;
    return;
  }
  const empresaOpcoes = (id) => opcoes([["", "sem empresa"], ...doCaixa().map((e) => [e.id, e.nome])], id || "");
  dlg.innerHTML = `<div class="dlg-cab"><h2 id="titulo-fechamento">Resumo do acerto: conferir e alterar</h2><button class="btn-link" data-fechar type="button">Fechar</button></div>
    <div class="dlg-corpo fech">
      <p class="dica">Montado com o que está no sistema. Confira e altere o que precisar (qualquer valor): o relatório sai do que estiver aqui, e nada no caixa muda. Despesas a aprovar ficam de fora.</p>
      <div class="campos">
        <label class="c2">De<input type="date" data-f="inicio" value="${esc(r.inicio)}"></label>
        <label class="c2">Até<input type="date" data-f="fim" value="${esc(r.fim)}"></label>
        <div class="c2 fech-recalc"><button class="btn btn-claro" type="button" data-fech="recalcular">Montar de novo do sistema</button></div>
        <label class="c2">Saldo inicial (R$)<input data-f="saldoInicial" inputmode="decimal" value="${v2(r.saldoInicial)}"></label>
        <label class="c2">Entradas no período (R$)<input data-f="entradas" inputmode="decimal" value="${v2(r.entradas)}"></label>
        <label class="c2">Saldo na conta (R$)<input data-f="conta" inputmode="decimal" value="${v2(r.conta)}" placeholder="opcional"></label>
      </div>
      <h3 class="fech-tit">Despesas (RDV e fichas de custo)</h3>
      <div class="tabela-wrap"><table class="tabela compacta fech-tab"><thead><tr><th>Tipo</th><th>Data</th><th>Descrição</th><th class="num">Valor (R$)</th><th></th></tr></thead><tbody>
        ${r.linhas.map((l, i) => `<tr data-linha="${i}"><td><select data-l="tipo" aria-label="Tipo">${opcoes(OPCOES_DESPESA(), `${l.classificacao || "outro"}|${l.empresa_id || ""}`)}</select></td>
          <td><input type="date" data-l="data" value="${esc(l.data || "")}" aria-label="Data"></td>
          <td><input data-l="descricao" maxlength="200" value="${esc(l.descricao)}" aria-label="Descrição"></td>
          <td><input data-l="valor" inputmode="decimal" class="num" value="${v2(l.valor)}" aria-label="Valor"></td>
          <td><button class="btn-link" type="button" data-tirar-linha="${i}">Tirar</button></td></tr>`).join("") || '<tr><td colspan="5" class="dica">Nenhuma despesa aprovada no período.</td></tr>'}
      </tbody></table></div>
      <button class="btn-link" type="button" data-fech="mais-linha">+ Despesa</button>
      <h3 class="fech-tit">Pendente de acerto (com colaboradores)</h3>
      <div class="tabela-wrap"><table class="tabela compacta fech-tab"><thead><tr><th>Colaborador</th><th>Empresa</th><th class="num">Valor (R$)</th><th></th></tr></thead><tbody>
        ${r.pendentes.map((p, i) => `<tr data-pend="${i}"><td><input data-p="nome" maxlength="80" value="${esc(p.nome)}" aria-label="Colaborador"></td>
          <td><select data-p="empresa_id" aria-label="Empresa">${empresaOpcoes(p.empresa_id)}</select></td>
          <td><input data-p="valor" inputmode="decimal" class="num" value="${v2(p.valor)}" aria-label="Valor"></td>
          <td><button class="btn-link" type="button" data-tirar-pend="${i}">Tirar</button></td></tr>`).join("") || '<tr><td colspan="4" class="dica">Nada com colaboradores.</td></tr>'}
      </tbody></table></div>
      <button class="btn-link" type="button" data-fech="mais-pend">+ Pendente</button>
      <div id="fech-totais"></div>
    </div>
    <div class="dlg-rodape"><button class="btn btn-claro" type="button" data-fechar>Cancelar</button><button class="btn btn-primary" type="button" data-fech="ver">Ver o relatório</button></div>`;
  totaisFechamento();
}

function totaisFechamento() {
  const t = totaisResumo(fech.r, doCaixa());
  const box = $("#fech-totais");
  if (!box) return;
  box.innerHTML = `<div class="tabela-wrap"><table class="tabela compacta"><thead><tr><th>Empresa</th><th class="num">RDV</th><th class="num">Ficha de custo</th><th class="num">Pendente de acerto</th><th class="num">Total</th></tr></thead><tbody>
    ${t.porEmpresa.map((x) => `<tr><td>${esc(x.nome)}${x.outro ? ` <small class="dica">+ outras ${moeda(x.outro)}</small>` : ""}</td><td class="num">${moeda(x.rdv)}</td><td class="num">${moeda(x.fc)}</td><td class="num">${moeda(x.pendente)}</td><td class="num"><b>${moeda(x.total)}</b></td></tr>`).join("")}
    </tbody><tfoot><tr><th>Total do acerto</th><th></th><th></th><th class="num">${moeda(t.comColaboradores)}</th><th class="num">${moeda(t.total)}</th></tr>
    <tr><th>Saldo atual (inicial + entradas − despesas)</th><th></th><th></th><th></th><th class="num">${moeda(t.saldoAtual)}</th></tr>
    <tr><th>Disponível na conta (saldo atual − pendente)</th><th></th><th></th><th></th><th class="num">${moeda(t.disponivel)}</th></tr></tfoot></table></div>
    ${t.avisos.map((a) => `<p class="aviso-doc">${esc(a)}</p>`).join("")}`;
}

function aoEditarFechamento(e) {
  const el = e.target;
  const r = fech.r;
  const num = (v) => { const n = numeroDigitado(v); return n == null ? 0 : n; };
  if (el.dataset.f) {
    const k = el.dataset.f;
    if (k === "inicio" || k === "fim") { r[k] = el.value; return; }
    r[k] = k === "conta" && !el.value.trim() ? null : num(el.value);
  } else if (el.dataset.l) {
    const l = r.linhas[Number(el.closest("tr").dataset.linha)];
    if (el.dataset.l === "tipo") { const [cl, emp] = el.value.split("|"); l.classificacao = cl; l.empresa_id = emp || null; }
    else if (el.dataset.l === "valor") l.valor = num(el.value);
    else l[el.dataset.l] = el.value;
  } else if (el.dataset.p) {
    const p = r.pendentes[Number(el.closest("tr").dataset.pend)];
    p[el.dataset.p] = el.dataset.p === "valor" ? num(el.value) : el.value || (el.dataset.p === "empresa_id" ? null : "");
  } else return;
  totaisFechamento();
}

async function aoClicarFechamento(e) {
  const b = e.target.closest("button");
  if (!b) return;
  const r = fech.r;
  if (b.dataset.tirarLinha) { r.linhas.splice(Number(b.dataset.tirarLinha), 1); desenharFechamento(); return; }
  if (b.dataset.tirarPend) { r.pendentes.splice(Number(b.dataset.tirarPend), 1); desenharFechamento(); return; }
  const acao = b.dataset.fech;
  if (acao === "mais-linha") { r.linhas.push({ classificacao: "rdv", empresa_id: (doCaixa()[0] || {}).id || null, data: r.fim, descricao: "", valor: 0 }); desenharFechamento(); }
  if (acao === "mais-pend") { r.pendentes.push({ nome: "", empresa_id: (doCaixa().at(-1) || {}).id || null, valor: 0 }); desenharFechamento(); }
  if (acao === "recalcular") {
    if (!r.inicio || !r.fim || r.inicio > r.fim) { avisar("Confira as datas do período."); return; }
    fech.r = montarResumo(config, movimentos, doCaixa(), { inicio: r.inicio, fim: r.fim });
    desenharFechamento();
  }
  if (acao === "ver") { fech.ver = true; desenharFechamento(); }
  if (acao === "voltar") { fech.ver = false; desenharFechamento(); }
  const opcoesRel = { titulo: `Acerto de caixa – ${nomesEmpresas()}`, nomes: perfil.nome || "" };
  if (acao === "png") {
    relatorioPng(r, doCaixa(), sig, opcoesRel).toBlob((blob) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `acerto-caixa-${r.fim}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }, "image/png");
  }
  if (acao === "imprimir") {
    const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Acerto de caixa ${dataBR(r.fim)}</title><style>body{margin:24px;background:#fff}${CSS_RELATORIO}</style></head><body>${relatorioHtml(r, doCaixa(), sig, opcoesRel)}<script>onload=()=>print()<\/script></body></html>`;
    const w = window.open(URL.createObjectURL(new Blob([html], { type: "text/html" })), "_blank");
    if (!w) avisar("O navegador bloqueou a janela de impressão: libere as janelas deste site.");
  }
  if (acao === "realizado") {
    if (!confirm(`Registrar o acerto de ${dataBR(r.inicio)} a ${dataBR(r.fim)}? O lembrete deste mês para, e o próximo resumo começa em ${dataBR(r.fim)} + 1 dia.`)) return;
    $("#dlg-fechamento").close();
    await escolherAcerto("realizado", { inicio: r.inicio, fim: r.fim, total: totaisResumo(r, doCaixa()).total });
  }
}

// ---------------------------------------------------------------- eventos
function prepararEventos() {
  prepararDialogos();
  $("#btn-configurar-novo").addEventListener("click", () => abrirConfig());
  $("#btn-configurar").addEventListener("click", () => abrirConfig());
  $("#btn-importar").addEventListener("click", abrirImportar);
  $("#btn-conferir").addEventListener("click", abrirConferir);
  $("#btn-fechamento").addEventListener("click", abrirFechamento);
  $("#dlg-fechamento").addEventListener("input", aoEditarFechamento);
  $("#dlg-fechamento").addEventListener("change", aoEditarFechamento);
  $("#dlg-fechamento").addEventListener("click", aoClicarFechamento);
  $("#caixa-acerto").addEventListener("click", (e) => { if (e.target.closest("[data-acerto-resumo]")) abrirFechamento(); });
  $("#caixa-acerto").addEventListener("change", (e) => {
    const s = e.target.closest("[data-acerto-escolha]");
    if (!s || !s.value) return;
    if (s.value === "realizado" && !confirm("Marcar o acerto deste mês como realizado? O próximo resumo começa a partir de amanhã.")) { s.value = ""; return; }
    escolherAcerto(s.value);
  });
  $("#btn-despesa").addEventListener("click", () => abrirMovimento(null, { tipo: "despesa" }));
  $("#btn-entrada").addEventListener("click", () => abrirMovimento(null, { tipo: "entrada", empresa_id: (doCaixa()[0] || {}).id || null }));
  $("#btn-adiantar").addEventListener("click", () => abrirMovimento(null, { tipo: "adiantamento", descricao: "Adiantamento" }));
  $("#periodo").addEventListener("change", (e) => { filtro.periodo = e.target.value; renderizar(); });
  $("#busca").addEventListener("input", (e) => { filtro.busca = e.target.value; renderTabela(); });
  $("#filtro-tipo").addEventListener("change", (e) => { filtro.tipo = e.target.value; renderTabela(); });
  $("#filtro-empresa").addEventListener("change", (e) => { filtro.empresa = e.target.value; renderTabela(); });
  $("#filtro-situacao").addEventListener("change", (e) => { filtro.situacao = e.target.value; renderTabela(); });
  $("#caixa-kpis").addEventListener("click", (e) => {
    const b = e.target.closest("[data-acao]");
    if (!b) return;
    if (b.dataset.acao === "conta") abrirConfig("saldo_conta");
    if (b.dataset.acao === "pendentes") $("#caixa-pendentes").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("#caixa-colab").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    const r = resumoCaixa(config, movimentos);
    if (b.dataset.colabAdiantar) abrirMovimento(null, { tipo: "adiantamento", colaborador: b.dataset.colabAdiantar, descricao: "Adiantamento" });
    if (b.dataset.colabDevolver) { const p = r.colaboradores.find((x) => x.nome === b.dataset.colabDevolver); abrirMovimento(null, { tipo: "devolucao", colaborador: p.nome, valor: p.saldo, descricao: "Devolução do adiantamento" }); }
    if (b.dataset.colabReembolsar) { const p = r.colaboradores.find((x) => x.nome === b.dataset.colabReembolsar); abrirMovimento(null, { tipo: "adiantamento", colaborador: p.nome, valor: -p.saldo, descricao: "Reembolso do que gastou a mais" }); }
  });
  const aoClicarLista = (e) => {
    const doc = e.target.closest("[data-doc]");
    if (doc) { abrirDocumento(doc.dataset.doc); return; }
    if (e.target.closest("[data-aprovar], label.aprovar")) return;
    const ed = e.target.closest("[data-editar]");
    if (ed) { abrirMovimento(ed.dataset.editar); return; }
    const tr = e.target.closest("tr[data-id]");
    if (tr) abrirMovimento(tr.dataset.id);
  };
  const aoMarcar = (e) => { if (e.target.matches("[data-aprovar]")) alternarAprovado(e.target.dataset.aprovar, e.target.checked); };
  for (const sel of ["#tabela tbody", "#caixa-pend"]) {
    $(sel).addEventListener("click", aoClicarLista);
    $(sel).addEventListener("change", aoMarcar);
  }
  $("#tabela tbody").addEventListener("keydown", (e) => { if (e.key === "Enter" && e.target.matches("tr[data-id]")) abrirMovimento(e.target.dataset.id); });
}

async function iniciar() {
  const sessao = await abrirPagina("caixa.html");
  if (!sessao) return;
  ({ armazem, perfil, empresas } = sessao);
  colecao = armazem.colecao("caixa_movimentos");
  prepararEventos();
  try {
    await recarregar();
    // Vindo das tarefas pendentes (caixa.html#caixa-pendentes): direto para os documentos a aprovar
    if (location.hash === "#caixa-pendentes" && !$("#caixa-pendentes").hidden) $("#caixa-pendentes").scrollIntoView({ block: "start" });
    if (location.hash === "#fechamento" && config && (config.empresas || []).length) abrirFechamento();
  } catch (err) {
    $("main").insertAdjacentHTML("afterbegin", `<p class="cartao erro-geral" role="alert">${esc(err.message)}</p>`);
  }
}

iniciar();
