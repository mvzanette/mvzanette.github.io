// Área restrita – Clientes: a base de clientes da engenharia. Cada cliente tem os e-mails de acesso ao portal, as
// solicitações (demandas), as ARTs que ele acompanha e os arquivos disponibilizados para ele.
import { abrirPagina } from "./sessao.js";
import { dataBR } from "./regras.js";
import * as G from "./regras-gestao.js";
import { $, esc, avisar, opcoes, prepararDialogos } from "./ui.js";
import { situacaoArtCliente } from "./portal.js";
import { blocoArquivos, ligarArquivos, blocoConvite, ligarConvites } from "./portal-equipe.js";

const UFS = "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ");
let armazem, colecao;
let clientes = [], demandas = [], arts = [], arquivos = [], comConta = [];

export const lerEmails = (texto) =>
  [...new Set(String(texto || "").split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)))];

const doCliente = (c) => {
  const emails = c.emails || [];
  return {
    demandas: demandas.filter((d) => d.cliente_id === c.id || (d.email && emails.includes(d.email.toLowerCase()))),
    arts: arts.filter((a) => a.cliente_id === c.id && a.acompanhada),
    arquivos: arquivos.filter((a) => a.cliente_id === c.id || (a.email && emails.includes(a.email))),
  };
};

async function recarregar() {
  [clientes, demandas, arts, arquivos] = await Promise.all([
    colecao.listar(),
    armazem.colecao("demandas").listar().catch(() => []),
    armazem.listar().catch(() => []),
    armazem.portal.arquivos().catch(() => []),
  ]);
  clientes.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  comConta = await armazem.portal.emailsComConta([...new Set(clientes.flatMap((c) => c.emails || []))]);
  renderTabela();
}

function renderTabela() {
  const termo = $("#busca").value.trim().toLowerCase();
  const filtro = $("#filtro").value;
  const lista = clientes.filter((c) => {
    const tem = (c.emails || []).some((e) => comConta.includes(e));
    if (filtro === "portal" && !tem) return false;
    if (filtro === "sem-portal" && tem) return false;
    if (filtro === "arts" && !doCliente(c).arts.length) return false;
    return !termo || [c.nome, c.documento, (c.emails || []).join(" "), c.cidade].join(" ").toLowerCase().includes(termo);
  });
  $("#tabela tbody").innerHTML = lista.map((c) => {
    const x = doCliente(c);
    return `<tr class="clicavel" tabindex="0" data-id="${esc(c.id)}">
      <td><b>${esc(c.nome)}</b>${c.documento ? `<br><small class="dica">${esc(c.documento)}</small>` : ""}</td>
      <td>${(c.emails || []).map((e) => `${esc(e)}${comConta.includes(e) ? ' <small class="ok-texto">· acessa</small>' : ""}`).join("<br>") || "—"}</td>
      <td>${esc(c.cidade || "—")}${c.uf ? "/" + esc(c.uf) : ""}</td>
      <td class="num">${x.demandas.length}</td>
      <td class="num">${x.arts.length}</td>
      <td class="num">${x.arquivos.length}</td></tr>`;
  }).join("");
  $("#vazio").hidden = lista.length > 0;
}

function abrirCliente(id) {
  const existente = clientes.find((c) => c.id === id);
  const c = existente ? { ...existente } : { emails: [] };
  const x = existente ? doCliente(c) : { demandas: [], arts: [], arquivos: [] };
  const dlg = $("#dlg-cliente");
  dlg.innerHTML = `<form id="form-cliente">
    <div class="dlg-cab"><h2>${existente ? esc(c.nome) : "Novo cliente"}</h2><button class="btn-link" data-fechar type="button">Fechar</button></div>
    <div class="dlg-corpo">
      <div class="campos">
        <label class="c4">Nome / razão social<input name="nome" value="${esc(c.nome)}" required maxlength="160"></label>
        <label class="c2">CPF / CNPJ<input name="documento" value="${esc(c.documento)}" maxlength="30"></label>
        <label class="c6">E-mails de acesso ao portal (separe com vírgula)<input name="emails" value="${esc((c.emails || []).join(", "))}" placeholder="compras@empresa.com.br, gerente@empresa.com.br"></label>
        <label class="c2">Telefone / WhatsApp<input name="telefone" value="${esc(c.telefone)}" maxlength="40"></label>
        <label class="c3">Cidade<input name="cidade" value="${esc(c.cidade)}" maxlength="80"></label>
        <label class="c1 campo-uf">UF<select name="uf"><option value="">—</option>${opcoes(UFS, c.uf)}</select></label>
        <label class="c6">Observações<textarea name="observacao" rows="2" maxlength="2000">${esc(c.observacao)}</textarea></label>
      </div>
      ${existente ? `
      ${blocoConvite(c.emails || [], comConta, c.nome)}
      <div class="bloco"><h3>Solicitações (${x.demandas.length})</h3>
        ${x.demandas.length ? `<ul class="lista-simples">${x.demandas.map((d) => `<li>${dataBR(d.recebida_em)} · <b>${esc(d.titulo)}</b> · <span class="etapa etapa-${esc(d.etapa)}">${esc(G.ROTULO_ETAPA[d.etapa] || d.etapa)}</span></li>`).join("")}</ul>`
          : '<p class="dica">Nenhuma demanda deste cliente. As demandas com um dos e-mails acima entram aqui sozinhas.</p>'}
      </div>
      <div class="bloco"><h3>ARTs acompanhadas (${x.arts.length})</h3>
        ${x.arts.length ? `<ul class="lista-simples">${x.arts.map((a) => { const [cl, r, dt] = situacaoArtCliente(a); return `<li><b>${esc(a.numero)}</b> · fim ${dataBR(a.fim)} · <span class="etiqueta ${cl}">${r}${dt ? `<small>${dt}</small>` : ""}</span>${a.aviso_cliente ? ` · aviso ${a.aviso_dias} dias antes` : ""}</li>`; }).join("")}</ul>`
          : '<p class="dica">Nenhuma ART acompanhada. Ligue uma ART a este cliente no Controle de ART (bloco “Acompanhamento pelo cliente”).</p>'}
      </div>
      ${blocoArquivos(x.arquivos)}` : '<p class="dica">Salve o cliente para convidar, ver as solicitações e enviar arquivos.</p>'}
    </div>
    <div class="dlg-rodape">
      ${existente ? '<button class="btn btn-perigo esquerda" type="button" id="btn-excluir">Excluir</button>' : ""}
      <button class="btn btn-claro" type="button" data-fechar>Cancelar</button>
      <button class="btn btn-primary" type="submit">Salvar</button>
    </div>
  </form>`;
  const form = $("#form-cliente", dlg);
  const reabrir = async () => { await recarregar(); abrirCliente(c.id); };
  if (existente) {
    ligarArquivos(form, { armazem, lista: x.arquivos, alvo: { cliente_id: c.id }, depois: reabrir });
    ligarConvites(form, armazem, reabrir);
  }
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const dados = { ...c };
    for (const n of ["nome", "documento", "telefone", "cidade", "uf", "observacao"]) dados[n] = String(f.get(n) || "").trim() || null;
    dados.emails = lerEmails(f.get("emails"));
    if (!dados.nome) return avisar("Informe o nome do cliente.");
    const repetido = clientes.find((o) => o.id !== c.id && (o.emails || []).some((e) => dados.emails.includes(e)));
    if (repetido && !confirm(`O e-mail ${repetido.emails.find((e) => dados.emails.includes(e))} já está em ${repetido.nome}. Salvar assim mesmo?`)) return;
    try {
      const salvo = await colecao.salvar(dados);
      avisar("Cliente salvo.");
      await recarregar();
      if (existente) dlg.close();
      else abrirCliente(salvo.id);
    } catch (err) {
      avisar("Não foi possível salvar: " + err.message);
    }
  });
  $("#btn-excluir", form)?.addEventListener("click", async () => {
    if (!confirm(`Excluir ${c.nome}? As demandas e ARTs continuam, só perdem a ligação; os arquivos enviados só para este cliente são apagados.`)) return;
    for (const a of arquivos.filter((a) => a.cliente_id === c.id && !a.email)) await armazem.portal.apagarArquivo(a.caminho).catch(() => {});
    await colecao.remover(c.id);
    dlg.close();
    avisar("Cliente excluído.");
    await recarregar();
  });
  if (!dlg.open) dlg.showModal();
}

// Cria clientes a partir das demandas sem cliente da base (agrupadas pelo nome do cliente) e liga as demandas a eles
async function trazerDasDemandas() {
  const chave = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();
  const soltas = demandas.filter((d) => !d.cliente_id && (d.cliente || d.contato));
  const grupos = new Map();
  for (const d of soltas) {
    const email = (d.email || "").toLowerCase();
    const existente = clientes.find((c) => chave(c.nome) === chave(d.cliente || d.contato) || (email && (c.emails || []).includes(email)));
    const k = existente ? `id:${existente.id}` : chave(d.cliente || d.contato);
    if (!grupos.has(k)) grupos.set(k, { existente, nome: d.cliente || d.contato, demandas: [], emails: new Set(), d });
    const g = grupos.get(k);
    g.demandas.push(d);
    if (email) g.emails.add(email);
  }
  const novos = [...grupos.values()].filter((g) => !g.existente).length;
  if (!grupos.size) return avisar("Todas as demandas já estão ligadas a um cliente da base.");
  if (!confirm(`${soltas.length} demandas sem cliente da base: ${novos} clientes novos e ${grupos.size - novos} já cadastrados. Criar e ligar?`)) return;
  try {
    for (const g of grupos.values()) {
      const salvo = g.existente
        ? await colecao.salvar({ ...g.existente, emails: [...new Set([...(g.existente.emails || []), ...g.emails])] })
        : await colecao.salvar({ nome: g.nome, emails: [...g.emails], telefone: g.d.telefone || null, cidade: g.d.cidade || null, uf: g.d.uf || null });
      for (const d of g.demandas) await armazem.colecao("demandas").salvar({ ...d, cliente_id: salvo.id });
    }
    avisar("Clientes criados e demandas ligadas.");
  } catch (err) {
    avisar("Parou no meio: " + err.message);
  }
  await recarregar();
}

async function iniciar() {
  const sessao = await abrirPagina("clientes.html");
  if (!sessao) return;
  armazem = sessao.armazem;
  colecao = armazem.colecao("clientes");
  prepararDialogos();
  try {
    await recarregar();
  } catch (err) {
    avisar(err.message);
  }
  $("#conteudo").hidden = false;
  $("#btn-novo").addEventListener("click", () => abrirCliente(null));
  $("#btn-importar").addEventListener("click", trazerDasDemandas);
  $("#busca").addEventListener("input", renderTabela);
  $("#filtro").addEventListener("change", renderTabela);
  $("#tabela tbody").addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-id]");
    if (tr) abrirCliente(tr.dataset.id);
  });
  $("#tabela tbody").addEventListener("keydown", (e) => {
    const tr = e.target.closest("tr[data-id]");
    if (tr && e.key === "Enter") abrirCliente(tr.dataset.id);
  });
  const abrir = new URLSearchParams(location.search).get("c");
  if (abrir && clientes.some((c) => c.id === abrir)) abrirCliente(abrir);
}

iniciar();
