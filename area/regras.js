// Regras de prazos, alertas e recomendações das ARTs.
// Usado pela área restrita (navegador) e pela rotina diária de e-mails (Node).

export const AVISO_DIAS = 30; // primeiro alerta
export const HORIZONTE_DIAS = 90; // "a vencer" no resumo dos vencimentos (três meses)
export const MARCOS_ANTES = [30, 7, 0]; // dias antes do fim previsto em que há alerta
export const INTERVALO_ATRASO = 7; // depois de vencida, um alerta por semana até a baixa

const DIA = 86400000;

export function hojeISO(agora = new Date()) {
  // data local (Brasil), sem horário
  const d = new Date(agora.getTime() - agora.getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 10);
}

export function diasAte(fimISO, hoje = hojeISO()) {
  if (!fimISO) return null;
  return Math.round((Date.parse(fimISO + "T00:00:00Z") - Date.parse(hoje + "T00:00:00Z")) / DIA);
}

export function dataBR(iso) {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

// ART encerrada: baixada no CREA ou arquivada aqui (sem substituta, complementar ou nova). Não vence mais.
export const encerrada = (art) => !!art.baixa_data || art.acao === "arquivada";

// Situação da ART: baixada | arquivada | sem-data | vencida | vencendo | ativa
export function situacao(art, hoje = hojeISO()) {
  if (art.baixa_data) return "baixada";
  if (art.acao === "arquivada") return "arquivada";
  const dias = diasAte(art.fim, hoje);
  if (dias === null) return "sem-data";
  if (dias < 0) return "vencida";
  if (dias <= AVISO_DIAS) return "vencendo";
  return "ativa";
}

// Faixa do resumo dos vencimentos: vencida, vence em até 30 dias, vence em 31 a 90 dias (ou null: baixada, sem
// data ou com o fim mais longe). A ART baixada ou arquivada não vence mais.
export function faixaVencimento(art, hoje = hojeISO()) {
  if (encerrada(art)) return null;
  const dias = diasAte(art.fim, hoje);
  if (dias === null) return null;
  if (dias < 0) return "vencida";
  if (dias <= AVISO_DIAS) return "30";
  if (dias <= HORIZONTE_DIAS) return "90";
  return null;
}

export function resumoVencimentos(arts, hoje = hojeISO()) {
  const r = { vencidas: [], ate30: [], ate90: [] };
  for (const a of arts) {
    const f = faixaVencimento(a, hoje);
    if (f === "vencida") r.vencidas.push(a);
    else if (f === "30") r.ate30.push(a);
    else if (f === "90") r.ate90.push(a);
  }
  const porFim = (x, y) => String(x.fim).localeCompare(String(y.fim));
  r.vencidas.sort(porFim); r.ate30.sort(porFim); r.ate90.sort(porFim);
  r.semAcao = [...r.vencidas, ...r.ate30].filter((a) => !a.acao).length;
  return r;
}

// Ação escolhida para a ART vencida ou perto de vencer. "Arquivar" encerra a ART aqui quando não há outra que a
// continue (substituta, complementar ou nova): ela sai dos vencimentos e dos alertas.
export const ACOES = {
  baixa: "Dar baixa (obra ou serviço concluído)",
  substituta: "Emitir ART substituta",
  complementar: "Emitir ART complementar",
  nova: "Emitir nova ART",
  arquivada: "Arquivar (sem substituta, complementar ou nova)",
};
// Ações que ainda pedem alguma coisa: a ART continua no indicador até a baixa, o arquivamento ou a nova ART
export const ACOES_PENDENTES = ["baixa", "substituta", "complementar", "nova"];
export const PASSOS_ACAO = {
  baixa: ["Concluir a obra ou o serviço", "Dar baixa por conclusão no portal do CREA",
    "Registrar a baixa aqui: “Registrar baixa” (na lista, no resumo dos vencimentos ou na ART), com a data em que foi feita no CREA"],
  substituta: [
    "Emitir a ART substituta no portal do CREA (use “Copiar dados para nova ART”)",
    "Importar aqui a ART substituta com “Importar nova ART vinculada”: esta ART fica baixada por substituição",
  ],
  complementar: [
    "Emitir a ART complementar no portal do CREA (use “Copiar dados para nova ART”), com o prazo, o valor ou as atividades a mais",
    "Importar aqui a ART complementar com “Importar nova ART vinculada”",
    "No fim da obra ou do serviço, dar baixa nesta ART e na complementar",
  ],
  nova: [
    "Emitir a nova ART no portal do CREA (use “Copiar dados para nova ART”)",
    "Importar aqui a nova ART com “Importar nova ART vinculada”: esta ART fica arquivada",
  ],
  arquivada: ["A ART sai dos vencimentos, dos alertas e do indicador de ação", "Para voltar a acompanhá-la, escolha outra ação"],
};

export const ROTULO_SITUACAO = {
  ativa: "Ativa",
  vencendo: "Vence em até 30 dias",
  vencida: "Vencida sem baixa",
  baixada: "Baixada",
  arquivada: "Arquivada",
  "sem-data": "Sem data de término",
};

// Precisa de baixa ou de alguma ação: não encerrada e vencida, vencendo em até 30 dias ou com ação ainda a fazer
export function precisaAcao(art, hoje = hojeISO()) {
  if (encerrada(art)) return false;
  const f = faixaVencimento(art, hoje);
  return f === "vencida" || f === "30" || ACOES_PENDENTES.includes(art.acao);
}

// Indicador das ARTs que precisam de baixa ou ação: sem ação definida, a dar baixa e aguardando outra ART
export function resumoAcoes(arts, hoje = hojeISO()) {
  const lista = arts.filter((a) => precisaAcao(a, hoje));
  return {
    lista,
    total: lista.length,
    semAcao: lista.filter((a) => !a.acao).length,
    baixa: lista.filter((a) => a.acao === "baixa").length,
    outraArt: lista.filter((a) => ["substituta", "complementar", "nova"].includes(a.acao)).length,
  };
}

// Marco de alerta atingido hoje (ou o mais recente ainda não superado).
// d30 → entre 30 e 8 dias; d7 → entre 7 e 1 dia; d0 → no dia; atraso-N → N-ésima semana após o fim.
export function marcoAtual(art, hoje = hojeISO()) {
  if (encerrada(art)) return null;
  const dias = diasAte(art.fim, hoje);
  if (dias === null || dias > AVISO_DIAS) return null;
  if (dias > 7) return "d30";
  if (dias > 0) return "d7";
  if (dias === 0) return "d0";
  return "atraso-" + (Math.floor((-dias - 1) / INTERVALO_ATRASO) + 1);
}

const cliente = (art) => art.contratante || "não informado";

export function mensagem(art, marco, hoje = hojeISO()) {
  const dias = diasAte(art.fim, hoje);
  const fim = dataBR(art.fim);
  if (marco === "d30" || marco === "d7") {
    return `Daqui a ${dias} dias a ART nº ${art.numero} do cliente ${cliente(art)} vencerá (fim previsto em ${fim}).`;
  }
  if (marco === "d0") return `A ART nº ${art.numero} do cliente ${cliente(art)} vence hoje (${fim}).`;
  return `A ART nº ${art.numero} do cliente ${cliente(art)} venceu em ${fim} e ainda não tem baixa registrada.`;
}

// Alertas a exibir/enviar: um por ART, no marco atual, se ainda não foi marcado como lido/enviado.
export function alertasPendentes(arts, jaTratados = new Set(), hoje = hojeISO()) {
  const lista = [];
  for (const art of arts) {
    const marco = marcoAtual(art, hoje);
    if (!marco) continue;
    const chave = `${art.id || art.numero}:${marco}`;
    if (jaTratados.has(chave)) continue;
    lista.push({ chave, art, marco, mensagem: mensagem(art, marco, hoje), dias: diasAte(art.fim, hoje) });
  }
  return lista.sort((a, b) => a.dias - b.dias);
}

// Texto para colar no portal do CREA ao emitir uma nova ART a partir de uma anterior.
export function textoNovaArt(art) {
  const linhas = [
    `Contratante: ${art.contratante || ""}${art.contratante_doc ? ` – CPF/CNPJ ${art.contratante_doc}` : ""}`,
    art.proprietario && art.proprietario !== art.contratante ? `Proprietário: ${art.proprietario}` : null,
    `Local da obra/serviço: ${[art.endereco, art.local].filter(Boolean).join(" – ")}`,
    art.contrato ? `Contrato: ${art.contrato}` : null,
    art.valor != null ? `Valor do contrato (anterior): R$ ${art.valor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : null,
    `Atividades (TOS):`,
    ...(art.atividades || []).map((a) => `  • ${a.atividade ? a.atividade + " – " : ""}${a.tos} ${a.descricao || ""}`.trimEnd()),
    art.observacao ? `Observação: ${art.observacao}` : null,
    `ART anterior: ${art.numero} (CREA-${art.crea})`,
  ];
  return linhas.filter(Boolean).join("\n");
}
