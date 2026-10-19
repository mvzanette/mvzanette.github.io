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
import { mostrarCasal } from "./financas-casal.js";
import { categoriaDe, contasDisponiveis, lerCategorias, normalizarCategoria } from "./financas-classificacao.js";
import { aplicarFatura, historicoDeCategorias, lerFaturaPdf, manterFaturasDoSite, montarFatura } from "./financas-faturas.js";
import { decodificarExtrato, lerExtrato, MOTIVOS, saidasDoExtrato } from "./financas-extrato.js";
import { extrairLinhas } from "./pdf-texto.js";
import { $, esc, avisar, opcoes, numeroDigitado, prepararDialogos, conferirPdf } from "./ui.js";

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
let contas = []; // pessoal, engenharia e empresas (conforme as permissões)
let faturaPdf = null; // fatura em PDF sendo processada: { caminho, nome, leitura, quem, montada, destino }
let extrato = null; // extrato da conta sendo importado: { leitura, saidas, entradas }

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

function mostrarStatus() {
  const gerado = registro.dados && registro.dados.gerado_em ? `Dados do projeto Financeiro de ${registro.dados.gerado_em}` : "Dados do projeto Financeiro";
  $("#fin-status").textContent = `${dono.id !== perfil.id ? `Painel de ${dono.nome} · ` : ""}${gerado} · atualizados em ${dataHora(registro.atualizado_em)}${registro.modo === "faturas" ? " · cartão e faturas" : ""}.`;
}

// ---------------------------------------------------------------- categorias e contas nos formulários
// Categoria e subcategoria sempre com a lista de opções da pessoa; "Nova…" abre um campo para escrever
const NOVA = "__nova__";
const igual = (a, b) => semAcento(a).trim() === semAcento(b).trim();

function preencherCategorias(form, categoria, subcategoria) {
  const nomes = cats.lista.map((c) => c.nome);
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
  prefs = await armazem.financas.salvarPreferencias(dono.id, { categorias: { lista: cats.lista, renomeadas: cats.renomeadas } });
  cats.salva = true;
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

function preencherConta(form, atual) {
  const campo = form.querySelector("[data-campo-conta]");
  campo.hidden = contas.length < 2;
  const lista = [...contas];
  if (atual && !lista.some((c) => c.id === atual)) lista.push({ id: atual, nome: "Empresa removida" });
  form.elements.conta.innerHTML = lista.map((c) => `<option value="${esc(c.id)}">${esc(c.nome)}</option>`).join("");
  form.elements.conta.value = atual || "pessoal";
}
const contaEscolhida = (form) => (contas.length > 1 && form.elements.conta.value !== "pessoal" ? form.elements.conta.value : null);

// ---------------------------------------------------------------- gastos lançados pelo site
// Forma de pagamento do último gasto lançado nesta visita: quem lança vários Pix seguidos não troca toda vez
const FORMA_DA_VISITA = "mz-fin-forma";

function abrirLancamento() {
  const form = $("#form-gasto");
  form.reset();
  form.elements.data.value = hojeISO();
  try {
    const forma = sessionStorage.getItem(FORMA_DA_VISITA);
    const opcao = forma && form.querySelector(`[name=forma][value="${CSS.escape(forma)}"]`);
    if (opcao) opcao.checked = true;
  } catch {
    /* sem armazenamento: começa no cartão */
  }
  preencherCategorias(form, "", "");
  preencherConta(form, "pessoal");
  $("#erro-gasto").hidden = true;
  atualizarForma();
  $("#dlg-gasto").showModal();
  form.elements.valor.focus();
}

function atualizarForma() {
  const cartao = $("#form-gasto").elements.forma.value === "cartao";
  $("#campo-parcelas").hidden = !cartao;
  $("#dica-forma").textContent = cartao
    ? "No cartão, o gasto entra na fatura do mês; se for parcelado, cada parcela cai numa fatura."
    : "Fora do cartão, o gasto sai do saldo do mês na hora.";
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
  const { categoria, subcategoria } = lerCategoria(form);
  if (form.elements.categoria.value === NOVA && !categoria) return falha("Escreva o nome da nova categoria.");
  const essencial = form.elements.essencial.value;
  const botao = form.querySelector("[type=submit]");
  botao.disabled = true;
  try {
    const salvo = await armazem.financas.salvarGasto({
      perfil_id: dono.id,
      data: form.elements.data.value,
      descricao: form.elements.descricao.value,
      valor,
      forma: form.elements.forma.value,
      parcelas: form.elements.parcelas.value,
      categoria,
      subcategoria,
      conta: contaEscolhida(form),
      essencial: essencial === "sim" ? true : essencial === "nao" ? false : null,
      observacao: form.elements.observacao.value,
    });
    gastos.push(salvo);
    try {
      sessionStorage.setItem(FORMA_DA_VISITA, salvo.forma);
    } catch {
      /* sem armazenamento: só não lembra */
    }
    await guardarNaLista(categoria, subcategoria).catch(() => {});
    painel.atualizarGastos(gastos);
    painel.atualizarClassificacao({ categorias: cats });
    $("#dlg-gasto").close();
    const parcelado = salvo.forma === "cartao" && salvo.parcelas > 1 ? ` em ${salvo.parcelas}x` : "";
    avisar(salvo.forma === "cartao" ? `Gasto lançado no cartão${parcelado}.` : "Gasto lançado.");
  } catch (err) {
    falha("Não foi possível lançar: " + err.message);
  } finally {
    botao.disabled = false;
  }
}

async function apagarGasto(idGasto) {
  const g = gastos.find((x) => x.id === idGasto);
  if (!g || !confirm(`Apagar o gasto "${g.descricao}" lançado pelo site?`)) return;
  try {
    await armazem.financas.apagarGasto(idGasto);
    gastos = gastos.filter((x) => x.id !== idGasto);
    painel.atualizarGastos(gastos);
    avisar("Gasto apagado.");
  } catch (err) {
    avisar("Não foi possível apagar: " + err.message);
  }
}

function prepararLancamento() {
  $("#form-gasto").elements.parcelas.innerHTML = opcoes(Array.from({ length: 24 }, (_, i) => [String(i + 1), i ? `${i + 1}x` : "À vista (1x)"]), "1");
  $("#formas-gasto").addEventListener("change", atualizarForma);
  prepararCategorias($("#form-gasto"));
  $("#form-gasto").addEventListener("submit", lancarGasto);
}

// ---------------------------------------------------------------- entradas: salário (holerite) e outros recebimentos
let liquidoDigitado = false; // com o líquido digitado à mão, ele deixa de ser calculado
const formEntrada = () => $("#form-entrada");
const valorBR = (v) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const linhaDesconto = (nome = "") => `<div class="desconto-linha">
  <input name="desconto_nome" list="nomes-desconto" maxlength="60" autocomplete="off" placeholder="ex.: INSS" aria-label="Nome do desconto" value="${esc(nome)}">
  <input name="desconto_valor" inputmode="decimal" autocomplete="off" placeholder="0,00" aria-label="Valor do desconto">
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

function abrirEntrada() {
  const form = formEntrada();
  form.reset();
  form.elements.data.value = hojeISO();
  // Os descontos mais comuns já vêm com o nome; os que ficarem sem valor não entram
  $("#descontos-entrada").innerHTML = ["INSS", "IRRF", "Plano de saúde"].map(linhaDesconto).join("");
  preencherConta(form, "pessoal");
  liquidoDigitado = false;
  $("#erro-entrada").hidden = true;
  atualizarTipoEntrada();
  $("#dlg-entrada").showModal();
  form.elements.bruto.focus();
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
  try {
    const salvo = await armazem.financas.salvarEntrada({
      perfil_id: dono.id,
      data: form.elements.data.value,
      tipo: salario ? "salario" : "outro",
      descricao: form.elements.descricao.value,
      bruto: bruto > 0 ? bruto : null,
      descontos,
      liquido,
      conta: contaEscolhida(form),
      observacao: form.elements.observacao.value,
    });
    entradas.push(salvo);
    painel.atualizarEntradas(entradas);
    $("#dlg-entrada").close();
    avisar(salario ? "Salário lançado." : "Entrada lançada.");
  } catch (err) {
    falha("Não foi possível lançar: " + err.message);
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

function prepararEntrada() {
  const form = formEntrada();
  $("#tipos-entrada").addEventListener("change", atualizarTipoEntrada);
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
  $("#btn-entrada-topo").addEventListener("click", abrirEntrada);
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
  form.elements.complemento.value = a.complemento || "";
  $("#dica-classificar").hidden = item.site;
  $("#btn-desfazer-classificacao").hidden = item.site || !item.ajuste;
  $("#dlg-classificar").showModal();
  form.elements.categoria.focus();
}

async function salvarClassificacao(e) {
  e.preventDefault();
  const form = e.target;
  const item = classificando;
  const { categoria, subcategoria } = lerCategoria(form);
  if (form.elements.categoria.value === NOVA && !categoria) return erroClassificar("Escreva o nome da nova categoria.");
  const ess = form.elements.essencial.value;
  const essencial = ess === "sim" ? true : ess === "nao" ? false : null;
  const conta = contas.length > 1 ? contaEscolhida(form) : item.atual.conta === "pessoal" ? null : item.atual.conta;
  const complemento = form.elements.complemento.value.trim() || null;
  const botao = form.querySelector("[type=submit]");
  botao.disabled = true;
  try {
    await guardarNaLista(categoria, subcategoria);
    if (item.site) {
      const salvo = await armazem.financas.atualizarGasto(item.id, { categoria, subcategoria, essencial, observacao: complemento, conta });
      gastos = gastos.map((g) => (g.id === salvo.id ? salvo : g));
      painel.atualizarGastos(gastos);
    } else {
      // Só o que muda em relação ao que veio do projeto fica guardado
      const linha = { perfil_id: dono.id, chave: item.chave, categoria: categoria && !igual(categoria, item.original.categoria) ? categoria : null,
        subcategoria, essencial, complemento, conta };
      const vazio = !linha.categoria && !linha.subcategoria && linha.essencial == null && !linha.complemento && !linha.conta;
      if (vazio) {
        if (item.ajuste) await armazem.financas.apagarAjuste(item.ajuste.id);
        ajustes = ajustes.filter((x) => x.chave !== item.chave);
      } else {
        const [salvo] = await armazem.financas.salvarAjustes([linha]);
        ajustes = [...ajustes.filter((x) => x.chave !== item.chave), salvo];
      }
    }
    painel.atualizarClassificacao({ ajustes, categorias: cats });
    $("#dlg-classificar").close();
    avisar("Classificação salva.");
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
  form.elements.categoria.addEventListener("change", atualizarPadraoEssencial);
  form.addEventListener("submit", salvarClassificacao);
  $("#btn-desfazer-classificacao").addEventListener("click", desfazerClassificacao);
}

// ---------------------------------------------------------------- lista de categorias e subcategorias
let edicao = null; // cópia da lista em edição (original = nome com que a categoria estava salva)

function erroCategorias(texto) {
  $("#erro-categorias").textContent = texto;
  $("#erro-categorias").hidden = !texto;
}

function abrirCategorias() {
  edicao = cats.lista.map((c) => ({ ...c, sub: [...c.sub], original: c.nome }));
  erroCategorias("");
  desenharEdicao();
  $("#dlg-categorias").showModal();
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
  for (const c of lista) delete renomeadas[c.nome]; // nome em uso não é desviado para outro
  const novoNome = (nome) => (trocas.find(([antigo]) => antigo === nome) || [])[1];
  const botao = $("#btn-salvar-categorias");
  botao.disabled = true;
  try {
    // Lançamentos já classificados com o nome antigo passam para o novo
    const mudar = ajustes.filter((a) => novoNome(a.categoria));
    if (mudar.length) {
      const salvos = await armazem.financas.salvarAjustes(mudar.map((a) => ({ ...a, categoria: novoNome(a.categoria) })));
      ajustes = [...ajustes.filter((a) => !salvos.some((s) => s.chave === a.chave)), ...salvos];
    }
    for (const g of gastos.filter((x) => novoNome(x.categoria))) {
      const salvo = await armazem.financas.atualizarGasto(g.id, { categoria: novoNome(g.categoria), subcategoria: g.subcategoria,
        essencial: g.essencial, observacao: g.observacao, conta: g.conta });
      gastos = gastos.map((x) => (x.id === salvo.id ? salvo : x));
    }
    cats = { lista: lista.map(normalizarCategoria), renomeadas, salva: cats.salva };
    await salvarCategorias();
    painel.atualizarGastos(gastos);
    painel.atualizarClassificacao({ ajustes, categorias: cats });
    $("#dlg-categorias").close();
    avisar("Categorias salvas.");
  } catch (err) {
    erroCategorias("Não foi possível salvar: " + err.message);
  } finally {
    botao.disabled = false;
  }
}

function prepararEdicaoCategorias() {
  const lista = $("#lista-categorias");
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
    desenharEdicao();
  });
  $("#btn-salvar-categorias").addEventListener("click", salvarEdicao);
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

  const avisos = [];
  if (!montada.confere) avisos.push(`${f.conferencia}. Confira o PDF antes de atualizar.`);
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
    if (destino && $("#fatura-outra").checked) {
      const atual = await armazem.financas.ler(destino.id);
      await armazem.financas.salvar(atual
        ? { perfil_id: destino.id, modo: atual.modo, dados: comFatura(atual.dados, "dono", montada), investimentos: atual.investimentos, arquivo: atual.arquivo }
        : { perfil_id: destino.id, modo: "faturas", dados: soFaturas(dados, quem), investimentos: null, arquivo: "Faturas em PDF" });
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
  $("#dlg-extrato").showModal();
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
  botao.disabled = !marcadas.length;
  botao.textContent = marcadas.length ? `Importar ${plural(marcadas.length, "gasto", "gastos")}` : "Importar";
}

async function confirmarExtrato() {
  const marcadas = extrato ? extrato.saidas.filter((s) => s.marcado) : [];
  if (!marcadas.length) return;
  const botao = $("#btn-confirmar-extrato");
  botao.disabled = true;
  botao.textContent = "Importando…";
  erroExtrato("");
  try {
    const salvos = await armazem.financas.salvarGastos(marcadas.map((s) => ({
      perfil_id: dono.id, data: s.data, descricao: s.descricao, valor: s.valor, forma: s.forma, parcelas: 1,
      categoria: s.categoria, subcategoria: s.subcategoria, conta: null, essencial: null, observacao: "",
    })));
    gastos.push(...salvos);
    painel.atualizarGastos(gastos);
    $("#dlg-extrato").close();
    avisar(`${plural(salvos.length, "gasto importado", "gastos importados")} do extrato.`);
    location.hash = "gastos";
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
    if (!velho.cartao.faturas.some((f) => f.origem === "pdf")) continue;
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
  prepararFaturaPdf();
  prepararExtrato();
  prepararEntrada();
  prepararClassificacao();
  prepararEdicaoCategorias();

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
  contas = contasDisponiveis(perfil, sessao.empresas);
  mostrarStatus();
  prepararLancamento();
  // Lançar gasto (ou Pix), lançar entrada e importar o extrato ficam no topo, em qualquer aba
  $("#btn-lancar-topo").hidden = false;
  $("#btn-entrada-topo").hidden = false;
  $("#btn-extrato").hidden = false;
  $("#fin-app").hidden = false;
  painel = desenharFinancas({
    dados: registro.dados,
    carteira: registro.investimentos,
    modo: registro.modo,
    nome: dono.nome || "",
    linkClaude: link,
    gastosSite: gastos,
    aoLancarGasto: abrirLancamento,
    aoApagarGasto: apagarGasto,
    aoImportarExtrato: abrirExtrato,
    entradasSite: entradas,
    aoLancarEntrada: abrirEntrada,
    aoApagarEntrada: apagarEntrada,
    categorias: cats,
    ajustes,
    contas,
    aoClassificar: abrirClassificacao,
    aoEditarCategorias: abrirCategorias,
    comDesejos: !!desejos,
  });
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
      salvarPlano: async (plano) => {
        prefs = await armazem.financas.salvarPreferencias(dono.id, { plano });
      },
    });
  }
}

iniciar();
