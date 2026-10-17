// Finanças pessoais (area/financas.html): carrega o painel de quem está logado, desenha com o código do painel
// do projeto Financeiro e importa o arquivo do painel. O administrador escolhe de quem é o painel importado e
// pode atualizar junto as faturas da outra pessoa que vêm no mesmo arquivo (ela vê só o próprio cartão).
import { abrirPagina } from "./sessao.js";
import { linkFinancas, pode } from "./modulos.js";
import { lerArquivoFinancas, soFaturas } from "./financas-importar.js";
import { desenharFinancas } from "./financas-painel.js";
import { $, esc, avisar, opcoes, prepararDialogos } from "./ui.js";

let armazem;
let perfil;
let pessoas = []; // quem pode ter painel (o administrador escolhe o destino da importação)
let leitura = null; // resultado do arquivo escolhido
let nomeArquivo = "";

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const dataHora = (iso) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
};
const semAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const primeiroNome = (p) => semAcento((p.nome || p.email || "").split(/[\s@]/)[0]);
const nomeDe = (p) => (p.id === perfil.id ? `${p.nome || p.email} (você)` : p.nome || p.email);

function mostrarStatus(registro) {
  const gerado = registro.dados && registro.dados.gerado_em ? `Dados do projeto Financeiro de ${registro.dados.gerado_em}` : "Dados do projeto Financeiro";
  $("#fin-status").textContent = `${gerado} · importados em ${dataHora(registro.atualizado_em)}${registro.modo === "faturas" ? " · cartão e faturas" : ""}.`;
}

// ---------------------------------------------------------------- importação
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

  // Faturas da outra pessoa que vêm no mesmo arquivo
  const outra = leitura.outras[0];
  const mostrarOutra = !!outra && adm;
  $("#campo-outra").hidden = !mostrarOutra;
  if (mostrarOutra) {
    $("#rotulo-outra").textContent = `As faturas de ${outra.nome} que vêm neste arquivo (${plural(outra.faturas, "fatura", "faturas")}) vão também para o painel de`;
    const candidata = pessoas.find((p) => p.id !== perfil.id && primeiroNome(p) === semAcento(outra.nome));
    $("#outra-fin").innerHTML = opcoes([["", "Não atualizar agora"], ...pessoas.filter((p) => p.id !== perfil.id).map((p) => [p.id, nomeDe(p)])], candidata ? candidata.id : "");
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
      await armazem.financas.salvar({
        perfil_id: outraDestino, modo: "faturas", dados: soFaturas(leitura.painel, leitura.outras[0].chave), investimentos: null, arquivo: nomeArquivo,
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

  let registro = null;
  try {
    registro = await armazem.financas.ler(perfil.id);
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
  mostrarStatus(registro);
  $("#fin-app").hidden = false;
  desenharFinancas({
    dados: registro.dados,
    carteira: registro.investimentos,
    modo: registro.modo,
    nome: perfil.nome || "",
    linkClaude: link,
  });
}

iniciar();
