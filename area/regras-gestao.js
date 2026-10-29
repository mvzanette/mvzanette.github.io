// Regras do controle financeiro, do controle de demandas e dos indicadores do painel.
// Usado pela área restrita (navegador) e pela rotina diária de e-mails (Node).
import { hojeISO, diasAte, dataBR } from "./regras.js";

export const PRAZO_ART_PAINEL = 45; // dias considerados "próximos do vencimento" no painel

// ---------------------------------------------------------------- listas
export const ETAPAS = [
  ["recebida", "Recebida"],
  ["proposta", "Proposta enviada"],
  ["aprovada", "Aprovada"],
  ["execucao", "Em execução"],
  ["concluida", "Concluída"],
  ["perdida", "Não aprovada"],
];
export const ROTULO_ETAPA = Object.fromEntries(ETAPAS);
export const ETAPAS_ABERTAS = ["recebida", "proposta", "aprovada", "execucao"];

export const ORIGENS = [
  ["site", "Formulário do site"],
  ["whatsapp", "WhatsApp"],
  ["email", "E-mail"],
  ["telefone", "Telefone"],
  ["indicacao", "Indicação"],
  ["outro", "Outro"],
];
export const ROTULO_ORIGEM = Object.fromEntries(ORIGENS);

// Tipos de serviço: usados nas demandas e nas categorias de receita, para comparar os dois
export const SERVICOS = [
  "Laudo NR-12",
  "Laudo NR-13",
  "Laudos mecânicos e eletromecânicos",
  "PMOC e climatização",
  "Consultoria em gestão de frotas e ativos",
  "Manutenção industrial",
  "Treinamentos técnicos",
  "Eletrificação de frota",
  "Indicação de serviços técnicos",
  "Outros",
];
export const CATEGORIAS = {
  receita: SERVICOS,
  despesa: ["Deslocamento", "Taxa de ART", "Impostos", "Materiais e equipamentos", "Software e assinaturas",
    "Serviços de terceiros", "Outros"],
};
// Lançamentos com as empresas (finanças das empresas): o que a empresa paga a você e o que você paga por ela
export const CATEGORIAS_EMPRESA = {
  receita: ["Reembolso de despesas", "Pagamento de ART", "Salário e benefícios", "Bônus e PLR", "Serviços prestados", "Outros"],
  despesa: ["Despesa a reembolsar", "Taxa de ART", "Deslocamento", "Alimentação", "Hospedagem", "Materiais", "Outros"],
};
export const FORMAS = ["Pix", "Transferência", "Boleto", "Dinheiro", "Cartão", "Outro"];

// ---------------------------------------------------------------- datas e períodos
const somarDias = (iso, dias) => new Date(Date.parse(iso + "T00:00:00Z") + dias * 86400000).toISOString().slice(0, 10);
const somarMeses = (anoMes, n) => {
  const [a, m] = anoMes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
};
const ultimoDia = (anoMes) => {
  const [a, m] = anoMes.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
};
export const NOME_MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export const rotuloMes = (anoMes) => `${NOME_MES[Number(anoMes.slice(5, 7)) - 1]}/${anoMes.slice(2, 4)}`;

export const PERIODOS = [
  ["ano", "Este ano"],
  ["mes", "Este mês"],
  ["12m", "Últimos 12 meses"],
  ["ano-anterior", "Ano anterior"],
  ["tudo", "Todo o período"],
];

// Intervalo do período e os 12 meses mostrados no gráfico mensal
export function periodo(chave, hoje = hojeISO()) {
  const ano = hoje.slice(0, 4);
  const mes = hoje.slice(0, 7);
  const anoAnt = String(Number(ano) - 1);
  const meses = (fimMes) => Array.from({ length: 12 }, (_, i) => somarMeses(fimMes, i - 11));
  switch (chave) {
    case "mes":
      return { inicio: mes + "-01", fim: ultimoDia(mes), meses: meses(`${ano}-12`) };
    case "12m":
      return { inicio: somarMeses(mes, -11) + "-01", fim: ultimoDia(mes), meses: meses(mes) };
    case "ano-anterior":
      return { inicio: `${anoAnt}-01-01`, fim: `${anoAnt}-12-31`, meses: meses(`${anoAnt}-12`) };
    case "tudo":
      return { inicio: "0000-01-01", fim: "9999-12-31", meses: meses(mes) };
    default:
      return { inicio: `${ano}-01-01`, fim: `${ano}-12-31`, meses: meses(`${ano}-12`) };
  }
}

const dentro = (data, p) => !!data && data >= p.inicio && data <= p.fim;

// ---------------------------------------------------------------- financeiro
// Situação do lançamento: pago (recebido) | atrasado | pendente
export function situacaoLancamento(l, hoje = hojeISO()) {
  if (l.pago_em) return "pago";
  if (l.vencimento && l.vencimento < hoje) return "atrasado";
  return "pendente";
}
export const ROTULO_SITUACAO_LANC = {
  receita: { pago: "Recebido", pendente: "A receber", atrasado: "Atrasado" },
  despesa: { pago: "Pago", pendente: "A pagar", atrasado: "Vencido" },
};

// Data que posiciona o lançamento no tempo: pagamento, vencimento ou competência
export const dataReferencia = (l) => l.pago_em || l.vencimento || l.competencia;

const soma = (lista) => lista.reduce((t, l) => t + (Number(l.valor) || 0), 0);

// Indicadores pelo regime de caixa: recebido e pago dentro do período
export function resumoFinanceiro(lancamentos, p, hoje = hojeISO()) {
  const receitas = lancamentos.filter((l) => l.tipo === "receita");
  const despesas = lancamentos.filter((l) => l.tipo === "despesa");
  const recebidas = receitas.filter((l) => dentro(l.pago_em, p));
  const recebido = soma(recebidas);
  const gastos = soma(despesas.filter((l) => dentro(l.pago_em, p)));
  const lucro = recebido - gastos;
  return {
    recebido,
    gastos,
    lucro,
    margem: recebido > 0 ? lucro / recebido : null,
    aReceber: soma(receitas.filter((l) => situacaoLancamento(l, hoje) === "pendente")),
    atrasado: soma(receitas.filter((l) => situacaoLancamento(l, hoje) === "atrasado")),
    qtdAtrasado: receitas.filter((l) => situacaoLancamento(l, hoje) === "atrasado").length,
    aPagar: soma(despesas.filter((l) => !l.pago_em)),
    ticket: recebidas.length ? recebido / recebidas.length : null,
    qtdRecebidas: recebidas.length,
  };
}

export function porMes(lancamentos, meses) {
  return meses.map((mes) => {
    const doMes = lancamentos.filter((l) => l.pago_em && l.pago_em.slice(0, 7) === mes);
    const receitas = soma(doMes.filter((l) => l.tipo === "receita"));
    const despesas = soma(doMes.filter((l) => l.tipo === "despesa"));
    return { mes, receitas, despesas, resultado: receitas - despesas };
  });
}

export function receitaPorCategoria(lancamentos, p) {
  const totais = new Map();
  for (const l of lancamentos) {
    if (l.tipo !== "receita" || !dentro(l.pago_em, p)) continue;
    const c = l.categoria || "Outros";
    totais.set(c, (totais.get(c) || 0) + (Number(l.valor) || 0));
  }
  return [...totais].map(([categoria, valor]) => ({ categoria, valor })).sort((a, b) => b.valor - a.valor);
}

// ---------------------------------------------------------------- demandas
export const emAberto = (d) => ETAPAS_ABERTAS.includes(d.etapa);

// Dias até o prazo (negativo = atrasada); null se não houver prazo ou se a demanda estiver encerrada
export function diasPrazo(d, hoje = hojeISO()) {
  if (!emAberto(d) || !d.prazo) return null;
  return diasAte(d.prazo, hoje);
}

export function resumoDemandas(demandas, p, hoje = hojeISO()) {
  const porEtapa = Object.fromEntries(ETAPAS.map(([e]) => [e, 0]));
  for (const d of demandas) porEtapa[d.etapa] = (porEtapa[d.etapa] || 0) + 1;
  const abertas = demandas.filter(emAberto);
  // Taxa de aprovação: das propostas enviadas no período, quantas foram aprovadas
  const decididas = demandas.filter((d) => dentro(d.proposta_em || d.recebida_em, p) && !["recebida", "proposta"].includes(d.etapa));
  const aprovadas = decididas.filter((d) => d.etapa !== "perdida").length;
  return {
    porEtapa,
    abertas: abertas.length,
    novas: demandas.filter((d) => dentro(d.recebida_em, p)).length,
    propostas: porEtapa.proposta,
    valorPropostas: soma(demandas.filter((d) => d.etapa === "proposta")),
    valorCarteira: soma(demandas.filter((d) => d.etapa === "aprovada" || d.etapa === "execucao")),
    taxaAprovacao: decididas.length ? aprovadas / decididas.length : null,
    prazosVencidos: abertas.filter((d) => (diasPrazo(d, hoje) ?? 0) < 0).length,
  };
}

// ---------------------------------------------------------------- acompanhamento diário (alerta em tela)
// Próximo passo de cada etapa: o mesmo do e-mail diário, montado no banco (supabase/schema.sql, demandas_resumo_diario)
export function proximoPasso(d) {
  switch (d.etapa) {
    case "recebida": return "Responder o cliente e levantar os dados para a proposta.";
    case "proposta": return "Cobrar o retorno do cliente sobre a proposta.";
    case "aprovada": return d.art_id ? "Agendar a execução do serviço." : "Emitir a ART e agendar a execução do serviço.";
    case "execucao": return d.art_id ? "Concluir o serviço, entregar o laudo e lançar a receita." : "Emitir a ART, concluir o serviço e entregar o laudo.";
    default: return "";
  }
}

const DATA_DA_ETAPA = { proposta: "proposta_em", aprovada: "aprovada_em", execucao: "aprovada_em" };
export const textoDias = (n) => `${n} ${Math.abs(n) === 1 ? "dia" : "dias"}`;

// Demandas em andamento (de recebida a em execução) com os dias corridos desde a chegada, os dias na etapa, o prazo e
// o próximo passo; prazos mais urgentes primeiro, depois as abertas há mais tempo
export function acompanhamentoDemandas(demandas, hoje = hojeISO()) {
  return demandas
    .filter(emAberto)
    .map((d) => {
      const desde = d.recebida_em || hoje;
      return {
        d,
        diasAberta: Math.max(0, -diasAte(desde, hoje)),
        diasNaEtapa: Math.max(0, -diasAte(d[DATA_DA_ETAPA[d.etapa]] || desde, hoje)),
        prazo: diasPrazo(d, hoje),
        passo: proximoPasso(d),
      };
    })
    .sort((a, b) => (a.prazo ?? 1e5) - (b.prazo ?? 1e5) || b.diasAberta - a.diasAberta || String(a.d.titulo).localeCompare(String(b.d.titulo)));
}

// ---------------------------------------------------------------- lembretes por e-mail
// Sem tabela de controle: cada lembrete cai em um dia certo (véspera, dia e uma vez por semana em atraso).
const diaDeLembrete = (dias) => dias === 1 || dias === 0 || (dias < 0 && -dias % 7 === 0);

export function lembretesDemandas(demandas, hoje = hojeISO()) {
  return demandas
    .map((d) => ({ d, dias: diasPrazo(d, hoje) }))
    .filter(({ dias }) => dias !== null && diaDeLembrete(dias))
    .map(({ d, dias }) => {
      const quem = d.cliente || d.contato || "cliente não informado";
      const etapa = ROTULO_ETAPA[d.etapa].toLowerCase();
      const quando = dias === 1 ? "vence amanhã" : dias === 0 ? "vence hoje" : `venceu em ${dataBR(d.prazo)}`;
      return { dias, mensagem: `Demanda "${d.titulo}" (${quem}, ${etapa}): prazo ${quando}.` };
    })
    .sort((a, b) => a.dias - b.dias);
}

export function lembretesRecebimentos(lancamentos, hoje = hojeISO()) {
  return lancamentos
    .filter((l) => l.tipo === "receita" && !l.pago_em && l.vencimento)
    .map((l) => ({ l, dias: diasAte(l.vencimento, hoje) }))
    .filter(({ dias }) => dias === 0 || (dias < 0 && -dias % 7 === 0))
    .map(({ l, dias }) => {
      const valor = Number(l.valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      const quem = l.cliente ? ` de ${l.cliente}` : "";
      const quando = dias === 0 ? "vence hoje" : `está em atraso desde ${dataBR(l.vencimento)}`;
      return { dias, mensagem: `Recebimento${quem} (${l.descricao}, ${valor}) ${quando}.` };
    })
    .sort((a, b) => a.dias - b.dias);
}

export { somarDias };
