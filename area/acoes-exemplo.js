// Dados FICTÍCIOS do painel de ações, só para o modo demonstração e para o teste da rotina (--teste).
// Os números não são cotações nem balanços reais: servem para ver a tela funcionando sem o banco.

const hoje = new Date();
const anoAtual = hoje.getFullYear();
const iso = (d) => d.toISOString().slice(0, 10);

// Proventos de exemplo: "pagos" por ano a partir de "desde", em "vezes" parcelas, crescendo "cresce" ao ano
function proventos({ base, desde, vezes = 2, cresce = 0.04, falhas = [] }) {
  const lista = [];
  for (let a = desde; a <= anoAtual; a++) {
    if (falhas.includes(a)) continue;
    const total = base * (1 + cresce) ** (a - desde);
    for (let i = 0; i < vezes; i++) {
      const mes = Math.floor((12 / vezes) * i) + 2;
      const data = new Date(Date.UTC(a, mes, 15));
      if (data > hoje) continue;
      lista.push({ data_com: iso(data), pagamento: iso(new Date(Date.UTC(a, mes + 1, 10))), valor: Math.round((total / vezes) * 10000) / 10000, tipo: i % 2 ? "JCP" : "Dividendo" });
    }
  }
  return lista;
}

const lucros = (base, cresce, negativos = []) =>
  [4, 3, 2, 1].map((k) => ({ ano: anoAtual - k, lucro: negativos.includes(anoAtual - k) ? -base * 0.3 : base * (1 + cresce) ** (4 - k) }));

function semanal(preco, oscila) {
  const pontos = [];
  for (let s = 52; s >= 0; s--) {
    const d = new Date(hoje.getTime() - s * 7 * 86400000);
    pontos.push([iso(d), Math.round(preco * (1 + oscila * Math.sin(s / 6) - (oscila / 2) * (s / 52)) * 100) / 100]);
  }
  pontos[pontos.length - 1][1] = preco;
  return pontos;
}

function acao(ticker, nome, setor, preco, variacao, ind, prov, luc, inicio, oscila = 0.08) {
  const pontos = semanal(preco, oscila);
  const precos = pontos.map((p) => p[1]);
  return {
    ticker, nome, setor, preco, variacao,
    atualizado_em: hoje.toISOString(),
    dados: {
      data_preco: iso(hoje),
      ind,
      proventos: prov,
      lucros: luc,
      historico: { inicio, min52: Math.min(...precos), max52: Math.max(...precos), mm200: precos.slice(-40).reduce((t, v) => t + v, 0) / 40, ret12m: preco / precos[0] - 1, ret5a: 0.35, semanal: pontos },
      fontes: ["Exemplo (números fictícios)"],
      avisos: [],
    },
  };
}

export const ACOES_EXEMPLO = [
  acao("TAEE11", "Exemplo Transmissão (fictício)", "Utilities", 38.9, 0.004,
    { lpa: 3.6, vpa: 22, roe: 0.17, margem: 0.42, divEbitda: 3.1, evEbitda: 8.5, valorMercado: 13e9, liquidez: 6e7, beta: 0.4 },
    proventos({ base: 1.6, desde: anoAtual - 14, vezes: 4, cresce: 0.04 }), lucros(1.2e9, 0.04), "2006-07-01", 0.05),
  acao("BBAS3", "Exemplo Banco (fictício)", "Financial Services", 27.5, -0.012,
    { lpa: 5.4, vpa: 32, roe: 0.18, margem: 0.21, valorMercado: 155e9, liquidez: 4e8, beta: 0.9 },
    proventos({ base: 0.75, desde: anoAtual - 14, vezes: 4, cresce: 0.08, falhas: [anoAtual - 9] }), lucros(30e9, 0.1), "2000-01-03"),
  acao("WEGE3", "Exemplo Motores (fictício)", "Industrials", 41.2, 0.018,
    { lpa: 1.5, vpa: 6.1, roe: 0.31, margem: 0.16, divEbitda: -0.3, evEbitda: 22, valorMercado: 172e9, liquidez: 3e8, beta: 0.6 },
    proventos({ base: 0.25, desde: anoAtual - 14, vezes: 4, cresce: 0.15 }), lucros(5e9, 0.15), "2000-01-03"),
  acao("PETR4", "Exemplo Petróleo (fictício)", "Energy", 31.4, -0.006,
    { lpa: 6.1, vpa: 31, roe: 0.2, margem: 0.18, divEbitda: 1.4, evEbitda: 3.6, valorMercado: 410e9, liquidez: 1.4e9, beta: 1.1 },
    proventos({ base: 0.9, desde: anoAtual - 14, vezes: 4, cresce: 0.1, falhas: [anoAtual - 11, anoAtual - 10, anoAtual - 9] }), lucros(100e9, -0.05, [anoAtual - 4]), "2000-01-03", 0.12),
  acao("MGLU3", "Exemplo Varejo (fictício)", "Consumer Cyclical", 9.8, 0.031,
    { lpa: -0.4, vpa: 14, roe: -0.03, margem: -0.01, divEbitda: 3.8, evEbitda: 9, valorMercado: 7e9, liquidez: 1.2e8, beta: 1.8 },
    proventos({ base: 0.05, desde: anoAtual - 12, vezes: 1, cresce: 0, falhas: [anoAtual - 4, anoAtual - 3, anoAtual - 2, anoAtual - 1, anoAtual] }), lucros(5e8, -0.3, [anoAtual - 3, anoAtual - 2, anoAtual - 1]), "2011-05-02", 0.25),
];
