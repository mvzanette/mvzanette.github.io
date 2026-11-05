// Portal do cliente – Meus pedidos: as demandas com o e-mail do cliente (ou do cliente dele na base), com a etapa,
// as datas, o recado do engenheiro e os arquivos de cada pedido.
import { abrirPagina } from "./sessao.js";
import { dataBR } from "./regras.js";
import { $, esc, moeda, avisar } from "./ui.js";
import { ROTULO_CLIENTE, linhaDoTempo, proximoCliente, baixarArquivo, linhaArquivo } from "./portal.js";

let armazem, pedidos = [], arquivos = [];

function render() {
  $("#vazio").hidden = pedidos.length > 0;
  $("#lista-pedidos").innerHTML = pedidos.map((d) => {
    const meus = arquivos.filter((a) => a.demanda_id === d.id);
    return `<article class="cartao-painel pedido">
      <header class="pedido-cab">
        <div><h2>${esc(d.titulo)}</h2><p class="dica">${d.servico ? esc(d.servico) + " · " : ""}pedido de ${dataBR(d.recebida_em)}</p></div>
        <span class="etapa etapa-${esc(d.etapa)}">${esc(ROTULO_CLIENTE[d.etapa] || d.etapa)}</span>
      </header>
      ${linhaDoTempo(d)}
      <p class="pedido-proximo">${esc(proximoCliente(d.etapa))}</p>
      ${d.nota_cliente ? `<div class="recado"><b>Recado do engenheiro</b><p>${esc(d.nota_cliente).replace(/\n/g, "<br>")}</p></div>` : ""}
      <dl class="pedido-dados">
        ${d.valor != null ? `<div><dt>Valor da proposta</dt><dd>${moeda(d.valor)}</dd></div>` : ""}
        ${d.art_numero ? `<div><dt>ART do serviço</dt><dd>${esc(d.art_numero)}</dd></div>` : ""}
        ${d.atualizado_em ? `<div><dt>Última atualização</dt><dd>${new Date(d.atualizado_em).toLocaleDateString("pt-BR")}</dd></div>` : ""}
      </dl>
      ${meus.length ? `<div class="bloco"><h3>Arquivos deste pedido</h3><ul class="lista-arquivos">${meus.map((a) =>
        `<li><span>${linhaArquivo(a)}</span><button class="btn btn-claro" type="button" data-baixar="${esc(a.id)}">Baixar</button></li>`).join("")}</ul></div>` : ""}
    </article>`;
  }).join("");
}

async function iniciar() {
  const sessao = await abrirPagina("pedidos.html");
  if (!sessao) return;
  armazem = sessao.armazem;
  try {
    [pedidos, arquivos] = await Promise.all([armazem.portal.pedidos(), armazem.portal.arquivos().catch(() => [])]);
  } catch (err) {
    avisar(err.message);
  }
  render();
  $("#conteudo").hidden = false;
  $("#lista-pedidos").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-baixar]");
    if (!b) return;
    try {
      await baixarArquivo(armazem, arquivos.find((a) => a.id === b.dataset.baixar), { cliente: true });
    } catch (err) {
      avisar(err.message);
    }
  });
}

iniciar();
