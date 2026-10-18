// Finanças pessoais (area/financas.html): carrega o painel de quem está logado e desenha com o código do painel
// do projeto Financeiro. Aqui também se lançam os gastos do dia a dia (somam com os do projeto; os de cartão
// entram na fatura), se guardam os PDFs das faturas e relatórios e se importa o arquivo do painel. Na importação,
// o administrador escolhe de quem é o painel e pode atualizar junto as faturas da outra pessoa que vêm no arquivo,
// com ou sem a carteira de investimentos conjunta.
import { abrirPagina } from "./sessao.js";
import { linkFinancas, pode } from "./modulos.js";
import { lerArquivoFinancas, soFaturas } from "./financas-importar.js";
import { desenharFinancas } from "./financas-painel.js";
import { $, esc, avisar, opcoes, numeroDigitado, prepararDialogos, conferirPdf } from "./ui.js";

let armazem;
let perfil;
let registro = null; // painel de quem está logado
let painel = null; // retorno de desenharFinancas
let gastos = []; // gastos lançados pelo site
let pessoas = []; // quem pode ter painel (o administrador escolhe o destino da importação)
let leitura = null; // resultado do arquivo escolhido
let nomeArquivo = "";

const CATEGORIAS = ["Mercado e padaria", "Restaurantes", "Transporte", "Saúde", "Casa", "Lazer", "Vestuário", "Assinaturas", "Educação", "Outros"];

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
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

// ---------------------------------------------------------------- gastos lançados pelo site
function abrirLancamento() {
  const form = $("#form-gasto");
  form.reset();
  form.elements.data.value = hojeISO();
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
      categoria: form.elements.categoria.value,
      essencial: essencial === "sim" ? true : essencial === "nao" ? false : null,
      observacao: form.elements.observacao.value,
    });
    gastos.push(salvo);
    painel.atualizarGastos(gastos);
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
  const cats = new Set(CATEGORIAS);
  for (const m of (registro.dados && registro.dados.meses) || []) for (const l of m.lancamentos || []) if (l.cat) cats.add(l.cat);
  $("#categorias-gasto").innerHTML = [...cats].sort((a, b) => a.localeCompare(b, "pt-BR")).map((c) => `<option value="${esc(c)}">`).join("");
  $("#form-gasto").elements.parcelas.innerHTML = opcoes(Array.from({ length: 24 }, (_, i) => [String(i + 1), i ? `${i + 1}x` : "À vista (1x)"]), "1");
  $("#formas-gasto").addEventListener("change", atualizarForma);
  $("#form-gasto").addEventListener("submit", lancarGasto);
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

  try {
    registro = await armazem.financas.ler(perfil.id);
    if (registro && registro.modo === "completo") gastos = await armazem.financas.gastos(perfil.id);
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
  });
  listarPdfs();
}

iniciar();
