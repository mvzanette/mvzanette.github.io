// Regras do painel de ações (sem tela: usadas pela página acoes.html e pela rotina diária do GitHub Actions).
// Os dados de mercado chegam prontos da rotina ferramentas/acoes-atualizar.mjs (tabela acoes_mercado); aqui ficam
// as contas: dividend yield, preço-teto, preço justo, nota de confiabilidade, zona de preço e alertas.
// Tudo é informativo: nenhuma conta daqui é recomendação de compra ou venda.

// Principais ações da B3 acompanhadas por padrão: as maiores do Ibovespa e as boas pagadoras de dividendos.
// Outros códigos entram sozinhos quando alguém os acompanha na página (tabela acoes_acompanhamento).
export const ACOES_PADRAO = [
  "PETR4", "VALE3", "ITUB4", "BBDC4", "BBAS3", "B3SA3", "ABEV3", "WEGE3", "ITSA4", "BBSE3",
  "TAEE11", "EGIE3", "SANB11", "SUZB3", "RENT3", "PRIO3", "VIVT3", "CMIG4", "KLBN11", "CXSE3",
  "ISAE4", "SAPR11", "GGBR4", "RADL3", "EQTL3", "LREN3", "PSSA3", "SBSP3", "BPAC11", "CSMG3",
  "TIMS3", "ALUP11", "UNIP6", "VBBR3", "RDOR3",
];

// Código de ação da B3: 4 letras e 1 ou 2 números (PETR4, TAEE11)
export const codigoValido = (t) => /^[A-Z]{4}\d{1,2}$/.test(String(t || "").trim().toUpperCase());
export const normalizarCodigo = (t) => String(t || "").trim().toUpperCase().replace(/\.SA$/, "");

// Bancos, seguradoras e holdings financeiras: dívida/EBITDA não se aplica
export const FINANCEIRAS = ["ITUB4", "BBDC4", "BBAS3", "SANB11", "BPAC11", "ITSA4", "BBSE3", "CXSE3", "PSSA3", "B3SA3"];
export const ehFinanceira = (a) => FINANCEIRAS.includes(a.ticker) || /financ|bank|banco|insur|segur/i.test(a.setor || "");

const num = (v) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const ano = (iso) => Number(String(iso).slice(0, 4));
const somaDias = (iso, dias) => new Date(Date.parse(iso) + dias * 86400000).toISOString().slice(0, 10);

// Dia útil anterior (sem feriados): a data com é o último dia com direito, um pregão antes da data ex
export function diaUtilAnterior(iso) {
  let d = somaDias(iso, -1);
  while ([0, 6].includes(new Date(d + "T12:00:00Z").getUTCDay())) d = somaDias(d, -1);
  return d;
}

// Data que vale para o direito ao provento: a data com informada ou, sem ela, o dia útil antes da data ex
export const dataDoDireito = (p) => p.data_com || (p.data_ex ? diaUtilAnterior(p.data_ex) : null);

// Proventos (dividendos e JCP) somados por ano da data com: { 2024: 3.21, ... }
export function proventosPorAno(proventos = []) {
  const anos = {};
  for (const p of proventos) {
    const d = dataDoDireito(p), v = num(p.valor);
    if (!d || !(v > 0)) continue;
    anos[ano(d)] = (anos[ano(d)] || 0) + v;
  }
  return anos;
}

// Proventos com data com nos últimos 12 meses (até hoje)
export function proventos12m(proventos = [], hoje) {
  const inicio = somaDias(hoje, -365);
  return proventos.reduce((t, p) => {
    const d = dataDoDireito(p);
    return d && d > inicio && d <= hoje ? t + (num(p.valor) || 0) : t;
  }, 0);
}

// Anos completos já encerrados que a ação estava listada (desde o ano seguinte ao início das negociações)
function anosCompletos(acao, hoje, limite) {
  const atual = ano(hoje);
  const inicio = acao.historico && acao.historico.inicio ? ano(acao.historico.inicio) + 1 : atual - limite;
  const lista = [];
  for (let a = atual - 1; a >= Math.max(inicio, atual - limite); a--) lista.push(a);
  return lista;
}

// Média anual dos proventos dos últimos 5 anos completos (anos sem pagamento contam como zero)
export function mediaProventos5a(acao, hoje) {
  const anos = anosCompletos(acao, hoje, 5);
  if (!anos.length) return null;
  const porAno = proventosPorAno(acao.proventos);
  return anos.reduce((t, a) => t + (porAno[a] || 0), 0) / anos.length;
}

// Preço-teto (método Bazin): o preço em que os proventos médios dariam o rendimento mínimo desejado (padrão 6% ao ano)
export function precoTeto(acao, hoje, rendimento = 0.06) {
  const media = mediaProventos5a(acao, hoje);
  return media > 0 ? media / rendimento : null;
}

// Preço justo (fórmula de Graham): raiz de 22,5 × LPA × VPA, só com lucro e patrimônio positivos
export function precoJusto(acao) {
  const lpa = num(acao.ind && acao.ind.lpa), vpa = num(acao.ind && acao.ind.vpa);
  return lpa > 0 && vpa > 0 ? Math.sqrt(22.5 * lpa * vpa) : null;
}

// Indicadores do mercado, com os que dependem do preço do dia refeitos aqui (o preço pode ser mais novo que o balanço)
export function indicadores(acao, hoje) {
  const ind = acao.ind || {};
  const preco = num(acao.preco);
  const p12 = proventos12m(acao.proventos, hoje);
  const media5 = mediaProventos5a(acao, hoje);
  const lpa = num(ind.lpa), vpa = num(ind.vpa);
  return {
    preco,
    pl: preco && lpa ? preco / lpa : num(ind.pl),
    pvp: preco && vpa ? preco / vpa : num(ind.pvp),
    dy12m: preco ? p12 / preco : null,
    dy5a: preco && media5 != null ? media5 / preco : null,
    proventos12m: p12,
    roe: num(ind.roe),
    margem: num(ind.margem),
    divEbitda: ehFinanceira(acao) ? null : num(ind.divEbitda),
    evEbitda: ehFinanceira(acao) ? null : num(ind.evEbitda),
    payout: lpa > 0 && p12 > 0 ? p12 / lpa : num(ind.payout),
    lpa, vpa,
    valorMercado: num(ind.valorMercado),
    liquidez: num(ind.liquidez),
    beta: num(ind.beta),
    cagrLucro: cagrLucro(acao.lucros),
  };
}

// Crescimento médio anual do lucro entre o primeiro e o último ano informados (os dois positivos)
export function cagrLucro(lucros = []) {
  const l = [...lucros].filter((x) => num(x.lucro) != null).sort((a, b) => a.ano - b.ano);
  if (l.length < 2) return null;
  const [p, u] = [l[0], l[l.length - 1]];
  const anos = u.ano - p.ano;
  return p.lucro > 0 && u.lucro > 0 && anos > 0 ? (u.lucro / p.lucro) ** (1 / anos) - 1 : null;
}

const faixa = (v, zero, cheio) => Math.max(0, Math.min(1, (v - zero) / (cheio - zero)));

// Nota de confiabilidade (0 a 100), pelo histórico: quanto mais tempo a empresa paga, lucra e se mantém saudável,
// maior a nota. Critérios sem dado ficam de fora e a nota é refeita sobre os que existem (a cobertura diz quanto).
export function confiabilidade(acao, hoje) {
  const i = indicadores(acao, hoje);
  const partes = [];
  const parte = (nome, max, fracao, detalhe) => partes.push({ nome, max, pontos: fracao == null ? null : Math.round(fracao * max * 10) / 10, detalhe });
  const anos10 = anosCompletos(acao, hoje, 10);
  const porAno = proventosPorAno(acao.proventos);
  const temProventos = Array.isArray(acao.proventos);

  // 1. Anos com proventos nos últimos 10 (anos antes de a ação existir contam como sem pagamento)
  const pagos = anos10.filter((a) => porAno[a] > 0).length;
  parte("Anos pagando proventos", 25, temProventos && anos10.length ? pagos / 10 : null, `${pagos} dos últimos 10 anos`);

  // 2. Regularidade: anos em que o provento não caiu mais de 25% sobre o ano anterior
  const pares = anos10.slice(0, -1).filter((a) => porAno[a - 1] > 0);
  const firmes = pares.filter((a) => (porAno[a] || 0) >= 0.75 * porAno[a - 1]).length;
  parte("Regularidade dos proventos", 15, temProventos && pares.length >= 3 ? firmes / pares.length : null,
    pares.length >= 3 ? `sem queda forte em ${firmes} de ${pares.length} anos` : "histórico curto");

  // 3. Lucro: anos com lucro positivo e crescimento no período
  const lucros = (acao.lucros || []).filter((l) => num(l.lucro) != null);
  const positivos = lucros.filter((l) => l.lucro > 0).length;
  parte("Anos com lucro", 15, lucros.length >= 2 ? positivos / lucros.length : null,
    lucros.length >= 2 ? `${positivos} de ${lucros.length} anos com lucro` : "sem histórico de lucro");
  parte("Crescimento do lucro", 5, lucros.length >= 2 ? (i.cagrLucro == null ? 0 : faixa(i.cagrLucro, 0, 0.1)) : null,
    i.cagrLucro == null ? "sem crescimento medido" : `${(i.cagrLucro * 100).toFixed(1).replace(".", ",")}% ao ano`);

  // 4. Tempo de bolsa
  const desde = acao.historico && acao.historico.inicio;
  const anosBolsa = desde ? (Date.parse(hoje) - Date.parse(desde.slice(0, 10))) / (365.25 * 86400000) : null;
  parte("Tempo de bolsa", 10, anosBolsa == null ? null : faixa(anosBolsa, 0, 15), anosBolsa == null ? "sem data de início" : `${Math.floor(anosBolsa)} anos`);

  // 5. Rentabilidade (ROE)
  parte("Rentabilidade (ROE)", 10, i.roe == null ? null : faixa(i.roe, 0, 0.15), i.roe == null ? "sem dado" : `ROE de ${Math.round(i.roe * 100)}%`);

  // 6. Endividamento (não se aplica a bancos e seguradoras)
  if (!ehFinanceira(acao)) {
    parte("Endividamento", 10, i.divEbitda == null ? null : i.divEbitda <= 0 ? 1 : 1 - faixa(i.divEbitda, 1, 4),
      i.divEbitda == null ? "sem dado" : `dívida líquida de ${i.divEbitda.toFixed(1).replace(".", ",")}× o EBITDA`);
  }

  // 7. Liquidez: volume médio negociado por dia (escala logarítmica de R$ 1 mi a R$ 50 mi)
  parte("Liquidez diária", 10, i.liquidez == null ? null : i.liquidez <= 0 ? 0 : faixa(Math.log10(i.liquidez), 6, Math.log10(5e7)),
    i.liquidez == null ? "sem dado" : `R$ ${(i.liquidez / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mi por dia`);

  const validas = partes.filter((p) => p.pontos != null);
  const max = validas.reduce((t, p) => t + p.max, 0);
  const total = partes.reduce((t, p) => t + p.max, 0);
  const nota = max >= 30 ? Math.round((validas.reduce((t, p) => t + p.pontos, 0) / max) * 100) : null;
  return { nota, nivel: nivelNota(nota), cobertura: total ? max / total : 0, partes };
}

export const nivelNota = (n) => (n == null ? "sem dados" : n >= 75 ? "alta" : n >= 55 ? "média" : "baixa");

// Zona de preço pelos preços de referência: abaixo do teto (rendimento ≥ 6%), perto (até 10% acima) ou acima.
// O preço justo de Graham entra como segunda opinião (margem de segurança).
export function zonaReferencia(acao, hoje) {
  const preco = num(acao.preco), teto = precoTeto(acao, hoje), justo = precoJusto(acao);
  if (!preco) return { zona: "sem", texto: "sem cotação", teto, justo };
  const margem = justo ? 1 - preco / justo : null;
  if (!teto) return { zona: "sem", texto: "sem proventos para o preço-teto", teto, justo, margem };
  if (teto < preco * 0.25) return { zona: "sem", texto: "proventos irrisórios", teto, justo, margem };
  const z = preco <= teto ? "abaixo" : preco <= teto * 1.1 ? "perto" : "acima";
  const texto = { abaixo: "abaixo do preço-teto", perto: "até 10% acima do teto", acima: "acima do preço-teto" }[z];
  return { zona: z, texto, teto, justo, margem };
}

// Alvos sugeridos para quem ainda não definiu: comprar até o preço-teto; vender (ou rever) a partir de 40% acima
// dele ou do preço justo, o que for maior. Só sugestão: a pessoa confirma ou muda.
export function alvosSugeridos(acao, hoje) {
  const preco = num(acao.preco), justo = precoJusto(acao);
  let teto = precoTeto(acao, hoje);
  if (teto && preco && teto < preco * 0.25) teto = null; // proventos irrisórios (zonaReferencia): o teto não serve de referência
  const r = (v) => (v ? Math.round(v * 100) / 100 : null);
  return { compra: r(teto || (justo ? justo * 0.8 : null)), venda: r(Math.max(teto ? teto * 1.4 : 0, justo ? justo * 1.2 : 0) || null) };
}

// Situação da ação diante dos alvos que a pessoa definiu: zona de compra, de venda ou entre os dois
export function situacaoAlvo(preco, alvo = {}) {
  const p = num(preco), c = num(alvo.preco_compra), v = num(alvo.preco_venda);
  if (!p) return { tipo: "sem", texto: "sem cotação" };
  if (c && p <= c) return { tipo: "compra", texto: "na zona de compra", distancia: p / c - 1 };
  if (v && p >= v) return { tipo: "venda", texto: "na zona de venda", distancia: p / v - 1 };
  if (!c && !v) return { tipo: "sem", texto: "sem alvos" };
  const ate = c ? c / p - 1 : null;
  return { tipo: "entre", texto: c ? `faltam ${Math.round(-ate * 1000) / 10}% para a compra`.replace(".", ",") : "abaixo da venda", distancia: ate };
}

// Alertas de uma pessoa: as ações acompanhadas com alerta ligado, a situação diante dos alvos e a cotação do dia
export function alertasDoDia(acompanhamentos, mercado, hoje) {
  const porCodigo = new Map(mercado.map((a) => [a.ticker, a]));
  return acompanhamentos
    .filter((x) => x.alertar)
    .map((x) => {
      const a = porCodigo.get(x.ticker);
      if (!a) return { ticker: x.ticker, tipo: "sem", texto: "sem cotação", acompanhamento: x };
      const s = situacaoAlvo(a.preco, x);
      const ref = zonaReferencia(a, hoje);
      return { ticker: x.ticker, nome: a.nome, preco: a.preco, variacao: a.variacao, ...s, referencia: ref, nota: confiabilidade(a, hoje).nota, acompanhamento: x };
    })
    .sort((a, b) => ordemTipo(a.tipo) - ordemTipo(b.tipo) || a.ticker.localeCompare(b.ticker));
}
const ordemTipo = (t) => ({ compra: 0, venda: 1, entre: 2, sem: 3 })[t] ?? 4;

// Linha de mercado como vem do banco (colunas + dados jsonb) para o formato usado nas contas
export function deLinha(linha) {
  const d = linha.dados || {};
  return {
    ticker: linha.ticker,
    nome: linha.nome || d.nome || linha.ticker,
    setor: linha.setor || d.setor || null,
    preco: num(linha.preco),
    variacao: num(linha.variacao),
    data_preco: d.data_preco || null,
    atualizado_em: linha.atualizado_em,
    ind: d.ind || {},
    proventos: Array.isArray(d.proventos) ? d.proventos : [],
    lucros: Array.isArray(d.lucros) ? d.lucros : [],
    historico: d.historico || {},
    fontes: d.fontes || [],
    avisos: d.avisos || [],
  };
}
