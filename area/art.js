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
const filtro = { busca: "", crea: "", situacao: "", para: "" };
const hoje = R.hojeISO();

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
  const d = R.diasAte(art.fim, hoje);
  if (d === null) return "";
  if (d > 0) return `em ${d} dia${d === 1 ? "" : "s"}`;
  if (d === 0) return "hoje";
  return `há ${-d} dia${d === -1 ? "" : "s"}`;
}

function etiqueta(art) {
  const s = R.situacao(art, hoje);
  const dias = textoDias(art);
  return `<span class="etiqueta s-${s}">${esc(R.ROTULO_SITUACAO[s])}${dias ? `<small>${esc(dias)}</small>` : ""}</span>`;
}

const ORDEM = { vencida: 0, vencendo: 1, ativa: 2, "sem-data": 3, baixada: 4 };
function ordenar(lista) {
  return [...lista].sort((a, b) => {
    const sa = R.situacao(a, hoje), sb = R.situacao(b, hoje);
    if (sa !== sb) return ORDEM[sa] - ORDEM[sb];
    const fa = a.fim || "9999", fb = b.fim || "9999";
    return sa === "baixada" ? fb.localeCompare(fa) : fa.localeCompare(fb);
  });
}

// ---------------------------------------------------------------- início
// O login, o menu e o aviso do modo demonstração ficam em sessao.js
async function iniciar() {
  const sessao = await abrirPagina("art.html");
  if (!sessao) return;
  armazem = sessao.armazem;
  $("#tela-painel").hidden = false;
  await recarregar();
}

async function recarregar() {
  [arts, tratados, empresas] = await Promise.all([armazem.listar(), armazem.tratados(), armazem.empresas.listar().catch(() => [])]);
  const filtroPara = $("#filtro-para");
  filtroPara.innerHTML = [["", "Empresas e particulares"], ["empresas", "Todas as empresas"], ...empresas.map((e) => [`e:${e.id}`, e.nome]),
    ["particular", "Clientes particulares"], ["sem", "Não informado"]]
    .map(([v, r]) => `<option value="${esc(v)}"${v === filtro.para ? " selected" : ""}>${esc(r)}</option>`).join("");
  renderizar();
}

function renderizar() {
  renderResumo();
  renderTabela();
  renderAlertas();
}

// ---------------------------------------------------------------- resumo e tabela
function renderResumo() {
  const conta = { ativa: 0, vencendo: 0, vencida: 0, baixada: 0, "sem-data": 0 };
  arts.forEach((a) => conta[R.situacao(a, hoje)]++);
  const cards = [
    ["ativa", "Ativas", "var(--ok)"],
    ["vencendo", "Vencem em até 30 dias", "var(--yellow)"],
    ["vencida", "Vencidas sem baixa", "var(--erro)"],
    ["baixada", "Baixadas", "var(--gray-500)"],
  ];
  $("#resumo").innerHTML = cards
    .map(
      ([s, rotulo, cor]) =>
        `<button class="indicador" type="button" data-situacao="${s}" style="--cor:${cor}" aria-pressed="${filtro.situacao === s}">
          <strong>${conta[s]}</strong><span>${rotulo}</span></button>`
    )
    .join("");
}

function filtradas() {
  const termo = filtro.busca.toLowerCase();
  return arts.filter((a) => {
    if (filtro.crea && a.crea !== filtro.crea) return false;
    if (filtro.situacao && R.situacao(a, hoje) !== filtro.situacao) return false;
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
  $("#tabela tbody").innerHTML = lista
    .map(
      (a) => `<tr class="clicavel" data-id="${esc(a.id)}" tabindex="0">
        <td class="numero">${esc(a.numero)}</td>
        <td>${esc(a.crea)}</td>
        <td>${esc(a.contratante || "—")}<br><small class="dica">${esc(a.local || "")}</small></td>
        <td>${chipVinculo(a)}</td>
        <td class="servico">${esc((a.observacao || "").slice(0, 110))}${(a.observacao || "").length > 110 ? "…" : ""}
          ${(a.tos || []).length ? `<br><small>TOS ${esc(a.tos.join(", "))}</small>` : ""}</td>
        <td class="data">${R.dataBR(a.inicio)}</td>
        <td class="data">${R.dataBR(a.fim)}</td>
        <td>${etiqueta(a)}</td>
      </tr>`
    )
    .join("");
  const vazio = $("#vazio");
  vazio.hidden = lista.length > 0;
  if (!lista.length && arts.length) vazio.textContent = "Nenhuma ART encontrada com esses filtros.";
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
  ["inicio", "Início", "c2", "date"],
  ["fim", "Fim previsto", "c2", "date"],
  ["celebrado", "Celebrado em", "c2", "date"],
  ["observacao", "Serviço / observação", "c6", "textarea"],
  ["notas", "Anotações internas", "c6", "textarea"],
];

function campoHtml([nome, rotulo, cls, tipo], art) {
  const v = art[nome] ?? "";
  let input;
  if (tipo === "textarea") input = `<textarea name="${nome}" rows="3">${esc(v)}</textarea>`;
  else if (tipo === "para") input = `<select name="para">${opcoesPara(paraDe(art))}</select>`;
  else if (tipo === "crea")
    input = `<select name="crea">${["MG", "RJ", "SP", "Outro"].map((c) => `<option${c === v ? " selected" : ""}>${c}</option>`).join("")}</select>`;
  else input = `<input name="${nome}" type="${tipo}"${tipo === "number" ? ' step="0.01" min="0"' : ""} value="${esc(v)}"${nome === "numero" ? " required" : ""}>`;
  return `<label class="${cls}">${rotulo}${input}</label>`;
}

function blocoDecisao(art) {
  const tipo = R.tipoServicoSugerido(art);
  return `<div class="bloco destaque" id="bloco-decisao">
    <h3>O que fazer com esta ART</h3>
    <div class="opcoes" role="radiogroup" aria-label="Tipo de serviço">
      <label><input type="radio" name="tipo_servico" value="pontual"${tipo === "pontual" ? " checked" : ""}> Serviço pontual (laudo, vistoria, projeto)</label>
      <label><input type="radio" name="tipo_servico" value="continuo"${tipo === "continuo" ? " checked" : ""}> Serviço contínuo (PMOC, manutenção, consultoria mensal)</label>
    </div>
    <p class="dica" id="pergunta-decisao"></p>
    <div class="opcoes" role="radiogroup" aria-labelledby="pergunta-decisao">
      <label><input type="radio" name="resposta" value="sim"> Sim</label>
      <label><input type="radio" name="resposta" value="nao"> Não</label>
    </div>
    <div id="recomendacao"></div>
  </div>`;
}

function atualizarDecisao(dlg) {
  const tipo = $("input[name=tipo_servico]:checked", dlg)?.value || "pontual";
  const resp = $("input[name=resposta]:checked", dlg)?.value;
  $("#pergunta-decisao", dlg).textContent =
    tipo === "continuo" ? "O contrato foi renovado para um novo período?" : "O serviço foi concluído?";
  const rec = R.recomendacao(tipo, resp === undefined ? null : resp === "sim");
  $("#recomendacao", dlg).innerHTML = rec
    ? `<div class="recomendacao"><strong>${esc(rec.acao)}</strong><ol>${rec.passos.map((p) => `<li>${esc(p)}</li>`).join("")}</ol></div>`
    : "";
}

// Lançamentos da ART: tirada para uma empresa, vão para a página da empresa (ela paga a taxa: reembolso);
// para cliente particular, para o controle financeiro da engenharia
function blocoFinanceiro(art) {
  const empresa = art.vinculo === "empresa" && empresas.find((e) => e.id === art.empresa_id);
  const id = encodeURIComponent(art.id);
  if (empresa) {
    const pagina = `empresas.html?e=${encodeURIComponent(empresa.id)}`;
    return `<div class="bloco"><h3>Financeiro</h3>
        <div class="linha-acoes">
          <a class="btn btn-claro" href="${pagina}&amp;novo=despesa&amp;art=${id}&amp;categoria=Taxa%20de%20ART">Taxa paga por você (a reembolsar)</a>
          <a class="btn btn-claro" href="${pagina}&amp;novo=receita&amp;art=${id}">Reembolso da taxa pela empresa</a>
        </div>
        <p class="dica">Tirada para ${esc(empresa.nome)}: a empresa paga a taxa. Os lançamentos ficam em Finanças ${esc(empresa.nome)}.</p>
      </div>`;
  }
  return `<div class="bloco"><h3>Financeiro</h3>
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

      ${existente && s !== "baixada" && art.fim ? blocoDecisao(art) : ""}

      ${existente ? `<div class="bloco"><h3>Baixa</h3>
        ${s === "baixada"
          ? `<p>Baixa registrada em <b>${R.dataBR(art.baixa_data)}</b> (${art.baixa_motivo === "interrupcao" ? "interrupção" : "conclusão"}).</p>
             <button class="btn btn-claro" type="button" id="btn-desfazer-baixa">Desfazer baixa</button>`
          : `<div class="linha-acoes">
              <label>Data da baixa<input type="date" name="baixa_data_nova" value="${hoje}"></label>
              <label>Motivo<select name="baixa_motivo_novo"><option value="conclusao">Conclusão</option><option value="interrupcao">Interrupção</option></select></label>
              <button class="btn btn-dark" type="button" id="btn-baixa">Registrar baixa</button>
            </div>
            <p class="dica">Registre aqui depois de dar a baixa no portal do CREA.</p>`}
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
  if ($("#bloco-decisao", dlg)) {
    atualizarDecisao(dlg);
    $("#bloco-decisao", dlg).addEventListener("change", () => atualizarDecisao(dlg));
  }

  const lerFormulario = () => {
    const f = new FormData(form);
    const dados = { ...art };
    for (const [nome, , , tipo] of CAMPOS) {
      if (tipo === "para") continue;
      const v = (f.get(nome) ?? "").toString().trim();
      dados[nome] = v === "" ? null : tipo === "number" ? Number(v) : v;
    }
    Object.assign(dados, vinculoDe(String(f.get("para") || "")));
    const tipoServico = f.get("tipo_servico");
    if (tipoServico) dados.tipo_servico = tipoServico;
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

  $("#btn-baixa", dlg)?.addEventListener("click", async () => {
    const data = form.elements.baixa_data_nova.value || hoje;
    const motivo = form.elements.baixa_motivo_novo.value;
    if (await salvar({ baixa_data: data, baixa_motivo: motivo })) {
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
  if (anterior) dica.textContent = `As ARTs importadas agora serão vinculadas como renovação da ART ${anterior.numero}.`;
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
  const cab = ["Número", "CREA", "Contratante", "Tirada para", "CPF/CNPJ", "Local", "Serviço", "TOS", "Valor", "Início", "Fim previsto", "Situação", "Dias para o fim", "Baixa", "Motivo da baixa"];
  const tiradaPara = (a) => (a.vinculo === "empresa" ? nomeEmpresa(a.empresa_id) || "Empresa removida" : a.vinculo === "particular" ? "Cliente particular" : "");
  const linhas = ordenar(arts).map((a) => [
    a.numero, a.crea, a.contratante, tiradaPara(a), a.contratante_doc, a.local, a.observacao, (a.tos || []).join(", "),
    a.valor == null ? "" : String(a.valor).replace(".", ","), R.dataBR(a.inicio), R.dataBR(a.fim),
    R.ROTULO_SITUACAO[R.situacao(a, hoje)], R.diasAte(a.fim, hoje) ?? "", a.baixa_data ? R.dataBR(a.baixa_data) : "",
    a.baixa_motivo === "interrupcao" ? "Interrupção" : a.baixa_motivo ? "Conclusão" : "",
  ]);
  const csv = [cab, ...linhas].map((l) => l.map((v) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `ARTs-${hoje}.csv` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------- eventos
document.addEventListener("click", async (e) => {
  const alvo = e.target.closest("button, tr.clicavel");
  if (!alvo) return;
  if (alvo.matches("[data-fechar]")) alvo.closest("dialog").close();
  else if (alvo.matches("tr.clicavel")) abrirArt(alvo.dataset.id);
  else if (alvo.matches("[data-situacao]")) {
    filtro.situacao = filtro.situacao === alvo.dataset.situacao ? "" : alvo.dataset.situacao;
    $("#filtro-situacao").value = filtro.situacao;
    renderResumo();
    renderTabela();
  } else if (alvo.matches("[data-ver]")) {
    alternarAlertas(false);
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

$("#tabela").addEventListener("keydown", (e) => {
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
$("#filtro-para").addEventListener("change", (e) => {
  filtro.para = e.target.value;
  renderTabela();
});

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
