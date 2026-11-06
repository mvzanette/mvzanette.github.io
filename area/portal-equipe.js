// Portal do cliente, lado da equipe: bloco "Arquivos para o cliente" (enviar, baixar, apagar e ver se ele já baixou)
// e os botões de convite, usados nas demandas e na base de clientes.
import { $, esc, avisar } from "./ui.js";
import { baixarArquivo, linhaArquivo, RESPOSTA_CONVITE } from "./portal.js";

const quando = (iso) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "");

// lista: os arquivos já enviados para este alvo; alvo: { email, cliente_id, demanda_id } que o novo arquivo recebe
export function blocoArquivos(lista, { semDestino = false } = {}) {
  return `<div class="bloco" data-arquivos-cliente><h3>Arquivos para o cliente baixar</h3>
    ${lista.length ? `<ul class="lista-arquivos">${lista.map((a) => `<li>
        <span>${linhaArquivo(a, ` · enviado em ${quando(a.criado_em)}${a.downloads ? ` · <b>baixado ${a.downloads}×</b> (último em ${quando(a.baixado_em)})` : " · ainda não baixado"}`)}</span>
        <span class="linha-acoes"><button class="btn-link" type="button" data-arq-baixar="${esc(a.id)}">Baixar</button>
        <button class="btn-link perigo" type="button" data-arq-apagar="${esc(a.id)}">Apagar</button></span></li>`).join("")}</ul>`
      : '<p class="dica">Nenhum arquivo enviado para o cliente.</p>'}
    ${semDestino ? '<p class="dica">Informe o e-mail do cliente (ou ligue a demanda a um cliente da base) e salve para poder enviar arquivos.</p>'
      : `<div class="linha-acoes">
        <label>Arquivo (até 50 MB)<input type="file" data-arq-arquivo multiple></label>
        <label>Descrição (opcional)<input data-arq-descricao maxlength="500" placeholder="Ex.: Laudo NR-12 assinado"></label>
        <button class="btn btn-claro" type="button" data-arq-enviar>Enviar para o cliente</button>
      </div>
      <p class="dica">O cliente vê e baixa em <b>Arquivos e ARTs</b>, no portal dele.</p>`}
  </div>`;
}

export function ligarArquivos(raiz, { armazem, lista, alvo, depois }) {
  const bloco = $("[data-arquivos-cliente]", raiz);
  if (!bloco) return;
  bloco.addEventListener("click", async (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    try {
      if (b.dataset.arqBaixar) await baixarArquivo(armazem, lista.find((a) => a.id === b.dataset.arqBaixar));
      else if (b.dataset.arqApagar) {
        const a = lista.find((x) => x.id === b.dataset.arqApagar);
        if (!confirm(`Apagar o arquivo ${a.nome}? O cliente deixa de ver.`)) return;
        await armazem.portal.apagarArquivo(a.caminho).catch(() => {});
        await armazem.colecao("arquivos_cliente").remover(a.id);
        avisar("Arquivo apagado.");
        await depois();
      } else if ("arqEnviar" in b.dataset) {
        const arquivos = [...$("[data-arq-arquivo]", bloco).files];
        if (!arquivos.length) return avisar("Escolha o arquivo.");
        const grande = arquivos.find((f) => f.size > 50 * 1048576);
        if (grande) return avisar(`${grande.name} passa de 50 MB.`);
        const descricao = $("[data-arq-descricao]", bloco).value.trim() || null;
        b.disabled = true;
        b.textContent = "Enviando…";
        for (const f of arquivos) {
          const caminho = await armazem.portal.enviarArquivo(f);
          await armazem.colecao("arquivos_cliente").salvar({
            email: alvo.email || null, cliente_id: alvo.cliente_id || null, demanda_id: alvo.demanda_id || null,
            nome: f.name, descricao, caminho, tamanho: f.size, tipo: f.type || null,
          });
        }
        avisar(arquivos.length === 1 ? "Arquivo enviado para o cliente." : `${arquivos.length} arquivos enviados para o cliente.`);
        await depois();
      }
    } catch (err) {
      avisar("Não foi possível: " + err.message);
      b.disabled = false;
    }
  });
}

// Convite para o portal: um botão por e-mail sem acesso; quem já tem aparece marcado
export function blocoConvite(emails, comConta, nome) {
  if (!emails.length) return `<div class="bloco"><h3>Acesso ao portal do cliente</h3><p class="dica">Cadastre um e-mail para o cliente acompanhar pelo site.</p></div>`;
  return `<div class="bloco"><h3>Acesso ao portal do cliente</h3>
    <ul class="lista-simples">${emails.map((e) => `<li>${esc(e)}: ${comConta.includes(e)
      ? '<b class="ok-texto">tem acesso</b>'
      : `sem acesso <button class="btn-link" type="button" data-convidar="${esc(e)}" data-nome="${esc(nome || "")}">Convidar para acompanhar</button>`}</li>`).join("")}</ul>
    <p class="dica">O convite é um e-mail com o link para o cliente criar a senha. Depois de entrar, ele vê as solicitações, os arquivos e as ARTs acompanhadas.</p>
  </div>`;
}

export function ligarConvites(raiz, armazem, depois) {
  raiz.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-convidar]");
    if (!b) return;
    b.disabled = true;
    try {
      const r = await armazem.portal.convidar(b.dataset.convidar, b.dataset.nome);
      avisar(RESPOSTA_CONVITE[r] || "Convite processado.");
      if (depois) await depois(r);
    } catch (err) {
      avisar("Não foi possível convidar: " + err.message);
      b.disabled = false;
    }
  });
}
