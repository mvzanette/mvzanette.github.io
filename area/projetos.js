// Projetos e Arquivos (area/projetos.html): o material de cada projeto (ex.: treinamento MAPS da Caterpillar) em pastas.
// Cada item é um arquivo guardado no espaço privado "projetos" do Supabase (Word, PDF, apresentações, planilhas, fotos)
// ou um link (Google Docs, Slides, Drive, YouTube...). Tabelas: projetos e projetos_arquivos (supabase/schema.sql).
import { abrirPagina } from "./sessao.js";
import { LIMITE_PROJETOS } from "./dados.js";
import { $, esc, avisar, opcoes, prepararDialogos } from "./ui.js";

const svg = (caminhos) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${caminhos}</svg>`;
const FOLHA = '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>';

// Tipos de arquivo: filtro, rótulo e ícone. A categoria vem da extensão do nome (ou do tipo informado pelo navegador).
const CATEGORIAS = [
  { id: "documento", titulo: "Documentos", ext: ["doc", "docx", "odt", "rtf", "txt", "md", "pages"], icone: svg(FOLHA + '<path d="M8 13h8M8 17h6"/>') },
  { id: "pdf", titulo: "PDF", ext: ["pdf"], icone: svg(FOLHA + '<path d="M8 17v-4h1.5a1.5 1.5 0 0 1 0 3H8"/>') },
  { id: "apresentacao", titulo: "Apresentações", ext: ["ppt", "pptx", "pps", "ppsx", "odp", "key"], icone: svg('<rect x="3" y="4" width="18" height="12" rx="1"/><path d="M12 16v4M8 20h8"/><path d="M7 12l3-3 2 2 4-4"/>') },
  { id: "planilha", titulo: "Planilhas", ext: ["xls", "xlsx", "xlsm", "csv", "ods", "numbers"], icone: svg('<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 9h18M3 15h18M9 3v18"/>') },
  { id: "foto", titulo: "Fotos", ext: ["jpg", "jpeg", "png", "webp", "heic", "heif", "gif", "bmp", "svg", "tif", "tiff"], icone: svg('<rect x="3" y="4" width="18" height="16" rx="1"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-9 8"/>') },
  { id: "video", titulo: "Vídeos e áudios", ext: ["mp4", "mov", "avi", "mkv", "webm", "m4v", "mp3", "wav", "m4a"], icone: svg('<rect x="3" y="5" width="14" height="14" rx="1"/><path d="m17 10 4-2v8l-4-2"/>') },
  { id: "link", titulo: "Links", ext: [], icone: svg('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>') },
  { id: "outro", titulo: "Outros", ext: [], icone: svg(FOLHA) },
];
const categoriaPorId = (id) => CATEGORIAS.find((c) => c.id === id);

// Caderno de anotações do MAPS (Google Docs): entra junto com o projeto MAPS (o mesmo do supabase/schema.sql)
const CADERNO_MAPS = {
  origem: "link",
  pasta: "Caderno do treinamento",
  nome: "Caderno de anotações – MAPS (23 a 27/11/2026)",
  descricao: "Programação do MAPS – Machine Application & Performance Seminar, dia a dia, com espaço para anotações e comentários. Google Docs \"CATERPILLAR - MAPS\".",
  url: "https://docs.google.com/document/d/1q-MNGN43A0zFJ-61hEkWbidsxwvZowYwz3h30Brh2_M/edit?usp=sharing",
};

// Pastas sugeridas (as que já existem no projeto aparecem também)
const PASTAS_SUGERIDAS = ["Caderno do treinamento", "Apostila e material do aluno", "Apresentações", "Exercícios e avaliações", "Fotos", "Referências técnicas", "Material de venda", "Certificados e listas de presença"];
const SEM_PASTA = "Sem pasta";

const extensao = (nome) => (/\.([a-z0-9]{1,8})$/i.exec(String(nome || "")) || [])[1]?.toLowerCase() || "";

function categoria(item) {
  if (item.origem === "link") return "link";
  const ext = extensao(item.caminho) || extensao(item.nome);
  const porExt = CATEGORIAS.find((c) => c.ext.includes(ext));
  if (porExt) return porExt.id;
  const tipo = String(item.tipo || "");
  if (tipo.startsWith("image/")) return "foto";
  if (tipo.startsWith("video/") || tipo.startsWith("audio/")) return "video";
  if (tipo === "application/pdf") return "pdf";
  return "outro";
}

// Rótulo do tipo: a extensão para arquivos; para links, o serviço (Google Docs, Slides, Drive...)
function rotuloTipo(item) {
  if (item.origem !== "link") return (extensao(item.caminho) || extensao(item.nome) || "arquivo").toUpperCase();
  let u;
  try {
    u = new URL(item.url);
  } catch {
    return "Link";
  }
  const h = u.hostname.replace(/^www\./, "");
  if (h === "docs.google.com") {
    if (u.pathname.startsWith("/document")) return "Google Docs";
    if (u.pathname.startsWith("/presentation")) return "Google Slides";
    if (u.pathname.startsWith("/spreadsheets")) return "Google Planilhas";
    if (u.pathname.startsWith("/forms")) return "Google Forms";
    return "Google";
  }
  if (h === "drive.google.com") return "Google Drive";
  if (h === "youtube.com" || h === "youtu.be" || h.endsWith(".youtube.com")) return "YouTube";
  if (h.endsWith("sharepoint.com") || h === "onedrive.live.com" || h === "1drv.ms") return "OneDrive";
  if (h.endsWith("canva.com")) return "Canva";
  return h;
}

const tamanho = (n) => {
  if (!n) return "";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
};
const dataBR = (iso) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "");
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

let armazem;
let projetos = [];
let itens = [];
let atual = null; // id do projeto aberto
let filtro = ""; // categoria escolhida ("" = todas)
let busca = "";
let paraEnviar = []; // arquivos escolhidos esperando o envio

const ordenarProjetos = (lista) =>
  [...lista].sort((a, b) => (a.situacao === "arquivado") - (b.situacao === "arquivado") || String(a.nome).localeCompare(String(b.nome), "pt-BR"));
const projetoAtual = () => projetos.find((p) => p.id === atual) || null;
const itensDo = (id) => itens.filter((i) => i.projeto_id === id);
const pastasDo = (id) => [...new Set(itensDo(id).map((i) => i.pasta).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
const listaPastas = (id) => `<datalist id="lista-pastas">${[...new Set([...pastasDo(id), ...PASTAS_SUGERIDAS])].map((p) => `<option value="${esc(p)}">`).join("")}</datalist>`;

// ---------------------------------------------------------------------------------------------------------------------
// Tela

function render() {
  const temProjetos = projetos.length > 0;
  $("#proj-vazio").hidden = temProjetos;
  $("#proj-tela").hidden = !temProjetos;
  if (!temProjetos) return;
  if (!projetoAtual()) atual = ordenarProjetos(projetos)[0].id;
  const url = new URL(location.href);
  if (url.searchParams.get("p") !== atual) {
    url.searchParams.set("p", atual);
    history.replaceState(null, "", url);
  }

  $("#proj-abas").innerHTML = ordenarProjetos(projetos).map((p) => `<a class="pilula" href="?p=${esc(p.id)}" data-projeto="${esc(p.id)}"${p.id === atual ? ' aria-current="page"' : ""}>${esc(p.nome)}${p.situacao === "arquivado" ? " (arquivado)" : ""}</a>`).join("");

  const p = projetoAtual();
  const doProjeto = itensDo(p.id);
  const nArq = doProjeto.filter((i) => i.origem !== "link");
  const nLinks = doProjeto.length - nArq.length;
  const total = nArq.reduce((t, i) => t + (Number(i.tamanho) || 0), 0);
  const partes = [plural(nArq.length, "arquivo", "arquivos"), plural(nLinks, "link", "links")];
  if (total) partes.push(`${tamanho(total)} guardados`);
  $("#proj-cab").innerHTML = `
    <div class="proj-cab-texto">
      <h2>${esc(p.nome)}${p.situacao === "arquivado" ? ' <span class="etiqueta">Arquivado</span>' : ""}</h2>
      ${p.cliente ? `<p class="proj-cliente">${esc(p.cliente)}</p>` : ""}
      ${p.descricao ? `<p class="proj-descricao">${esc(p.descricao)}</p>` : ""}
      <p class="dica">${partes.join(" · ")}</p>
    </div>
    <div class="proj-cab-acoes">
      <button class="btn btn-primary" type="button" id="btn-enviar">Enviar arquivos</button>
      <button class="btn btn-claro" type="button" id="btn-link">Adicionar link</button>
      <button class="btn btn-claro" type="button" id="btn-editar-projeto">Editar projeto</button>
    </div>`;

  // Filtros por tipo: só os tipos que existem no projeto
  const contagem = {};
  doProjeto.forEach((i) => (contagem[categoria(i)] = (contagem[categoria(i)] || 0) + 1));
  if (filtro && !contagem[filtro]) filtro = "";
  $("#proj-filtros").innerHTML = doProjeto.length
    ? `<button type="button" class="pilula" data-filtro=""${!filtro ? ' aria-current="page"' : ""}>Todos (${doProjeto.length})</button>` +
      CATEGORIAS.filter((c) => contagem[c.id]).map((c) => `<button type="button" class="pilula" data-filtro="${c.id}"${filtro === c.id ? ' aria-current="page"' : ""}>${c.titulo} (${contagem[c.id]})</button>`).join("")
    : "";

  const termo = busca.trim().toLowerCase();
  const visiveis = doProjeto.filter((i) => (!filtro || categoria(i) === filtro)
    && (!termo || `${i.nome} ${i.descricao || ""} ${i.pasta || ""}`.toLowerCase().includes(termo)));

  // Agrupado por pasta (em ordem alfabética; "Sem pasta" no fim)
  const grupos = new Map();
  visiveis.forEach((i) => {
    const pasta = i.pasta || SEM_PASTA;
    if (!grupos.has(pasta)) grupos.set(pasta, []);
    grupos.get(pasta).push(i);
  });
  const nomesPastas = [...grupos.keys()].sort((a, b) => (a === SEM_PASTA) - (b === SEM_PASTA) || a.localeCompare(b, "pt-BR"));
  $("#proj-lista").innerHTML = nomesPastas.map((pasta) => {
    const lista = grupos.get(pasta).sort((a, b) => String(a.nome).localeCompare(String(b.nome), "pt-BR", { numeric: true }));
    return `<div class="proj-pasta">
      <h2 class="subtitulo-area">${svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>')} ${esc(pasta)} <small>${lista.length}</small></h2>
      <div class="tabela-wrap"><table class="tabela proj-tabela">
        <colgroup><col><col class="proj-c-tipo"><col class="proj-c-tam"><col class="proj-c-data"><col class="proj-c-acoes"></colgroup>
        <thead><tr><th>Nome</th><th>Tipo</th><th class="num">Tamanho</th><th>Adicionado</th><th></th></tr></thead>
        <tbody>${lista.map(linha).join("")}</tbody>
      </table></div>
    </div>`;
  }).join("");
  const vazio = $("#proj-lista-vazia");
  vazio.hidden = visiveis.length > 0;
  vazio.innerHTML = doProjeto.length ? "Nada encontrado com esse filtro ou busca."
    : "Este projeto ainda não tem arquivos. Arraste os arquivos para o quadro acima ou use <b>Adicionar link</b> para um Google Docs, Slides ou Drive.";
}

function linha(i) {
  const cat = categoriaPorId(categoria(i));
  const link = i.origem === "link";
  return `<tr>
    <td><span class="proj-item"><span class="proj-icone proj-${cat.id}">${cat.icone}</span>
      <span><button class="btn-link proj-nome" type="button" data-abrir="${esc(i.id)}">${esc(i.nome)}</button>${i.descricao ? `<br><small class="dica">${esc(i.descricao)}</small>` : ""}</span></span></td>
    <td><span class="etiqueta proj-tipo">${esc(rotuloTipo(i))}</span></td>
    <td class="num">${link ? "" : tamanho(i.tamanho)}</td>
    <td class="data">${dataBR(i.criado_em)}</td>
    <td class="proj-acoes">
      <button class="btn btn-claro" type="button" data-abrir="${esc(i.id)}">Abrir</button>
      ${link ? "" : `<button class="btn btn-claro" type="button" data-baixar="${esc(i.id)}">Baixar</button>`}
      <button class="btn-link" type="button" data-editar="${esc(i.id)}">Editar</button>
    </td></tr>`;
}

// ---------------------------------------------------------------------------------------------------------------------
// Abrir e baixar (link temporário de 10 minutos para os arquivos guardados)

async function abrir(item, baixar = false) {
  if (item.origem === "link") {
    window.open(item.url, "_blank", "noopener");
    return;
  }
  // A janela abre antes de pedir o link, senão o navegador pode bloquear
  const janela = baixar ? null : window.open("", "_blank");
  try {
    const url = await armazem.projetos.url(item.caminho, baixar ? item.nome : undefined);
    if (!url) throw new Error("no modo demonstração o arquivo fica disponível só até recarregar a página.");
    if (janela) {
      janela.opener = null;
      janela.location.href = url;
    } else {
      const a = Object.assign(document.createElement("a"), { href: url, download: item.nome, rel: "noopener" });
      document.body.append(a);
      a.click();
      a.remove();
    }
  } catch (err) {
    if (janela) janela.close();
    avisar("Não foi possível abrir: " + err.message);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Projeto: criar, editar, arquivar e excluir

function abrirProjeto(id, sugestao = {}, itensIniciais = []) {
  const p = projetos.find((x) => x.id === id) || { situacao: "ativo", ...sugestao };
  const existente = !!p.id;
  const dlg = $("#dlg-projeto");
  dlg.innerHTML = `<form id="form-projeto">
    <div class="dlg-cab"><h2 id="titulo-projeto">${existente ? "Editar projeto" : "Novo projeto"}</h2><button class="btn-link" data-fechar type="button">Fechar</button></div>
    <div class="dlg-corpo">
      <div class="campos">
        <label class="c4">Nome do projeto<input name="nome" value="${esc(p.nome)}" required maxlength="120" placeholder="Ex.: Treinamento MAPS – Caterpillar"></label>
        <label class="c2">Situação<select name="situacao">${opcoes([["ativo", "Ativo"], ["arquivado", "Arquivado"]], p.situacao)}</select></label>
        <label class="c6">Cliente / empresa<input name="cliente" value="${esc(p.cliente)}" maxlength="120" placeholder="opcional"></label>
        <label class="c6">Descrição<textarea name="descricao" rows="3" maxlength="2000" placeholder="Objetivo, público, observações">${esc(p.descricao)}</textarea></label>
      </div>
    </div>
    <div class="dlg-rodape">
      ${existente ? '<button class="btn btn-perigo esquerda" type="button" id="btn-excluir-projeto">Excluir projeto</button>' : ""}
      <button class="btn btn-claro" type="button" data-fechar>Cancelar</button>
      <button class="btn btn-primary" type="submit">${existente ? "Salvar" : "Criar projeto"}</button>
    </div>
  </form>`;
  const form = $("#form-projeto", dlg);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const dados = Object.fromEntries(new FormData(form));
    try {
      const salvo = await armazem.colecao("projetos").salvar({ ...(existente ? { id: p.id } : {}), ...dados });
      projetos = projetos.filter((x) => x.id !== salvo.id).concat(salvo);
      atual = salvo.id;
      for (const item of existente ? [] : itensIniciais) {
        itens.push(await armazem.colecao("projetos_arquivos").salvar({ ...item, projeto_id: salvo.id }));
      }
      dlg.close();
      render();
      avisar(existente ? "Projeto salvo." : "Projeto criado. Agora é só enviar os arquivos.");
    } catch (err) {
      avisar("Não foi possível salvar: " + err.message);
    }
  });
  const excluir = $("#btn-excluir-projeto", dlg);
  if (excluir) excluir.addEventListener("click", () => excluirProjeto(p, dlg));
  dlg.showModal();
}

async function excluirProjeto(p, dlg) {
  const doProjeto = itensDo(p.id);
  const aviso = doProjeto.length ? `\n\nOs ${plural(doProjeto.length, "item", "itens")} dele (arquivos e links) também serão apagados, sem volta.` : "";
  if (!confirm(`Excluir o projeto “${p.nome}”?${aviso}\n\nSe quiser só tirar da frente, mude a situação para Arquivado.`)) return;
  try {
    for (const i of doProjeto) {
      if (i.caminho) await armazem.projetos.apagar(i.caminho).catch(() => {});
      await armazem.colecao("projetos_arquivos").remover(i.id);
    }
    await armazem.colecao("projetos").remover(p.id);
    projetos = projetos.filter((x) => x.id !== p.id);
    itens = itens.filter((i) => i.projeto_id !== p.id);
    atual = null;
    dlg.close();
    render();
    avisar("Projeto excluído.");
  } catch (err) {
    avisar("Não foi possível excluir: " + err.message);
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Item: adicionar link, editar (nome, pasta, descrição) e excluir

function abrirItem(id, novoLink = false) {
  const i = itens.find((x) => x.id === id) || { origem: "link", projeto_id: atual };
  const link = i.origem === "link";
  const dlg = $("#dlg-item");
  dlg.innerHTML = `<form id="form-item">
    <div class="dlg-cab"><h2 id="titulo-item">${novoLink ? "Adicionar link" : link ? "Editar link" : "Editar arquivo"}</h2><button class="btn-link" data-fechar type="button">Fechar</button></div>
    <div class="dlg-corpo">
      <div class="campos">
        ${link ? `<label class="c6">Endereço (link)<input name="url" type="url" value="${esc(i.url)}" required maxlength="2000" pattern="https://.+" placeholder="https://docs.google.com/..."></label>` : ""}
        <label class="c6">Nome<input name="nome" value="${esc(i.nome)}"${link ? "" : " required"} maxlength="200" placeholder="${link ? "Ex.: Apostila MAPS (Google Docs)" : ""}"></label>
        <label class="c3">Pasta<input name="pasta" value="${esc(i.pasta)}" maxlength="80" list="lista-pastas" placeholder="Ex.: Apresentações"></label>
        <label class="c3">Projeto<select name="projeto_id">${opcoes(ordenarProjetos(projetos).map((p) => [p.id, p.nome]), i.projeto_id)}</select></label>
        <label class="c6">Descrição<input name="descricao" value="${esc(i.descricao)}" maxlength="500" placeholder="opcional"></label>
      </div>
      ${listaPastas(i.projeto_id)}
      ${link ? '<p class="dica">No Google Docs, Slides ou Drive, use <b>Compartilhar → Copiar link</b>. Quem abrir precisa ter acesso ao arquivo no Google.</p>'
        : `<p class="dica">${esc(rotuloTipo(i))} · ${tamanho(i.tamanho)} · adicionado em ${dataBR(i.criado_em)}</p>`}
    </div>
    <div class="dlg-rodape">
      ${novoLink ? "" : '<button class="btn btn-perigo esquerda" type="button" id="btn-excluir-item">Excluir</button>'}
      <button class="btn btn-claro" type="button" data-fechar>Cancelar</button>
      <button class="btn btn-primary" type="submit">${novoLink ? "Adicionar" : "Salvar"}</button>
    </div>
  </form>`;
  const form = $("#form-item", dlg);
  // Link sem nome: usa o serviço (Google Docs, Slides...) como nome
  if (link) form.url.addEventListener("input", () => {
    form.nome.placeholder = /^https:\/\/\S+/.test(form.url.value) ? `Em branco: “${rotuloTipo({ origem: "link", url: form.url.value.trim() })}”` : "Ex.: Apostila MAPS (Google Docs)";
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const dados = Object.fromEntries(new FormData(form));
    try {
      if (link) {
        dados.url = dados.url.trim();
        if (!dados.nome.trim()) dados.nome = rotuloTipo({ origem: "link", url: dados.url });
      }
      const salvo = await armazem.colecao("projetos_arquivos").salvar({ ...i, ...dados });
      itens = itens.filter((x) => x.id !== salvo.id).concat(salvo);
      atual = salvo.projeto_id;
      dlg.close();
      render();
      avisar(novoLink ? "Link adicionado." : "Salvo.");
    } catch (err) {
      avisar("Não foi possível salvar: " + err.message);
    }
  });
  const excluir = $("#btn-excluir-item", dlg);
  if (excluir) excluir.addEventListener("click", async () => {
    if (!confirm(`Excluir “${i.nome}”?${link ? "" : " O arquivo é apagado do site, sem volta."}`)) return;
    try {
      if (i.caminho) await armazem.projetos.apagar(i.caminho);
      await armazem.colecao("projetos_arquivos").remover(i.id);
      itens = itens.filter((x) => x.id !== i.id);
      dlg.close();
      render();
      avisar("Excluído.");
    } catch (err) {
      avisar("Não foi possível excluir: " + err.message);
    }
  });
  dlg.showModal();
}

// ---------------------------------------------------------------------------------------------------------------------
// Envio de arquivos: escolhe a pasta e manda um por um

function prepararEnvio(arquivos) {
  paraEnviar = [...arquivos];
  if (!paraEnviar.length) return;
  const p = projetoAtual();
  const pastaSugerida = filtro === "apresentacao" ? "Apresentações" : filtro === "foto" ? "Fotos" : "";
  const dlg = $("#dlg-envio");
  dlg.innerHTML = `<form id="form-envio">
    <div class="dlg-cab"><h2 id="titulo-envio">Enviar para “${esc(p.nome)}”</h2><button class="btn-link" data-fechar type="button">Fechar</button></div>
    <div class="dlg-corpo">
      <ul class="proj-envio" id="proj-envio">${paraEnviar.map((f, n) => {
        const grande = f.size > LIMITE_PROJETOS;
        return `<li data-n="${n}"${grande ? ' class="erro"' : ""}><span>${esc(f.name)}</span><small>${tamanho(f.size)}${grande ? " · grande demais (até 50 MB), não será enviado" : ""}</small><b class="proj-envio-status"></b></li>`;
      }).join("")}</ul>
      <div class="campos">
        <label class="c3">Pasta<input name="pasta" maxlength="80" list="lista-pastas" value="${esc(pastaSugerida)}" placeholder="Ex.: Apostila e material do aluno"></label>
        <label class="c3">Descrição (vale para todos)<input name="descricao" maxlength="500" placeholder="opcional"></label>
      </div>
      ${listaPastas(p.id)}
      <p class="dica">Os arquivos ficam num espaço privado: só quem tem o módulo Projetos e Arquivos consegue abrir.</p>
    </div>
    <div class="dlg-rodape">
      <button class="btn btn-claro" type="button" data-fechar>Cancelar</button>
      <button class="btn btn-primary" type="submit" id="btn-confirmar-envio">Enviar ${plural(paraEnviar.filter((f) => f.size <= LIMITE_PROJETOS).length, "arquivo", "arquivos")}</button>
    </div>
  </form>`;
  const form = $("#form-envio", dlg);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const botao = $("#btn-confirmar-envio", dlg);
    botao.disabled = true;
    const { pasta, descricao } = Object.fromEntries(new FormData(form));
    let enviados = 0;
    let falhas = 0;
    for (const [n, f] of paraEnviar.entries()) {
      const status = $(`[data-n="${n}"] .proj-envio-status`, dlg);
      if (f.size > LIMITE_PROJETOS) continue;
      status.textContent = "enviando…";
      try {
        const caminho = await armazem.projetos.enviar(p.id, f);
        const salvo = await armazem.colecao("projetos_arquivos").salvar({
          projeto_id: p.id, origem: "arquivo", nome: f.name.slice(0, 200), pasta, descricao, caminho, tamanho: f.size, tipo: f.type || null,
        }).catch(async (err) => {
          await armazem.projetos.apagar(caminho).catch(() => {}); // sem o registro, o arquivo ficaria perdido no espaço
          throw err;
        });
        itens.push(salvo);
        status.textContent = "enviado";
        enviados++;
      } catch (err) {
        status.textContent = err.message;
        status.closest("li").classList.add("erro");
        falhas++;
      }
    }
    render();
    if (!falhas) {
      dlg.close();
      avisar(`${plural(enviados, "arquivo enviado", "arquivos enviados")}.`);
    } else {
      botao.hidden = true;
      avisar(`${plural(enviados, "arquivo enviado", "arquivos enviados")}; ${plural(falhas, "falhou", "falharam")} (veja a lista).`);
    }
  });
  dlg.showModal();
}

// ---------------------------------------------------------------------------------------------------------------------

function ligarEventos() {
  $("#btn-novo-projeto").addEventListener("click", () => abrirProjeto(null));
  $("#btn-outro-projeto").addEventListener("click", () => abrirProjeto(null));
  $("#btn-primeiro-projeto").addEventListener("click", () => abrirProjeto(null, {
    nome: "Treinamento MAPS – Caterpillar",
    cliente: "Caterpillar",
    descricao: "Material do treinamento MAPS da Caterpillar e o conteúdo derivado dele para treinamentos em empresas (venda ou instrução técnica).",
  }, [CADERNO_MAPS]));

  $("#proj-abas").addEventListener("click", (e) => {
    const a = e.target.closest("[data-projeto]");
    if (!a) return;
    e.preventDefault();
    atual = a.dataset.projeto;
    filtro = "";
    render();
  });
  $("#proj-filtros").addEventListener("click", (e) => {
    const b = e.target.closest("[data-filtro]");
    if (!b) return;
    filtro = b.dataset.filtro;
    render();
  });
  $("#proj-busca").addEventListener("input", (e) => {
    busca = e.target.value;
    render();
  });

  $("#proj-cab").addEventListener("click", (e) => {
    if (e.target.closest("#btn-enviar")) $("#proj-arquivos").click();
    else if (e.target.closest("#btn-link")) abrirItem(null, true);
    else if (e.target.closest("#btn-editar-projeto")) abrirProjeto(atual);
  });
  $("#proj-lista").addEventListener("click", (e) => {
    const b = e.target.closest("[data-abrir], [data-baixar], [data-editar]");
    if (!b) return;
    const item = itens.find((i) => i.id === (b.dataset.abrir || b.dataset.baixar || b.dataset.editar));
    if (!item) return;
    if (b.dataset.editar) abrirItem(item.id);
    else abrir(item, !!b.dataset.baixar);
  });

  const entrada = $("#proj-arquivos");
  entrada.addEventListener("change", () => {
    prepararEnvio(entrada.files);
    entrada.value = "";
  });
  const zona = $("#proj-soltar");
  ["dragenter", "dragover"].forEach((ev) => zona.addEventListener(ev, (e) => {
    e.preventDefault();
    zona.classList.add("arrastando");
  }));
  ["dragleave", "drop"].forEach((ev) => zona.addEventListener(ev, () => zona.classList.remove("arrastando")));
  zona.addEventListener("drop", (e) => {
    e.preventDefault();
    prepararEnvio([...(e.dataTransfer.files || [])]);
  });
}

async function iniciar() {
  const sessao = await abrirPagina("projetos.html");
  if (!sessao) return;
  armazem = sessao.armazem;
  atual = new URLSearchParams(location.search).get("p");
  try {
    [projetos, itens] = await Promise.all([armazem.colecao("projetos").listar(), armazem.colecao("projetos_arquivos").listar()]);
  } catch (err) {
    avisar(err.message);
  }
  prepararDialogos();
  ligarEventos();
  render();
  $("#conteudo").hidden = false;
}

iniciar();
