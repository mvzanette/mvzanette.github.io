// Lê o arquivo do painel do projeto Financeiro (o HTML que o projeto gera ou um JSON com os mesmos dados)
// e separa o que vai para o banco: os dados do painel, os da carteira de investimentos e o modo.
// Nada daqui fica no código do site: os dados vêm do arquivo escolhido na hora da importação.

const LIMITE_BYTES = 8 * 1024 * 1024;

// Acha a chave que fecha o objeto aberto em t[i], respeitando os textos entre aspas
function fimDoObjeto(t, i) {
  let nivel = 0;
  let aspas = false;
  for (let k = i; k < t.length; k++) {
    const c = t[k];
    if (aspas) {
      if (c === "\\") k++;
      else if (c === '"') aspas = false;
      continue;
    }
    if (c === '"') aspas = true;
    else if (c === "{") nivel++;
    else if (c === "}" && --nivel === 0) return k;
  }
  return -1;
}

// No HTML do painel, os dados ficam em blocos "const D = {...};" (um do painel e outro da carteira)
function blocosDoHtml(texto) {
  const blocos = [];
  const re = /const\s+D\s*=\s*\{/g;
  let m;
  while ((m = re.exec(texto))) {
    const inicio = m.index + m[0].length - 1;
    const fim = fimDoObjeto(texto, inicio);
    if (fim < 0) break;
    try {
      blocos.push(JSON.parse(texto.slice(inicio, fim + 1)));
    } catch {
      /* bloco que não é JSON puro: ignora */
    }
    re.lastIndex = fim;
  }
  return blocos;
}

const ehPainel = (o) => !!o && Array.isArray(o.meses) && !!o.cartao && typeof o.cartao === "object";
const ehCarteira = (o) => !!o && Array.isArray(o.posicoes);
const ehObjeto = (v) => !!v && typeof v === "object" && !Array.isArray(v);

// Outras pessoas cujas faturas vêm no painel (ex.: o cartão de alguém da família): blocos com "cartao.faturas"
export function outrasPessoas(painel) {
  return Object.entries(painel || {})
    .filter(([, v]) => ehObjeto(v) && ehObjeto(v.cartao) && Array.isArray(v.cartao.faturas))
    .map(([chave, v]) => ({ chave, nome: chave.charAt(0).toUpperCase() + chave.slice(1), faturas: v.cartao.faturas.length }));
}

// Painel só com o cartão e as faturas de uma das outras pessoas (o que ela vê no próprio painel)
export function soFaturas(painel, chave) {
  const p = painel[chave] || {};
  return {
    perfil: "faturas",
    gerado_em: painel.gerado_em || null,
    rotulos_meses: painel.rotulos_meses,
    meses: [],
    recorrentes: [],
    relatorios: p.relatorios || [],
    cartao: p.cartao,
    cartao_nome: p.cartao_nome || "",
  };
}

// Tira o que o site não usa e o que só faz sentido no computador de origem (pasta, caminhos, notas internas)
function limparPainel(painel) {
  const limpo = structuredClone(painel);
  delete limpo.pasta;
  for (const chave of Object.keys(limpo)) {
    if (ehObjeto(limpo[chave])) delete limpo[chave]._como_usar;
  }
  delete limpo._como_usar;
  return limpo;
}

function limparCarteira(carteira) {
  if (!carteira) return null;
  const limpa = structuredClone(carteira);
  delete limpa._como_usar;
  return limpa;
}

// Resultado: { painel, carteira, modo: "completo" | "faturas", outras: [{ chave, nome, faturas }], resumo }
export function lerArquivoFinancas(texto) {
  if (!texto || texto.length > LIMITE_BYTES) throw new Error("Arquivo vazio ou grande demais para ser o painel.");
  let painel = null;
  let carteira = null;
  let perfil = null;

  const inicio = texto.trimStart();
  if (inicio.startsWith("{")) {
    let json;
    try {
      json = JSON.parse(inicio);
    } catch {
      throw new Error("O arquivo JSON não pôde ser lido.");
    }
    painel = [json.painel, json.dados, json].find(ehPainel) || null;
    carteira = [json.carteira, json.investimentos, json].find(ehCarteira) || null;
  } else {
    const blocos = blocosDoHtml(texto);
    painel = blocos.find(ehPainel) || null;
    carteira = blocos.find(ehCarteira) || null;
    const m = texto.match(/const\s+PERFIL\s*=\s*(?:\/\*[^*]*\*\/\s*)?"([^"]+)"/);
    perfil = m ? m[1] : null;
  }
  if (!painel) throw new Error("Não encontrei os dados do painel neste arquivo. Escolha o arquivo HTML do painel gerado pelo projeto Financeiro.");

  perfil = painel.perfil || perfil || "completo";
  let modo = perfil === "completo" ? "completo" : "faturas";
  let limpo = limparPainel(painel);
  if (modo === "faturas" && limpo.perfil !== "faturas") {
    const outra = outrasPessoas(limpo)[0];
    if (outra) limpo = soFaturas(limpo, outra.chave);
  }
  const outras = modo === "completo" ? outrasPessoas(limpo) : [];
  const meses = limpo.meses || [];
  const ultimaPosicao = carteira && carteira.posicoes.length ? carteira.posicoes[carteira.posicoes.length - 1] : null;
  return {
    painel: limpo,
    carteira: modo === "completo" ? limparCarteira(carteira) : null,
    modo,
    outras,
    resumo: {
      gerado_em: limpo.gerado_em || null,
      meses: meses.map((m) => m.rotulo).filter(Boolean),
      lancamentos: meses.reduce((t, m) => t + (m.lancamentos || []).length, 0),
      faturas: (limpo.cartao && limpo.cartao.faturas ? limpo.cartao.faturas.length : 0),
      carteira_total: ultimaPosicao ? ultimaPosicao.total : null,
    },
  };
}
