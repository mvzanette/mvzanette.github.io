// Portal do cliente: partes comuns de Meus pedidos (pedidos.html), Arquivos e ARTs (arquivos.html) e das telas da
// equipe que mandam arquivos e convites (demandas.html, clientes.html e art.html).
import { dataBR, diasAte, hojeISO } from "./regras.js";
import { esc } from "./ui.js";

// Etapas como o cliente vê (a etapa "perdida" aparece como encerrada, sem o termo interno)
export const ETAPAS_CLIENTE = [
  ["recebida", "Pedido recebido", "recebida_em"],
  ["proposta", "Proposta enviada", "proposta_em"],
  ["aprovada", "Aprovada", "aprovada_em"],
  ["execucao", "Em execução", null],
  ["concluida", "Concluída", "concluida_em"],
];
export const ROTULO_CLIENTE = { ...Object.fromEntries(ETAPAS_CLIENTE.map(([e, r]) => [e, r])), perdida: "Encerrada" };

// O que o cliente pode esperar em cada etapa
const PROXIMO_CLIENTE = {
  recebida: "O engenheiro vai entrar em contato para confirmar os dados e preparar a proposta.",
  proposta: "A proposta foi enviada. Responda ao engenheiro para aprovar ou tirar dúvidas.",
  aprovada: "Serviço aprovado: a ART e o agendamento estão sendo preparados.",
  execucao: "O serviço está em andamento.",
  concluida: "Serviço concluído. Os documentos ficam em Arquivos e ARTs.",
  perdida: "Esta solicitação foi encerrada. Para retomar, fale com o engenheiro.",
};
export const proximoCliente = (etapa) => PROXIMO_CLIENTE[etapa] || "";

// Linha do tempo das etapas, com a data de cada uma quando houver
export function linhaDoTempo(d) {
  const atual = ETAPAS_CLIENTE.findIndex(([e]) => e === d.etapa);
  return `<ol class="linha-tempo${d.etapa === "perdida" ? " encerrada" : ""}">${ETAPAS_CLIENTE.map(([e, rotulo, campo], i) => {
    const estado = d.etapa === "perdida" ? (d[campo] ? "feito" : "") : i < atual || d.etapa === "concluida" ? "feito" : i === atual ? "atual" : "";
    const data = campo && d[campo] ? `<small>${dataBR(d[campo])}</small>` : "";
    return `<li class="${estado}"${i === atual ? ' aria-current="step"' : ""}><span>${rotulo}</span>${data}</li>`;
  }).join("")}</ol>`;
}

export const tamanhoTexto = (n) =>
  n == null ? "" : n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1).replace(".", ",")} MB`;

// Baixa um arquivo do portal (link temporário) e, se for o cliente, registra o download
export async function baixarArquivo(armazem, a, { cliente = false } = {}) {
  const url = await armazem.portal.urlArquivo(a.caminho, a.nome);
  if (!url) throw new Error("No modo demonstração o arquivo fica disponível só até recarregar a página.");
  if (cliente) armazem.portal.registrarDownload(a.id).catch(() => {});
  window.open(url, "_blank", "noopener");
}

// Situação de uma ART acompanhada, para o cliente: ativa, vence em breve ou vencida
export function situacaoArtCliente(art, hoje = hojeISO()) {
  if (!art.fim) return ["s-ativa", "Ativa", "sem fim previsto"];
  const dias = diasAte(art.fim, hoje);
  if (dias < 0) return ["s-vencida", "Vencida", `venceu há ${-dias} ${-dias === 1 ? "dia" : "dias"}`];
  if (dias === 0) return ["s-vencida", "Vence hoje", ""];
  if (dias <= 30) return ["s-vencendo", "Vence em breve", `em ${dias} ${dias === 1 ? "dia" : "dias"}`];
  return ["s-ativa", "Ativa", `faltam ${dias} dias`];
}

// Mensagem do convite, conforme a resposta do banco
export const RESPOSTA_CONVITE = {
  enviado: "Convite enviado: o cliente recebe o e-mail para criar a senha e acompanhar pelo site.",
  ja_tem_conta: "Este e-mail já tem acesso ao site. O cliente entra com a senha dele (ou usa Esqueci a senha).",
  sem_configuracao: "O convite ainda não está ligado: falta configurar o e-mail no Supabase (veja o README, Portal do cliente).",
  email_invalido: "E-mail inválido.",
  demo: "No modo demonstração nenhum e-mail é enviado.",
};

export const linhaArquivo = (a, extra = "") => `<b>${esc(a.nome)}</b>${a.descricao ? `<br><small class="dica">${esc(a.descricao)}</small>` : ""}
  <small class="dica">${tamanhoTexto(a.tamanho)}${extra}</small>`;
