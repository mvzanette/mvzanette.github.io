// Finanças pessoais (area/financas.html): carrega o painel de quem está logado e desenha com o código do painel
// do projeto Financeiro. Aqui também se lançam os gastos do dia a dia (somam com os do projeto; os de cartão
// entram na fatura; o extrato da conta traz os Pix, débitos e boletos de uma vez), se classificam os lançamentos (categoria, subcategoria, essencial, conta e complemento, com a
// lista de categorias de cada pessoa), se guardam os PDFs das faturas e relatórios (as faturas que o site sabe ler
// atualizam o cartão pelo botão Processar), fica a lista de desejos e se importa o arquivo do painel. Na importação,
// o administrador escolhe de quem é o painel e pode atualizar junto as faturas da outra pessoa que vêm no arquivo,
// com ou sem a carteira de investimentos conjunta; as faturas lidas pelo site que o arquivo não traz continuam.
// Em casal nas finanças, a página abre o painel da outra pessoa (?de=<id>), com tudo para alterar, ou a visão do
// casal (?de=casal); o que se carrega e grava segue o painel aberto (dono).
import { abrirPagina } from "./sessao.js";
import { linkFinancas, pode } from "./modulos.js";
import { lerArquivoFinancas, outrasPessoas, soFaturas } from "./financas-importar.js";
import { desenharFinancas } from "./financas-painel.js";
import { desenharDesejos } from "./financas-desejos.js";
import { desenharInvestimentosPessoais, registroAte, resumir, ultimoMes } from "./financas-investimentos.js";
import { lerPainelSoCalculo, mostrarCasal } from "./financas-casal.js";
import { prepararPlanoAporte } from "./financas-plano.js";
import { CATEGORIA as CAT_CAIXINHA, prepararCaixinhas } from "./financas-caixinhas.js";
import { desenharOndeInvestir } from "./financas-onde-investir.js";
import { categoriaDe, categoriasEscolhiveis, chavesFatura, chavesGastos, contasDisponiveis, juntarCategorias, lerCategorias, lerContas, normalizarCategoria, partesDe, semClassificacao } from "./financas-classificacao.js";
import { aplicarFatura, herdarClassificacao, historicoDeCategorias, lerFaturaPdf, manterFaturasDoSite, montarFatura } from "./financas-faturas.js";
import { decodificarExtrato, lerExtrato, MOTIVOS, saidasDoExtrato } from "./financas-extrato.js";
import { leituraDosBancos, prepararBancos } from "./financas-bancos.js";
import { aplicarPrevia, bancoDoCartao, faturaProvavel, lerFaturaParcial, montarPrevia, ordemFatura, rotuloFatura } from "./financas-previa.js";
import { extrairLinhas } from "./pdf-texto.js";
import { $, esc, avisar, opcoes, numeroDigitado, prepararDialogos, conferirPdf } from "./ui.js";
import { mostrarTarefas, tarefaAPagar, tarefaCaixinhas, tarefaClassificar } from "./tarefas.js";

let armazem;
let perfil; // quem está usando a página
let dono = null; // de quem é o painel aberto: o próprio ou o de quem forma casal nas finanças
let parceiro = null; // { id, nome } de quem forma casal nas finanças com quem está usando
let acessiveis = []; // painéis que quem está usando pode alterar (para atualizar junto o painel da outra pessoa)
let registro = null; // painel de quem está logado
let painel = null; // retorno de desenharFinancas
let gastos = []; // gastos lançados pelo site
let entradas = []; // entradas lançadas pelo site (salário e outros recebimentos)
let pessoas = []; // quem pode ter painel (o administrador escolhe o destino da importação)
let leitura = null; // resultado do arquivo escolhido
let nomeArquivo = "";
let prefs = null; // lista de categorias e plano da lista de desejos
let cats = null; // lista de categorias em uso ({ lista, renomeadas })
let ajustes = []; // classificação feita no site para os lançamentos do projeto
let contas = []; // contas que aparecem nos formulários (de quem é o dinheiro), conforme as permissões e os Cadastros
let contasTodas = []; // as mesmas e as escondidas, para dar nome aos lançamentos antigos
let empresas = []; // empresas cadastradas (os nomes vêm do banco)
let faturaPdf = null; // fatura em PDF sendo processada: { caminho, nome, leitura, quem, montada, destino }
let extrato = null; // extrato da conta sendo importado: { leitura, saidas, entradas }
let recorrentes = []; // pagamentos recorrentes cadastrados no site (preferências do painel)
let caixinhasUI = null; // aba Caixinhas (redesenha depois de lançar ou apagar um gasto)
let bancos = null; // bancos conectados de quem é o painel: { conexoes, contas, movimentos } (sem as tabelas no banco, null)
let bancosUI = null; // aba Bancos

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const brl = (v) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataBR = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const dataHora = (iso) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
};
const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const tamanho = (b) => (b == null ? "" : b >= 1048576 ? `${(b / 1048576).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const semAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const primeiroNome = (p) => semAcento((p.nome || p.email || "").split(/[\s@]/)[0]);
const nomeDe = (p) => (p.id === perfil.id ? `${p.nome || p.email} (você)` : p.nome || p.email);

// Uma data só: a última mudança no painel (arquivo importado, fatura, gasto, entrada, classificação ou preferências)
function mostrarStatus() {
  const datas = [registro && registro.atualizado_em, prefs && prefs.atualizado_em,
    ...gastos.map((g) => g.atualizado_em || g.criado_em), ...entradas.map((e) => e.atualizado_em || e.criado_em), ...ajustes.map((a) => a.atualizado_em)]
    .filter((d) => d && !Number.isNaN(Date.parse(d))).sort();
  const ultima = datas.at(-1);
  $("#fin-status").textContent = `${dono.id !== perfil.id ? `Painel de ${dono.nome} · ` : ""}${ultima ? `Última atualização: ${dataHora(ultima)}` : "Ainda sem atualização"}${registro.modo === "faturas" ? " · cartão e faturas" : ""}.`;
}

// ---------------------------------------------------------------- categorias e contas nos formulários
// Categoria e subcategoria sempre com a lista de opções da pessoa; "Nova…" abre um campo para escrever
const NOVA = "__nova__";
const igual = (a, b) => semAcento(a).trim() === semAcento(b).trim();

// "Outros" não aparece: fica só para o ajuste de gastos não detalhados (o lançamento sem categoria fica a classificar)
function preencherCategorias(form, categoria, subcategoria) {
  const nomes = categoriasEscolhiveis(cats).map((c) => c.nome);
  if (semClassificacao(categoria)) categoria = "";
  if (categoria && !nomes.some((n) => igual(n, categoria))) nomes.push(categoria); // fora da lista: aparece mesmo assim
  const atual = nomes.find((n) => igual(n, categoria || "")) || "";
  form.elements.categoria.innerHTML = '<option value="">—</option>' + nomes.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join("")
    + (form.elements.categoria_nova ? `<option value="${NOVA}">+ Nova categoria…</option>` : "");
  form.elements.categoria.value = atual;
  preencherSub(form, subcategoria);
}

function preencherSub(form, subcategoria) {
  const sel = form.elements.subcategoria;
  if (sel) {
    const subs = [...((categoriaDe(cats, form.elements.categoria.value) || {}).sub || [])];
    if (subcategoria && !subs.includes(subcategoria)) subs.push(subcategoria);
    sel.innerHTML = '<option value="">—</option>' + subs.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join("")
      + (form.elements.subcategoria_nova ? `<option value="${NOVA}">+ Nova subcategoria…</option>` : "");
    sel.value = subcategoria && subs.includes(subcategoria) ? subcategoria : "";
    sel.disabled = !form.elements.categoria.value;
  }
  mostrarCamposNovos(form);
}

function mostrarCamposNovos(form) {
  const campo = (sel) => form.querySelector(sel);
  if (campo("[data-campo-nova-categoria]")) campo("[data-campo-nova-categoria]").hidden = form.elements.categoria.value !== NOVA;
  if (campo("[data-campo-nova-sub]")) campo("[data-campo-nova-sub]").hidden = !form.elements.subcategoria || form.elements.subcategoria.value !== NOVA;
}

function prepararCategorias(form) {
  form.elements.categoria.addEventListener("change", () => preencherSub(form, ""));
  if (form.elements.subcategoria) form.elements.subcategoria.addEventListener("change", () => mostrarCamposNovos(form));
}

// Categoria e subcategoria escolhidas (ou escritas em "Nova…")
function lerCategoria(form) {
  let categoria = form.elements.categoria.value;
  if (categoria === NOVA) categoria = form.elements.categoria_nova.value.trim();
  let subcategoria = form.elements.subcategoria ? form.elements.subcategoria.value : "";
  if (subcategoria === NOVA) subcategoria = form.elements.subcategoria_nova.value.trim();
  return { categoria: categoria || null, subcategoria: (categoria && subcategoria) || null };
}

async function salvarCategorias() {
  prefs = await armazem.financas.salvarPreferencias(dono.id, { categorias: { lista: cats.lista, renomeadas: cats.renomeadas, subPadrao: cats.subPadrao || {} } });
  cats.salva = true;
  if (!categoriasMexidas) recomecarCategorias(); // categoria nova criada ao lançar ou classificar aparece nos Cadastros
}

// Categoria ou subcategoria escrita em "Nova…" entra na lista da pessoa (antes de "Outros")
async function guardarNaLista(categoria, subcategoria) {
  if (!categoria) return;
  let c = categoriaDe(cats, categoria);
  let mudou = !cats.salva;
  if (!c) {
    c = { nome: categoria, sub: [], essencial: null };
    const fim = cats.lista.length && igual(cats.lista.at(-1).nome, "Outros") ? cats.lista.length - 1 : cats.lista.length;
    cats.lista.splice(fim, 0, c);
    mudou = true;
  }
  if (subcategoria && !c.sub.includes(subcategoria)) {
    c.sub.push(subcategoria);
    mudou = true;
  }
  if (mudou) await salvarCategorias();
}

// Contas do painel aberto: a outra pessoa do casal é a de quem está usando ou, no painel dela, quem está usando
function montarContas() {
  const par = dono.id === perfil.id ? parceiro : { id: perfil.id, nome: perfil.nome, email: perfil.email };
  contasTodas = contasDisponiveis({ perfil, dono, parceiro: par, empresas, prefs });
  contas = contasTodas.filter((c) => !c.oculta);
}

function preencherConta(form, atual) {
  const campo = form.querySelector("[data-campo-conta]");
  campo.hidden = contas.length < 2;
  const lista = [...contas];
  if (atual && !lista.some((c) => c.id === atual)) lista.push(contasTodas.find((c) => c.id === atual) || { id: atual, nome: "Conta removida" });
  form.elements.conta.innerHTML = lista.map((c) => `<option value="${esc(c.id)}">${esc(c.nome)}</option>`).join("");
  form.elements.conta.value = atual || "pessoal";
}
const contaEscolhida = (form) => (contas.length > 1 && form.elements.conta.value !== "pessoal" ? form.elements.conta.value : null);

// ---------------------------------------------------------------- dividir um lançamento em categorias
// Quadro dos formulários de classificar e de lançar ou editar gasto: o lançamento dividido em duas ou mais partes,
// cada uma com o valor, a categoria, a subcategoria e a conta. A primeira parte fica com o que falta para o total.
function opcoesCats(atual) {
  const nomes = categoriasEscolhiveis(cats).map((c) => c.nome);
  if (atual && !semClassificacao(atual) && !nomes.some((n) => igual(n, atual))) nomes.push(atual);
  const sel = nomes.find((n) => igual(n, atual || "")) || "";
  return '<option value="">Escolha…</option>' + nomes.map((n) => `<option value="${esc(n)}"${n === sel ? " selected" : ""}>${esc(n)}</option>`).join("");
}
function opcoesSubs(cat, atual) {
  const subs = [...((categoriaDe(cats, cat || "") || {}).sub || [])];
  if (atual && !subs.includes(atual)) subs.push(atual);
  return '<option value="">—</option>' + subs.map((x) => `<option value="${esc(x)}"${x === atual ? " selected" : ""}>${esc(x)}</option>`).join("");
}
function opcoesContas(atual) {
  const lista = [...contas];
  if (atual && !lista.some((c) => c.id === atual)) lista.push(contasTodas.find((c) => c.id === atual) || { id: atual, nome: "Conta removida" });
  return lista.map((c) => `<option value="${esc(c.id)}"${c.id === (atual || "pessoal") ? " selected" : ""}>${esc(c.nome)}</option>`).join("");
}
const linhaParte = (p = {}) => `<div class="parte-linha">
    <label>Valor (R$)<input name="parte_valor" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${p.valor > 0 ? valorBR(p.valor) : ""}"></label>
    <label>Categoria<select name="parte_cat">${opcoesCats(p.categoria)}</select></label>
    <label>Subcategoria<select name="parte_sub"${p.categoria ? "" : " disabled"}>${opcoesSubs(p.categoria, p.subcategoria)}</select></label>
    ${contas.length > 1 ? `<label>Conta<select name="parte_conta">${opcoesContas(p.conta)}</select></label>` : ""}
    <button type="button" class="btn-link" data-tirar-parte>Tirar</button></div>`;
const quadroDivisao = (form) => form.querySelector("[data-divisao]");
const totalDivisao = (q) => (typeof q._total === "function" ? q._total() : q._total) || 0;
// total: o valor do lançamento (ou uma função que lê o campo valor); partes: a divisão que ele já tem
function montarDivisao(form, { total, partes = null, categoria = "", subcategoria = "", conta = "pessoal" }) {
  const q = quadroDivisao(form);
  q._total = total;
  q._base = { categoria: semClassificacao(categoria) ? "" : categoria, subcategoria, conta: conta || "pessoal" };
  const lista = Array.isArray(partes) && partes.length >= 2 ? partes : null;
  form.elements.dividir.checked = !!lista;
  q.querySelector(".partes").innerHTML = lista ? lista.map(linhaParte).join("") : "";
  mostrarDivisao(form);
}
function mostrarDivisao(form) {
  const q = quadroDivisao(form);
  const ligado = form.elements.dividir.checked;
  q.querySelector(".divisao-corpo").hidden = !ligado;
  form.querySelectorAll("[data-sem-divisao]").forEach((el) => { el.hidden = ligado; });
  if (ligado && !q.querySelectorAll(".parte-linha").length) {
    q.querySelector(".partes").innerHTML = linhaParte({ valor: totalDivisao(q), ...q._base }) + linhaParte({ conta: q._base.conta });
  }
  somarDivisao(form);
}
const valorParte = (linha) => numeroDigitado(linha.querySelector("[name=parte_valor]").value) || 0;
// mexida: a parte que mudou; a primeira parte fica com o resto do total
function somarDivisao(form, mexida = null) {
  const q = quadroDivisao(form);
  if (!form.elements.dividir.checked) return;
  const linhas = [...q.querySelectorAll(".parte-linha")];
  const t = totalDivisao(q);
  if (mexida && linhas.length > 1 && mexida !== linhas[0]) {
    const resto = Math.round((t - linhas.slice(1).reduce((x, l) => x + valorParte(l), 0)) * 100) / 100;
    linhas[0].querySelector("[name=parte_valor]").value = resto > 0 ? valorBR(resto) : "";
  }
  const soma = Math.round(linhas.reduce((x, l) => x + valorParte(l), 0) * 100) / 100;
  const ok = Math.abs(soma - t) < 0.005;
  const el = q.querySelector(".divisao-soma");
  el.textContent = `Soma das partes: ${brl(soma)} de ${brl(t)}${ok ? "" : ` (${soma > t ? "passa" : "faltam"} ${brl(Math.abs(t - soma))})`}`;
  el.classList.toggle("erro-soma", !ok);
}
// Partes escolhidas ({ partes: null } sem divisão) ou { erro } quando falta alguma coisa
function lerDivisao(form) {
  if (!form.elements.dividir || !form.elements.dividir.checked) return { partes: null };
  const q = quadroDivisao(form);
  const t = totalDivisao(q);
  const partes = [...q.querySelectorAll(".parte-linha")].map((l) => {
    const conta = l.querySelector("[name=parte_conta]");
    return { valor: Math.round(valorParte(l) * 100) / 100, categoria: l.querySelector("[name=parte_cat]").value,
      subcategoria: l.querySelector("[name=parte_sub]").value || null, conta: conta && conta.value !== "pessoal" ? conta.value : null };
  });
  if (partes.length < 2) return { erro: "Para dividir, são pelo menos duas partes." };
  if (partes.length > 8) return { erro: "Divida em no máximo oito partes." };
  if (partes.some((p) => !(p.valor > 0))) return { erro: "Cada parte precisa de um valor maior que zero." };
  if (partes.some((p) => !p.categoria)) return { erro: "Escolha a categoria de cada parte." };
  const soma = partes.reduce((x, p) => x + p.valor, 0);
  if (Math.abs(soma - t) >= 0.005) return { erro: `A soma das partes (${brl(soma)}) precisa ser igual ao valor do lançamento (${brl(t)}).` };
  return { partes, maior: partes.reduce((x, p) => (p.valor > x.valor ? p : x), partes[0]) };
}
function prepararDivisao(form) {
  const q = quadroDivisao(form);
  form.elements.dividir.addEventListener("change", () => mostrarDivisao(form));
  q.addEventListener("input", (e) => { if (e.target.name === "parte_valor") somarDivisao(form, e.target.closest(".parte-linha")); });
  q.addEventListener("change", (e) => {
    if (e.target.name !== "parte_cat") return;
    const sub = e.target.closest(".parte-linha").querySelector("[name=parte_sub]");
    sub.innerHTML = opcoesSubs(e.target.value, "");
    sub.disabled = !e.target.value;
  });
  q.addEventListener("click", (e) => {
    if (e.target.closest("[data-mais-parte]")) {
      q.querySelector(".partes").insertAdjacentHTML("beforeend", linhaParte({ conta: q._base && q._base.conta }));
      q.querySelector(".parte-linha:last-child [name=parte_valor]").focus();
      somarDivisao(form);
    }
    const tirar = e.target.closest("[data-tirar-parte]");
    if (tirar) {
      tirar.closest(".parte-linha").remove();
      somarDivisao(form, q.querySelector(".parte-linha:last-child"));
    }
  });
}

// ---------------------------------------------------------------- gastos lançados pelo site
// Forma de pagamento do último gasto lançado nesta visita: quem lança vários Pix seguidos não troca toda vez
const FORMA_DA_VISITA = "mz-fin-forma";

let pagamento = null; // pagamento recorrente sendo marcado como pago ({ chave, nome, rotulo, ... }); sem ele, gasto comum
let editandoGasto = null; // gasto lançado pelo site aberto para editar (ou para confirmar o pagamento)
let pagoMexido = false; // a escolha de pago / a pagar foi feita à mão (a data deixa de decidir)

// Gastos lançados no site que ainda vão ser pagos (ids, nas preferências do caixa do painel)
const idsAPagar = () => new Set((prefs && prefs.caixa && prefs.caixa.aPagar) || []);
// Pagamento recorrente a que o gasto está ligado ("id|AAAA-MM"): nome e mês
function recorrenteDoGasto(g) {
  if (!g || !g.recorrente) return null;
  const i = g.recorrente.lastIndexOf("|");
  const chave = i > 0 ? g.recorrente.slice(0, i) : g.recorrente;
  const mes = i > 0 ? g.recorrente.slice(i + 1) : "";
  const r = recorrentes.find((x) => x.id === chave);
  return { chave, mes, nome: r ? r.nome : chave.startsWith("p:") ? chave.slice(2) : "pagamento recorrente" };
}

// Lançar gasto. Com um pagamento recorrente, o formulário vem preenchido com ele (valor, data e forma para conferir).
// Com um gasto do site, abre para editar (ou, com pagar, para confirmar o pagamento de um gasto a pagar).
function abrirLancamento(recorrente = null, gasto = null, { pagar = false } = {}) {
  pagamento = recorrente && recorrente.chave ? recorrente : null;
  editandoGasto = gasto && gasto.id ? gasto : null;
  pagoMexido = false;
  const g = editandoGasto;
  const form = $("#form-gasto");
  form.reset();
  form.elements.data.value = g ? (pagar ? hojeISO() : g.data) : pagamento ? pagamento.data : hojeISO();
  try {
    const forma = g ? g.forma : pagamento ? pagamento.forma : sessionStorage.getItem(FORMA_DA_VISITA);
    const opcao = forma && form.querySelector(`[name=forma][value="${CSS.escape(forma)}"]`);
    if (opcao) opcao.checked = true;
  } catch {
    /* sem armazenamento: começa no cartão */
  }
  if (pagamento) {
    form.elements.descricao.value = pagamento.nome;
    form.elements.valor.value = pagamento.valor != null ? valorBR(pagamento.valor) : "";
  }
  if (g) {
    form.elements.descricao.value = g.descricao;
    form.elements.valor.value = valorBR(Number(g.valor));
    form.elements.parcelas.value = String(g.parcelas || 1);
    form.elements.essencial.value = g.essencial === true ? "sim" : g.essencial === false ? "nao" : "";
    form.elements.observacao.value = g.observacao || "";
  }
  // Pago ou a pagar: o gasto aberto mantém o que tinha; o novo segue a data (depois de hoje, a pagar)
  form.elements.pago.value = !pagar && g && idsAPagar().has(g.id) ? "nao" : "sim";
  const ligado = recorrenteDoGasto(g);
  $("#titulo-gasto").textContent = pagamento ? `Marcar como pago: ${pagamento.nome} (${pagamento.rotulo})`
    : g && pagar ? `Confirmar pagamento: ${g.descricao}` : g ? "Editar gasto" : "Lançar gasto";
  form.querySelector("[type=submit]").textContent = pagamento ? "Marcar como pago" : g && pagar ? "Confirmar pagamento" : g ? "Salvar" : "Lançar";
  $("#dica-pagamento").hidden = !pagamento;
  // Repete todo mês: só para o gasto que ainda não está ligado a um pagamento recorrente
  repetePossivel = !pagamento && !ligado;
  $("#dica-recorrente").hidden = !ligado;
  if (ligado) $("#dica-recorrente").textContent = `Este gasto é o pagamento de “${ligado.nome}”${ligado.mes ? ` em ${rotuloMes(ligado.mes)}` : ""}. Para mudar o valor de todo mês, edite o recorrente na aba Cadastros.`;
  $("#btn-apagar-gasto").hidden = !g;
  preencherCategorias(form, g ? g.categoria || "" : pagamento ? pagamento.categoria || "" : "", g ? g.subcategoria || "" : pagamento ? pagamento.subcategoria || "" : "");
  preencherConta(form, (g && g.conta) || (pagamento && pagamento.conta) || "pessoal");
  montarDivisao(form, { total: () => numeroDigitado(form.elements.valor.value), partes: g ? g.partes : null,
    categoria: g ? g.categoria || "" : pagamento ? pagamento.categoria || "" : "", subcategoria: g ? g.subcategoria || "" : "", conta: (g && g.conta) || "pessoal" });
  $("#erro-gasto").hidden = true;
  preencherPagoCom(g ? g.caixinha_id || "" : "");
  atualizarForma();
  $("#dlg-gasto").showModal();
  form.elements.valor.focus();
  if (pagamento || pagar) form.elements.valor.select();
}

const abrirEdicaoGasto = (id) => {
  const g = gastos.find((x) => x.id === id);
  if (g) abrirLancamento(null, g);
};
// Pagar um gasto a pagar: abre para conferir o valor e a data do pagamento (hoje, se não mudar)
const pagarGasto = (id) => {
  const g = gastos.find((x) => x.id === id);
  if (g) abrirLancamento(null, g, { pagar: true });
};

// Fim de um pagamento recorrente: o último mês ou o número de parcelas (contando o primeiro mês). Preencher um
// calcula o outro; os dois em branco: sem data para terminar.
const mesesEntre = (de, ate) => { const [a1, m1] = de.split("-").map(Number); const [a2, m2] = ate.split("-").map(Number); return (a2 - a1) * 12 + m2 - m1; };
function sincronizarTermino(form, { inicio, fim, parcelas, dica, valor }, origem) {
  const ini = form.elements[inicio].value || mesAtual();
  const n = parseInt(form.elements[parcelas].value, 10);
  if (origem === parcelas || (origem === inicio && n > 0)) form.elements[fim].value = n > 0 ? somarMes(ini, n - 1) : "";
  else if (origem === fim) form.elements[parcelas].value = form.elements[fim].value && form.elements[fim].value >= ini ? mesesEntre(ini, form.elements[fim].value) + 1 : "";
  const f = form.elements[fim].value;
  const qtd = f && f >= ini ? mesesEntre(ini, f) + 1 : null;
  const v = valor ? numeroDigitado(form.elements[valor].value) : null;
  $(dica).textContent = !f ? "Sem data para terminar: fica pendente todo mês até você pôr o último mês ou o nº de parcelas."
    : f < ini ? "O último mês vem depois do primeiro."
    : `De ${rotuloMes(ini)} a ${rotuloMes(f)}: ${qtd} ${qtd === 1 ? "parcela" : "parcelas"}${v > 0 ? ` de ${brl(v)} (total ${brl(v * qtd)})` : ""}.`;
}
const TERMINO_GASTO = { inicio: "rep_inicio", fim: "rep_fim", parcelas: "rep_parcelas", dica: "#dica-repete", valor: "valor" };
const TERMINO_REC = { inicio: "inicio", fim: "fim", parcelas: "parcelas", dica: "#dica-rec-termino", valor: "valor" };

// Pagamento recorrente no lançamento do gasto: só para o gasto que ainda não paga um recorrente, e nunca no parcelado
// do cartão (as parcelas já caem uma em cada fatura)
let repetePossivel = true;
function atualizarRepete() {
  const form = $("#form-gasto");
  const parcelado = form.elements.forma.value === "cartao" && Number(form.elements.parcelas.value) > 1;
  $("#campo-repete").hidden = !repetePossivel || parcelado;
  $("#repete-detalhes").hidden = !form.elements.repete.checked;
  if (form.elements.repete.checked) sincronizarTermino(form, TERMINO_GASTO, null);
}
// Ao marcar (ou mudar a data do gasto), o dia e o primeiro mês vêm do gasto
function repetePelaData() {
  const form = $("#form-gasto");
  const data = form.elements.data.value || hojeISO();
  form.elements.rep_dia.value = String(Number(data.slice(8, 10)));
  form.elements.rep_inicio.value = data.slice(0, 7);
  sincronizarTermino(form, TERMINO_GASTO, "rep_inicio");
}

// "Pago com": a conta (entra nos gastos do mês) ou uma caixinha (não entra nos gastos nem no caixa; só tira do saldo
// dela). Nunca no cartão: a compra iria para a fatura e contaria em dobro.
function preencherPagoCom(atual = "") {
  const sel = $("#form-gasto").elements.caixinha_id;
  const linhas = painel && painel.estadoCaixinhas ? painel.estadoCaixinhas().linhas : [];
  sel.innerHTML = `<option value="">Conta (entra nos gastos do mês)</option>` + linhas.map((x) => `<option value="${esc(x.cx.id)}">Caixinha ${esc(x.cx.nome)} (tem ${brl(x.conta.saldo)}; não entra nos gastos)</option>`).join("");
  sel.value = linhas.some((x) => x.cx.id === atual) ? atual : "";
  sel.dataset.tem = linhas.length ? "1" : "";
}
function atualizarForma() {
  const form = $("#form-gasto");
  const cartao = form.elements.forma.value === "cartao";
  $("#campo-parcelas").hidden = !cartao;
  $("#campo-caixinha").hidden = cartao || !form.elements.caixinha_id.dataset.tem;
  atualizarRepete();
  // No cartão, o pagamento é o da fatura: o gasto não fica a pagar
  $("#campo-pago").hidden = cartao;
  $("#dica-forma").textContent = cartao
    ? "No cartão, o gasto entra na fatura do mês; se for parcelado, cada parcela cai numa fatura."
    : "Fora do cartão, o gasto sai do saldo do mês na data. Se ainda não foi pago, marque “Ainda vou pagar”.";
}

// Gasto novo com data depois de hoje: começa como a pagar (até escolher à mão)
function pagoPelaData() {
  const form = $("#form-gasto");
  if (pagoMexido || editandoGasto || pagamento) return;
  form.elements.pago.value = form.elements.data.value > hojeISO() ? "nao" : "sim";
}

async function lancarGasto(e) {
  e.preventDefault();
  const form = e.target;
  const erroGasto = $("#erro-gasto");
  const falha = (texto) => {
    erroGasto.textContent = texto;
    erroGasto.hidden = false;
  };
  erroGasto.hidden = true;
  const valor = numeroDigitado(form.elements.valor.value);
  if (!(valor > 0)) return falha("Informe o valor (ex.: 45,90).");
  if (!form.elements.descricao.value.trim()) return falha("Informe a descrição.");
  if (!form.elements.data.value) return falha("Informe a data.");
  const div = lerDivisao(form);
  if (div.erro) return falha(div.erro);
  let { categoria, subcategoria } = lerCategoria(form);
  if (div.partes) ({ categoria, subcategoria } = div.maior); // dividido: a categoria do gasto é a da maior parte
  else if (form.elements.categoria.value === NOVA && !categoria) return falha("Escreva o nome da nova categoria.");
  const essencial = form.elements.essencial.value;
  const forma = form.elements.forma.value;
  const aPagar = forma !== "cartao" && form.elements.pago.value === "nao";
  const antigo = editandoGasto;
  const eraAPagar = !!antigo && idsAPagar().has(antigo.id);
  // Repete todo mês: vira um pagamento recorrente, e este gasto fica como o pagamento do mês
  const mes = form.elements.data.value.slice(0, 7);
  const parceladoCartao = forma === "cartao" && Number(form.elements.parcelas.value) > 1;
  const novoRec = !pagamento && !(antigo && antigo.recorrente) && !parceladoCartao && form.elements.repete.checked ? { id: novoId() } : null;
  if (novoRec) {
    novoRec.inicio = form.elements.rep_inicio.value || mes;
    novoRec.fim = form.elements.rep_fim.value || null;
    novoRec.dia = parseInt(form.elements.rep_dia.value, 10) || Number(form.elements.data.value.slice(8, 10));
    if (novoRec.inicio > mes) return falha("O primeiro mês do recorrente é o deste gasto ou antes: este gasto fica como o pagamento do mês.");
    if (novoRec.fim && novoRec.fim < mes) return falha("O último mês do recorrente é o deste gasto ou depois.");
  }
  const campos = {
    perfil_id: antigo ? antigo.perfil_id : dono.id,
    data: form.elements.data.value,
    descricao: form.elements.descricao.value,
    valor,
    forma,
    parcelas: form.elements.parcelas.value,
    categoria,
    subcategoria,
    conta: contaEscolhida(form),
    essencial: essencial === "sim" ? true : essencial === "nao" ? false : null,
    observacao: form.elements.observacao.value,
    recorrente: pagamento ? pagamento.chave : novoRec ? `${novoRec.id}|${mes}` : antigo ? antigo.recorrente || null : null,
    partes: div.partes,
    caixinha_id: forma === "cartao" ? null : form.elements.caixinha_id.value || null,
  };
  const botao = form.querySelector("[type=submit]");
  botao.disabled = true;
  try {
    const salvo = antigo ? await armazem.financas.editarGasto(antigo.id, { ...antigo, ...campos }) : await armazem.financas.salvarGasto(campos);
    gastos = antigo ? gastos.map((x) => (x.id === antigo.id ? salvo : x)) : [...gastos, salvo];
    try {
      sessionStorage.setItem(FORMA_DA_VISITA, salvo.forma);
    } catch {
      /* sem armazenamento: só não lembra */
    }
    await guardarNaLista(categoria, subcategoria).catch(() => {});
    // A pagar e o recorrente novo ficam nas preferências do painel (numa gravação só)
    const ids = idsAPagar();
    const mudouAPagar = ids.has(salvo.id) !== aPagar;
    if (aPagar) ids.add(salvo.id);
    else ids.delete(salvo.id);
    const existentes = new Set(gastos.map((x) => x.id));
    const rec = novoRec ? { id: novoRec.id, nome: salvo.descricao.slice(0, 100), valor: salvo.valor, dia: novoRec.dia, forma: salvo.forma,
      categoria, subcategoria, conta: salvo.conta || null, inicio: novoRec.inicio, fim: novoRec.fim } : null;
    if (mudouAPagar || rec) {
      await salvarPrefs({ ...(rec ? { recorrentes: [...recorrentes, rec] } : {}), ...(mudouAPagar ? { caixa: { aPagar: [...ids].filter((x) => existentes.has(x)) } } : {}) });
    }
    painel.atualizarGastos(gastos);
    painel.atualizarClassificacao({ categorias: cats });
    if (caixinhasUI) caixinhasUI.desenhar();
    $("#dlg-gasto").close();
    const parcelado = salvo.forma === "cartao" && salvo.parcelas > 1 ? ` em ${salvo.parcelas}x` : "";
    const outroMes = salvo.forma !== "cartao" && salvo.data.slice(0, 7) !== mesAtual() ? ` em ${rotuloMes(salvo.data.slice(0, 7))}` : "";
    const qtdRec = rec && rec.fim ? mesesEntre(rec.inicio, rec.fim) + 1 : null;
    const textoRec = rec ? `. Virou um pagamento recorrente ${qtdRec ? `até ${rotuloMes(rec.fim)} (${qtdRec} ${qtdRec === 1 ? "parcela" : "parcelas"})` : "sem data para terminar"} (aba Cadastros)` : "";
    const sufixo = (aPagar ? `, a pagar em ${dataBR(salvo.data)}` : "") + textoRec;
    const comCaixinha = salvo.caixinha_id && !/^caixinha/i.test(semAcento(salvo.categoria || ""));
    if (comCaixinha) avisar(`Gasto pago com a caixinha: não entra nos gastos nem no caixa do mês; saiu do saldo dela.`);
    else avisar(pagamento ? `${pagamento.nome} marcado como ${aPagar ? "lançado (a pagar)" : "pago"} em ${pagamento.rotulo}.`
      : eraAPagar && !aPagar ? `Pagamento de “${salvo.descricao}” confirmado em ${dataBR(salvo.data)}.` : antigo ? `Gasto salvo${sufixo}.`
      : salvo.forma === "cartao" ? `Gasto lançado no cartão${parcelado}${textoRec}.` : `Gasto lançado${outroMes}${sufixo}.`);
    pagamento = null;
    editandoGasto = null;
  } catch (err) {
    falha(`Não foi possível ${antigo ? "salvar" : "lançar"}: ` + err.message);
  } finally {
    botao.disabled = false;
  }
}

async function apagarGasto(idGasto, pergunta = null, aviso = "Gasto apagado.") {
  const g = gastos.find((x) => x.id === idGasto);
  if (!g || !confirm(pergunta || `Apagar o gasto "${g.descricao}" lançado pelo site?`)) return false;
  try {
    await armazem.financas.apagarGasto(idGasto);
    gastos = gastos.filter((x) => x.id !== idGasto);
    const ids = idsAPagar();
    if (ids.delete(idGasto)) await salvarPrefs({ caixa: { aPagar: [...ids] } }).catch(() => {});
    painel.atualizarGastos(gastos);
    if (caixinhasUI) caixinhasUI.desenhar();
    avisar(aviso);
    return true;
  } catch (err) {
    avisar("Não foi possível apagar: " + err.message);
    return false;
  }
}

function prepararLancamento() {
  const form = $("#form-gasto");
  form.elements.parcelas.innerHTML = opcoes(Array.from({ length: 48 }, (_, i) => [String(i + 1), i ? `${i + 1}x` : "À vista (1x)"]), "1");
  $("#formas-gasto").addEventListener("change", atualizarForma);
  form.elements.data.addEventListener("change", pagoPelaData);
  form.elements.rep_dia.innerHTML = Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join("");
  form.elements.parcelas.addEventListener("change", atualizarRepete);
  form.elements.repete.addEventListener("change", () => {
    if (form.elements.repete.checked) repetePelaData();
    atualizarRepete();
  });
  form.elements.data.addEventListener("change", () => { if (form.elements.repete.checked) repetePelaData(); });
  for (const nome of ["rep_inicio", "rep_fim", "rep_parcelas"]) form.elements[nome].addEventListener("input", () => sincronizarTermino(form, TERMINO_GASTO, nome));
  form.elements.valor.addEventListener("input", () => {
    if (form.elements.repete.checked) sincronizarTermino(form, TERMINO_GASTO, null);
    // Dividido: a primeira parte acompanha o valor novo
    if (form.elements.dividir.checked) somarDivisao(form, form.querySelectorAll("[data-divisao] .parte-linha")[1] || null);
  });
  $("#campo-pago").addEventListener("change", () => { pagoMexido = true; });
  prepararCategorias(form);
  prepararDivisao(form);
  form.addEventListener("submit", lancarGasto);
  $("#btn-apagar-gasto").addEventListener("click", async () => {
    if (editandoGasto && (await apagarGasto(editandoGasto.id))) {
      editandoGasto = null;
      $("#dlg-gasto").close();
    }
  });
}

// ---------------------------------------------------------------- pagamentos recorrentes
// Aluguel, condomínio, escola, assinaturas: cadastrados nas preferências do painel. Cada mês ficam pendentes na visão
// geral até serem marcados como pagos, o que lança o gasto (com o valor para conferir). O valor pode ser mudado só
// num mês (conta de luz, por exemplo) sem mudar o dos outros meses.
const FORMAS_REC = { pix: "Pix", outro: "Boleto ou débito automático", debito: "Débito", cartao: "Cartão de crédito", dinheiro: "Dinheiro" };
let editandoRec = null; // id do recorrente aberto no formulário (null: novo)
const mesAtual = () => hojeISO().slice(0, 7);
const novoId = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

// Grava as preferências do painel e atualiza o que depende delas. O caixa (saldos, gastos a pagar, fixos do projeto
// tirados e previsões do mês) é gravado inteiro, juntando o que muda com o que já havia.
async function salvarPrefs({ recorrentes: lista = null, caixa = null } = {}) {
  const campos = {};
  if (lista) campos.recorrentes = lista;
  if (caixa) campos.caixa = { ...((prefs && prefs.caixa) || {}), ...caixa };
  prefs = await armazem.financas.salvarPreferencias(dono.id, campos);
  if (lista) {
    recorrentes = Array.isArray(prefs && prefs.recorrentes) ? prefs.recorrentes : lista;
    painel.atualizarRecorrentes(recorrentes);
  }
  if (caixa) painel.atualizarCaixa((prefs && prefs.caixa) || campos.caixa);
  desenharRecorrentesCad();
}
const salvarRecorrentes = (lista) => salvarPrefs({ recorrentes: lista });

// Fixos do projeto Financeiro tirados ou trocados por um recorrente daqui (chaves "p:<nome>")
const fixosOcultos = () => new Set((prefs && prefs.caixa && prefs.caixa.fixosOcultos) || []);
let doProjeto = null; // fixo do projeto aberto no formulário: { chave, busca, variavel }

// Editar um recorrente do site (id), cadastrar um novo ou editar um fixo do projeto (vira um recorrente daqui com a
// mesma chave, para os pagamentos já marcados continuarem ligados a ele)
function abrirRecorrente(id = null, fixo = null) {
  const r = id ? recorrentes.find((x) => x.id === id) : fixo && fixo.chave ? fixo : null;
  editandoRec = id && r ? r.id : null;
  doProjeto = !id && r ? { chave: fixo.chave, busca: fixo.busca || [], variavel: !!fixo.variavel } : null;
  const form = $("#form-recorrente");
  form.reset();
  $("#titulo-recorrente").textContent = doProjeto ? `Editar fixo do projeto: ${r.nome}` : r ? `Editar: ${r.nome}` : "Novo pagamento recorrente";
  form.elements.nome.value = r ? r.nome : "";
  form.elements.valor.value = r && r.valor != null ? valorBR(Number(r.valor)) : "";
  form.elements.dia.value = r && r.dia ? r.dia : "";
  // O fixo do projeto valia em todos os meses: o primeiro mês fica em branco (continua valendo em todos)
  form.elements.inicio.value = doProjeto ? "" : (r && r.inicio) || (r ? "" : mesAtual());
  form.elements.fim.value = (r && r.fim) || "";
  form.elements.parcelas.value = "";
  sincronizarTermino(form, TERMINO_REC, "fim");
  const forma = form.querySelector(`[name=forma][value="${CSS.escape((r && r.forma) || "pix")}"]`);
  if (forma) forma.checked = true;
  preencherCategorias(form, r ? r.categoria || "" : "", r ? r.subcategoria || "" : "");
  preencherConta(form, (r && r.conta) || "pessoal");
  const doProjetoAntes = doProjeto || (r && String(r.id || "").startsWith("p:"));
  $("#dica-rec-projeto").hidden = !doProjeto;
  $("#btn-apagar-recorrente").hidden = !r;
  $("#btn-apagar-recorrente").textContent = doProjetoAntes ? "Tirar" : "Apagar";
  $("#erro-recorrente").hidden = true;
  $("#dlg-recorrente").showModal();
  form.elements.nome.focus();
}

async function salvarRecorrente(e) {
  e.preventDefault();
  const form = e.target;
  const falha = (texto) => {
    $("#erro-recorrente").textContent = texto;
    $("#erro-recorrente").hidden = false;
  };
  const nome = form.elements.nome.value.trim().slice(0, 100);
  const valor = numeroDigitado(form.elements.valor.value);
  const dia = parseInt(form.elements.dia.value, 10);
  if (!nome) return falha("Informe o nome (ex.: aluguel).");
  if (!(valor > 0)) return falha("Informe o valor de todo mês (ex.: 1.850,00). Se ele muda, use o valor mais comum: dá para mudar só num mês na visão geral.");
  if (form.elements.dia.value && !(dia >= 1 && dia <= 31)) return falha("O dia do vencimento vai de 1 a 31.");
  const antigo = recorrentes.find((x) => x.id === editandoRec) || {};
  // Sem primeiro mês: o recorrente novo começa agora; o que veio do projeto continua valendo em todos os meses
  const semInicio = !!doProjeto || (antigo.id && !antigo.inicio);
  const inicio = form.elements.inicio.value || (semInicio ? null : mesAtual());
  const fim = form.elements.fim.value || null;
  if (fim && inicio && fim < inicio) return falha("O último mês vem depois do primeiro.");
  const { categoria, subcategoria } = lerCategoria(form);
  if (form.elements.categoria.value === NOVA && !categoria) return falha("Escreva o nome da nova categoria.");
  const r = { ...antigo, ...(doProjeto ? { busca: doProjeto.busca, variavel: doProjeto.variavel } : {}), id: antigo.id || (doProjeto ? doProjeto.chave : novoId()),
    nome, valor: Math.round(valor * 100) / 100, dia: dia || null, forma: form.elements.forma.value, categoria, subcategoria, conta: contaEscolhida(form), inicio, fim };
  const botao = form.querySelector("[type=submit]");
  botao.disabled = true;
  try {
    await guardarNaLista(categoria, subcategoria).catch(() => {});
    const lista = antigo.id ? recorrentes.map((x) => (x.id === r.id ? r : x)) : [...recorrentes.filter((x) => x.id !== r.id), r];
    // O fixo do projeto sai da lista do projeto na mesma gravação em que entra o recorrente daqui
    const ocultos = fixosOcultos();
    if (doProjeto) ocultos.add(doProjeto.chave);
    await salvarPrefs({ recorrentes: lista, ...(doProjeto ? { caixa: { fixosOcultos: [...ocultos] } } : {}) });
    painel.atualizarClassificacao({ categorias: cats });
    $("#dlg-recorrente").close();
    avisar(doProjeto ? "Fixo salvo. Agora ele é um pagamento recorrente daqui (aba Cadastros)." : antigo.id ? "Pagamento recorrente salvo." : "Pagamento recorrente cadastrado. Ele fica pendente a cada mês até você marcar como pago.");
    doProjeto = null;
  } catch (err) {
    falha("Não foi possível salvar: " + err.message);
  } finally {
    botao.disabled = false;
  }
}

async function apagarRecorrente() {
  // Fixo do projeto (ainda não editado): só sai da lista; dá para restaurar nos Cadastros
  if (doProjeto) {
    const nome = $("#form-recorrente").elements.nome.value || doProjeto.chave.slice(2);
    if (!confirm(`Tirar o fixo "${nome}" do projeto Financeiro? Ele deixa de ficar pendente todo mês. Dá para restaurar na aba Cadastros.`)) return;
    try {
      const ocultos = fixosOcultos();
      ocultos.add(doProjeto.chave);
      await salvarPrefs({ caixa: { fixosOcultos: [...ocultos] } });
      doProjeto = null;
      $("#dlg-recorrente").close();
      avisar(`${nome} saiu dos pagamentos recorrentes.`);
    } catch (err) {
      $("#erro-recorrente").textContent = "Não foi possível tirar: " + err.message;
      $("#erro-recorrente").hidden = false;
    }
    return;
  }
  const r = recorrentes.find((x) => x.id === editandoRec);
  if (!r || !confirm(`Apagar o pagamento recorrente "${r.nome}"? Os pagamentos já marcados continuam nos gastos.`)) return;
  try {
    await salvarRecorrentes(recorrentes.filter((x) => x.id !== r.id));
    $("#dlg-recorrente").close();
    avisar("Pagamento recorrente apagado.");
  } catch (err) {
    $("#erro-recorrente").textContent = "Não foi possível apagar: " + err.message;
    $("#erro-recorrente").hidden = false;
  }
}

// Valor de um recorrente só num mês (null volta ao valor de todo mês). Guarda só os meses do último ano em diante.
async function mudarValorRecorrente(id, mes, valor) {
  const r = recorrentes.find((x) => x.id === id);
  if (!r) return;
  const valores = {};
  const limite = `${Number(mesAtual().slice(0, 4)) - 1}${mesAtual().slice(4)}`;
  for (const [k, v] of Object.entries(r.valores || {})) if (k >= limite) valores[k] = v;
  if (valor == null || Math.abs(valor - Number(r.valor)) < 0.005) delete valores[mes];
  else valores[mes] = valor;
  await salvarRecorrentes(recorrentes.map((x) => (x.id === id ? { ...x, valores } : x)));
  avisar(valores[mes] != null ? "Valor do mês salvo. Os outros meses continuam com o valor de sempre." : "O mês voltou ao valor de sempre.");
}

function desmarcarPagamento(idGasto, nome) {
  return apagarGasto(idGasto, `Desmarcar o pagamento de "${nome}"? O gasto lançado ao marcar como pago será apagado.`, `${nome} voltou a ficar pendente.`);
}

// Lista nos Cadastros: os recorrentes daqui e os fixos do projeto Financeiro que continuam valendo
let fixosProjeto = [];
function desenharRecorrentesCad() {
  fixosProjeto = painel && painel.fixosDoProjeto ? painel.fixosDoProjeto() : [];
  const lista = [...recorrentes, ...fixosProjeto.map((f, i) => ({ ...f, projeto: i }))].sort((a, b) => (a.dia || 99) - (b.dia || 99) || a.nome.localeCompare(b.nome));
  const mes = mesAtual();
  $("#lista-recorrentes").innerHTML = lista.length ? lista.map((r) => {
    const encerrado = r.fim && r.fim < mes;
    const detalhe = [r.projeto != null ? "do projeto Financeiro" : "", FORMAS_REC[r.forma] || "Outro", r.dia ? `vence dia ${r.dia}` : "", r.categoria || "",
      encerrado ? `terminou em ${r.fim.slice(5)}/${r.fim.slice(0, 4)}` : r.inicio && r.inicio > mes ? `começa em ${r.inicio.slice(5)}/${r.inicio.slice(0, 4)}` : ""].filter(Boolean);
    const editar = r.projeto != null ? `data-editar-fixo="${r.projeto}"` : `data-editar-rec="${esc(r.id)}"`;
    return `<div class="rec-cad${encerrado ? " encerrado" : ""}"><div><b>${esc(r.nome)}</b><small>${esc(detalhe.join(" · "))}</small></div>
      <span class="num">${r.valor != null ? brl(Number(r.valor) || 0) : "—"}</span><button type="button" class="btn-link" ${editar}>Editar</button></div>`;
  }).join("") : '<p class="muted" style="margin:0">Nenhum pagamento recorrente cadastrado.</p>';
  // Fixos do projeto tirados (sem um recorrente daqui no lugar): dá para restaurar
  const tirados = [...fixosOcultos()].filter((k) => !recorrentes.some((r) => r.id === k));
  $("#fixos-ocultos").hidden = !tirados.length;
  $("#fixos-ocultos").innerHTML = tirados.length ? `Fixos do projeto tirados: ${tirados.map((k) => `${esc(k.slice(2))} <button type="button" class="btn-link" data-restaurar-fixo="${esc(k)}">Restaurar</button>`).join(" · ")}` : "";
}

async function restaurarFixo(chave) {
  const ocultos = fixosOcultos();
  ocultos.delete(chave);
  try {
    await salvarPrefs({ caixa: { fixosOcultos: [...ocultos] } });
    avisar(`${chave.slice(2)} voltou aos pagamentos recorrentes.`);
  } catch (err) {
    avisar("Não foi possível restaurar: " + err.message);
  }
}

// Previsões do mês (investimento mensal e fatura do cartão): vêm do projeto e podem ser trocadas aqui
function preencherMetas() {
  const form = $("#form-metas");
  const m = (painel && painel.metas) || {};
  form.elements.investimento_mensal.value = m.investimento_mensal ? valorBR(Number(m.investimento_mensal)) : "";
  form.elements.investimento_nome.value = m.investimento_nome || "";
  form.elements.cartao_mensal.value = m.cartao_mensal != null ? valorBR(Number(m.cartao_mensal)) : "";
  $("#erro-metas").hidden = true;
}

async function salvarMetas(e) {
  e.preventDefault();
  const form = e.target;
  const falha = (texto) => {
    $("#erro-metas").textContent = texto;
    $("#erro-metas").hidden = false;
  };
  const ler = (nome) => {
    const t = form.elements[nome].value.trim();
    return t ? numeroDigitado(t) : 0;
  };
  const inv = ler("investimento_mensal");
  const cartao = ler("cartao_mensal");
  if (inv == null || inv < 0) return falha("Investimento mensal inválido (ex.: 1.500,00).");
  if (cartao == null || cartao < 0) return falha("Previsão do cartão inválida (ex.: 6.500,00).");
  const botao = form.querySelector("[type=submit]");
  botao.disabled = true;
  try {
    // Em branco vira zero (e não volta para o valor do projeto)
    await salvarPrefs({ caixa: { metas: { investimento_mensal: Math.round(inv * 100) / 100, investimento_nome: form.elements.investimento_nome.value.trim().slice(0, 80),
      cartao_mensal: cartao ? Math.round(cartao * 100) / 100 : null } } });
    preencherMetas();
    avisar("Previsões do mês salvas.");
  } catch (err) {
    falha("Não foi possível salvar: " + err.message);
  } finally {
    botao.disabled = false;
  }
}

// Os links "alterar" da visão geral levam para as previsões nos Cadastros
function abrirMetas() {
  $("#tab-cadastros").click();
  // Com plano de aportes, o investimento do mês muda lá
  if (!$("#cad-plano").hidden && $("#lista-plano [data-editar-degrau]")) {
    $("#cad-plano").scrollIntoView({ block: "start" });
    $("#btn-novo-degrau").focus();
    return;
  }
  preencherMetas();
  $("#cad-metas").scrollIntoView({ block: "start" });
  $("#form-metas").elements.investimento_mensal.focus();
}

function prepararRecorrentes() {
  const form = $("#form-recorrente");
  form.elements.dia.innerHTML = '<option value="">—</option>' + Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join("");
  prepararCategorias(form);
  form.addEventListener("submit", salvarRecorrente);
  for (const nome of ["inicio", "fim", "parcelas"]) form.elements[nome].addEventListener("input", () => sincronizarTermino(form, TERMINO_REC, nome));
  form.elements.valor.addEventListener("input", () => sincronizarTermino(form, TERMINO_REC, null));
  $("#btn-apagar-recorrente").addEventListener("click", apagarRecorrente);
  $("#btn-novo-recorrente").addEventListener("click", () => abrirRecorrente(null));
  $("#lista-recorrentes").addEventListener("click", (e) => {
    const b = e.target.closest("[data-editar-rec]");
    if (b) abrirRecorrente(b.dataset.editarRec);
    const f = e.target.closest("[data-editar-fixo]");
    if (f && fixosProjeto[Number(f.dataset.editarFixo)]) abrirRecorrente(null, fixosProjeto[Number(f.dataset.editarFixo)]);
  });
  $("#fixos-ocultos").addEventListener("click", (e) => {
    const b = e.target.closest("[data-restaurar-fixo]");
    if (b) restaurarFixo(b.dataset.restaurarFixo);
  });
  $("#form-metas").addEventListener("submit", salvarMetas);
}

// ---------------------------------------------------------------- investimentos individuais no caixa
// Aplicação: gasto na categoria Investimentos (sai como investimento no fluxo de caixa, não como gasto do mês), com o
// tipo como subcategoria. Resgate: entrada avulsa.
async function lancarInvestimentoNoCaixa({ data, descricao, valor, forma, subcategoria, conta }) {
  const categoria = (cats.lista.find((c) => /^investiment/i.test(semAcento(c.nome))) || {}).nome || "Investimentos";
  const salvo = await armazem.financas.salvarGasto({ perfil_id: dono.id, data, descricao, valor, forma: forma || "pix", parcelas: 1, categoria, subcategoria: subcategoria || null,
    conta: conta || null, essencial: null, observacao: null });
  gastos.push(salvo);
  await guardarNaLista(categoria, subcategoria).catch(() => {});
  painel.atualizarGastos(gastos);
  painel.atualizarClassificacao({ categorias: cats });
}

async function lancarResgateNoCaixa({ data, descricao, liquido, conta }) {
  const salvo = await armazem.financas.salvarEntrada({ perfil_id: dono.id, tipo: "outro", data, descricao, liquido, conta: conta || null, recebimento: "avulso", repete: false });
  entradas.push(salvo);
  painel.atualizarEntradas(entradas);
}

// ---------------------------------------------------------------- entradas: salário (holerite) e outros recebimentos
let liquidoDigitado = false; // com o líquido digitado à mão, ele deixa de ser calculado
const formEntrada = () => $("#form-entrada");
const valorBR = (v) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const linhaDesconto = (nome = "", valor = null) => `<div class="desconto-linha">
  <input name="desconto_nome" list="nomes-desconto" maxlength="60" autocomplete="off" placeholder="ex.: INSS" aria-label="Nome do desconto" value="${esc(nome)}">
  <input name="desconto_valor" inputmode="decimal" autocomplete="off" placeholder="0,00" aria-label="Valor do desconto" value="${valor > 0 ? valorBR(valor) : ""}">
  <button type="button" class="btn-link" data-tirar-desconto aria-label="Tirar este desconto">Tirar</button></div>`;

function descontosDigitados() {
  return [...$("#descontos-entrada").querySelectorAll(".desconto-linha")]
    .map((l) => ({ nome: l.querySelector("[name=desconto_nome]").value.trim(), valor: numeroDigitado(l.querySelector("[name=desconto_valor]").value) }))
    .filter((d) => d.valor);
}

function calcularLiquido() {
  const form = formEntrada();
  if (liquidoDigitado || form.elements.tipo.value !== "salario") return;
  const bruto = numeroDigitado(form.elements.bruto.value);
  if (!(bruto > 0)) return;
  const liquido = Math.round((bruto - descontosDigitados().reduce((t, d) => t + d.valor, 0)) * 100) / 100;
  form.elements.liquido.value = liquido > 0 ? valorBR(liquido) : "";
}

function atualizarTipoEntrada() {
  const form = formEntrada();
  const salario = form.elements.tipo.value === "salario";
  form.querySelectorAll("[data-so-salario]").forEach((el) => { el.hidden = !salario; });
  $("#dica-liquido").hidden = !salario;
  if (salario && !form.elements.descricao.value.trim()) form.elements.descricao.value = "Salário";
  if (!salario && form.elements.descricao.value === "Salário") form.elements.descricao.value = "";
  calcularLiquido();
}

// Mês de trabalho a que a entrada se refere: o anterior ao recebimento (trabalha e recebe depois) ou o próprio
const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const somarMes = (chave, k) => { const [a, m] = chave.split("-").map(Number); const t = a * 12 + m - 1 + k; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`; };
const rotuloMes = (chave) => `${MESES_CURTOS[Number(chave.slice(5, 7)) - 1]}/${chave.slice(2, 4)}`;
const referenciaPadrao = (data, recebimento) => (recebimento === "depois" ? somarMes(data.slice(0, 7), -1) : data.slice(0, 7));

function atualizarReferencia(manterEscolha) {
  const form = formEntrada();
  const data = form.elements.data.value || hojeISO();
  const recebimento = form.elements.recebimento.value;
  const sel = form.elements.referencia;
  const antes = sel.value;
  const meses = [-3, -2, -1, 0, 1].map((k) => somarMes(data.slice(0, 7), k));
  sel.innerHTML = meses.map((c) => `<option value="${c}">${rotuloMes(c)}</option>`).join("");
  sel.value = manterEscolha && meses.includes(antes) ? antes : referenciaPadrao(data, recebimento);
  form.querySelector("[data-campo-referencia]").hidden = recebimento === "avulso";
}

// Entrada nova, edição de uma entrada lançada (idEntrada) ou confirmação de uma prevista (modelo: os campos dela)
let editandoEntrada = null; // id da entrada em edição (null: entrada nova)
function abrirEntrada(idEntrada = null, modelo = null) {
  const form = formEntrada();
  form.reset();
  editandoEntrada = typeof idEntrada === "string" ? idEntrada : null;
  const base = editandoEntrada ? entradas.find((x) => x.id === editandoEntrada) : modelo && typeof modelo === "object" ? modelo : null;
  $("#erro-entrada").hidden = true;
  $("#titulo-entrada").textContent = editandoEntrada ? "Editar entrada" : base ? "Confirmar recebimento" : "Lançar entrada";
  form.querySelector("[type=submit]").textContent = editandoEntrada ? "Salvar" : base ? "Confirmar recebimento" : "Lançar";
  if (!base) {
    editandoEntrada = null;
    form.elements.data.value = hojeISO();
    // Os descontos mais comuns já vêm com o nome; os que ficarem sem valor não entram
    $("#descontos-entrada").innerHTML = ["INSS", "IRRF", "Plano de saúde"].map((d) => linhaDesconto(d)).join("");
    preencherConta(form, "pessoal");
    liquidoDigitado = false;
    atualizarTipoEntrada();
    escolherRecebimento();
    $("#dlg-entrada").showModal();
    form.elements.bruto.focus();
    return;
  }
  const salario = base.tipo === "salario";
  form.elements.tipo.value = salario ? "salario" : "outro";
  form.elements.descricao.value = base.descricao || "";
  form.elements.data.value = base.data || hojeISO();
  form.elements.bruto.value = base.bruto != null ? valorBR(Number(base.bruto)) : "";
  const descontos = base.descontos || [];
  $("#descontos-entrada").innerHTML = (descontos.length ? descontos.map((d) => linhaDesconto(d.nome, Number(d.valor))) : ["INSS", "IRRF", "Plano de saúde"].map((d) => linhaDesconto(d))).join("");
  form.elements.liquido.value = valorBR(Number(base.liquido));
  liquidoDigitado = true; // o valor que veio fica, até mudar o bruto ou os descontos
  preencherConta(form, base.conta || "pessoal");
  form.elements.observacao.value = base.observacao || "";
  atualizarTipoEntrada();
  form.elements.recebimento.value = base.recebimento || (salario ? "depois" : "avulso");
  form.elements.repete.checked = !!base.repete;
  atualizarReferencia(false);
  const sel = form.elements.referencia;
  if (base.referencia) {
    if (![...sel.options].some((o) => o.value === base.referencia)) sel.insertAdjacentHTML("afterbegin", `<option value="${esc(base.referencia)}">${rotuloMes(base.referencia)}</option>`);
    sel.value = base.referencia;
  }
  $("#dlg-entrada").showModal();
  form.elements.liquido.focus();
}

// Entrada prevista dada como recebida (botão ✓ Recebida): a lançada no site muda só a data; a que repete todo mês ou
// a estimativa vira uma entrada nova, com o valor previsto
async function receberEntrada({ id, entrada }) {
  try {
    let salvo;
    if (id) {
      const atual = entradas.find((x) => x.id === id);
      if (!atual) return;
      salvo = await armazem.financas.editarEntrada(id, { ...atual, data: entrada.data });
      entradas = entradas.map((x) => (x.id === id ? salvo : x));
    } else {
      salvo = await armazem.financas.salvarEntrada({ perfil_id: dono.id, ...entrada });
      entradas.push(salvo);
    }
    painel.atualizarEntradas(entradas);
    avisar(`${salvo.descricao}: ${brl(salvo.liquido)} recebido em ${dataBR(salvo.data)}.`);
  } catch (err) {
    avisar("Não foi possível dar como recebida: " + err.message);
  }
}

async function lancarEntrada(e) {
  e.preventDefault();
  const form = e.target;
  const erroEntrada = $("#erro-entrada");
  const falha = (texto) => {
    erroEntrada.textContent = texto;
    erroEntrada.hidden = false;
  };
  erroEntrada.hidden = true;
  const salario = form.elements.tipo.value === "salario";
  const liquido = numeroDigitado(form.elements.liquido.value);
  if (!(liquido > 0)) return falha("Informe o valor líquido (ex.: 6.310,82).");
  if (!form.elements.descricao.value.trim()) return falha("Informe a descrição.");
  if (!form.elements.data.value) return falha("Informe a data em que entrou.");
  const descontos = salario ? descontosDigitados() : [];
  if (descontos.some((d) => !d.nome)) return falha("Dê um nome a cada desconto com valor (ex.: INSS).");
  if (descontos.some((d) => !(d.valor > 0))) return falha("Os descontos precisam ter valor maior que zero.");
  const bruto = salario ? numeroDigitado(form.elements.bruto.value) : null;
  const botao = form.querySelector("[type=submit]");
  botao.disabled = true;
  const confirmando = !editandoEntrada && $("#titulo-entrada").textContent === "Confirmar recebimento";
  try {
    const campos = {
      perfil_id: dono.id,
      data: form.elements.data.value,
      tipo: salario ? "salario" : "outro",
      descricao: form.elements.descricao.value,
      bruto: bruto > 0 ? bruto : null,
      descontos,
      liquido,
      conta: contaEscolhida(form),
      observacao: form.elements.observacao.value,
      recebimento: form.elements.recebimento.value || null,
      referencia: form.elements.recebimento.value === "avulso" ? null : form.elements.referencia.value,
      repete: form.elements.repete.checked,
    };
    const editada = editandoEntrada;
    const salvo = editada ? await armazem.financas.editarEntrada(editada, campos) : await armazem.financas.salvarEntrada(campos);
    entradas = editada ? entradas.map((x) => (x.id === editada ? salvo : x)) : [...entradas, salvo];
    editandoEntrada = null;
    painel.atualizarEntradas(entradas);
    // A entrada conta no mês da data em que entrou: a visão geral vai para esse mês
    const mesEntrou = salvo.data.slice(0, 7);
    painel.mostrarMes(mesEntrou);
    $("#dlg-entrada").close();
    const trabalho = salvo.referencia && salvo.referencia !== mesEntrou ? ` (trabalho de ${rotuloMes(salvo.referencia)})` : "";
    avisar(editada ? `Entrada atualizada: ${brl(salvo.liquido)} em ${dataBR(salvo.data)}.`
      : confirmando ? `${salvo.descricao}: ${brl(salvo.liquido)} recebido em ${dataBR(salvo.data)}.`
      : `${salario ? "Salário lançado" : "Entrada lançada"}: ${brl(salvo.liquido)} no caixa de ${rotuloMes(mesEntrou)}${trabalho}.`);
  } catch (err) {
    falha((editandoEntrada ? "Não foi possível salvar: " : "Não foi possível lançar: ") + err.message);
  } finally {
    botao.disabled = false;
  }
}

async function apagarEntrada(idEntrada) {
  const ent = entradas.find((x) => x.id === idEntrada);
  if (!ent || !confirm(`Apagar a entrada "${ent.descricao}" lançada pelo site?`)) return;
  try {
    await armazem.financas.apagarEntrada(idEntrada);
    entradas = entradas.filter((x) => x.id !== idEntrada);
    painel.atualizarEntradas(entradas);
    avisar("Entrada apagada.");
  } catch (err) {
    avisar("Não foi possível apagar: " + err.message);
  }
}

// Salário: trabalha e recebe depois, todo mês; outro recebimento: avulso (dá para trocar)
function escolherRecebimento() {
  const form = formEntrada();
  const salario = form.elements.tipo.value === "salario";
  form.elements.recebimento.value = salario ? "depois" : "avulso";
  form.elements.repete.checked = salario;
  atualizarReferencia(false);
}

// Mudar como é o recebimento de uma entrada já lançada (no fluxo de caixa)
async function mudarRecebimento(idEntrada, campos) {
  const ent = entradas.find((x) => x.id === idEntrada);
  if (!ent) return;
  const novo = { recebimento: ent.recebimento, referencia: ent.referencia, repete: !!ent.repete, ...campos };
  if (campos.recebimento) novo.referencia = campos.recebimento === "avulso" ? null : referenciaPadrao(ent.data, campos.recebimento);
  try {
    const salvo = await armazem.financas.atualizarEntrada(idEntrada, novo);
    entradas = entradas.map((x) => (x.id === idEntrada ? salvo : x));
    painel.atualizarEntradas(entradas);
    avisar("Recebimento atualizado.");
  } catch (err) {
    avisar("Não foi possível atualizar: " + err.message);
    painel.atualizarEntradas(entradas);
  }
}

// Saldo da conta no início de um mês (fluxo de caixa): os meses seguintes continuam a partir dele
async function salvarSaldoInicial(chave, valor) {
  const saldos = { ...((prefs && prefs.caixa && prefs.caixa.saldos) || {}) };
  if (valor == null) delete saldos[chave];
  else saldos[chave] = Math.round(valor * 100) / 100;
  await salvarPrefs({ caixa: { saldos } });
  avisar(valor == null ? "Saldo do início do mês apagado." : "Saldo do início do mês salvo.");
}

function prepararEntrada() {
  const form = formEntrada();
  $("#tipos-entrada").addEventListener("change", () => {
    atualizarTipoEntrada();
    escolherRecebimento();
  });
  $("#recebimento-entrada").addEventListener("change", () => atualizarReferencia(false));
  form.elements.data.addEventListener("change", () => atualizarReferencia(false));
  form.addEventListener("input", (e) => {
    if (e.target.name === "liquido") liquidoDigitado = !!e.target.value.trim();
    else if (e.target.name === "bruto" || e.target.name === "desconto_valor") calcularLiquido();
  });
  $("#btn-mais-desconto").addEventListener("click", () => {
    $("#descontos-entrada").insertAdjacentHTML("beforeend", linhaDesconto());
    $("#descontos-entrada").lastElementChild.querySelector("input").focus();
  });
  $("#descontos-entrada").addEventListener("click", (e) => {
    const tirar = e.target.closest("[data-tirar-desconto]");
    if (!tirar) return;
    tirar.closest(".desconto-linha").remove();
    calcularLiquido();
  });
  form.addEventListener("submit", lancarEntrada);
  $("#btn-entrada-topo").addEventListener("click", () => abrirEntrada());
  // Menu "+ Mais" do topo: fecha ao escolher, ao clicar fora e com Esc
  const menu = $("#menu-mais");
  menu.addEventListener("click", (e) => { if (e.target.closest(".menu-mais-lista button, .menu-mais-lista a")) menu.open = false; });
  document.addEventListener("click", (e) => { if (menu.open && !menu.contains(e.target)) menu.open = false; });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && menu.open) { menu.open = false; menu.querySelector("summary").focus(); } });
  // Sem nenhuma ação disponível (ex.: visão do casal), o menu some
  const itensMenu = [...menu.querySelectorAll(".menu-mais-lista > *")];
  const ajustarMenu = () => { const v = !itensMenu.some((el) => !el.hidden); if (menu.hidden !== v) menu.hidden = v; };
  new MutationObserver(ajustarMenu).observe(menu, { subtree: true, attributes: true, attributeFilter: ["hidden"] });
  ajustarMenu();
}

// ---------------------------------------------------------------- classificar um lançamento
let classificando = null; // lançamento aberto no diálogo (vem do painel)
const rotuloEss = (v) => (v === true ? "essencial" : v === false ? "não essencial" : "sem classificação");

function erroClassificar(texto) {
  $("#erro-classificar").textContent = texto;
  $("#erro-classificar").hidden = !texto;
}

// "Padrão": o que vem do projeto ou, sem isso, o padrão da categoria escolhida
function atualizarPadraoEssencial() {
  const form = $("#form-classificar");
  const base = classificando.site ? null : classificando.essencialOriginal;
  const padrao = base ?? (categoriaDe(cats, lerCategoria(form).categoria || "") || {}).essencial ?? null;
  $("#rotulo-essencial-padrao").textContent = base != null ? `Como veio do projeto (${rotuloEss(padrao)})` : `Padrão da categoria (${rotuloEss(padrao)})`;
}

function abrirClassificacao(item) {
  classificando = item;
  const form = $("#form-classificar");
  form.reset();
  erroClassificar("");
  const quando = item.data ? dataBR(item.data) : "";
  const origem = item.site ? "Lançado no site" : item.tipo === "fatura" ? `Fatura ${item.mes || ""}` : "Gastos do dia a dia (projeto Financeiro)";
  $("#classificar-info").innerHTML = `<b>${esc(item.titulo)}</b><span>${[quando, brl(item.valor), item.parcela ? `parcela ${esc(item.parcela)}` : ""].filter(Boolean).join(" · ")}</span><small>${esc(origem)}</small>`;
  const a = item.atual;
  preencherCategorias(form, a.categoria, a.subcategoria);
  // Essencial escolhido: no gasto do site, o que foi gravado nele; nos do projeto, o ajuste (sem ajuste: "padrão")
  const escolhido = item.site ? (gastos.find((g) => g.id === item.id) || {}).essencial ?? null : item.ajuste ? item.ajuste.essencial : null;
  form.elements.essencial.value = escolhido === true ? "sim" : escolhido === false ? "nao" : "";
  atualizarPadraoEssencial();
  preencherConta(form, a.conta);
  montarDivisao(form, { total: Number(item.valor) || 0, partes: a.partes ? partesDe(a, Number(item.valor) || 0) : null,
    categoria: a.categoria, subcategoria: a.subcategoria, conta: a.conta });
  form.elements.complemento.value = a.complemento || "";
  $("#dica-classificar").hidden = item.site;
  $("#btn-desfazer-classificacao").hidden = item.site || !item.ajuste;
  $("#dlg-classificar").showModal();
  form.elements.categoria.focus();
}

// Grava a classificação de um lançamento e do seu par (a compra da fatura e o gasto do dia a dia conferido com ela
// são o mesmo lançamento). No gasto lançado pelo site, grava no próprio gasto; nos outros, só o que muda em relação
// ao que veio do projeto ou da fatura. redesenhar: false para gravar vários e redesenhar o painel uma vez no fim.
// partes: a divisão em categorias (null tira a divisão; sem o campo, a divisão que houver continua)
async function gravarClassificacao(item, { categoria, subcategoria, essencial, conta, complemento, partes }, { redesenhar = true } = {}) {
  await guardarNaLista(categoria, subcategoria);
  const comPartes = partes !== undefined ? { partes } : {};
  let mexeuGastos = false;
  for (const alvo of [item, ...(item.par ? [item.par] : [])]) {
    if (alvo.site) {
      const salvo = await armazem.financas.atualizarGasto(alvo.id, { categoria, subcategoria, essencial, observacao: complemento, conta, ...comPartes });
      gastos = gastos.map((g) => (g.id === salvo.id ? salvo : g));
      mexeuGastos = true;
      continue;
    }
    const existente = ajustes.find((x) => x.chave === alvo.chave);
    const linha = { perfil_id: dono.id, chave: alvo.chave, categoria: categoria && !igual(categoria, alvo.original.categoria) ? categoria : null,
      subcategoria, essencial, complemento, conta, ...(partes !== undefined ? { partes } : existente && existente.partes ? { partes: existente.partes } : {}) };
    const vazio = !linha.categoria && !linha.subcategoria && linha.essencial == null && !linha.complemento && !linha.conta && !linha.partes;
    if (vazio) {
      if (existente) await armazem.financas.apagarAjuste(existente.id);
      ajustes = ajustes.filter((x) => x.chave !== alvo.chave);
    } else {
      const [salvo] = await armazem.financas.salvarAjustes([linha]);
      ajustes = [...ajustes.filter((x) => x.chave !== alvo.chave), salvo];
    }
  }
  if (!redesenhar) return mexeuGastos;
  if (mexeuGastos) painel.atualizarGastos(gastos);
  painel.atualizarClassificacao({ ajustes, categorias: cats });
  return mexeuGastos;
}

const SEM_OUTROS = "Escolha a categoria. “Outros” fica só para o ajuste de gastos não detalhados.";

async function salvarClassificacao(e) {
  e.preventDefault();
  const form = e.target;
  const item = classificando;
  const div = lerDivisao(form);
  if (div.erro) return erroClassificar(div.erro);
  let { categoria, subcategoria } = lerCategoria(form);
  if (div.partes) ({ categoria, subcategoria } = div.maior); // dividido: a categoria do lançamento é a da maior parte
  else if (form.elements.categoria.value === NOVA && !categoria) return erroClassificar("Escreva o nome da nova categoria.");
  if (semClassificacao(categoria)) return erroClassificar(SEM_OUTROS);
  const ess = form.elements.essencial.value;
  const essencial = ess === "sim" ? true : ess === "nao" ? false : null;
  const conta = contas.length > 1 ? contaEscolhida(form) : item.atual.conta === "pessoal" ? null : item.atual.conta;
  const complemento = form.elements.complemento.value.trim() || null;
  const botao = form.querySelector("[type=submit]");
  botao.disabled = true;
  try {
    await gravarClassificacao(item, { categoria, subcategoria, essencial, conta, complemento, partes: div.partes });
    $("#dlg-classificar").close();
    const dividido = div.partes ? ` Dividido em ${div.partes.length} categorias.` : "";
    avisar((item.par ? "Classificação salva na compra da fatura e no gasto do dia a dia." : "Classificação salva.") + dividido);
  } catch (err) {
    erroClassificar("Não foi possível salvar: " + err.message);
  } finally {
    botao.disabled = false;
  }
}

async function desfazerClassificacao() {
  const item = classificando;
  if (!item || !item.ajuste) return;
  try {
    await armazem.financas.apagarAjuste(item.ajuste.id);
    ajustes = ajustes.filter((x) => x.chave !== item.chave);
    const doPar = item.par && ajustes.find((x) => x.chave === item.par.chave);
    if (doPar) {
      await armazem.financas.apagarAjuste(doPar.id);
      ajustes = ajustes.filter((x) => x.chave !== doPar.chave);
    }
    painel.atualizarClassificacao({ ajustes });
    $("#dlg-classificar").close();
    avisar("O lançamento voltou à classificação do projeto Financeiro.");
  } catch (err) {
    erroClassificar("Não foi possível desfazer: " + err.message);
  }
}

function prepararClassificacao() {
  const form = $("#form-classificar");
  prepararCategorias(form);
  prepararDivisao(form);
  form.elements.categoria.addEventListener("change", atualizarPadraoEssencial);
  form.addEventListener("submit", salvarClassificacao);
  $("#btn-desfazer-classificacao").addEventListener("click", desfazerClassificacao);
  prepararPendencias();
}

// ---------------------------------------------------------------- lançamentos a classificar
// Lista no topo da página com os lançamentos sem categoria (o painel avisa quando ela muda). Escolhe-se a categoria
// e a subcategoria de cada um e salva um por um ou todos os escolhidos; "Mais opções" abre o diálogo completo.
// As tarefas pendentes do início trazem para cá (financas.html#classificar).
let pendencias = [];
let pendenciasVistas = false; // a lista já teve itens nesta visita (mostra "tudo classificado" quando zera)
const rascunho = new Map(); // chave → { categoria, subcategoria } escolhidas e ainda não salvas
const origemDe = (item) => (item.site ? "Lançado no site" : item.tipo === "fatura" ? `Fatura ${item.mes || ""}`.trim() : "Gastos do dia a dia");

function renderPendencias(lista) {
  pendencias = lista;
  const box = $("#classificar");
  if (lista.length) pendenciasVistas = true;
  box.hidden = !lista.length && !pendenciasVistas;
  $("#classificar-n").textContent = lista.length || "";
  $("#classificar-n").hidden = !lista.length;
  [...rascunho.keys()].forEach((k) => { if (!lista.some((x) => x.chave === k)) rascunho.delete(k); });
  const nomes = categoriasEscolhiveis(cats).map((c) => c.nome);
  const opcoesSub = (categoria, atual) => ((categoriaDe(cats, categoria) || {}).sub || []).map((x) => `<option value="${esc(x)}"${x === atual ? " selected" : ""}>${esc(x)}</option>`).join("");
  $("#classificar-lista").innerHTML = lista.length
    ? lista.map((item, i) => {
      const r = rascunho.get(item.chave) || {};
      return `<div class="cl-linha" data-i="${i}">
        <div class="cl-info"><b>${esc(item.titulo)}</b>
          <span>${[item.data ? dataBR(item.data) : "", brl(item.valor), item.parcela ? `parcela ${esc(item.parcela)}` : ""].filter(Boolean).join(" · ")}</span>
          <small>${esc(origemDe(item))}${item.par ? " · também nos gastos do dia a dia" : ""}</small></div>
        <label>Categoria<select data-cl-cat><option value="">Escolha…</option>${nomes.map((n) => `<option value="${esc(n)}"${n === r.categoria ? " selected" : ""}>${esc(n)}</option>`).join("")}</select></label>
        <label>Subcategoria<select data-cl-sub${r.categoria ? "" : " disabled"}><option value="">—</option>${r.categoria ? opcoesSub(r.categoria, r.subcategoria) : ""}</select></label>
        <div class="cl-botoes"><button class="btn btn-primary" type="button" data-cl-salvar${r.categoria ? "" : " disabled"}>Salvar</button>
          <button class="btn-link" type="button" data-cl-mais>Mais opções</button></div>
      </div>`;
    }).join("")
    : '<p class="cl-ok">Tudo classificado: nenhum lançamento a classificar.</p>';
  atualizarSalvarTodos();
}

function atualizarSalvarTodos() {
  const n = pendencias.filter((x) => (rascunho.get(x.chave) || {}).categoria).length;
  const b = $("#btn-classificar-todos");
  b.hidden = n < 2;
  b.textContent = `Salvar os ${n} escolhidos`;
}

// Mantém o que já estava no lançamento além da categoria (essencial, conta e complemento)
function camposRapidos(item, { categoria, subcategoria }) {
  const g = item.site ? gastos.find((x) => x.id === item.id) || {} : null;
  return { categoria, subcategoria: subcategoria || null,
    essencial: item.site ? g.essencial ?? null : item.ajuste ? item.ajuste.essencial ?? null : null,
    conta: item.atual.conta === "pessoal" ? null : item.atual.conta,
    complemento: item.site ? g.observacao || null : (item.ajuste && item.ajuste.complemento) || null };
}

async function salvarPendencias(itens) {
  const escolhidos = itens.filter((x) => (rascunho.get(x.chave) || {}).categoria);
  if (!escolhidos.length) return;
  const botoes = [...document.querySelectorAll("#classificar button")];
  botoes.forEach((b) => { b.disabled = true; });
  let mexeuGastos = false, feitos = 0;
  try {
    for (const item of escolhidos) {
      mexeuGastos = (await gravarClassificacao(item, camposRapidos(item, rascunho.get(item.chave)), { redesenhar: false })) || mexeuGastos;
      rascunho.delete(item.chave);
      feitos++;
    }
    avisar(feitos === 1 ? "Lançamento classificado." : `${feitos} lançamentos classificados.`);
  } catch (err) {
    avisar("Não foi possível salvar: " + err.message);
  } finally {
    $("#btn-classificar-todos").disabled = false;
    if (mexeuGastos) painel.atualizarGastos(gastos);
    painel.atualizarClassificacao({ ajustes, categorias: cats }); // redesenha a lista (o painel avisa as pendências)
  }
}

function prepararPendencias() {
  const lista = $("#classificar-lista");
  lista.addEventListener("change", (e) => {
    const linha = e.target.closest(".cl-linha");
    if (!linha) return;
    const item = pendencias[Number(linha.dataset.i)];
    const r = rascunho.get(item.chave) || {};
    if (e.target.matches("[data-cl-cat]")) {
      r.categoria = e.target.value || null;
      r.subcategoria = null;
      const sub = linha.querySelector("[data-cl-sub]");
      sub.innerHTML = '<option value="">—</option>' + ((categoriaDe(cats, r.categoria || "") || {}).sub || []).map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join("");
      sub.disabled = !r.categoria;
      linha.querySelector("[data-cl-salvar]").disabled = !r.categoria;
    } else if (e.target.matches("[data-cl-sub]")) r.subcategoria = e.target.value || null;
    if (r.categoria) rascunho.set(item.chave, r); else rascunho.delete(item.chave);
    atualizarSalvarTodos();
  });
  lista.addEventListener("click", (e) => {
    const linha = e.target.closest(".cl-linha");
    if (!linha) return;
    const item = pendencias[Number(linha.dataset.i)];
    if (e.target.closest("[data-cl-salvar]")) salvarPendencias([item]);
    else if (e.target.closest("[data-cl-mais]")) abrirClassificacao(item);
  });
  $("#btn-classificar-todos").addEventListener("click", () => salvarPendencias(pendencias));
}

// ---------------------------------------------------------------- cadastros: categorias, subcategorias e contas
// A aba Cadastros do painel tem a lista de categorias (com as subcategorias e o padrão essencial) e as contas de quem
// é o dinheiro. As mudanças ficam na tela até Salvar; Desfazer volta ao que está salvo.
let edicao = null; // cópia da lista em edição (original = nome com que a categoria estava salva)
let categoriasMexidas = false; // há mudança na lista que ainda não foi salva
let edicaoContas = null; // { grupos, ocultas } em edição
let fusoes = []; // categorias juntadas desde a última vez que salvou: { de (nome salvo), alvo (categoria que fica), sub }

function erroCategorias(texto) {
  $("#erro-categorias").textContent = texto;
  $("#erro-categorias").hidden = !texto;
}

function recomecarCategorias() {
  categoriasMexidas = false;
  edicao = cats.lista.map((c) => ({ ...c, sub: [...c.sub], original: c.nome }));
  fusoes = [];
  erroCategorias("");
  desenharEdicao();
}

// Os botões Categorias do painel levam para a aba Cadastros
function abrirCategorias() {
  $("#tab-cadastros").click();
  $("#cad-categorias").scrollIntoView({ block: "start" });
}

function desenharEdicao(foco) {
  const valorEss = (c) => (c.essencial === true ? "sim" : c.essencial === false ? "nao" : "");
  $("#lista-categorias").innerHTML = edicao.map((c, i) => `<div class="cat-edicao" data-i="${i}">
      <div class="cat-edicao-topo">
        <label>Categoria<input data-campo="nome" value="${esc(c.nome)}" maxlength="60" autocomplete="off"></label>
        <label>Padrão<select data-campo="essencial">${[["sim", "Essencial"], ["nao", "Não essencial"], ["", "Depende"]]
          .map(([v, r]) => `<option value="${v}"${valorEss(c) === v ? " selected" : ""}>${r}</option>`).join("")}</select></label>
        <button type="button" class="btn-link" data-remover-cat>Remover</button>
      </div>
      <div class="subs">${c.sub.map((s, j) => `<span class="sub-chip">${esc(s)}<button type="button" data-remover-sub="${j}" aria-label="Remover ${esc(s)}">×</button></span>`).join("")}
        <span class="sub-nova"><input data-campo="nova-sub" placeholder="Nova subcategoria" maxlength="60" autocomplete="off" aria-label="Nova subcategoria de ${esc(c.nome || "nova categoria")}"><button type="button" class="btn sec mini" data-add-sub>Adicionar</button></span>
      </div>
    </div>`).join("");
  if (foco) {
    const el = $(`#lista-categorias .cat-edicao[data-i="${foco.i}"] [data-campo="${foco.campo}"]`);
    if (el) el.focus();
  }
  desenharJuntar();
}

// Juntar categorias: cada marcada vira uma subcategoria da que fica (o nome dela ou o escrito ao lado)
function desenharJuntar() {
  const marcadas = new Set([...document.querySelectorAll("#juntar-lista [data-juntar]:checked")].map((x) => x.value));
  $("#juntar-lista").innerHTML = edicao.map((c, i) => (c.nome.trim() ? `<div class="juntar-linha">
      <label><input type="checkbox" data-juntar value="${i}"${marcadas.has(String(i)) ? " checked" : ""}> ${esc(c.nome)}</label>
      <label class="juntar-sub"${marcadas.has(String(i)) ? "" : " hidden"}>vira a subcategoria<input data-juntar-sub="${i}" value="${esc(c.nome)}" maxlength="60" autocomplete="off"></label>
    </div>` : "")).join("");
  $("#juntar-nomes").innerHTML = edicao.filter((c) => c.nome.trim()).map((c) => `<option value="${esc(c.nome)}"></option>`).join("");
}

function juntarMarcadas() {
  const erro = (t) => { $("#erro-juntar").textContent = t; $("#erro-juntar").hidden = !t; };
  const marcadas = [...document.querySelectorAll("#juntar-lista [data-juntar]:checked")].map((x) => edicao[Number(x.value)]).filter(Boolean);
  const subDe = {};
  for (const x of document.querySelectorAll("#juntar-lista [data-juntar-sub]")) {
    const c = edicao[Number(x.dataset.juntarSub)];
    if (c && x.value.trim()) subDe[c.nome] = x.value.trim();
  }
  try {
    const { lista, mudancas } = juntarCategorias(edicao, marcadas.map((c) => c.nome), $("#juntar-destino").value, subDe);
    const existente = edicao.find((c) => igual(c.nome, $("#juntar-destino").value));
    const alvo = lista.find((c) => mudancas.length && c.nome === mudancas[0].para);
    alvo.original = existente ? existente.original : null;
    for (const m of mudancas) {
      const fonte = marcadas.find((c) => c.nome === m.de);
      fusoes.push({ de: (fonte && fonte.original) || m.de, alvo, sub: m.sub });
      // Juntada antes nesta mesma edição: passa a apontar para a nova categoria que fica
      fusoes.forEach((f) => { if (f.alvo === fonte) f.alvo = alvo; });
    }
    edicao = lista;
    categoriasMexidas = true;
    erro("");
    $("#juntar-destino").value = "";
    desenharEdicao();
    document.querySelectorAll("#juntar-lista [data-juntar]").forEach((x) => { x.checked = false; });
    desenharJuntar();
    avisar(`${plural(mudancas.length, "categoria juntada", "categorias juntadas")} em ${alvo.nome}. Confira e clique em Salvar categorias.`);
  } catch (err) {
    erro(err.message);
  }
}

function adicionarSub(div) {
  const i = Number(div.dataset.i);
  const input = div.querySelector('[data-campo="nova-sub"]');
  const nome = input.value.trim().slice(0, 60);
  if (!nome) return;
  if (!edicao[i].sub.some((s) => igual(s, nome))) edicao[i].sub.push(nome);
  desenharEdicao({ i, campo: "nova-sub" });
}

async function salvarEdicao() {
  const lista = edicao.map((c) => ({ ...c, nome: c.nome.trim() })).filter((c) => c.nome);
  const vistos = new Set();
  for (const c of lista) {
    if (vistos.has(semAcento(c.nome))) return erroCategorias(`A categoria "${c.nome}" aparece duas vezes.`);
    vistos.add(semAcento(c.nome));
  }
  // Categoria renomeada: os lançamentos importados continuam com o nome antigo, que passa a apontar para o novo
  const trocas = lista.filter((c) => c.original && c.original !== c.nome).map((c) => [c.original, c.nome]);
  const renomeadas = { ...cats.renomeadas };
  for (const [antigo, novo] of trocas) {
    for (const k of Object.keys(renomeadas)) if (renomeadas[k] === antigo) renomeadas[k] = novo;
    renomeadas[antigo] = novo;
  }
  // Categorias juntadas: o nome antigo aponta para a que ficou e o lançamento sem subcategoria ganha a que ela virou
  const fus = fusoes.map((f) => ({ de: f.de, para: f.alvo.nome.trim(), sub: f.sub })).filter((f) => f.para && !igual(f.de, f.para));
  const subPadrao = { ...(cats.subPadrao || {}) };
  for (const f of fus) {
    for (const k of Object.keys(renomeadas)) if (renomeadas[k] === f.de) renomeadas[k] = f.para;
    renomeadas[f.de] = f.para;
    subPadrao[f.de] = f.sub;
  }
  for (const c of lista) { delete renomeadas[c.nome]; delete subPadrao[c.nome]; } // nome em uso não é desviado para outro
  // Para onde vai um lançamento classificado com uma categoria: renomeada e, se juntada, a subcategoria que ela virou
  const mover = (nome) => {
    if (!nome) return null;
    let categoria = nome, sub = null, mudou = false;
    const troca = trocas.find(([antigo]) => antigo === categoria);
    if (troca) { categoria = troca[1]; mudou = true; }
    for (const f of fus) if (igual(f.de, categoria)) { categoria = f.para; sub = sub || f.sub; mudou = true; }
    return mudou ? { categoria, sub } : null;
  };
  const botao = $("#btn-salvar-categorias");
  botao.disabled = true;
  erroCategorias("");
  try {
    // Lançamentos já classificados com o nome antigo passam para o novo (e, se juntada, para a subcategoria dela)
    const mudar = ajustes.filter((a) => mover(a.categoria));
    if (mudar.length) {
      const salvos = await armazem.financas.salvarAjustes(mudar.map((a) => {
        const d = mover(a.categoria);
        return { ...a, categoria: d.categoria, subcategoria: a.subcategoria || d.sub };
      }));
      ajustes = [...ajustes.filter((a) => !salvos.some((s) => s.chave === a.chave)), ...salvos];
    }
    for (const g of gastos.filter((x) => mover(x.categoria))) {
      const d = mover(g.categoria);
      const salvo = await armazem.financas.atualizarGasto(g.id, { categoria: d.categoria, subcategoria: g.subcategoria || d.sub,
        essencial: g.essencial, observacao: g.observacao, conta: g.conta });
      gastos = gastos.map((x) => (x.id === salvo.id ? salvo : x));
    }
    const recMudou = recorrentes.some((r) => mover(r.categoria));
    if (recMudou) {
      await salvarRecorrentes(recorrentes.map((r) => {
        const d = mover(r.categoria);
        return d ? { ...r, categoria: d.categoria, subcategoria: r.subcategoria || d.sub } : r;
      }));
    }
    cats = { lista: lista.map(normalizarCategoria), renomeadas, subPadrao, salva: cats.salva };
    await salvarCategorias();
    painel.atualizarGastos(gastos);
    painel.atualizarClassificacao({ ajustes, categorias: cats });
    recomecarCategorias();
    avisar("Categorias salvas.");
  } catch (err) {
    erroCategorias("Não foi possível salvar: " + err.message);
  } finally {
    botao.disabled = false;
  }
}

function prepararEdicaoCategorias() {
  const lista = $("#lista-categorias");
  const mexeu = () => { categoriasMexidas = true; };
  ["input", "change", "click"].forEach((tipo) => lista.addEventListener(tipo, (e) => { if (e.target.closest("input, select, button")) mexeu(); }));
  ["#btn-nova-categoria", "#btn-categorias-padrao"].forEach((sel) => $(sel).addEventListener("click", mexeu));
  lista.addEventListener("input", (e) => {
    const div = e.target.closest(".cat-edicao");
    if (div && e.target.dataset.campo === "nome") edicao[Number(div.dataset.i)].nome = e.target.value;
  });
  lista.addEventListener("change", (e) => {
    const div = e.target.closest(".cat-edicao");
    if (div && e.target.dataset.campo === "essencial") {
      edicao[Number(div.dataset.i)].essencial = e.target.value === "sim" ? true : e.target.value === "nao" ? false : null;
    }
  });
  lista.addEventListener("click", (e) => {
    const div = e.target.closest(".cat-edicao");
    if (!div) return;
    const i = Number(div.dataset.i);
    if (e.target.closest("[data-remover-cat]")) {
      edicao.splice(i, 1);
      desenharEdicao();
    } else if (e.target.closest("[data-remover-sub]")) {
      edicao[i].sub.splice(Number(e.target.closest("[data-remover-sub]").dataset.removerSub), 1);
      desenharEdicao();
    } else if (e.target.closest("[data-add-sub]")) {
      adicionarSub(div);
    }
  });
  lista.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.dataset.campo === "nova-sub") {
      e.preventDefault();
      adicionarSub(e.target.closest(".cat-edicao"));
    }
  });
  $("#btn-nova-categoria").addEventListener("click", () => {
    edicao.push({ nome: "", sub: [], essencial: null, original: null });
    desenharEdicao({ i: edicao.length - 1, campo: "nome" });
  });
  $("#btn-categorias-padrao").addEventListener("click", () => {
    edicao = lerCategorias(null, registro.dados).lista.map((c) => ({ ...c, original: c.nome }));
    fusoes = [];
    desenharEdicao();
  });
  $("#juntar-lista").addEventListener("change", (e) => {
    if (!e.target.matches("[data-juntar]")) return;
    e.target.closest(".juntar-linha").querySelector(".juntar-sub").hidden = !e.target.checked;
    if (e.target.checked && !$("#juntar-destino").value) $("#juntar-destino").focus();
  });
  $("#btn-juntar-cats").addEventListener("click", juntarMarcadas);
  $("#btn-desfazer-categorias").addEventListener("click", recomecarCategorias);
  $("#btn-salvar-categorias").addEventListener("click", salvarEdicao);
}

// Contas: mostrar ou esconder nos formulários, unir empresas numa conta só, renomear e separar
const TIPO_CONTA = {
  pessoal: "padrão: o dinheiro de quem é o painel",
  pessoa: "gasto que é da outra pessoa do casal",
  casal: "despesa dos dois",
  engenharia: "trabalho autônomo de engenharia",
  empresa: "empresa",
};

function erroContas(texto) {
  $("#erro-contas").textContent = texto;
  $("#erro-contas").hidden = !texto;
}

function recomecarContas() {
  edicaoContas = structuredClone(lerContas(prefs));
  erroContas("");
  desenharContas();
}

function desenharContas() {
  const lista = contasDisponiveis({ perfil, dono, parceiro: dono.id === perfil.id ? parceiro : { id: perfil.id, nome: perfil.nome, email: perfil.email },
    empresas, prefs: { contas: edicaoContas } }).filter((c) => !c.agrupada);
  $("#lista-contas").innerHTML = lista.map((c) => `<div class="conta-cad" data-id="${esc(c.id)}">
      <label class="conta-mostrar"><input type="checkbox" data-mostrar${c.oculta ? "" : " checked"}${c.id === "pessoal" ? " disabled" : ""}
        aria-label="Mostrar ${esc(c.nome)} nos formulários"></label>
      <div class="conta-nome">${c.tipo === "grupo"
        ? `<input data-nome-grupo value="${esc(c.nome)}" maxlength="60" autocomplete="off" aria-label="Nome da conta unida"><small>empresas unidas: ${esc(c.nomesEmpresas.join(", "))}</small>`
        : `<b>${esc(c.nome)}</b><small>${esc(TIPO_CONTA[c.tipo] || "")}</small>`}</div>
      ${c.tipo === "grupo" ? '<button type="button" class="btn-link" data-separar>Separar</button>' : ""}
    </div>`).join("");
  const livres = empresas.filter((e) => !edicaoContas.grupos.some((g) => g.empresas.includes(String(e.id))));
  $("#unir-empresas").hidden = !lista.some((c) => c.tipo === "empresa" || c.tipo === "grupo") || livres.length < 2;
  $("#unir-lista").innerHTML = livres.map((e) => `<label class="opcao-linha"><input type="checkbox" value="${esc(e.id)}"><span>${esc(e.nome)}</span></label>`).join("");
}

function unirEmpresas() {
  const ids = [...document.querySelectorAll("#unir-lista input:checked")].map((x) => x.value);
  const nome = $("#unir-nome").value.trim().slice(0, 60);
  if (ids.length < 2) return erroContas("Marque pelo menos duas empresas para unir.");
  if (!nome) return erroContas("Dê um nome para a conta unida (ex.: as duas empresas juntas).");
  edicaoContas.grupos.push({ id: `grupo:${crypto.randomUUID()}`, nome, empresas: ids });
  $("#unir-nome").value = "";
  erroContas("");
  desenharContas();
}

async function salvarContas() {
  if (edicaoContas.grupos.some((g) => !g.nome.trim())) return erroContas("Toda conta unida precisa de um nome.");
  const botao = $("#btn-salvar-contas");
  botao.disabled = true;
  erroContas("");
  try {
    prefs = await armazem.financas.salvarPreferencias(dono.id, { contas: lerContas({ contas: edicaoContas }) });
    montarContas();
    painel.atualizarClassificacao({ contas: contasTodas });
    recomecarContas();
    avisar("Contas salvas.");
  } catch (err) {
    erroContas("Não foi possível salvar: " + err.message);
  } finally {
    botao.disabled = false;
  }
}

function prepararContas() {
  const lista = $("#lista-contas");
  lista.addEventListener("change", (e) => {
    const div = e.target.closest(".conta-cad");
    if (!div || !e.target.matches("[data-mostrar]")) return;
    const id = div.dataset.id;
    edicaoContas.ocultas = edicaoContas.ocultas.filter((x) => x !== id);
    if (!e.target.checked) edicaoContas.ocultas.push(id);
  });
  lista.addEventListener("input", (e) => {
    const div = e.target.closest(".conta-cad");
    if (!div || !e.target.matches("[data-nome-grupo]")) return;
    const g = edicaoContas.grupos.find((x) => x.id === div.dataset.id);
    if (g) g.nome = e.target.value;
  });
  lista.addEventListener("click", (e) => {
    const div = e.target.closest(".conta-cad");
    if (!div || !e.target.closest("[data-separar]")) return;
    edicaoContas.grupos = edicaoContas.grupos.filter((x) => x.id !== div.dataset.id);
    edicaoContas.ocultas = edicaoContas.ocultas.filter((x) => x !== div.dataset.id);
    desenharContas();
  });
  $("#btn-unir-empresas").addEventListener("click", unirEmpresas);
  $("#btn-desfazer-contas").addEventListener("click", recomecarContas);
  $("#btn-salvar-contas").addEventListener("click", salvarContas);
}

// ---------------------------------------------------------------- PDFs das faturas e relatórios
function mensagemPdf(texto, tipo = "") {
  const el = $("#pdfs-msg");
  el.hidden = !texto;
  el.className = "msg" + (tipo ? " " + tipo : "");
  el.textContent = texto || "";
}

// Faturas já lidas de cada PDF (o caminho do PDF fica guardado na fatura), para marcar na lista
function faturasDosPdfs() {
  const mapa = new Map();
  const d = (registro && registro.dados) || {};
  const marcar = (cartao, nome) => {
    for (const f of (cartao && cartao.faturas) || []) {
      if (f.arquivo_pdf) mapa.set(f.arquivo_pdf, [...(mapa.get(f.arquivo_pdf) || []), nome ? `${f.mes} de ${nome}` : f.mes]);
    }
  };
  marcar(d.cartao, "");
  for (const o of outrasPessoas(d)) marcar(d[o.chave].cartao, o.nome);
  return mapa;
}

async function listarPdfs() {
  let lista = [];
  try {
    lista = await armazem.financas.pdfs(dono.id);
  } catch (err) {
    mensagemPdf("Não foi possível listar os PDFs: " + err.message, "bad");
  }
  const lidas = faturasDosPdfs();
  $("#pdfs-lista").innerHTML = lista.length
    ? lista.map((a) => `<div class="file">
        <div><div class="fn">${esc(a.nome)}</div><div class="sub">${a.criado_em ? dataHora(a.criado_em) : ""}${a.tamanho ? ` · ${tamanho(a.tamanho)}` : ""}${lidas.has(a.caminho) ? ` · <span class="pdf-lido">fatura ${esc(lidas.get(a.caminho).join(", "))} no painel</span>` : ""}</div></div>
        <div class="acoes"><button type="button" class="btn sec mini" data-processar-pdf="${esc(a.caminho)}" data-nome="${esc(a.nome)}">Processar</button><button type="button" class="btn sec mini" data-abrir-pdf="${esc(a.caminho)}">Abrir</button><button type="button" class="btn sec mini" data-apagar-pdf="${esc(a.caminho)}">Apagar</button></div>
      </div>`).join("")
    : '<p class="muted" style="margin:0">Nenhum PDF enviado ainda.</p>';
}

async function enviarPdf(arquivo) {
  const problema = await conferirPdf(arquivo);
  if (problema) return mensagemPdf(problema, "warn");
  const botao = $("#btn-enviar-pdf");
  botao.disabled = true;
  mensagemPdf(`Enviando ${arquivo.name}…`);
  let caminho = null;
  try {
    caminho = await armazem.financas.enviarPdf(dono.id, arquivo);
    mensagemPdf(`${arquivo.name} guardado.`, "ok");
    await listarPdfs();
  } catch (err) {
    mensagemPdf("Não foi possível enviar: " + err.message, "bad");
  } finally {
    botao.disabled = false;
  }
  // Se for uma fatura que o site sabe ler, já mostra a leitura para atualizar o cartão
  if (caminho) processarPdf({ caminho, nome: arquivo.name, arquivo, automatico: true });
}

// ---------------------------------------------------------------- faturas em PDF: leitura e atualização do cartão
let pdfjsLib;
async function carregarPdfjs() {
  if (!pdfjsLib) {
    pdfjsLib = await import("./vendor/pdf.min.mjs");
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("./vendor/pdf.worker.min.mjs", import.meta.url).href;
  }
  return pdfjsLib;
}

function erroFatura(texto) {
  $("#erro-fatura-pdf").textContent = texto;
  $("#erro-fatura-pdf").hidden = !texto;
}

// Cartões do painel: o de quem está logado e, no painel completo, o da outra pessoa que vem no arquivo
function cartoesDoPainel() {
  const lista = [{ chave: "dono", nome: `${(dono.nome || dono.email || "Você").split(/[\s@]/)[0]}${dono.id === perfil.id ? " (você)" : ""}`, primeiro: primeiroNome(dono) }];
  const outra = registro.modo === "completo" ? outrasPessoas(registro.dados)[0] : null;
  if (outra) lista.push({ chave: outra.chave, nome: outra.nome, primeiro: semAcento(outra.nome) });
  return lista;
}

const cartaoDe = (dados, quem) => (quem === "dono" ? dados.cartao : (dados[quem] || {}).cartao) || null;

// Categorias que a pessoa já usou (com a classificação feita no site), para sugerir nas compras da fatura nova e
// nas saídas do extrato
function historicoPara(quem) {
  const d = registro.dados || {};
  const doSite = { meses: [{ lancamentos: gastos.map((g) => ({ data: g.data, desc: g.descricao, valor: g.valor, cat: g.categoria, sub: g.subcategoria, origem: "site", id: g.id })) }] };
  const fontes = registro.modo === "completo" ? [{ meses: d.meses }, doSite, { cartao: d.cartao, prefixo: "c" }] : [doSite, { cartao: d.cartao, prefixo: "c" }];
  if (quem !== "dono" && d[quem]) fontes.push({ cartao: d[quem].cartao, prefixo: "co" });
  return historicoDeCategorias(fontes, new Map(ajustes.map((a) => [a.chave, a])), cats);
}

// Classificação herdada das faturas anteriores para os lançamentos novos (fatura lida do PDF ou prévia): a mesma
// compra parcelada leva tudo, inclusive o complemento; a mesma loja leva a categoria, a conta e o essencial
function herancaDaFatura(dadosAntes, quem, novos, ajustesMap) {
  const prefixo = quem === "dono" ? "c" : "co";
  const antes = cartaoDe(dadosAntes || {}, quem) || {};
  const comChave = (ls, p) => chavesFatura(ls, p).map((k, i) => ({ ...ls[i], chave: k }));
  const antigos = [];
  if (quem === "dono") {
    for (const m of (dadosAntes && dadosAntes.meses) || []) antigos.push(...comChaveGastos(m.lancamentos || []));
    antigos.push(...gastos.map((g) => ({ desc: g.descricao, valor: g.valor, chave: `s|${g.id}` })));
  }
  antigos.push(...comChave(antes.lancamentos || [], prefixo));
  for (const p of antes.previas || []) antigos.push(...comChave((p.lancamentos || []).map((l) => ({ ...l, mes: p.mes })), prefixo));
  return herdarClassificacao(novos, antigos, ajustesMap);
}
const comChaveGastos = (ls) => chavesGastos(ls).map((k, i) => ({ ...ls[i], chave: k }));
const novosComChave = (lancamentos, quem, mes) => chavesFatura(lancamentos, quem === "dono" ? "c" : "co").map((k, i) => ({ ...lancamentos[i], chave: k })).filter((l) => !mes || l.mes === mes);
const textoHeranca = (h) => (h.length ? `${plural(h.length, "lançamento herda", "lançamentos herdam")} a classificação feita nas faturas anteriores${h.some((x) => x.complemento) ? ` (${plural(h.filter((x) => x.complemento).length, "com complemento", "com complemento")})` : ""}.` : "");

// Lê o PDF (o arquivo recém-enviado ou o guardado no banco) e mostra a prévia. Logo depois do envio, só abre a
// janela se o PDF for uma fatura que o site sabe ler.
let leituraAtual = 0;
async function processarPdf({ caminho, nome, arquivo = null, automatico = false }) {
  const vez = ++leituraAtual;
  faturaPdf = null;
  $("#previa-fatura-pdf").hidden = true;
  $("#btn-confirmar-fatura-pdf").disabled = true;
  erroFatura("");
  $("#fatura-pdf-status").textContent = `Lendo ${nome}…`;
  if (!automatico) $("#dlg-fatura-pdf").showModal();
  let leitura;
  try {
    const conteudo = arquivo || (await armazem.financas.baixarPdf(caminho));
    leitura = lerFaturaPdf(await extrairLinhas(await carregarPdfjs(), new Uint8Array(await conteudo.arrayBuffer())));
  } catch (err) {
    if (vez !== leituraAtual) return;
    const msg = err.name === "PasswordException" ? "Este PDF tem senha. Abra no computador, salve uma cópia sem senha e envie de novo."
      : err.name === "InvalidPDFException" ? "Não foi possível abrir este PDF: o arquivo parece estar danificado." : err.message;
    if (automatico) {
      if (/deste banco|senha/.test(msg)) mensagemPdf(`${nome} guardado. ${msg}`, "warn");
      return;
    }
    $("#fatura-pdf-status").textContent = "";
    erroFatura(msg);
    return;
  }
  if (vez !== leituraAtual) return; // outra leitura começou enquanto esta corria
  faturaPdf = { caminho, nome, leitura };
  const cartoes = cartoesDoPainel();
  const titular = semAcento(leitura.titular);
  const dela = cartoes.find((c) => c.chave !== "dono" && c.primeiro === titular);
  $("#fatura-de").innerHTML = opcoes(cartoes.map((c) => [c.chave, c.nome]), dela ? dela.chave : "dono");
  $("#campo-fatura-de").hidden = cartoes.length < 2;
  $("#fatura-pdf-status").textContent = `Lido de ${nome}.`;
  mostrarFaturaPdf();
  if (automatico) $("#dlg-fatura-pdf").showModal();
}

function mostrarFaturaPdf() {
  const quem = $("#fatura-de").value || "dono";
  const montada = montarFatura(faturaPdf.leitura, { historico: historicoPara(quem), arquivo: faturaPdf.caminho });
  const f = montada.fatura;
  const cartao = cartoesDoPainel().find((c) => c.chave === quem);
  // Quem pode alterar o painel da outra pessoa (administrador ou casal nas finanças) atualiza junto o dela
  const destino = quem !== "dono" ? acessiveis.find((p) => p.id !== dono.id && primeiroNome(p) === cartao.primeiro) : null;
  Object.assign(faturaPdf, { quem, montada, destino: destino || null });

  const linha = (rotulo, valor) => `<div><dt>${rotulo}</dt><dd>${valor}</dd></div>`;
  $("#previa-fatura-dados").innerHTML = [
    linha("Cartão", esc(`${montada.banco}${montada.titular ? ` · ${montada.titular}` : ""}`)),
    linha("Fatura", `${esc(f.mes)} · vence em ${dataBR(f.vencimento)}`),
    linha("Período das compras", f.periodo ? `${dataBR(f.periodo.inicio)} a ${dataBR(f.periodo.fim)}` : "—"),
    linha("Total a pagar", brl(f.total)),
    linha("Lançamentos", `${f.n_lanc} · ${montada.confere ? "a soma confere com o total" : "a soma não confere"}`),
    linha("À vista e parcelas", `${brl(f.avista)} + ${brl(f.parcelas)}`),
    linha("Parceladas a vencer", `${brl(f.parcelado_a_vencer)} (${plural(montada.parcelamentos.length, "compra", "compras")})`),
    linha("Pontos de atenção", String(montada.alertas.length)),
  ].join("");

  const depois = cartaoDe(comFatura(registro.dados, quem, montada), quem);
  faturaPdf.herdados = herancaDaFatura(registro.dados, quem, novosComChave(depois.lancamentos, quem, f.mes), new Map(ajustes.map((a) => [a.chave, a])));
  const avisos = [];
  if (!montada.confere) avisos.push(`${f.conferencia}. Confira o PDF antes de atualizar.`);
  if (faturaPdf.herdados.length) avisos.push(textoHeranca(faturaPdf.herdados));
  const existente = ((cartaoDe(registro.dados, quem) || {}).faturas || []).find((x) => x.mes === f.mes);
  if (existente) {
    avisos.push(existente.origem === "pdf" ? `A fatura ${f.mes} deste cartão já foi lida antes e será substituída.`
      : `A fatura ${f.mes} deste cartão veio do projeto Financeiro e será substituída pela leitura deste PDF.`);
  }
  $("#aviso-fatura-pdf").innerHTML = avisos.map(esc).join("<br>");
  $("#aviso-fatura-pdf").hidden = !avisos.length;

  $("#campo-fatura-outra").hidden = !destino;
  if (destino) $("#rotulo-fatura-outra").textContent = `Atualizar também o painel de ${destino.nome || destino.email}`;

  const ls = [...montada.lancamentos].sort((a, b) => String(a.data).localeCompare(String(b.data)));
  $("#resumo-lanc-fatura-pdf").textContent = `Ver os ${plural(ls.length, "lançamento", "lançamentos")}`;
  $("#lanc-fatura-pdf").innerHTML = ls.map((l) => `<tr><td class="num">${l.data ? esc(dataBR(l.data).slice(0, 5)) : ""}</td>
    <td>${esc(l.nome)}<div class="sub">${esc(l.cat)}${l.sub ? ` › ${esc(l.sub)}` : ""}${l.parcela ? ` · parcela ${esc(l.parcela)}` : ""}${l.tipo !== "Nacional" ? ` · ${esc(l.tipo)}` : ""}</div></td>
    <td class="r num">${brl(l.valor)}</td></tr>`).join("");
  $("#previa-fatura-pdf").hidden = false;
  $("#btn-confirmar-fatura-pdf").disabled = false;
}

// Grava a classificação herdada (sem travar a atualização da fatura se o banco recusar)
async function herdarNoBanco(perfilId, herdados) {
  if (!herdados || !herdados.length) return;
  try {
    const salvos = await armazem.financas.salvarAjustes(herdados.map((h) => ({ ...h, perfil_id: perfilId })));
    if (perfilId === dono.id) ajustes = [...ajustes.filter((a) => !salvos.some((s) => s.chave === a.chave)), ...salvos];
  } catch (err) {
    console.error(err);
  }
}
// No painel da outra pessoa (atualizado junto), a herança usa a classificação dela
async function herdarNoPainelDela(perfilId, dadosAntes, novos) {
  try {
    const dela = await armazem.financas.ajustes(perfilId);
    const antes = cartaoDe(dadosAntes || {}, "dono") || {};
    const antigos = [...chavesFatura(antes.lancamentos || [], "c").map((k, i) => ({ ...antes.lancamentos[i], chave: k }))];
    await herdarNoBanco(perfilId, herdarClassificacao(novos, antigos, new Map(dela.map((a) => [a.chave, a]))));
  } catch (err) {
    console.error(err);
  }
}

// Dados do painel com a fatura no cartão de quem (o dono do painel ou a outra pessoa do arquivo)
function comFatura(dadosAtuais, quem, montada) {
  const d = structuredClone(dadosAtuais || {});
  if (quem === "dono") {
    d.cartao = aplicarFatura(d.cartao, montada);
    if (!d.cartao_nome) d.cartao_nome = montada.banco;
  } else {
    d[quem] = { relatorios: [], ...(d[quem] || {}) };
    d[quem].cartao = aplicarFatura(d[quem].cartao, montada);
    if (!d[quem].cartao_nome) d[quem].cartao_nome = montada.banco;
  }
  return d;
}

async function confirmarFaturaPdf() {
  if (!faturaPdf || !faturaPdf.montada) return;
  const { quem, montada, destino } = faturaPdf;
  const botao = $("#btn-confirmar-fatura-pdf");
  botao.disabled = true;
  botao.textContent = "Atualizando…";
  erroFatura("");
  try {
    const dados = comFatura(registro.dados, quem, montada);
    await armazem.financas.salvar({ perfil_id: dono.id, modo: registro.modo, dados, investimentos: registro.investimentos, arquivo: registro.arquivo });
    await herdarNoBanco(dono.id, faturaPdf.herdados);
    if (destino && $("#fatura-outra").checked) {
      const atual = await armazem.financas.ler(destino.id);
      const dadosDela = atual ? comFatura(atual.dados, "dono", montada) : soFaturas(dados, quem);
      await armazem.financas.salvar(atual
        ? { perfil_id: destino.id, modo: atual.modo, dados: dadosDela, investimentos: atual.investimentos, arquivo: atual.arquivo }
        : { perfil_id: destino.id, modo: "faturas", dados: dadosDela, investimentos: null, arquivo: "Faturas em PDF" });
      await herdarNoPainelDela(destino.id, atual && atual.dados, novosComChave(cartaoDe(dadosDela, "dono").lancamentos, "dono", montada.fatura.mes));
    }
    // Volta direto na análise da fatura atualizada
    try {
      localStorage.setItem("mz-fin-aba", "cartao");
      localStorage.setItem("mz-fin-fatura-de", quem === "dono" ? "dono" : "outra");
    } catch {
      /* sem armazenamento: abre na aba de sempre */
    }
    $("#dlg-fatura-pdf").close();
    avisar(`Fatura ${montada.fatura.mes} atualizada. Atualizando o painel…`);
    setTimeout(() => {
      location.hash = "cartao";
      location.reload();
    }, 700);
  } catch (e) {
    erroFatura("Não foi possível atualizar: " + e.message);
    botao.disabled = false;
  } finally {
    botao.textContent = "Atualizar fatura";
  }
}

function prepararFaturaPdf() {
  $("#fatura-de").addEventListener("change", () => {
    if (faturaPdf) mostrarFaturaPdf();
  });
  $("#btn-confirmar-fatura-pdf").addEventListener("click", confirmarFaturaPdf);
}

// ---------------------------------------------------------------- fatura parcial (CSV ou OFX do app)
let parcial = null; // { nome, leitura, quem, mes, previa, destino }

function erroParcial(texto) {
  $("#erro-parcial").textContent = texto;
  $("#erro-parcial").hidden = !texto;
}

async function lerArquivoParcial(arquivo) {
  parcial = null;
  erroParcial("");
  $("#previa-parcial").hidden = true;
  $("#btn-confirmar-parcial").disabled = true;
  $("#parcial-status").textContent = `Lendo ${arquivo.name}…`;
  $("#dlg-fatura-parcial").showModal();
  let leitura;
  try {
    leitura = lerFaturaParcial(decodificarExtrato(new Uint8Array(await arquivo.arrayBuffer())), arquivo.name);
  } catch (err) {
    $("#parcial-status").textContent = "";
    erroParcial(err.message);
    return;
  }
  parcial = { nome: arquivo.name, leitura };
  // Fatura: a do vencimento no nome do arquivo (ou a provável), com os meses em volta para corrigir
  const provavel = faturaProvavel(leitura), base = ordemFatura(provavel);
  const meses = [-2, -1, 0, 1, 2, 3].map((k) => rotuloFatura(Math.floor((base + k) / 12), ((base + k) % 12) + 1));
  $("#parcial-mes").innerHTML = opcoes(meses.map((m) => [m, m]), provavel);
  // Cartão: o do mesmo banco do arquivo, se houver
  const cartoes = cartoesDoPainel();
  const doBanco = leitura.banco ? cartoes.find((c) => bancoDoCartao(registro.dados, c.chave) === leitura.banco) : null;
  $("#parcial-de").innerHTML = opcoes(cartoes.map((c) => [c.chave, c.nome]), (doBanco || cartoes[0]).chave);
  $("#campo-parcial-de").hidden = cartoes.length < 2;
  $("#parcial-status").textContent = `Lido de ${arquivo.name}.`;
  mostrarParcial();
}

function mostrarParcial() {
  if (!parcial) return;
  const { leitura } = parcial;
  const quem = $("#parcial-de").value || "dono", mes = $("#parcial-mes").value;
  const previa = montarPrevia(leitura, { mes, historico: historicoPara(quem), arquivo: parcial.nome });
  const cartao = cartoesDoPainel().find((c) => c.chave === quem);
  const destino = quem !== "dono" ? acessiveis.find((p) => p.id !== dono.id && primeiroNome(p) === cartao.primeiro) : null;
  Object.assign(parcial, { quem, mes, previa, destino: destino || null });

  const linha = (rotulo, valor) => `<div><dt>${rotulo}</dt><dd>${valor}</dd></div>`;
  $("#previa-parcial-dados").innerHTML = [
    linha("Arquivo", esc(`${leitura.formato}${leitura.banco ? ` do ${leitura.banco}` : ""}`)),
    linha("Lançamentos de", `${dataBR(leitura.inicio)} a ${dataBR(leitura.fim)}`),
    linha("Total até agora", brl(previa.total)),
    linha("Lançamentos", String(previa.n_lanc)),
    linha("À vista e primeiras parcelas", brl(previa.compras)),
    linha("Parcelas de compras anteriores", brl(previa.parcelas_anteriores)),
  ].join("");

  const avisos = [];
  let bloqueia = false;
  const banco = bancoDoCartao(registro.dados, quem);
  if (leitura.banco && banco && banco !== leitura.banco) {
    avisos.push(`O cartão de ${cartao.nome} neste painel é do ${banco} e este arquivo é do ${leitura.banco}. O painel guarda um cartão por pessoa: escolha o cartão certo em "Cartão de".`);
    bloqueia = true;
  }
  const atual = cartaoDe(registro.dados, quem) || {};
  if ((atual.faturas || []).some((f) => f.mes === mes)) {
    avisos.push(`A fatura ${mes} deste cartão já fechou e está no painel. A prévia serve para a fatura aberta e as próximas.`);
    bloqueia = true;
  }
  const antiga = (atual.previas || []).find((p) => p.mes === mes);
  if (antiga && !bloqueia) avisos.push(`A prévia de ${mes} importada em ${dataBR(String(antiga.importada_em).slice(0, 10))} será substituída por esta.`);
  parcial.herdados = bloqueia ? [] : herancaDaFatura(registro.dados, quem, novosComChave(previa.lancamentos.map((l) => ({ ...l, mes })), quem, mes), new Map(ajustes.map((a) => [a.chave, a])));
  if (parcial.herdados.length) avisos.push(textoHeranca(parcial.herdados));
  $("#aviso-parcial").innerHTML = avisos.map(esc).join("<br>");
  $("#aviso-parcial").hidden = !avisos.length;
  $("#campo-parcial-outra").hidden = !destino;
  if (destino) $("#rotulo-parcial-outra").textContent = `Atualizar também o painel de ${destino.nome || destino.email}`;

  const ls = previa.lancamentos;
  $("#resumo-lanc-parcial").textContent = `Ver os ${plural(ls.length, "lançamento", "lançamentos")}`;
  $("#lanc-parcial").innerHTML = ls.map((l) => `<tr><td class="num">${esc(dataBR(l.data).slice(0, 5))}</td>
    <td>${esc(l.nome)}<div class="sub">${esc(l.cat)}${l.sub ? ` › ${esc(l.sub)}` : ""}${l.parcela ? ` · parcela ${esc(l.parcela)}` : ""}${l.tipo !== "Nacional" ? ` · ${esc(l.tipo)}` : ""}</div></td>
    <td class="r num">${brl(l.valor)}</td></tr>`).join("");
  $("#previa-parcial").hidden = false;
  $("#btn-confirmar-parcial").disabled = bloqueia;
}

// Dados do painel com a prévia no cartão de quem (o dono do painel ou a outra pessoa do arquivo)
function comPrevia(dadosAtuais, quem, previa) {
  const d = structuredClone(dadosAtuais || {});
  const p = quem === "dono" ? d : (d[quem] = { relatorios: [], ...(d[quem] || {}) });
  p.cartao = aplicarPrevia(p.cartao, previa);
  if (!p.cartao_nome && previa.banco) p.cartao_nome = previa.banco;
  return d;
}

async function confirmarParcial() {
  if (!parcial || !parcial.previa) return;
  const { quem, previa, destino } = parcial;
  const botao = $("#btn-confirmar-parcial");
  botao.disabled = true;
  botao.textContent = "Importando…";
  erroParcial("");
  try {
    const dados = comPrevia(registro.dados, quem, previa);
    await armazem.financas.salvar({ perfil_id: dono.id, modo: registro.modo, dados, investimentos: registro.investimentos, arquivo: registro.arquivo });
    await herdarNoBanco(dono.id, parcial.herdados);
    if (destino && $("#parcial-outra").checked) {
      const daOutra = await armazem.financas.ler(destino.id);
      await armazem.financas.salvar(daOutra
        ? { perfil_id: destino.id, modo: daOutra.modo, dados: comPrevia(daOutra.dados, "dono", previa), investimentos: daOutra.investimentos, arquivo: daOutra.arquivo }
        : { perfil_id: destino.id, modo: "faturas", dados: soFaturas(dados, quem), investimentos: null, arquivo: "Faturas em PDF" });
    }
    try {
      localStorage.setItem("mz-fin-aba", "cartao");
      localStorage.setItem("mz-fin-fatura-de", quem === "dono" ? "dono" : "outra");
    } catch {
      /* sem armazenamento: abre na aba de sempre */
    }
    $("#dlg-fatura-parcial").close();
    avisar(`Prévia da fatura ${previa.mes} importada. Atualizando o painel…`);
    setTimeout(() => {
      location.hash = "cartao";
      location.reload();
    }, 700);
  } catch (e) {
    erroParcial("Não foi possível importar: " + e.message);
    botao.disabled = false;
  } finally {
    botao.textContent = "Importar prévia";
  }
}

function prepararParcial() {
  $("#btn-fatura-parcial").addEventListener("click", () => $("#arquivo-fatura-parcial").click());
  $("#arquivo-fatura-parcial").addEventListener("change", (e) => {
    const arquivo = e.target.files[0];
    e.target.value = "";
    if (arquivo) lerArquivoParcial(arquivo);
  });
  $("#parcial-de").addEventListener("change", mostrarParcial);
  $("#parcial-mes").addEventListener("change", mostrarParcial);
  $("#btn-confirmar-parcial").addEventListener("click", confirmarParcial);
}

function prepararPdfs() {
  $("#btn-enviar-pdf").addEventListener("click", () => $("#arquivo-pdf").click());
  $("#arquivo-pdf").addEventListener("change", (e) => {
    const arquivo = e.target.files[0];
    e.target.value = "";
    if (arquivo) enviarPdf(arquivo);
  });
  $("#pdfs-lista").addEventListener("click", async (e) => {
    const processar = e.target.closest("[data-processar-pdf]");
    const abrir = e.target.closest("[data-abrir-pdf]");
    const apagar = e.target.closest("[data-apagar-pdf]");
    if (processar) processarPdf({ caminho: processar.dataset.processarPdf, nome: processar.dataset.nome });
    if (abrir) {
      // Abre a aba antes de buscar o link, para o navegador não bloquear a janela
      const janela = window.open("", "_blank");
      try {
        const url = await armazem.financas.urlPdf(abrir.dataset.abrirPdf);
        if (janela) janela.location = url;
        else location.href = url;
      } catch (err) {
        if (janela) janela.close();
        mensagemPdf("Não foi possível abrir: " + err.message, "bad");
      }
    }
    if (apagar && confirm("Apagar este PDF?")) {
      try {
        await armazem.financas.apagarPdf(apagar.dataset.apagarPdf);
        await listarPdfs();
        mensagemPdf("PDF apagado.", "ok");
      } catch (err) {
        mensagemPdf("Não foi possível apagar: " + err.message, "bad");
      }
    }
  });
}

// ---------------------------------------------------------------- extrato da conta: Pix, débitos, boletos e saques
const FORMA_NOME = { pix: "Pix", debito: "Débito", dinheiro: "Saque (dinheiro)" };

function erroExtrato(texto) {
  $("#erro-extrato").textContent = texto;
  $("#erro-extrato").hidden = !texto;
}

function abrirExtrato() {
  extrato = null;
  $("#arquivo-extrato").value = "";
  $("#previa-extrato").hidden = true;
  $("#btn-confirmar-extrato").disabled = true;
  $("#btn-confirmar-extrato").textContent = "Importar";
  erroExtrato("");
  // Bancos conectados: as saídas do extrato que ainda não passaram pela importação
  const doBanco = bancos ? leituraDosBancos(bancos) : null;
  $("#extrato-bancos").hidden = !doBanco;
  if (doBanco) {
    const n = doBanco.movimentos.length;
    $("#extrato-bancos-info").textContent = `${n} ${n === 1 ? "movimento novo" : "movimentos novos"} de ${dataBR(doBanco.inicio).slice(0, 5)} a ${dataBR(doBanco.fim).slice(0, 5)} (${doBanco.banco}). Sem arquivo.`;
  }
  $("#dlg-extrato").showModal();
}

// Extrato dos bancos conectados: a mesma prévia do arquivo, com os movimentos ainda não revisados
function usarExtratoDosBancos() {
  const leitura = bancos ? leituraDosBancos(bancos) : null;
  if (!leitura) return;
  erroExtrato("");
  extrato = { leitura, ...saidasDoExtrato(leitura, { historico: historicoPara("dono"), jaNoPainel: lancadosForaDoCartao() }) };
  mostrarPreviaExtrato();
}

// O que já está no painel fora do cartão (do projeto e lançado pelo site), para não importar duas vezes
function lancadosForaDoCartao() {
  const doProjeto = ((registro.dados && registro.dados.meses) || []).flatMap((m) => m.lancamentos || [])
    .filter((l) => l.data && !/cart/i.test(l.forma || "")).map((l) => ({ data: l.data, valor: Number(l.valor) }));
  return [...doProjeto, ...gastos.filter((g) => g.forma !== "cartao").map((g) => ({ data: g.data, valor: Number(g.valor) }))];
}

async function lerArquivoExtrato(arquivo) {
  extrato = null;
  erroExtrato("");
  $("#previa-extrato").hidden = true;
  $("#btn-confirmar-extrato").disabled = true;
  try {
    if (arquivo.size > 5 * 1024 * 1024) throw new Error("Arquivo grande demais para um extrato (até 5 MB).");
    const leitura = lerExtrato(decodificarExtrato(new Uint8Array(await arquivo.arrayBuffer())), arquivo.name);
    extrato = { leitura, ...saidasDoExtrato(leitura, { historico: historicoPara("dono"), jaNoPainel: lancadosForaDoCartao() }) };
  } catch (e) {
    erroExtrato(e.message);
    return;
  }
  mostrarPreviaExtrato();
}

function mostrarPreviaExtrato() {
  $("#lista-extrato").innerHTML = extrato.saidas.map((s, i) => `<tr class="${s.marcado ? "" : "fora"}">
    <td><input type="checkbox" data-saida="${i}" ${s.marcado ? "checked" : ""} aria-label="Importar ${esc(s.descricao)}"></td>
    <td class="num">${esc(dataBR(s.data).slice(0, 5))}</td>
    <td>${esc(s.descricao)}<div class="sub">${FORMA_NOME[s.forma]} · ${esc(s.categoria)}${s.subcategoria ? ` › ${esc(s.subcategoria)}` : ""}${s.motivo ? ` · <span class="motivo">${esc(MOTIVOS[s.motivo])}</span>` : ""}</div></td>
    <td class="r num">${brl(s.valor)}</td></tr>`).join("") || '<tr><td colspan="4">Nenhuma saída neste extrato.</td></tr>';
  resumoExtrato();
  $("#previa-extrato").hidden = false;
}

// Resumo e botão: mudam a cada saída marcada ou desmarcada
function resumoExtrato() {
  const { leitura, saidas, entradas } = extrato;
  const marcadas = saidas.filter((s) => s.marcado);
  const soma = (lista) => lista.reduce((t, s) => t + s.valor, 0);
  const linha = (rotulo, valor) => `<div><dt>${rotulo}</dt><dd>${valor}</dd></div>`;
  $("#previa-extrato-dados").innerHTML = [
    linha("Extrato", esc(`${leitura.banco || "Banco não informado"} · ${leitura.formato}`)),
    linha("Período", leitura.inicio && leitura.fim ? `${dataBR(leitura.inicio)} a ${dataBR(leitura.fim)}` : "—"),
    linha("Saídas", `${plural(saidas.length, "saída", "saídas")} · ${brl(soma(saidas))}`),
    linha("Entradas (não entram)", `${plural(entradas.quantidade, "entrada", "entradas")} · ${brl(entradas.total)}`),
    linha("A importar", `${plural(marcadas.length, "gasto", "gastos")} · ${brl(soma(marcadas))}`),
    linha("Ficam de fora", `${saidas.length - marcadas.length} (desmarcadas)`),
  ].join("");
  const botao = $("#btn-confirmar-extrato");
  // Do banco conectado, dá para só marcar como revisado (as saídas não voltam na próxima importação)
  const doBanco = !!leitura.ids;
  botao.disabled = !marcadas.length && !doBanco;
  botao.textContent = marcadas.length ? `Importar ${plural(marcadas.length, "gasto", "gastos")}` : doBanco ? "Marcar como revisados" : "Importar";
}

async function confirmarExtrato() {
  const marcadas = extrato ? extrato.saidas.filter((s) => s.marcado) : [];
  const ids = extrato && extrato.leitura.ids;
  if (!marcadas.length && !ids) return;
  const botao = $("#btn-confirmar-extrato");
  botao.disabled = true;
  botao.textContent = "Importando…";
  erroExtrato("");
  try {
    const salvos = marcadas.length ? await armazem.financas.salvarGastos(marcadas.map((s) => ({
      perfil_id: dono.id, data: s.data, descricao: s.descricao, valor: s.valor, forma: s.forma, parcelas: 1,
      categoria: s.categoria, subcategoria: s.subcategoria, conta: null, essencial: null, observacao: "",
    }))) : [];
    gastos.push(...salvos);
    painel.atualizarGastos(gastos);
    // Do banco conectado: todos os movimentos da prévia ficam revisados (os desmarcados não voltam na próxima vez)
    if (ids) {
      await armazem.financas.revisarMovimentos(ids);
      const agora = new Date().toISOString(), conjunto = new Set(ids);
      bancos.movimentos.forEach((m) => { if (conjunto.has(m.id)) m.revisado_em = agora; });
      if (bancosUI) bancosUI.atualizar(bancos);
    }
    $("#dlg-extrato").close();
    avisar(salvos.length ? `${plural(salvos.length, "gasto importado", "gastos importados")} do extrato.` : "Movimentos marcados como revisados.");
    if (salvos.length) location.hash = "gastos";
  } catch (e) {
    erroExtrato("Não foi possível importar: " + e.message);
    resumoExtrato();
  }
}

function prepararExtrato() {
  const zona = $("#soltar-extrato");
  ["dragenter", "dragover"].forEach((ev) => zona.addEventListener(ev, (e) => {
    e.preventDefault();
    zona.classList.add("arrastando");
  }));
  ["dragleave", "drop"].forEach((ev) => zona.addEventListener(ev, () => zona.classList.remove("arrastando")));
  zona.addEventListener("drop", (e) => {
    e.preventDefault();
    const arquivo = e.dataTransfer.files[0];
    if (arquivo) lerArquivoExtrato(arquivo);
  });
  $("#arquivo-extrato").addEventListener("change", (e) => {
    const arquivo = e.target.files[0];
    if (arquivo) lerArquivoExtrato(arquivo);
  });
  $("#lista-extrato").addEventListener("change", (e) => {
    const caixa = e.target.closest("[data-saida]");
    if (!caixa || !extrato) return;
    extrato.saidas[Number(caixa.dataset.saida)].marcado = caixa.checked;
    caixa.closest("tr").classList.toggle("fora", !caixa.checked);
    resumoExtrato();
  });
  $("#btn-confirmar-extrato").addEventListener("click", confirmarExtrato);
  $("#btn-extrato").addEventListener("click", abrirExtrato);
  $("#btn-extrato-bancos").addEventListener("click", usarExtratoDosBancos);
  $("#btn-lancar-topo").addEventListener("click", abrirLancamento);
}

// ---------------------------------------------------------------- importação do arquivo do painel
function erro(texto) {
  $("#erro-fin").textContent = texto;
  $("#erro-fin").hidden = !texto;
}

function abrirImportacao() {
  leitura = null;
  $("#arquivo-fin").value = "";
  $("#previa-fin").hidden = true;
  $("#btn-confirmar-fin").disabled = true;
  erro("");
  $("#dlg-importar-fin").showModal();
}

async function lerArquivo(arquivo) {
  erro("");
  $("#previa-fin").hidden = true;
  $("#btn-confirmar-fin").disabled = true;
  if (/\.pdf$/i.test(arquivo.name) || arquivo.type === "application/pdf") {
    erro("Este botão lê o arquivo do painel (HTML) gerado pelo projeto Financeiro. Para faturas em PDF, use “Enviar PDF” na aba Cartão e faturas: as do Nubank são lidas pelo site e atualizam o cartão.");
    return;
  }
  try {
    leitura = lerArquivoFinancas(await arquivo.text());
  } catch (e) {
    leitura = null;
    erro(e.message);
    return;
  }
  nomeArquivo = arquivo.name.slice(0, 120);
  const r = leitura.resumo;
  const linha = (rotulo, valor) => `<div><dt>${rotulo}</dt><dd>${valor}</dd></div>`;
  $("#previa-dados").innerHTML = [
    linha("Gerado em", esc(r.gerado_em || "não informado")),
    linha("Tipo", leitura.modo === "completo" ? "Painel completo" : "Só cartão e faturas"),
    linha("Meses", r.meses.length ? esc(r.meses.join(", ")) : "—"),
    linha("Gastos do dia a dia", plural(r.lancamentos, "lançamento", "lançamentos")),
    linha("Faturas do cartão", plural(r.faturas, "fatura", "faturas")),
    linha("Investimentos", leitura.carteira ? "carteira incluída" : "—"),
  ].join("");

  // Destino: o administrador escolhe de quem é o painel; os demais importam o próprio
  const adm = perfil.papel === "adm" && pessoas.length > 1;
  $("#campo-destino").hidden = !adm;
  if (adm) $("#destino-fin").innerHTML = opcoes(pessoas.map((p) => [p.id, nomeDe(p)]), dono.id);

  // Faturas da outra pessoa que vêm no mesmo arquivo (e, se houver, a carteira conjunta)
  const outra = leitura.outras[0];
  const mostrarOutra = !!outra && adm;
  $("#campo-outra").hidden = !mostrarOutra;
  $("#campo-carteira-outra").hidden = !(mostrarOutra && leitura.carteira);
  if (mostrarOutra) {
    $("#rotulo-outra").textContent = `As faturas de ${outra.nome} que vêm neste arquivo (${plural(outra.faturas, "fatura", "faturas")}) vão também para o painel de`;
    const candidata = pessoas.find((p) => p.id !== dono.id && primeiroNome(p) === semAcento(outra.nome));
    $("#outra-fin").innerHTML = opcoes([["", "Não atualizar agora"], ...pessoas.filter((p) => p.id !== dono.id).map((p) => [p.id, nomeDe(p)])], candidata ? candidata.id : "");
    $("#rotulo-carteira-outra").textContent = `Mostrar também a carteira de investimentos${leitura.carteira && leitura.carteira.titulares ? ` (${leitura.carteira.titulares})` : ""} nesse painel`;
  }
  $("#previa-fin").hidden = false;
  $("#btn-confirmar-fin").disabled = false;
}

// As faturas lidas de PDFs pelo site continuam no painel quando o arquivo importado não traz o mesmo mês
function comFaturasDoSite(novo, antigo) {
  if (!antigo) return novo;
  const d = structuredClone(novo);
  d.cartao = manterFaturasDoSite(d.cartao, antigo.cartao);
  if (!d.cartao_nome && antigo.cartao_nome) d.cartao_nome = antigo.cartao_nome;
  for (const o of outrasPessoas(antigo)) {
    const velho = antigo[o.chave];
    if (!velho.cartao.faturas.some((f) => f.origem === "pdf") && !(velho.cartao.previas || []).length) continue;
    d[o.chave] = { relatorios: [], ...(d[o.chave] || {}) };
    d[o.chave].cartao = manterFaturasDoSite(d[o.chave].cartao, velho.cartao);
    if (!d[o.chave].cartao_nome && velho.cartao_nome) d[o.chave].cartao_nome = velho.cartao_nome;
  }
  return d;
}

async function confirmarImportacao() {
  if (!leitura) return;
  const botao = $("#btn-confirmar-fin");
  botao.disabled = true;
  botao.textContent = "Importando…";
  try {
    const destino = $("#campo-destino").hidden ? dono.id : $("#destino-fin").value;
    const anterior = destino === dono.id ? registro : await armazem.financas.ler(destino);
    await armazem.financas.salvar({
      perfil_id: destino, modo: leitura.modo, dados: comFaturasDoSite(leitura.painel, anterior && anterior.dados),
      investimentos: leitura.carteira, arquivo: nomeArquivo,
    });
    const outraDestino = $("#campo-outra").hidden ? "" : $("#outra-fin").value;
    if (outraDestino && outraDestino !== destino) {
      const comCarteira = !$("#campo-carteira-outra").hidden && $("#carteira-outra").checked;
      const daOutra = await armazem.financas.ler(outraDestino);
      await armazem.financas.salvar({
        perfil_id: outraDestino, modo: "faturas", dados: comFaturasDoSite(soFaturas(leitura.painel, leitura.outras[0].chave), daOutra && daOutra.dados),
        investimentos: comCarteira ? leitura.carteira : null, arquivo: nomeArquivo,
      });
    }
    $("#dlg-importar-fin").close();
    if (destino === dono.id) {
      avisar("Dados importados. Atualizando o painel…");
      setTimeout(() => location.reload(), 700);
    } else {
      avisar(`Painel de ${nomeDe(pessoas.find((p) => p.id === destino))} atualizado.`);
    }
  } catch (e) {
    erro("Não foi possível importar: " + e.message);
  } finally {
    botao.disabled = false;
    botao.textContent = "Importar";
  }
}

function prepararImportacao() {
  const zona = $("#soltar-fin");
  ["dragenter", "dragover"].forEach((ev) => zona.addEventListener(ev, (e) => {
    e.preventDefault();
    zona.classList.add("arrastando");
  }));
  ["dragleave", "drop"].forEach((ev) => zona.addEventListener(ev, () => zona.classList.remove("arrastando")));
  zona.addEventListener("drop", (e) => {
    e.preventDefault();
    const arquivo = e.dataTransfer.files[0];
    if (arquivo) lerArquivo(arquivo);
  });
  $("#arquivo-fin").addEventListener("change", (e) => {
    const arquivo = e.target.files[0];
    if (arquivo) lerArquivo(arquivo);
  });
  $("#btn-importar-fin").addEventListener("click", abrirImportacao);
  $("#btn-importar-vazio").addEventListener("click", abrirImportacao);
  $("#btn-confirmar-fin").addEventListener("click", confirmarImportacao);
}

// ---------------------------------------------------------------- finanças em casal: de quem é o painel aberto
function montarSeletor(aberto, eu) {
  const itens = [[eu.id, eu.nome, "financas.html"], [parceiro.id, parceiro.nome, `financas.html?de=${encodeURIComponent(parceiro.id)}`], ["casal", "Casal", "financas.html?de=casal"]];
  $("#painel-de").innerHTML = itens.map(([id, nome, href]) => `<a class="pilula" href="${esc(href)}"${id === aberto ? ' aria-current="page"' : ""}>${esc(nome)}</a>`).join("");
  $("#painel-de").hidden = false;
}

// ---------------------------------------------------------------- início
async function iniciar() {
  const sessao = await abrirPagina("financas.html");
  if (!sessao) return;
  ({ armazem, perfil } = sessao);
  prepararDialogos();
  prepararImportacao();
  prepararPdfs();
  prepararParcial();
  prepararFaturaPdf();
  prepararExtrato();
  prepararEntrada();
  prepararClassificacao();
  prepararEdicaoCategorias();
  prepararContas();

  const link = linkFinancas(perfil);
  if (link) {
    $("#link-claude").href = link;
    $("#link-claude").hidden = false;
  }
  $("#conteudo").hidden = false;

  // Finanças em casal: quem forma par com quem está usando (vínculo do cadastro) e o painel pedido no endereço
  // (financas.html?de=<id> para o painel da outra pessoa, ?de=casal para a visão do casal)
  const familia = await armazem.financas.pessoas().catch(() => []);
  const par = perfil.casal_com ? familia.find((p) => p.id === perfil.casal_com) : null;
  parceiro = par ? { id: par.id, nome: par.nome } : null;
  const eu = { id: perfil.id, nome: (perfil.nome || perfil.email || "Você").split(/[\s@]/)[0] };
  const pedido = new URLSearchParams(location.search).get("de");
  const aberto = parceiro && pedido === "casal" ? "casal" : parceiro && pedido === parceiro.id ? parceiro.id : perfil.id;
  if (parceiro) montarSeletor(aberto, eu);
  if (aberto === "casal") {
    $("#btn-importar-fin").hidden = true;
    $("#casal").hidden = false;
    $("#fin-status").textContent = `Visão do casal: o mês de ${eu.nome} e de ${parceiro.nome} lado a lado.`;
    try {
      await mostrarCasal({ armazem, pessoas: [{ ...eu, link: "financas.html" }, { ...parceiro, link: `financas.html?de=${encodeURIComponent(parceiro.id)}` }] });
    } catch (e) {
      $("#fin-status").textContent = "Não foi possível montar a visão do casal: " + e.message;
    }
    return;
  }
  dono = aberto === perfil.id ? perfil : { ...parceiro };

  if (perfil.papel === "adm") {
    try {
      const todos = await armazem.usuarios.listar();
      pessoas = todos.filter((u) => u.id === perfil.id || (u.situacao === "ativo" && pode(u, "financas")));
    } catch {
      pessoas = [perfil];
    }
  } else {
    pessoas = [perfil];
  }
  // Painéis que quem está usando pode alterar: o administrador, todos; os demais, o próprio e o de quem forma casal
  acessiveis = perfil.papel === "adm" ? pessoas : [perfil, ...(parceiro ? [parceiro] : [])];

  let desejos = null;
  try {
    registro = await armazem.financas.ler(dono.id);
    // Gastos e entradas lançados pelo site valem nos dois tipos de painel (no só de faturas, viram os meses)
    if (registro) gastos = await armazem.financas.gastos(dono.id);
    if (registro) entradas = await armazem.financas.entradas(dono.id).catch(() => []);
    // Classificação, lista de categorias e desejos: com o banco ainda sem as tabelas novas, a página funciona sem eles
    [prefs, ajustes, desejos] = await Promise.all([
      armazem.financas.preferencias(dono.id).catch(() => null),
      armazem.financas.ajustes(dono.id).catch(() => []),
      armazem.financas.desejos().catch(() => null),
    ]);
  } catch (e) {
    $("#fin-status").textContent = e.message;
    return;
  }
  if (!registro) {
    if (dono.id !== perfil.id) {
      $("#fin-vazio-texto").textContent = `O painel de ${dono.nome} ainda não foi importado. Quem tiver o arquivo do painel dele(a) pode importar por aqui.`;
    } else if (perfil.papel !== "adm") {
      $("#fin-vazio-texto").textContent = "O seu painel ainda não foi importado. Se o administrador cuida das suas faturas, ele importa por aqui; se você tiver o arquivo do painel, pode importar também.";
    }
    $("#fin-vazio").hidden = false;
    return;
  }
  cats = lerCategorias(prefs, registro.dados);
  recorrentes = Array.isArray(prefs && prefs.recorrentes) ? prefs.recorrentes : [];
  empresas = sessao.empresas || [];
  montarContas();
  mostrarStatus();
  prepararLancamento();
  prepararRecorrentes();
  // Lançar gasto (ou Pix), lançar entrada e importar o extrato ficam no topo, em qualquer aba
  $("#btn-lancar-topo").hidden = false;
  $("#btn-entrada-topo").hidden = false;
  $("#btn-extrato").hidden = false;
  $("#fin-app").hidden = false;
  // A outra pessoa do casal: a previsão de aporte dela (Cadastros do painel dela) e os investimentos conjuntos que ela
  // cadastrou, para a carteira conjunta e o aporte previsto terem uma fonte só nos dois painéis
  const outroDoCasal = parceiro ? (dono.id === perfil.id ? parceiro : { id: perfil.id, nome: perfil.nome || perfil.email }) : null;
  const prefsOutro = outroDoCasal ? await armazem.financas.preferencias(outroDoCasal.id).catch(() => null) : null;
  const curto = (p) => String((p && (p.nome || p.email)) || "").trim().split(/[\s@]/)[0];
  const conjuntos = [...(Array.isArray(prefs && prefs.investimentos) ? prefs.investimentos : []), ...(Array.isArray(prefsOutro && prefsOutro.investimentos) ? prefsOutro.investimentos : [])]
    .filter((i) => i.conta === "casal");
  const mesConj = ultimoMes(conjuntos, hojeISO().slice(0, 7));
  const resConj = mesConj ? resumir(conjuntos, mesConj) : null;
  const metasOutro = prefsOutro && prefsOutro.caixa && prefsOutro.caixa.metas;
  // Plano de aportes com datas: os degraus de quem é o painel e os de quem forma casal (Cadastros e projeção da carteira)
  const pessoasPlano = [{ id: dono.id, nome: curto(dono) }, ...(outroDoCasal ? [{ id: outroDoCasal.id, nome: curto(outroDoCasal) }] : [])];
  const idsPlano = pessoasPlano.map((p) => p.id);
  let planos = await armazem.financas.planosAporte(idsPlano).catch(() => null);
  const planoDoDono = (lista) => (lista || []).filter((d) => d.perfil_id === dono.id);
  // Caixinhas: as de quem é o painel e as do casal (sem a tabela no banco, a aba fica escondida)
  let caixinhas = await armazem.financas.caixinhas(idsPlano).catch(() => null);
  const caixinhasDoDono = (lista) => (lista || []).filter((c) => c.dono === "casal" || c.perfil_id === dono.id);
  // Bancos conectados (Open Finance): sem as tabelas no banco, a aba fica escondida
  bancos = await armazem.financas.bancos(dono.id).catch(() => null);
  painel = desenharFinancas({
    dados: registro.dados,
    carteira: registro.investimentos,
    investimentosCasal: resConj && resConj.total > 0 ? { total: resConj.total, mes: mesConj, data: resConj.data, n: resConj.itens.length } : null,
    outroAporte: outroDoCasal ? { nome: curto(outroDoCasal), valor: metasOutro && metasOutro.investimento_mensal != null && metasOutro.investimento_mensal !== "" ? Number(metasOutro.investimento_mensal) : null } : null,
    modo: registro.modo,
    nome: dono.nome || "",
    linkClaude: link,
    gastosSite: gastos,
    aoLancarGasto: abrirLancamento,
    aoApagarGasto: apagarGasto,
    aoEditarGasto: abrirEdicaoGasto,
    aoPagarGasto: pagarGasto,
    aoEditarMetas: abrirMetas,
    aoImportarExtrato: abrirExtrato,
    entradasSite: entradas,
    aoLancarEntrada: () => abrirEntrada(),
    aoApagarEntrada: apagarEntrada,
    aoEditarEntrada: (id, modelo) => abrirEntrada(id, modelo),
    aoReceberEntrada: receberEntrada,
    aoMudarRecebimento: mudarRecebimento,
    caixa: (prefs && prefs.caixa) || {},
    aoSalvarSaldo: salvarSaldoInicial,
    recorrentes,
    aoPagarRecorrente: abrirLancamento,
    aoDesmarcarRecorrente: desmarcarPagamento,
    aoEditarRecorrente: abrirRecorrente,
    aoValorRecorrente: mudarValorRecorrente,
    categorias: cats,
    ajustes,
    contas: contasTodas,
    aoClassificar: abrirClassificacao,
    aoEditarCategorias: abrirCategorias,
    aoMudarPendencias: renderPendencias,
    comDesejos: !!desejos,
    comInvestimentos: true,
    planoAporte: planos ? planoDoDono(planos) : null,
    planoCasal: planos ? { degraus: planos, pessoas: pessoasPlano } : null,
    caixinhas: caixinhas ? { lista: caixinhasDoDono(caixinhas), perfilId: dono.id } : null,
    comBancos: !!bancos,
    // Categoria de uma entrada (pela descrição, vale para as próximas) ou sugestão dispensada; decisão sobre a entrada do
    // site igual a uma do projeto. Ficam nas preferências do caixa do painel.
    aoCategoriaEntrada: async ({ chave, categoria = null, ignorar = false }) => {
      const c = (prefs && prefs.caixa) || {};
      try {
        if (ignorar) await salvarPrefs({ caixa: { categoriasEntradaIgnoradas: [...new Set([...(c.categoriasEntradaIgnoradas || []), chave])] } });
        else await salvarPrefs({ caixa: { categoriasEntrada: { ...(c.categoriasEntrada || {}), [chave]: categoria } } });
        avisar(ignorar ? "Sugestão dispensada." : "Categoria salva. Vale também para as próximas entradas com a mesma descrição.");
      } catch (err) {
        avisar("Não foi possível salvar: " + err.message);
      }
    },
    aoUnirEntradas: async (idEntrada, decisao) => {
      const c = (prefs && prefs.caixa) || {};
      try {
        await salvarPrefs({ caixa: { uniaoEntradas: { ...(c.uniaoEntradas || {}), [idEntrada]: decisao } } });
        avisar(decisao === "site" ? "Pronto: vale a entrada do site no lugar da do projeto (o total do mês não mudou)." : "Pronto: as duas entradas contam.");
      } catch (err) {
        avisar("Não foi possível salvar: " + err.message);
      }
    },
  });
  if (bancos) {
    bancosUI = prepararBancos({
      bancos,
      perfilId: dono.id,
      salvar: async (c) => {
        await armazem.financas.salvarConexaoBanco(c);
        return (bancos = await armazem.financas.bancos(dono.id));
      },
      apagar: async (id) => {
        await armazem.financas.apagarConexaoBanco(id);
        return (bancos = await armazem.financas.bancos(dono.id));
      },
    });
  }
  if (caixinhas) {
    caixinhasUI = prepararCaixinhas({
      painel,
      pessoas: pessoasPlano,
      dono: dono.id,
      salvar: async (c) => {
        await armazem.financas.salvarCaixinha(c);
        caixinhas = await armazem.financas.caixinhas(idsPlano);
        painel.atualizarCaixinhas(caixinhasDoDono(caixinhas));
        return caixinhas;
      },
      // Depósito: gasto na categoria Caixinhas ligado à caixinha (sai do caixa como caixinha, não como gasto)
      guardar: async ({ caixinha, valor, data, forma }) => {
        const salvo = await armazem.financas.salvarGasto({ perfil_id: dono.id, data, descricao: `Caixinha ${caixinha.nome}`.slice(0, 120), valor, forma: forma || "pix",
          parcelas: 1, categoria: CAT_CAIXINHA, caixinha_id: caixinha.id });
        gastos = [...gastos, salvo];
        await guardarNaLista(CAT_CAIXINHA, null).catch(() => {});
        painel.atualizarGastos(gastos);
        painel.atualizarClassificacao({ categorias: cats });
      },
      editarGasto: abrirEdicaoGasto,
    });
  }
  if (planos) {
    $("#cad-plano").hidden = false;
    const recarregar = async () => (planos = await armazem.financas.planosAporte(idsPlano));
    prepararPlanoAporte({
      pessoas: pessoasPlano,
      degraus: () => planos,
      salvar: async (d) => { await armazem.financas.salvarDegrau(d); return recarregar(); },
      apagar: async (id) => { await armazem.financas.apagarDegrau(id); return recarregar(); },
      aoMudar: (lista) => painel.atualizarPlano(planoDoDono(lista), { degraus: lista, pessoas: pessoasPlano }),
    });
  }
  // Onde investir (aba Investimentos): os investimentos de quem é o painel e os conjuntos da outra pessoa, o aporte
  // previsto do mês e o custo essencial do último mês fechado (dos dois, quando o painel da outra pessoa carrega)
  let essencialOutro = 0;
  const mesFechado = somarMes(hojeISO().slice(0, 7), -1);
  const essencialDe = (p) => { try { return p.detalhe(mesFechado).gastos.filter((g) => g.essencial === true).reduce((t, g) => t + (Number(g.valor) || 0), 0); } catch { return 0; } };
  const minhasPrefs = dono.id === perfil.id ? prefs : prefsOutro;
  const oiUI = desenharOndeInvestir({
    raiz: $("#oi-app"),
    prefixo: "oi",
    estado: (minhasPrefs && minhasPrefs.investir) || {},
    salvar: async (investir) => {
      const r = await armazem.financas.salvarPreferencias(perfil.id, { investir });
      if (dono.id === perfil.id) prefs = r;
    },
    dados: () => {
      const lista = [
        ...(Array.isArray(prefs && prefs.investimentos) ? prefs.investimentos : []).map((inv) => ({ inv, dono: inv.conta === "casal" ? "conjunto" : `só de ${curto(dono)}` })),
        ...(outroDoCasal && Array.isArray(prefsOutro && prefsOutro.investimentos) ? prefsOutro.investimentos.filter((i) => i.conta === "casal") : []).map((inv) => ({ inv, dono: "conjunto" })),
      ];
      const mes = ultimoMes(lista.map((x) => x.inv), hojeISO().slice(0, 7));
      const ap = painel.aporteDoMes(hojeISO().slice(0, 7));
      return {
        investimentos: lista.map((x) => ({ ...x, saldo: mes ? Number((registroAte(x.inv, mes) || {}).saldo) || 0 : 0 })),
        aporte: ap.previsto, nomeAporte: ap.plano ? "plano de aportes" : "previsões do mês",
        essencial: Math.round((essencialDe(painel) + essencialOutro) * 100) / 100, essencialMes: rotuloMes(mesFechado),
      };
    },
  });
  $("#oi-raiz").hidden = false;
  // Vindo das tarefas pendentes (financas.html#classificar): direto para a lista; senão, a janela de tarefas avisa
  // (uma vez por sessão) quando há lançamentos a classificar, gastos a pagar vencidos ou caixinhas atrasadas perto da data
  const avisarTarefas = () => {
    if (location.hash === "#classificar") { $("#classificar").scrollIntoView({ block: "start" }); return; }
    if (dono.id !== perfil.id) return;
    const vencidos = painel.aPagarVencidos();
    const atrasadas = caixinhas ? painel.estadoCaixinhas().linhas.filter((x) => x.conta.alerta).map((x) => ({ nome: x.cx.nome, falta: x.conta.falta, ate: dataBR(x.cx.data_alvo) })) : [];
    mostrarTarefas([tarefaClassificar(pendencias.length, "#classificar"), tarefaAPagar(vencidos.length, vencidos.reduce((t, l) => t + Number(l.valor || 0), 0), "#gastos"), tarefaCaixinhas(atrasadas, "#caixinhas")], {
      perfil, automatico: true,
      aoAbrir: (href) => (href === "#gastos" ? $("#tab-gastos").click() : href === "#caixinhas" ? $("#tab-caixinhas").click() : $("#classificar").scrollIntoView({ block: "start", behavior: "smooth" })),
    });
  };
  // O painel da outra pessoa do casal, só para os cálculos: o "feito" do mês dela no previsto × feito dos aportes, a
  // renda do mês (divisão das caixinhas do casal) e os depósitos e gastos dela ligados às caixinhas
  if (outroDoCasal) {
    lerPainelSoCalculo(armazem, outroDoCasal, { planoAporte: (planos || []).filter((d) => d.perfil_id === outroDoCasal.id) })
      .then((lido) => {
        if (lido) painel.definirParceiro({ id: outroDoCasal.id, nome: curto(outroDoCasal), aporte: lido.painel.aporteDoMes, resumo: lido.painel.resumo,
          receitas: lido.painel.receitasDoMes, gastos: lido.gastos });
        if (caixinhasUI) caixinhasUI.desenhar();
        if (lido) { essencialOutro = essencialDe(lido.painel); oiUI.desenhar(); }
      })
      .catch((e) => console.warn("Painel da outra pessoa do casal:", e.message))
      .finally(avisarTarefas);
  } else avisarTarefas();
  desenharInvestimentosPessoais({
    raiz: $("#inv-pessoal"),
    lista: Array.isArray(prefs && prefs.investimentos) ? prefs.investimentos : [],
    nomeDono: dono.id !== perfil.id ? `Investimentos de ${dono.nome}` : "Seus investimentos",
    nomeCurto: curto(dono),
    doOutro: outroDoCasal ? { nome: curto(outroDoCasal), lista: (Array.isArray(prefsOutro && prefsOutro.investimentos) ? prefsOutro.investimentos : []).filter((i) => i.conta === "casal") } : null,
    contas: () => contas,
    salvar: async (lista) => {
      prefs = await armazem.financas.salvarPreferencias(dono.id, { investimentos: lista });
      return Array.isArray(prefs && prefs.investimentos) ? prefs.investimentos : lista;
    },
    lancarGasto: lancarInvestimentoNoCaixa,
    lancarEntrada: lancarResgateNoCaixa,
  });
  recomecarCategorias();
  recomecarContas();
  desenharRecorrentesCad();
  preencherMetas();
  listarPdfs();
  if (desejos) {
    desenharDesejos({
      armazem,
      perfil: dono,
      nomeDono: dono.id !== perfil.id ? dono.nome : "",
      pessoas: familia,
      // O administrador enxerga os desejos de todos: aqui ficam só os de quem é o painel e os divididos com essa pessoa
      desejos: desejos.filter((d) => d.perfil_id === dono.id || d.outra_id === dono.id),
      plano: (prefs && prefs.plano) || {},
      painel,
      categorias: () => cats,
      caixinhas: caixinhas ? () => painel.estadoCaixinhas().linhas.map((x) => ({ id: x.cx.id, nome: x.cx.nome, saldo: x.conta.saldo, meta: x.cx.meta })) : null,
      salvarPlano: async (plano) => {
        prefs = await armazem.financas.salvarPreferencias(dono.id, { plano });
      },
    });
  }
}

iniciar();
