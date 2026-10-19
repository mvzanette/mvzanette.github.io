// Classificação das finanças pessoais, usada pelo painel (financas-painel.js), pela página (financas.js) e pelas
// páginas da engenharia e das empresas (financeiro.js): contas (pessoal, engenharia e empresas), lista de categorias
// e subcategorias, a chave de cada lançamento e os valores depois dos ajustes feitos no site.
// Nenhum dado pessoal aqui: os nomes das empresas e as listas de cada pessoa vêm do banco.
import { pode } from "./modulos.js";

const semAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// ---------------------------------------------------------------- contas
// De quem é o dinheiro do lançamento: pessoal (padrão), engenharia (trabalho autônomo) ou uma empresa
export const ROTULO_ENGENHARIA = "Engenharia (autônomo)";

export function contasDisponiveis(perfil, empresas = []) {
  const lista = [{ id: "pessoal", nome: "Pessoal" }];
  if (pode(perfil, "financeiro")) lista.push({ id: "engenharia", nome: ROTULO_ENGENHARIA });
  if (pode(perfil, "empresas")) empresas.forEach((e) => lista.push({ id: `empresa:${e.id}`, nome: e.nome }));
  return lista;
}

export function nomeConta(conta, empresas = []) {
  if (!conta || conta === "pessoal") return "Pessoal";
  if (conta === "engenharia") return ROTULO_ENGENHARIA;
  const e = empresas.find((x) => `empresa:${x.id}` === conta);
  return e ? e.nome : "Empresa removida";
}

// ---------------------------------------------------------------- categorias
// Lista inicial, genérica. Cada pessoa edita a dela: nome, subcategorias e se a categoria é essencial por padrão.
export const CATEGORIAS_PADRAO = [
  { nome: "Mercado e padaria", essencial: true, sub: ["Supermercado", "Padaria", "Hortifrúti", "Açougue"] },
  { nome: "Restaurantes", essencial: false, sub: ["Almoço", "Jantar", "Lanche e café", "Delivery"] },
  { nome: "Transporte", essencial: true, sub: ["Combustível", "Aplicativo e táxi", "Estacionamento", "Pedágio", "Manutenção do carro", "Transporte público"] },
  { nome: "Saúde", essencial: true, sub: ["Farmácia", "Consultas e exames", "Plano de saúde", "Academia e esporte"] },
  { nome: "Casa", essencial: true, sub: ["Aluguel e condomínio", "Energia", "Água e gás", "Internet e telefone", "Manutenção e reparos", "Móveis e utensílios"] },
  { nome: "Educação", essencial: true, sub: ["Cursos", "Livros e material", "Mensalidades"] },
  { nome: "Serviços", essencial: null, sub: ["Beleza e cuidados", "Lavanderia", "Serviços gerais"] },
  { nome: "Vestuário", essencial: null, sub: ["Roupas", "Calçados", "Acessórios"] },
  { nome: "Lazer", essencial: false, sub: ["Passeios", "Cinema e shows", "Jogos", "Hobbies"] },
  { nome: "Viagem", essencial: false, sub: ["Passagens", "Hospedagem", "Passeios na viagem"] },
  { nome: "Eletrônicos", essencial: false, sub: ["Celular e informática", "Videogame", "Acessórios"] },
  { nome: "Assinaturas", essencial: null, sub: ["Streaming", "Aplicativos e software", "Clubes e revistas"] },
  { nome: "Presentes e doações", essencial: false, sub: ["Presentes", "Doações"] },
  { nome: "Pets", essencial: true, sub: ["Ração", "Veterinário", "Banho e tosa"] },
  { nome: "Impostos e taxas", essencial: true, sub: ["IPVA", "IPTU", "Outros impostos"] },
  { nome: "Tarifas e encargos", essencial: null, sub: ["Anuidade", "IOF", "Juros e multas", "Tarifas bancárias"] },
  { nome: "Outros", essencial: null, sub: [] },
];

const simNao = (v) => (v === true || v === "Essencial" ? true : v === false || v === "Não essencial" ? false : null);

export function normalizarCategoria(c) {
  return {
    nome: String((c && c.nome) || "").trim().slice(0, 60),
    sub: [...new Set(((c && c.sub) || []).map((s) => String(s).trim().slice(0, 60)).filter(Boolean))],
    essencial: simNao(c && c.essencial),
  };
}

// Categorias que aparecem nos dados importados (gastos do dia a dia e faturas, inclusive da outra pessoa)
export function categoriasDosDados(dados) {
  const nomes = new Set();
  const d = dados || {};
  for (const m of d.meses || []) for (const l of m.lancamentos || []) if (l.cat) nomes.add(l.cat);
  const daFatura = (c) => {
    for (const l of (c && c.lancamentos) || []) if (l.cat) nomes.add(l.cat);
  };
  daFatura(d.cartao);
  for (const v of Object.values(d)) if (v && typeof v === "object" && !Array.isArray(v) && v.cartao) daFatura(v.cartao);
  return [...nomes];
}

// Lista da pessoa: a que ela salvou ou, até salvar a primeira vez, a padrão mais as categorias dos dados
export function lerCategorias(prefs, dados) {
  const salvas = prefs && prefs.categorias;
  if (salvas && Array.isArray(salvas.lista) && salvas.lista.length) {
    return { lista: salvas.lista.map(normalizarCategoria).filter((c) => c.nome), renomeadas: { ...(salvas.renomeadas || {}) }, salva: true };
  }
  const lista = CATEGORIAS_PADRAO.map(normalizarCategoria);
  for (const nome of categoriasDosDados(dados)) {
    if (!lista.some((c) => semAcento(c.nome) === semAcento(nome))) lista.splice(lista.length - 1, 0, { nome, sub: [], essencial: null });
  }
  return { lista, renomeadas: {}, salva: false };
}

// Nome atual de uma categoria que foi renomeada na lista (os dados importados continuam com o nome antigo)
export function renomear(cats, nome) {
  let n = nome;
  for (let i = 0; i < 10 && cats && cats.renomeadas && cats.renomeadas[n]; i++) n = cats.renomeadas[n];
  return n;
}

export const categoriaDe = (cats, nome) => (cats ? cats.lista.find((c) => semAcento(c.nome) === semAcento(nome)) : null) || null;

// ---------------------------------------------------------------- chaves e valores ajustados
// A chave identifica um lançamento vindo do projeto Financeiro e continua igual depois de cada importação:
// data, valor e descrição (lançamentos iguais no mesmo mês ganham um número de ordem). Gasto lançado pelo site
// usa o próprio id. Nas faturas, a mesma compra parcelada tem a mesma chave em todas as faturas.
const parte = (t) => String(t || "").slice(0, 200);

export function chavesGastos(lancamentos) {
  const vistos = {};
  return lancamentos.map((l) => {
    if (l.origem === "site") return `s|${l.id}`;
    if (l.origem === "fatura" && l.chave) return l.chave; // compra da fatura que entrou nos gastos: a chave da fatura
    const base = `d|${l.data}|${Number(l.valor).toFixed(2)}|${parte(l.desc)}`;
    const n = (vistos[base] = (vistos[base] ?? -1) + 1);
    return n ? `${base}|${n}` : base;
  });
}

// Nas faturas lidas pelo site, a parcela vem com a data do ciclo; o mês de referência da compra (compra) é o que
// se repete de uma fatura para a outra.
export function chavesFatura(lancamentos, prefixo = "c") {
  const vistos = {};
  return lancamentos.map((l) => {
    const base = `${prefixo}|${l.compra || l.data || l.mes || ""}|${Number(l.valor).toFixed(2)}|${parte(l.nome)}`;
    const grupo = `${l.mes}|${base}`;
    const n = (vistos[grupo] = (vistos[grupo] ?? -1) + 1);
    return n ? `${base}|${n}` : base;
  });
}

// Valores que valem para o lançamento: o ajuste feito no site (se houver) sobre o que veio do projeto.
// Essencial: o ajuste, depois o que veio do projeto, depois o padrão da categoria.
export function efetivo(l, ajuste, cats) {
  const a = ajuste || {};
  const site = l.origem === "site";
  const categoria = a.categoria || renomear(cats, l.cat || "Outros");
  const padrao = (categoriaDe(cats, categoria) || {}).essencial ?? null;
  const doProjeto = simNao(l.essencial);
  return {
    categoria,
    subcategoria: a.subcategoria || l.sub || null,
    essencial: simNao(a.essencial) ?? doProjeto ?? padrao,
    semAjuste: doProjeto ?? padrao, // o que vale se o ajuste de essencial for retirado
    padrao,
    complemento: a.complemento || (site ? l.obs || null : null),
    conta: a.conta || l.conta || "pessoal",
    ajustado: !!ajuste,
  };
}

// Lançamentos das finanças pessoais marcados com uma conta (ex.: pagos com o seu dinheiro para uma empresa),
// para as páginas da engenharia e das empresas. A compra no cartão que também está nos gastos do dia a dia
// aparece uma vez só.
export function lancamentosDaConta({ dados, gastos = [], ajustes = [], prefs = null }, conta) {
  const d = dados || {};
  const cats = lerCategorias(prefs, d);
  const aj = new Map(ajustes.map((a) => [a.chave, a]));
  const lista = [];
  for (const m of d.meses || []) {
    const ls = m.lancamentos || [];
    chavesGastos(ls).forEach((chave, i) => {
      const e = efetivo(ls[i], aj.get(chave), cats);
      if (e.conta === conta) {
        lista.push({ chave, data: ls[i].data, descricao: ls[i].desc, complemento: e.complemento, valor: Number(ls[i].valor),
          categoria: e.categoria, origem: "Gastos do dia a dia", doDia: true });
      }
    });
  }
  const fatura = (d.cartao && d.cartao.lancamentos) || [];
  chavesFatura(fatura, "c").forEach((chave, i) => {
    const l = fatura[i];
    const e = efetivo(l, aj.get(chave), cats);
    if (e.conta !== conta) return;
    if (lista.some((x) => x.doDia && x.data === l.data && Math.abs(x.valor - Number(l.valor)) < 0.01)) return;
    lista.push({ chave, data: l.data || null, descricao: l.nome, complemento: e.complemento, valor: Number(l.valor),
      categoria: e.categoria, origem: `Fatura ${l.mes}${l.parcela ? ` · parcela ${l.parcela}` : ""}` });
  });
  for (const g of gastos) {
    if ((g.conta || "pessoal") !== conta) continue;
    lista.push({ chave: `s|${g.id}`, data: g.data, descricao: g.descricao, complemento: g.observacao, valor: Number(g.valor),
      categoria: renomear(cats, g.categoria || "Outros"), origem: g.parcelas > 1 ? `Lançado no site · ${g.parcelas}x` : "Lançado no site" });
  }
  return lista.sort((a, b) => String(b.data || "").localeCompare(String(a.data || "")));
}
