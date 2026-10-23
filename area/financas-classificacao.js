// Classificação das finanças pessoais, usada pelo painel (financas-painel.js), pela página (financas.js) e pelas
// páginas da engenharia e das empresas (financeiro.js): contas (pessoal, engenharia e empresas), lista de categorias
// e subcategorias, a chave de cada lançamento e os valores depois dos ajustes feitos no site.
// Nenhum dado pessoal aqui: os nomes das empresas e as listas de cada pessoa vêm do banco.
import { pode } from "./modulos.js";

const semAcento = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// ---------------------------------------------------------------- contas
// De quem é o dinheiro do lançamento: pessoal de quem é o painel (o padrão), pessoal da outra pessoa do casal,
// compartilhado do casal, engenharia (trabalho autônomo), uma empresa ou empresas unidas numa conta só. Os nomes das
// pessoas e das empresas vêm do banco; as empresas unidas e as contas escondidas ficam nas preferências da pessoa.
export const ROTULO_ENGENHARIA = "Engenharia (autônomo)";
export const ROTULO_CASAL = "Compartilhado do casal";
const primeiroNome = (p) => String((p && (p.nome || p.email)) || "").trim().split(/[\s@]/)[0];
export const contaValida = (v) => /^(pessoal|casal|engenharia|(empresa|pessoa|grupo):[0-9a-f-]{36})$/.test(String(v || ""));

// Preferências das contas: { grupos: [{ id, nome, empresas: [ids] }], ocultas: [ids das contas escondidas] }
export function lerContas(prefs) {
  const c = (prefs && prefs.contas) || {};
  const grupos = (Array.isArray(c.grupos) ? c.grupos : [])
    .filter((g) => g && /^grupo:[0-9a-f-]{36}$/.test(g.id) && String(g.nome || "").trim())
    .map((g) => ({ id: g.id, nome: String(g.nome).trim().slice(0, 60), empresas: [...new Set((g.empresas || []).map(String))] }));
  const ocultas = (Array.isArray(c.ocultas) ? c.ocultas : []).filter((id) => contaValida(id) && id !== "pessoal");
  return { grupos, ocultas };
}

// Todas as contas do painel, com as escondidas marcadas (oculta). As empresas que estão numa conta unida continuam
// na lista, escondidas, só para dar nome aos lançamentos antigos (agrupada: id da conta unida).
// dono: de quem é o painel; parceiro: a outra pessoa do casal (se houver)
export function contasDisponiveis({ perfil, dono = null, parceiro = null, empresas = [], prefs = null }) {
  const { grupos, ocultas } = lerContas(prefs);
  const nome = primeiroNome(dono || perfil);
  const lista = [{ id: "pessoal", nome: nome ? `Pessoal de ${nome}` : "Pessoal", tipo: "pessoal" }];
  if (parceiro && parceiro.id) {
    lista.push({ id: `pessoa:${parceiro.id}`, nome: `Pessoal de ${primeiroNome(parceiro) || "outra pessoa"}`, tipo: "pessoa" });
    lista.push({ id: "casal", nome: ROTULO_CASAL, tipo: "casal" });
  }
  if (pode(perfil, "financeiro")) lista.push({ id: "engenharia", nome: ROTULO_ENGENHARIA, tipo: "engenharia" });
  const agrupadas = [];
  if (pode(perfil, "empresas")) {
    const nomes = new Map(empresas.map((e) => [String(e.id), e.nome]));
    const unidas = new Map();
    for (const g of grupos) {
      const membros = g.empresas.filter((id) => nomes.has(id) && !unidas.has(id));
      if (!membros.length) continue;
      membros.forEach((id) => unidas.set(id, g.id));
      lista.push({ id: g.id, nome: g.nome, tipo: "grupo", empresas: membros, nomesEmpresas: membros.map((id) => nomes.get(id)) });
    }
    empresas.forEach((e) => {
      const g = unidas.get(String(e.id));
      if (g) agrupadas.push({ id: `empresa:${e.id}`, nome: e.nome, tipo: "empresa", oculta: true, agrupada: g });
      else lista.push({ id: `empresa:${e.id}`, nome: e.nome, tipo: "empresa" });
    });
  }
  return [...lista.map((c) => ({ ...c, oculta: ocultas.includes(c.id) })), ...agrupadas];
}

export function nomeConta(conta, empresas = []) {
  if (!conta || conta === "pessoal") return "Pessoal";
  if (conta === "engenharia") return ROTULO_ENGENHARIA;
  if (conta === "casal") return ROTULO_CASAL;
  if (conta.startsWith("pessoa:")) return "Pessoal da outra pessoa";
  if (conta.startsWith("grupo:")) return "Empresas unidas";
  const e = empresas.find((x) => `empresa:${x.id}` === conta);
  return e ? e.nome : "Empresa removida";
}

// Contas que entram na página de uma empresa: a da própria empresa e as contas unidas de que ela faz parte
export function contasDaEmpresa(prefs, empresaId) {
  const ids = new Set([`empresa:${empresaId}`]);
  for (const g of lerContas(prefs).grupos) if (g.empresas.includes(String(empresaId))) ids.add(g.id);
  return ids;
}

// ---------------------------------------------------------------- categorias
// Lista inicial, genérica. Cada pessoa edita a dela: nome, subcategorias e se a categoria é essencial por padrão
// (essSub: o padrão de uma subcategoria, quando é diferente do da categoria).
export const CATEGORIAS_PADRAO = [
  { nome: "Alimentação", essencial: null, sub: ["Supermercado", "Padaria", "Hortifrúti", "Açougue", "Restaurante", "Almoço", "Jantar", "Lanche e café", "Delivery"],
    essSub: { Supermercado: true, Padaria: true, Hortifrúti: true, Açougue: true, Restaurante: false, Almoço: false, Jantar: false, "Lanche e café": false, Delivery: false } },
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
  // O que é lançado aqui sai como investimento no fluxo de caixa (não conta como gasto do mês)
  { nome: "Investimentos", essencial: null, sub: ["CDB", "LCI", "LCA", "Tesouro Direto", "Fundos", "Ações", "Previdência", "Poupança", "Cripto", "Outros investimentos"] },
  { nome: "Impostos e taxas", essencial: true, sub: ["IPVA", "IPTU", "Outros impostos"] },
  { nome: "Tarifas e encargos", essencial: null, sub: ["Anuidade", "IOF", "Juros e multas", "Tarifas bancárias"] },
  { nome: "Outros", essencial: null, sub: [] },
];

const simNao = (v) => (v === true || v === "Essencial" ? true : v === false || v === "Não essencial" ? false : null);

export function normalizarCategoria(c) {
  const sub = [...new Set(((c && c.sub) || []).map((s) => String(s).trim().slice(0, 60)).filter(Boolean))];
  const essSub = {};
  for (const [k, v] of Object.entries((c && c.essSub) || {})) if (sub.includes(k) && simNao(v) != null) essSub[k] = simNao(v);
  return { nome: String((c && c.nome) || "").trim().slice(0, 60), sub, essencial: simNao(c && c.essencial), ...(Object.keys(essSub).length ? { essSub } : {}) };
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
    return { lista: salvas.lista.map(normalizarCategoria).filter((c) => c.nome), renomeadas: { ...(salvas.renomeadas || {}) },
      subPadrao: { ...(salvas.subPadrao || {}) }, salva: true };
  }
  const lista = CATEGORIAS_PADRAO.map(normalizarCategoria);
  for (const nome of categoriasDosDados(dados)) {
    if (!lista.some((c) => semAcento(c.nome) === semAcento(nome))) lista.splice(lista.length - 1, 0, { nome, sub: [], essencial: null });
  }
  return { lista, renomeadas: {}, subPadrao: {}, salva: false };
}

// Junta categorias numa só: as juntadas viram subcategorias dela (sub: o nome da subcategoria que os lançamentos sem
// subcategoria recebem). Devolve a lista nova e o que muda nos lançamentos: [{ de, para, sub }].
// fontes: nomes das categorias juntadas; destino: nome da categoria que fica (nova ou uma das da lista)
export function juntarCategorias(lista, fontes, destino, subDe = {}) {
  const alvo = String(destino || "").trim().slice(0, 60);
  if (!alvo) throw new Error("Dê um nome para a categoria que fica.");
  const iguais = (a, b) => semAcento(a) === semAcento(b);
  const juntadas = lista.filter((c) => fontes.some((f) => iguais(f, c.nome)) && !iguais(c.nome, alvo));
  if (!juntadas.length) throw new Error("Escolha pelo menos uma categoria para juntar.");
  const existente = lista.find((c) => iguais(c.nome, alvo));
  const nova = existente ? { ...existente, sub: [...existente.sub], essSub: { ...(existente.essSub || {}) } } : { nome: alvo, sub: [], essencial: null, essSub: {} };
  const mudancas = [];
  for (const c of juntadas) {
    const sub = String(subDe[c.nome] || c.nome).trim().slice(0, 60);
    for (const s of [sub, ...c.sub]) {
      if (!nova.sub.some((x) => iguais(x, s))) nova.sub.push(s);
      if (c.essencial != null && nova.essSub[s] == null) nova.essSub[s] = c.essencial;
    }
    mudancas.push({ de: c.nome, para: nova.nome, sub });
  }
  // O padrão da categoria: o das juntadas quando todas são iguais (e a que fica não tinha outro)
  const padroes = [...new Set([...(existente ? [existente.essencial] : []), ...juntadas.map((c) => c.essencial)])];
  nova.essencial = padroes.length === 1 ? padroes[0] : null;
  const posicao = Math.min(...[existente, ...juntadas].filter(Boolean).map((c) => lista.indexOf(c)));
  const resto = lista.filter((c) => c !== existente && !juntadas.includes(c));
  resto.splice(Math.min(posicao, resto.length), 0, normalizarCategoria(nova));
  return { lista: resto, mudancas };
}

// Nome atual de uma categoria que foi renomeada na lista (os dados importados continuam com o nome antigo)
export function renomear(cats, nome) {
  let n = nome;
  for (let i = 0; i < 10 && cats && cats.renomeadas && cats.renomeadas[n]; i++) n = cats.renomeadas[n];
  return n;
}

export const categoriaDe = (cats, nome) => (cats ? cats.lista.find((c) => semAcento(c.nome) === semAcento(nome)) : null) || null;

// ---------------------------------------------------------------- a classificar
// Nenhum lançamento fica em "Outros": a categoria é só do ajuste (gastos no cartão não detalhados). O que vem sem
// categoria, ou em Outros, fica "A classificar" até alguém escolher uma, e entra nas tarefas pendentes.
export const OUTROS = "Outros";
export const A_CLASSIFICAR = "A classificar";
export const ehAjuste = (l) => /^ajuste/i.test(String((l && (l.desc || l.nome)) || ""));
export const semClassificacao = (nome) => !nome || [OUTROS, A_CLASSIFICAR].some((x) => semAcento(x) === semAcento(nome));
// Categorias que podem ser escolhidas para um lançamento (Outros fica de fora)
export const categoriasEscolhiveis = (cats) => (cats ? cats.lista.filter((c) => !semClassificacao(c.nome)) : []);

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
// pendente: sem categoria (ou em Outros, fora do ajuste), fica "A classificar"
export function efetivo(l, ajuste, cats) {
  const a = ajuste || {};
  const site = l.origem === "site";
  const original = l.cat || OUTROS;
  let categoria = a.categoria || renomear(cats, original);
  const pendente = semClassificacao(categoria) && !ehAjuste(l);
  if (pendente) categoria = A_CLASSIFICAR;
  // Categoria juntada a outra: o lançamento sem subcategoria fica na subcategoria que ela virou
  const subcategoria = pendente ? null : a.subcategoria || l.sub || (!a.categoria && cats && cats.subPadrao && cats.subPadrao[original]) || null;
  const c = categoriaDe(cats, categoria) || {};
  const padrao = (subcategoria && c.essSub && c.essSub[subcategoria] != null ? c.essSub[subcategoria] : c.essencial) ?? null;
  const doProjeto = simNao(l.essencial);
  return {
    categoria,
    subcategoria,
    essencial: simNao(a.essencial) ?? doProjeto ?? padrao,
    semAjuste: doProjeto ?? padrao, // o que vale se o ajuste de essencial for retirado
    padrao,
    complemento: a.complemento || (site ? l.obs || null : null),
    conta: a.conta || l.conta || "pessoal",
    ajustado: !!ajuste,
    pendente,
  };
}

// Lançamentos das finanças pessoais marcados com uma conta (ex.: pagos com o seu dinheiro para uma empresa),
// para as páginas da engenharia e das empresas. A compra no cartão que também está nos gastos do dia a dia
// aparece uma vez só.
export function lancamentosDaConta({ dados, gastos = [], ajustes = [], prefs = null }, conta) {
  const alvo = conta instanceof Set ? conta : new Set([conta]); // uma conta ou várias (empresa e contas unidas)
  const d = dados || {};
  const cats = lerCategorias(prefs, d);
  const aj = new Map(ajustes.map((a) => [a.chave, a]));
  const lista = [];
  for (const m of d.meses || []) {
    const ls = m.lancamentos || [];
    chavesGastos(ls).forEach((chave, i) => {
      const e = efetivo(ls[i], aj.get(chave), cats);
      if (alvo.has(e.conta)) {
        lista.push({ chave, data: ls[i].data, descricao: ls[i].desc, complemento: e.complemento, valor: Number(ls[i].valor),
          categoria: e.categoria, origem: "Gastos do dia a dia", doDia: true });
      }
    });
  }
  const fatura = (d.cartao && d.cartao.lancamentos) || [];
  chavesFatura(fatura, "c").forEach((chave, i) => {
    const l = fatura[i];
    const e = efetivo(l, aj.get(chave), cats);
    if (!alvo.has(e.conta)) return;
    if (lista.some((x) => x.doDia && x.data === l.data && Math.abs(x.valor - Number(l.valor)) < 0.01)) return;
    lista.push({ chave, data: l.data || null, descricao: l.nome, complemento: e.complemento, valor: Number(l.valor),
      categoria: e.categoria, origem: `Fatura ${l.mes}${l.parcela ? ` · parcela ${l.parcela}` : ""}` });
  });
  for (const g of gastos) {
    if (!alvo.has(g.conta || "pessoal")) continue;
    const categoria = renomear(cats, g.categoria || OUTROS);
    lista.push({ chave: `s|${g.id}`, data: g.data, descricao: g.descricao, complemento: g.observacao, valor: Number(g.valor),
      categoria: semClassificacao(categoria) ? A_CLASSIFICAR : categoria, origem: g.parcelas > 1 ? `Lançado no site · ${g.parcelas}x` : "Lançado no site" });
  }
  return lista.sort((a, b) => String(b.data || "").localeCompare(String(a.data || "")));
}
