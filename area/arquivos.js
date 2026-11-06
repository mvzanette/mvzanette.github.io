// Portal do cliente – Arquivos e ARTs: os arquivos disponibilizados para o cliente (para baixar) e as ARTs ativas que
// ele acompanha, com o fim previsto e o PDF.
import { abrirPagina } from "./sessao.js";
import { dataBR } from "./regras.js";
import { $, esc, avisar } from "./ui.js";
import { baixarArquivo, linhaArquivo, situacaoArtCliente } from "./portal.js";

let armazem, arquivos = [], arts = [], pedidos = [];

function render() {
  const nomePedido = (id) => (pedidos.find((p) => p.id === id) || {}).titulo;
  $("#tabela-arquivos tbody").innerHTML = arquivos.map((a) => `<tr>
      <td>${linhaArquivo(a)}</td>
      <td>${esc(nomePedido(a.demanda_id) || "—")}</td>
      <td class="data">${a.criado_em ? new Date(a.criado_em).toLocaleDateString("pt-BR") : "—"}</td>
      <td><button class="btn btn-primary" type="button" data-baixar="${esc(a.id)}">Baixar</button></td></tr>`).join("");
  $("#vazio-arquivos").hidden = arquivos.length > 0;

  $("#tabela-arts tbody").innerHTML = arts.map((a) => {
    const [classe, rotulo, detalhe] = situacaoArtCliente(a);
    return `<tr>
      <td><b>${esc(a.numero)}</b><br><small class="dica">CREA-${esc(a.crea || "")}</small></td>
      <td>${esc(a.local || a.endereco || "—")}${a.observacao ? `<br><small class="dica">${esc(String(a.observacao).slice(0, 140))}</small>` : ""}</td>
      <td class="data">${dataBR(a.inicio)}</td>
      <td class="data">${dataBR(a.fim)}</td>
      <td><span class="etiqueta ${classe}">${rotulo}${detalhe ? `<small>${detalhe}</small>` : ""}</span>${a.aviso_cliente ? `<br><small class="dica">aviso por e-mail ${a.aviso_dias} dias antes</small>` : ""}</td>
      <td>${a.pdf_path ? `<button class="btn btn-claro" type="button" data-pdf="${esc(a.id)}">PDF</button>` : ""}</td></tr>`;
  }).join("");
  $("#vazio-arts").hidden = arts.length > 0;
}

async function iniciar() {
  const sessao = await abrirPagina("arquivos.html");
  if (!sessao) return;
  armazem = sessao.armazem;
  try {
    [arquivos, arts, pedidos] = await Promise.all([
      armazem.portal.arquivos(),
      armazem.portal.arts(),
      armazem.portal.pedidos().catch(() => []),
    ]);
  } catch (err) {
    avisar(err.message);
  }
  render();
  $("#conteudo").hidden = false;
  $("#conteudo").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-baixar], [data-pdf]");
    if (!b) return;
    try {
      if (b.dataset.baixar) await baixarArquivo(armazem, arquivos.find((a) => a.id === b.dataset.baixar), { cliente: true });
      else {
        const url = await armazem.urlPdf(arts.find((a) => a.id === b.dataset.pdf).pdf_path);
        if (url) window.open(url, "_blank", "noopener");
        else avisar("No modo demonstração o PDF fica disponível só até recarregar a página.");
      }
    } catch (err) {
      avisar("Não foi possível baixar: " + err.message);
    }
  });
}

iniciar();
