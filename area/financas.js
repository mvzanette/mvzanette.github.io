// Finanças pessoais (area/financas.html): carrega o painel de quem está logado e desenha com o código do painel
// do projeto Financeiro. Aqui também se lançam os gastos do dia a dia (somam com os do projeto; os de cartão
// entram na fatura), se classificam os lançamentos (categoria, subcategoria, essencial, conta e complemento, com a
// lista de categorias de cada pessoa), se guardam os PDFs das faturas e relatórios, fica a lista de desejos e se
// importa o arquivo do painel. Na importação, o administrador escolhe de quem é o painel e pode atualizar junto as
// faturas da outra pessoa que vêm no arquivo, com ou sem a carteira de investimentos conjunta.
import { abrirPagina } from "./sessao.js";
import { linkFinancas, pode } from "./modulos.js";
import { lerArquivoFinancas, soFaturas } from "./financas-importar.js";
import { desenharFinancas } from "./financas-painel.js";
import { desenharDesejos } from "./financas-desejos.js";
import { categoriaDe, contasDisponiveis, lerCategorias, normalizarCategoria } from "./financas-classificacao.js";
import { $, esc, avisar, opcoes, numeroDigitado, prepararDialogos, conferirPdf } from "./ui.js";

let armazem;
let perfil;
let registro = null; // painel de quem está logado
let painel = null; // retorno de desenharFinancas
let gastos = []; // gastos lançados pelo site
let pessoas = []; // quem pode ter painel (o administrador escolhe o destino da importação)
let leitura = null; // resultado do arquivo escolhido
let nomeArquivo = "";
let prefs = null; // lista de categorias e plano da lista de desejos
let cats = null; // lista de categorias em uso ({ lista, renomeadas })
let ajustes = []; // classificação feita no site para os lançamentos do projeto
let contas = []; // pessoal, engenharia e empresas (conforme as permissões)

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
  $("#fin-status").textContent = `${gerado} · importados em ${dataHora(registro.atualizado_em)}${registro.modo === "faturas" ? " · cartão e faturas" : ""}.`;
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
  prefs = await armazem.financas.salvarPreferencias(perfil.id, { categorias: { lista: cats.lista, renomeadas: cats.renomeadas } });
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
function abrirLancamento() {
  const form = $("#form-gasto");
  form.reset();
  form.elements.data.value = hojeISO();
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
      perfil_id: perfil.id,
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
      const linha = { perfil_id: perfil.id, chave: item.chave, categoria: categoria && !igual(categoria, item.original.categoria) ? categoria : null,
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

async function listarPdfs() {
  let lista = [];
  try {
    lista = await armazem.financas.pdfs(perfil.id);
  } catch (err) {
    mensagemPdf("Não foi possível listar os PDFs: " + err.message, "bad");
  }
  $("#pdfs-lista").innerHTML = lista.length
    ? lista.map((a) => `<div class="file">
        <div><div class="fn">${esc(a.nome)}</div><div class="sub">${a.criado_em ? dataHora(a.criado_em) : ""}${a.tamanho ? ` · ${tamanho(a.tamanho)}` : ""}</div></div>
        <div class="acoes"><button type="button" class="btn sec mini" data-abrir-pdf="${esc(a.caminho)}">Abrir</button><button type="button" class="btn sec mini" data-apagar-pdf="${esc(a.caminho)}">Apagar</button></div>
      </div>`).join("")
    : '<p class="muted" style="margin:0">Nenhum PDF enviado ainda.</p>';
}

async function enviarPdf(arquivo) {
  const problema = await conferirPdf(arquivo);
  if (problema) return mensagemPdf(problema, "warn");
  const botao = $("#btn-enviar-pdf");
  botao.disabled = true;
  mensagemPdf(`Enviando ${arquivo.name}…`);
  try {
    await armazem.financas.enviarPdf(perfil.id, arquivo);
    mensagemPdf(`${arquivo.name} guardado.`, "ok");
    await listarPdfs();
  } catch (err) {
    mensagemPdf("Não foi possível enviar: " + err.message, "bad");
  } finally {
    botao.disabled = false;
  }
}

function prepararPdfs() {
  $("#btn-enviar-pdf").addEventListener("click", () => $("#arquivo-pdf").click());
  $("#arquivo-pdf").addEventListener("change", (e) => {
    const arquivo = e.target.files[0];
    e.target.value = "";
    if (arquivo) enviarPdf(arquivo);
  });
  $("#pdfs-lista").addEventListener("click", async (e) => {
    const abrir = e.target.closest("[data-abrir-pdf]");
    const apagar = e.target.closest("[data-apagar-pdf]");
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
        mensagemPdf("PDF apagado.", "ok");
        await listarPdfs();
      } catch (err) {
        mensagemPdf("Não foi possível apagar: " + err.message, "bad");
      }
    }
  });
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
    erro("Este botão lê o arquivo do painel (HTML) gerado pelo projeto Financeiro. Para guardar PDFs de faturas e relatórios, use “Enviar PDF” na aba Cartão e faturas.");
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
  if (adm) $("#destino-fin").innerHTML = opcoes(pessoas.map((p) => [p.id, nomeDe(p)]), perfil.id);

  // Faturas da outra pessoa que vêm no mesmo arquivo (e, se houver, a carteira conjunta)
  const outra = leitura.outras[0];
  const mostrarOutra = !!outra && adm;
  $("#campo-outra").hidden = !mostrarOutra;
  $("#campo-carteira-outra").hidden = !(mostrarOutra && leitura.carteira);
  if (mostrarOutra) {
    $("#rotulo-outra").textContent = `As faturas de ${outra.nome} que vêm neste arquivo (${plural(outra.faturas, "fatura", "faturas")}) vão também para o painel de`;
    const candidata = pessoas.find((p) => p.id !== perfil.id && primeiroNome(p) === semAcento(outra.nome));
    $("#outra-fin").innerHTML = opcoes([["", "Não atualizar agora"], ...pessoas.filter((p) => p.id !== perfil.id).map((p) => [p.id, nomeDe(p)])], candidata ? candidata.id : "");
    $("#rotulo-carteira-outra").textContent = `Mostrar também a carteira de investimentos${leitura.carteira && leitura.carteira.titulares ? ` (${leitura.carteira.titulares})` : ""} nesse painel`;
  }
  $("#previa-fin").hidden = false;
  $("#btn-confirmar-fin").disabled = false;
}

async function confirmarImportacao() {
  if (!leitura) return;
  const botao = $("#btn-confirmar-fin");
  botao.disabled = true;
  botao.textContent = "Importando…";
  try {
    const destino = $("#campo-destino").hidden ? perfil.id : $("#destino-fin").value;
    await armazem.financas.salvar({
      perfil_id: destino, modo: leitura.modo, dados: leitura.painel, investimentos: leitura.carteira, arquivo: nomeArquivo,
    });
    const outraDestino = $("#campo-outra").hidden ? "" : $("#outra-fin").value;
    if (outraDestino && outraDestino !== destino) {
      const comCarteira = !$("#campo-carteira-outra").hidden && $("#carteira-outra").checked;
      await armazem.financas.salvar({
        perfil_id: outraDestino, modo: "faturas", dados: soFaturas(leitura.painel, leitura.outras[0].chave),
        investimentos: comCarteira ? leitura.carteira : null, arquivo: nomeArquivo,
      });
    }
    $("#dlg-importar-fin").close();
    if (destino === perfil.id) {
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

// ---------------------------------------------------------------- início
async function iniciar() {
  const sessao = await abrirPagina("financas.html");
  if (!sessao) return;
  ({ armazem, perfil } = sessao);
  prepararDialogos();
  prepararImportacao();
  prepararPdfs();
  prepararClassificacao();
  prepararEdicaoCategorias();

  const link = linkFinancas(perfil);
  if (link) {
    $("#link-claude").href = link;
    $("#link-claude").hidden = false;
  }
  $("#conteudo").hidden = false;

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

  let desejos = null;
  let familia = [];
  try {
    registro = await armazem.financas.ler(perfil.id);
    if (registro && registro.modo === "completo") gastos = await armazem.financas.gastos(perfil.id);
    // Classificação, lista de categorias e desejos: com o banco ainda sem as tabelas novas, a página funciona sem eles
    [prefs, ajustes, familia, desejos] = await Promise.all([
      armazem.financas.preferencias(perfil.id).catch(() => null),
      armazem.financas.ajustes(perfil.id).catch(() => []),
      armazem.financas.pessoas().catch(() => []),
      armazem.financas.desejos().catch(() => null),
    ]);
  } catch (e) {
    $("#fin-status").textContent = e.message;
    return;
  }
  if (!registro) {
    if (perfil.papel !== "adm") {
      $("#fin-vazio-texto").textContent = "O seu painel ainda não foi importado. Se o administrador cuida das suas faturas, ele importa por aqui; se você tiver o arquivo do painel, pode importar também.";
    }
    $("#fin-vazio").hidden = false;
    return;
  }
  cats = lerCategorias(prefs, registro.dados);
  contas = contasDisponiveis(perfil, sessao.empresas);
  mostrarStatus();
  prepararLancamento();
  $("#fin-app").hidden = false;
  painel = desenharFinancas({
    dados: registro.dados,
    carteira: registro.investimentos,
    modo: registro.modo,
    nome: perfil.nome || "",
    linkClaude: link,
    gastosSite: gastos,
    aoLancarGasto: registro.modo === "completo" ? abrirLancamento : null,
    aoApagarGasto: registro.modo === "completo" ? apagarGasto : null,
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
      perfil,
      pessoas: familia,
      // O administrador enxerga os desejos de todos: aqui ficam só os dele e os divididos com ele
      desejos: desejos.filter((d) => d.perfil_id === perfil.id || d.outra_id === perfil.id),
      plano: (prefs && prefs.plano) || {},
      painel,
      categorias: () => cats,
      salvarPlano: async (plano) => {
        prefs = await armazem.financas.salvarPreferencias(perfil.id, { plano });
      },
    });
  }
}

iniciar();
