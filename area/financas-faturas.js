// Leitura das faturas de cartão em PDF (quadro "PDFs das faturas e relatórios" das finanças pessoais) e montagem
// da fatura no formato do painel: a fatura do mês, os lançamentos, as categorias, os postos de combustível, os
// pontos de atenção, as compras parceladas a vencer e o que já está comprometido nas próximas faturas.
// Recebe as linhas extraídas por pdf-texto.js; tudo roda no navegador.
//
// Formatos reconhecidos:
//   - Fatura do cartão Nubank
// Os outros bancos ainda não têm leitor: cada um precisa de um PDF de exemplo.
//
// Nenhum dado pessoal aqui: as regras de categoria são genéricas e o histórico de cada pessoa vem do painel dela.
import { chavesFatura, chavesGastos, efetivo } from "./financas-classificacao.js";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MES_PDF = { JAN: 1, FEV: 2, MAR: 3, ABR: 4, MAI: 5, JUN: 6, JUL: 7, AGO: 8, SET: 9, OUT: 10, NOV: 11, DEZ: 12 };

const centavos = (v) => Math.round(v * 100) / 100;
const somar = (lista, f) => centavos(lista.reduce((t, x) => t + f(x), 0));
const dois = (n) => String(n).padStart(2, "0");
const rotulo = (ano, mes) => `${MESES[mes - 1]}/${String(ano).slice(2)}`;
const somarMeses = (ano, mes, n) => {
  const t = ano * 12 + mes - 1 + n;
  return [Math.floor(t / 12), (t % 12) + 1];
};
const brl = (v) => Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataCurta = (iso) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

// Valores em reais da linha, na ordem: "R$ 4.718,68", "−R$ 4.742,62" (sinal de menos ou hífen)
const DINHEIRO = /([−-])?\s*R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/g;
const valores = (linha) => [...String(linha || "").matchAll(DINHEIRO)].map((m) => (m[1] ? -1 : 1) * Number(m[2].replace(/\./g, "").replace(",", ".")));
const ultimoValor = (linha) => valores(linha).at(-1) ?? null;

// "05 OUT 2026" → "2026-10-05"
function dataCompleta(texto) {
  const m = String(texto || "").toUpperCase().match(/(\d{2}) ([A-Z]{3}) (\d{4})/);
  return m && MES_PDF[m[2]] ? `${m[3]}-${dois(MES_PDF[m[2]])}-${m[1]}` : null;
}

// Nome para comparar com o histórico: sem acento, maiúsculo, sem a parcela e sem pontuação
export function chaveNome(nome) {
  return String(nome || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase()
    .replace(/\s*-\s*PARCELA \d+\/\d+\s*$/, "").replace(/[^A-Z0-9*]+/g, " ").trim();
}

// ---------------------------------------------------------------- categorias
// Regras genéricas pelo nome do estabelecimento; a primeira que bater vale. Lojas que vendem de tudo (Mercado
// Livre, Shopee, Amazon) ficam em Outros: o complemento de cada lançamento diz o que foi comprado.
const REGRAS = [
  [/\bIOF\b/, "Tarifas e encargos", "IOF"],
  [/JUROS|MULTA|ENCARGO|MORA\b/, "Tarifas e encargos", "Juros e multas"],
  [/ANUIDADE|ULTRAVIOLETA/, "Tarifas e encargos", "Anuidade"],
  [/TARIFA|\bTAR\b|PACOTE (DE )?SERVI|CESTA (DE )?SERVI/, "Tarifas e encargos", "Tarifas bancárias"],
  [/POSTO|COMBUST|SHELL|IPIRANGA|PETROBRAS|\bBR MANIA\b/, "Transporte", "Combustível"],
  [/NUTAG|SEM PARAR|CONECTCAR|VELOE|PEDAGIO|\bTAG\b/, "Transporte", "Pedágio"],
  [/ESTACION|PARKING|PAYMOV|ESTAPAR|ZONA AZUL|\bPARK\b/, "Transporte", "Estacionamento"],
  [/\bUBER\b|\b99 ?(APP|POP|TAXI)\b|CABIFY|\bTAXI\b|WHOOSH|PATINET|TEMBICI/, "Transporte", "Aplicativo e táxi"],
  [/METRO\b|\bBRT\b|ONIBUS|BILHETE UNICO|RODOVIARIA|BUSER|CLICKBUS/, "Transporte", "Transporte público"],
  [/AUTO ?CENTER|PNEU|MECANIC|LAVA ?JATO|AUTOPECAS|AUTO PECAS|VEICULOS/, "Transporte", "Manutenção do carro"],
  [/IFOOD|\bIFD\b|RAPPI|AIQFOME|ZE DELIVERY|DELIVERY/, "Alimentação", "Delivery"],
  [/RESTAUR|PIZZ|BURGER|LANCH|OUTBACK|DOMINO|SPOLETO|MADERO|BUTECO|BOTECO|\bBAR\b|CHOPP|CERVEJ|ACAI|SORVET|CAFE\b|CAFETERIA|STARBUCKS|CHURRASC|PEIXARIA|SUSHI|TEMAKI|GRILL|BISTRO|MC ?DONALD|SUBWAY|HABIB|GIRAFFAS|COCO BAMBU|CANTINA|TRATTORIA|PASTEL|CREPE|ESPETINHO/, "Alimentação", "Restaurante"],
  [/SUPERMERC|HIPERMERC|ATACAD|ASSAI|CARREFOUR|PAO DE ACUCAR|\bEXTRA\b|BAHAMAS|HORTIFRUT|SACOLAO|EMPORIO|MERCEARIA|MINIMERCADO/, "Alimentação", "Supermercado"],
  [/PADARIA|PANIFIC|CONFEITARIA/, "Alimentação", "Padaria"],
  [/ACOUGUE|CASA DE CARNES/, "Alimentação", "Açougue"],
  [/DROGA|FARMA|\bRAIA\b|PACHECO|PAGUE MENOS|ARAUJO|PANVEL|VENANCIO/, "Saúde", "Farmácia"],
  [/TOTALPASS|GYMPASS|WELLHUB|SMART ?FIT|ACADEMIA|BIO RITMO|CROSSFIT|PILATES|\bYOGA\b|NATACAO|TICKETSPORTS|NUTRITION|SUPLEMENT/, "Saúde", "Academia e esporte"],
  [/CLINICA|HOSPITAL|LABORAT|ODONTO|DENTIST|MEDIC|EXAME|PSICOLOG|FISIOTER|\bOTICA\b/, "Saúde", "Consultas e exames"],
  [/UNIMED|\bAMIL\b|SULAMERICA|HAPVIDA|PLANO DE SAUDE/, "Saúde", "Plano de saúde"],
  [/AIRBNB|HOTEL|HOTEIS|BOOKING|POUSADA|HOSTEL|TRIVAGO|EXPEDIA|DECOLAR/, "Viagem", "Hospedagem"],
  [/LATAM|GOL LINHAS|AZUL LINHAS|SMILES|MAXMILHAS|123 ?MILHAS/, "Viagem", "Passagens"],
  [/NETFLIX|SPOTIFY|DISNEY|\bHBO\b|PRIME VIDEO|AMAZON PRIME|GLOBOPLAY|DEEZER|YOUTUBE|PARAMOUNT|APPLE ?MUSIC|CRUNCHYROLL/, "Assinaturas", "Streaming"],
  [/GOOGLE|MICROSOFT|ADOBE|DROPBOX|ICLOUD|APPLE ?COM|OPENAI|CHATGPT|CANVA|NOTION|ANTHROPIC|CLAUDE/, "Assinaturas", "Aplicativos e software"],
  [/INGRESSO|CINEMA|CINEMARK|KINOPLEX|\bUCI\b|SYMPLA|EVENTIM|TICKETMASTER|TEATRO/, "Lazer", "Cinema e shows"],
  [/STEAM|PLAYSTATION|\bPSN\b|XBOX|NINTENDO|EPIC GAMES/, "Lazer", "Jogos"],
  [/RENNER|\bC ?& ?A\b|RIACHUELO|\bZARA\b|HERING|CENTAURO|NETSHOES|DECATHLON|\bNIKE\b|ADIDAS|ASICS|SPEEDO|OLYMPIKUS|MIZUNO|RIP ?CURL|AREZZO|SCHUTZ|CALCADO|\bMODA\b|\bROUPA/, "Vestuário", null],
  [/JOALHERIA|RELOJOARIA|\bLE SAC\b|BIJUTERIA/, "Vestuário", "Acessórios"],
  [/KABUM|FAST SHOP|SAMSUNG|XIAOMI|\bDELL\b|LENOVO|MULTILASER|ELETRONIC/, "Eletrônicos", null],
  [/LEROY|TELHANORTE|TOK ?STOK|CAMICADO|MOBLY|CASA ?SHOW|MADEIRAMADEIRA|GIGA ?LAR|UTILIDADES/, "Casa", "Móveis e utensílios"],
  [/CEMIG|\bLIGHT\b|\bENEL\b|ENERGISA|COELBA|CPFL|ELETROPAULO/, "Casa", "Energia"],
  [/COPASA|SABESP|CEDAE|SANEAGO|COMGAS|ULTRAGAZ|LIQUIGAS/, "Casa", "Água e gás"],
  [/\bVIVO\b|\bCLARO\b|\bTIM\b|\bOI\b|INTERNET|TELECOM|FIBRA/, "Casa", "Internet e telefone"],
  [/CONDOMIN|ALUGUEL|IMOBILIARIA/, "Casa", "Aluguel e condomínio"],
  [/SALAO|CABELEIR|BARBEAR|BARBEARIA|ESTETICA|MANICURE|DEPILA|BOTICARIO|NATURA|SEPHORA|BELEZA/, "Serviços", "Beleza e cuidados"],
  [/LAVANDERIA|LAVA ?SECO/, "Serviços", "Lavanderia"],
  [/SEGURO|\bSEG\b|YELUMSEG|CARTORIO|CORREIOS|CHAVEIRO|\bFOTO|STUDIO/, "Serviços", "Serviços gerais"],
  [/\bPET\b|PETZ|COBASI|PETLOVE|VETERIN|RACAO/, "Pets", null],
  [/ESCOLA|COLEGIO|FACULDADE|UNIVERSIDADE|\bCURSO|UDEMY|ALURA|COURSERA|LIVRARIA|SARAIVA|KINDLE/, "Educação", null],
  [/\bIPVA\b|\bIPTU\b|DETRAN|\bDARF\b|PREFEITURA|LICENCIAMENTO/, "Impostos e taxas", null],
  [/DOACAO|VAKINHA|IGREJA|DIZIMO/, "Presentes e doações", "Doações"],
];

export function categorizar(nome, historico) {
  const chave = chaveNome(nome);
  const visto = historico && historico.get(chave);
  if (visto) return { cat: visto.cat, sub: visto.sub || null };
  const regra = REGRAS.find(([re]) => re.test(chave));
  return regra ? { cat: regra[1], sub: regra[2] } : { cat: "Outros", sub: null };
}

// Categoria que cada estabelecimento já recebeu no painel da pessoa (com a classificação feita no site por cima).
// fontes: [{ meses }] (gastos do dia a dia) e [{ cartao, prefixo }] (faturas), em ordem: as últimas valem mais.
export function historicoDeCategorias(fontes, ajustes = new Map(), cats = null) {
  const mapa = new Map();
  const guardar = (nome, e) => {
    const k = chaveNome(nome);
    if (k && e.categoria && !e.pendente && e.categoria !== "Outros") mapa.set(k, { cat: e.categoria, sub: e.subcategoria || null });
  };
  for (const f of fontes) {
    for (const m of f.meses || []) {
      const ls = m.lancamentos || [];
      chavesGastos(ls).forEach((k, i) => guardar(ls[i].desc, efetivo(ls[i], ajustes.get(k), cats)));
    }
    const ls = (f.cartao && f.cartao.lancamentos) || [];
    chavesFatura(ls, f.prefixo || "c").forEach((k, i) => guardar(ls[i].nome, efetivo(ls[i], ajustes.get(k), cats)));
  }
  return mapa;
}

// ---------------------------------------------------------------- leitura do PDF
// "Nubank", "outro" (parece fatura de cartão de um banco sem leitor) ou null
export function bancoDaFatura(linhas) {
  const texto = linhas.join("\n");
  if (/Nu Pagamentos|nubank/i.test(texto)) return "Nubank";
  if (/fatura/i.test(texto) && /vencimento/i.test(texto) && /cart[ãa]o/i.test(texto)) return "outro";
  return null;
}

// Linha de transação: "27 AGO  •••• 1531  Peixaria Beira Mar - Parcela 3/3  R$ 184,16" (o final do cartão nem sempre vem)
const TRANSACAO = /^(\d{2}) ([A-Z]{3})\s+(?:[•·]{2,}\s*\d{4}\s+)?(.+?)\s+([−-]?\s*R\$\s*\d{1,3}(?:\.\d{3})*,\d{2})$/;

function lerNubank(linhas) {
  const linha = (re) => linhas.find((l) => re.test(l)) || "";
  const vencimento = dataCompleta(linha(/Data de vencimento/i)) || dataCompleta(linha(/^FATURA \d{2} [A-Z]{3} \d{4}/));
  if (!vencimento) throw new Error("Não encontrei a data de vencimento nesta fatura.");
  const [va, vm] = vencimento.split("-").map(Number);
  // As transações trazem só dia e mês: o ano vem do vencimento (meses depois dele são do ano anterior)
  const dataDoCiclo = (dia, mesPdf) => {
    const m = MES_PDF[String(mesPdf).toUpperCase()];
    return m ? `${m > vm ? va - 1 : va}-${dois(m)}-${dia}` : null;
  };
  const p = linha(/Per[ií]odo vigente/i).match(/(\d{2}) ([A-Z]{3}) a (\d{2}) ([A-Z]{3})/i)
    || linha(/^TRANSA[CÇ][OÕ]ES\s+DE/i).match(/(\d{2}) ([A-Z]{3}) A (\d{2}) ([A-Z]{3})/i);
  const periodo = p ? { inicio: dataDoCiclo(p[1], p[2]), fim: dataDoCiclo(p[3], p[4]) } : null;

  // Resumo da fatura atual
  const iResumo = linhas.findIndex((l) => /^RESUMO DA FATURA ATUAL/i.test(l));
  const resumo = iResumo >= 0 ? linhas.slice(iResumo + 1, iResumo + 14) : [];
  const doResumo = (re) => ultimoValor(resumo.find((l) => re.test(l)));
  let total = doResumo(/^Total a pagar/i);
  if (total == null) total = ultimoValor(linha(/fatura no valor de R\$/i));
  if (total == null) throw new Error("Não encontrei o total a pagar nesta fatura.");
  const anterior = doResumo(/^Fatura anterior/i);
  const pagamento = doResumo(/^Pagamento recebido/i);
  const limiteUsado = linhas.find((l) => /^Limite total\s+R\$/i.test(l));

  // Transações: compras de cada cartão, depois "Pagamentos e Financiamentos" (pagamento da fatura anterior e
  // Pix ou boleto pagos no crédito, que entram na fatura com IOF e juros)
  const itens = [];
  let dentro = false;
  let pagamentos = false;
  for (let i = 0; i < linhas.length; i++) {
    const l = linhas[i].trim();
    if (/^TRANSA[CÇ][OÕ]ES\s+DE\s/i.test(l)) { dentro = true; continue; }
    if (!dentro) continue;
    if (/^Pagamentos e Financiamentos/i.test(l)) { pagamentos = true; continue; }
    const m = l.match(TRANSACAO);
    if (!m || !MES_PDF[m[2]]) continue;
    const valor = valores(m[4])[0];
    let nome = m[3].trim();
    let parcela = null;
    const pc = nome.match(/\s+-\s+Parcela (\d+)\/(\d+)$/i);
    if (pc) {
      parcela = { k: Number(pc[1]), n: Number(pc[2]) };
      nome = nome.slice(0, pc.index).trim();
    }
    // Logo abaixo pode vir o detalhe do Pix/boleto no crédito ("valor da transação de R$ 8,00 + R$ 0,05 de IOF
    // + R$ 0,30 de juros") ou a conversão de uma compra internacional
    let detalhe = "";
    for (let j = i + 1; j < Math.min(i + 3, linhas.length); j++) {
      const s = linhas[j].trim();
      if (TRANSACAO.test(s) || /^--- fim da página/.test(s) || (j === i + 1 && !/^Total a pagar:|USD|US\$|EUR|Convers[ãa]o|Cota[çc][ãa]o/i.test(s))) break;
      detalhe += " " + s;
    }
    const iof = ultimoValor((detalhe.match(/R\$\s*[\d.]+,\d{2} de IOF/i) || [""])[0]);
    const juros = ultimoValor((detalhe.match(/R\$\s*[\d.]+,\d{2} de juros/i) || [""])[0]);
    if (valor < 0 && /^Pagamento (em|recebido|da fatura)/i.test(nome)) continue; // pagamento da fatura anterior
    const tipo = /\bIOF\b|juros|multa|encargo|anuidade/i.test(nome) ? "Encargo"
      : /USD|US\$|EUR|Convers[ãa]o|Cota[çc][ãa]o/i.test(nome + detalhe) ? "Internacional"
      : iof != null || juros != null || (pagamentos && valor > 0) ? "Pagamento no crédito"
      : "Nacional";
    itens.push({ data: dataDoCiclo(m[1], m[2]), nome, valor, parcela, tipo, encargos: centavos((iof || 0) + (juros || 0)), iof, juros });
  }
  if (!itens.length) throw new Error("Não encontrei as transações nesta fatura.");

  return {
    banco: "Nubank",
    titular: (linha(/^Ol[áa], /).match(/^Ol[áa], ([^\s.,]+)/) || [])[1] || "",
    vencimento,
    periodo,
    total,
    anterior,
    pago: pagamento == null ? null : Math.abs(pagamento),
    minimo: doResumo(/^Pagamento m[ií]nimo/i),
    limite: ultimoValor(linha(/Limite total do cart[ãa]o/i)),
    limite_usado: limiteUsado ? valores(limiteUsado)[0] : null,
    proxima: {
      fechamento: dataCompleta(linha(/Fechamento da pr[oó]xima fatura/i)),
      saldo: ultimoValor(linha(/Saldo em aberto da pr[oó]xima fatura/i)),
    },
    saldo_total: ultimoValor(linha(/Saldo em aberto total/i)),
    itens,
  };
}

// Lê as linhas do PDF. Erro com mensagem para a tela quando não é uma fatura que o site conhece.
export function lerFaturaPdf(linhas) {
  const banco = bancoDaFatura(linhas);
  if (banco === "Nubank") return lerNubank(linhas);
  if (banco === "outro") throw new Error("Ainda não sei ler as faturas deste banco em PDF. Por enquanto, o site lê as faturas do Nubank.");
  throw new Error("Este PDF não parece uma fatura de cartão que o site saiba ler. Por enquanto, o site lê as faturas do Nubank.");
}

// ---------------------------------------------------------------- montagem no formato do painel
// historico: categorias já usadas pela pessoa (historicoDeCategorias); arquivo: caminho do PDF no banco
export function montarFatura(leitura, { historico = new Map(), arquivo = "" } = {}) {
  const [va, vm] = leitura.vencimento.split("-").map(Number);
  const mes = rotulo(va, vm);
  // Mês de referência da compra parcelada (início do ciclo menos as parcelas já pagas): é o mesmo em todas as
  // faturas, e assim a classificação feita no site acompanha a compra até a última parcela
  const [ca, cm] = (leitura.periodo && leitura.periodo.inicio ? leitura.periodo.inicio : leitura.vencimento).split("-").map(Number);
  const lancamentos = leitura.itens.map((it) => {
    const c = categorizar(it.nome, historico);
    const l = {
      mes, data: it.data, nome: it.nome, cidade: "", cat: c.cat, tipo: it.tipo,
      parcela: it.parcela ? `${dois(it.parcela.k)}/${dois(it.parcela.n)}` : "", valor: it.valor,
    };
    if (c.sub) l.sub = c.sub;
    if (it.parcela) {
      const [a, m] = somarMeses(ca, cm, -(it.parcela.k - 1));
      l.compra = `${a}-${dois(m)}`;
    }
    return l;
  });

  const soma = somar(lancamentos, (l) => l.valor);
  // A soma dos lançamentos é o total menos o saldo que veio da fatura anterior (fatura anterior menos o pago)
  const esperado = centavos(leitura.total - ((leitura.anterior || 0) - (leitura.pago || 0)));
  const confere = Math.abs(soma - esperado) <= 0.05;

  const categorias = {};
  lancamentos.forEach((l) => { categorias[l.cat] = centavos((categorias[l.cat] || 0) + l.valor); });

  const postos = lancamentos.filter((l) => l.cat === "Transporte" && l.sub === "Combustível")
    .map((l) => ({ nome: l.nome, valor: l.valor, data: dataCurta(l.data) }));

  // Parcelas a vencer depois desta fatura e quanto delas cai em cada fatura seguinte
  const parcelamentos = [];
  const comprometido = {};
  leitura.itens.forEach((it, i) => {
    if (!it.parcela || it.parcela.k >= it.parcela.n) return;
    const restantes = it.parcela.n - it.parcela.k;
    for (let k = 1; k <= restantes; k++) {
      const r = rotulo(...somarMeses(va, vm, k));
      comprometido[r] = centavos((comprometido[r] || 0) + it.valor);
    }
    parcelamentos.push({
      nome: lancamentos[i].nome, prox: `${dois(it.parcela.k + 1)}/${dois(it.parcela.n)}`, valor: it.valor,
      restantes, saldo: centavos(it.valor * restantes), ultima: rotulo(...somarMeses(va, vm, restantes)),
    });
  });
  parcelamentos.sort((a, b) => b.saldo - a.saldo);

  const alertas = pontosDeAtencao(mes, leitura.itens, lancamentos);
  // IOF e juros do Pix/boleto no crédito vêm dentro do valor do lançamento: contam em encargos, não em à vista
  const embutidos = somar(leitura.itens, (it) => it.encargos);
  const encargos = centavos(somar(lancamentos.filter((l) => l.tipo === "Encargo"), (l) => l.valor) + embutidos);

  const fatura = {
    mes,
    vencimento: leitura.vencimento,
    total: leitura.total,
    gastos: soma,
    avista: centavos(somar(lancamentos.filter((l) => !l.parcela && (l.tipo === "Nacional" || l.tipo === "Pagamento no crédito")), (l) => l.valor) - embutidos),
    parcelas: somar(lancamentos.filter((l) => l.parcela), (l) => l.valor),
    internacional: somar(lancamentos.filter((l) => l.tipo === "Internacional"), (l) => l.valor),
    encargos,
    limite: leitura.limite,
    limite_usado: leitura.limite_usado,
    alertas: alertas.length,
    conferencia: confere ? "OK" : `A soma dos lançamentos (${brl(soma)}) não bate com o esperado (${brl(esperado)})`,
    n_lanc: lancamentos.length,
    anterior: leitura.anterior,
    pago: leitura.pago,
    minimo: leitura.minimo,
    parcelado_a_vencer: somar(parcelamentos, (p) => p.saldo),
    origem: "pdf",
    banco: leitura.banco,
    periodo: leitura.periodo,
    proxima: leitura.proxima,
    saldo_total: leitura.saldo_total,
    arquivo_pdf: arquivo,
    processada_em: new Date().toISOString(),
  };
  return { banco: leitura.banco, titular: leitura.titular, mes, fatura, lancamentos, categorias, postos, alertas, parcelamentos, comprometido, soma, esperado, confere };
}

// Pontos de atenção, como os do projeto Financeiro: cobrança repetida, várias no mesmo dia, IOF e juros do Pix
// no crédito, compra internacional e compras parceladas novas. Os mais importantes primeiro.
function pontosDeAtencao(mes, itens, lancamentos) {
  const alertas = [];
  const aVista = lancamentos.map((l, i) => ({ l, it: itens[i] })).filter(({ it }) => !it.parcela && it.valor > 0);
  const grupos = new Map();
  aVista.forEach((x) => {
    const k = `${chaveNome(x.l.nome)}|${x.l.valor.toFixed(2)}`;
    grupos.set(k, [...(grupos.get(k) || []), x]);
  });
  const repetidas = new Set();
  for (const g of grupos.values()) {
    if (g.length < 2) continue;
    const datas = g.map((x) => x.l.data).sort();
    const dias = (new Date(datas.at(-1)) - new Date(datas[0])) / 864e5;
    if (dias > 3) continue;
    g.forEach((x) => repetidas.add(x));
    alertas.push({ mes, prioridade: "Alta", tipo: "Possível cobrança duplicada", data: datas[0], nome: g[0].l.nome, valor: g[0].l.valor,
      detalhe: `${g.length} cobranças de ${brl(g[0].l.valor)} (${datas.map(dataCurta).join(", ")})` });
  }
  const mesmoDia = new Map();
  lancamentos.forEach((l, i) => {
    if (itens[i].parcela && itens[i].parcela.k > 1) return; // parcelas antigas caem todas no início do ciclo
    const k = `${chaveNome(l.nome)}|${l.data}`;
    mesmoDia.set(k, [...(mesmoDia.get(k) || []), l]);
  });
  for (const g of mesmoDia.values()) {
    if (g.length < 2 || g.every((l) => [...repetidas].some((x) => x.l === l))) continue;
    alertas.push({ mes, prioridade: "Baixa", tipo: "Várias cobranças no mesmo dia", data: g[0].data, nome: g[0].nome, valor: somar(g, (l) => l.valor),
      detalhe: `${g.length} cobranças: ${g.map((l) => brl(l.valor)).join(" + ")}` });
  }
  itens.forEach((it, i) => {
    const l = lancamentos[i];
    if (it.encargos > 0) {
      alertas.push({ mes, prioridade: "Média", tipo: "IOF e juros no pagamento pelo crédito", data: l.data, nome: l.nome, valor: it.encargos,
        detalhe: [it.iof != null ? `${brl(it.iof)} de IOF` : "", it.juros != null ? `${brl(it.juros)} de juros` : ""].filter(Boolean).join(" + ") });
    }
    if (it.tipo === "Internacional") alertas.push({ mes, prioridade: "Info", tipo: "Compra internacional", data: l.data, nome: l.nome, valor: l.valor, detalhe: "" });
    if (it.tipo === "Encargo" && /\bIOF\b/i.test(l.nome)) alertas.push({ mes, prioridade: "Baixa", tipo: "IOF de compra internacional", data: l.data, nome: l.nome, valor: l.valor, detalhe: "" });
    if (it.parcela && it.parcela.k === 1 && it.parcela.n > 1) {
      alertas.push({ mes, prioridade: "Info", tipo: "Nova compra parcelada", data: l.data, nome: l.nome, valor: l.valor,
        detalhe: `${it.parcela.n}x de ${brl(it.valor)}, somando ${brl(it.valor * it.parcela.n)}` });
    }
  });
  const ordem = { Alta: 0, "Média": 1, Baixa: 2, Info: 3 };
  return alertas.sort((a, b) => ordem[a.prioridade] - ordem[b.prioridade]);
}

// ---------------------------------------------------------------- gravação no cartão da pessoa
const cartaoVazio = () => ({ arquivo: "", faturas: [], parcelamentos: [], comprometido: {}, categorias: {}, postos: {}, lancamentos: [], alertas: [] });

// Põe a fatura montada no cartão (substitui a do mesmo mês). As parcelas a vencer e o comprometido seguem a
// fatura mais recente.
export function aplicarFatura(cartao, montada) {
  const c = { ...cartaoVazio(), ...structuredClone(cartao || {}) };
  const mes = montada.fatura.mes;
  c.faturas = [...c.faturas.filter((f) => f.mes !== mes), montada.fatura].sort((a, b) => String(a.vencimento).localeCompare(String(b.vencimento)));
  c.lancamentos = [...c.lancamentos.filter((l) => l.mes !== mes), ...montada.lancamentos];
  c.categorias = { ...c.categorias, [mes]: montada.categorias };
  c.postos = { ...c.postos };
  if (montada.postos.length) c.postos[mes] = montada.postos;
  else delete c.postos[mes];
  c.alertas = [...c.alertas.filter((a) => a.mes !== mes), ...montada.alertas];
  if (c.previas) c.previas = c.previas.filter((p) => p.mes !== mes); // a fatura fechou: a prévia dela sai
  if (c.faturas.at(-1).mes === mes) {
    c.parcelamentos = montada.parcelamentos;
    c.comprometido = montada.comprometido;
  }
  if (!c.arquivo) c.arquivo = "Faturas em PDF";
  return c;
}

// Classificação herdada das faturas anteriores, para os lançamentos da fatura nova que ainda não foram classificados
// no site: a mesma compra parcelada (mesmo nome, mesmo número de parcelas e mesmo valor da parcela) leva tudo
// (categoria, subcategoria, essencial, conta e complemento); a mesma loja leva a categoria, a subcategoria, o
// essencial e a conta da última vez em que foi classificada. Devolve os ajustes a gravar para as chaves novas.
// novos e antigos: lançamentos com a chave da classificação (chave); ajustes: Map chave → ajuste
export function herdarClassificacao(novos, antigos, ajustes) {
  const parcelaDe = (l) => { const x = String(l.parcela || l.parcelas || "").match(/(\d+)\s*\/\s*(\d+)/); return x ? { k: Number(x[1]), n: Number(x[2]) } : null; };
  const nomeDe = (l) => chaveNome(l.nome || l.desc);
  const compra = new Map(), loja = new Map();
  for (const l of antigos) {
    const a = ajustes.get(l.chave);
    if (!a) continue;
    const p = parcelaDe(l);
    if (p && p.n > 1) compra.set(`${nomeDe(l)}|${p.n}|${Number(l.valor).toFixed(2)}`, a);
    if (a.categoria || a.conta || a.essencial != null) loja.set(nomeDe(l), a);
  }
  const herdados = [];
  for (const l of novos) {
    if (!l.chave || ajustes.has(l.chave)) continue;
    const p = parcelaDe(l);
    const daCompra = p && p.n > 1 ? compra.get(`${nomeDe(l)}|${p.n}|${Number(l.valor).toFixed(2)}`) : null;
    const base = daCompra || loja.get(nomeDe(l));
    if (!base) continue;
    const h = { chave: l.chave, categoria: base.categoria || null, subcategoria: base.subcategoria || null, essencial: base.essencial ?? null,
      conta: base.conta || null, complemento: daCompra ? daCompra.complemento || null : null };
    // Nada a herdar além do que a categoria automática já dá
    if (!h.complemento && !h.conta && h.essencial == null && (!h.categoria || h.categoria === l.cat) && (h.subcategoria || null) === (l.sub || null)) continue;
    herdados.push(h);
  }
  return herdados;
}

// Na importação do arquivo do painel, as faturas lidas no site que o arquivo não traz continuam no cartão
export function manterFaturasDoSite(novo, antigo) {
  const ja = new Set(((novo && novo.faturas) || []).map((f) => f.mes));
  const doSite = ((antigo && antigo.faturas) || []).filter((f) => f.origem === "pdf" && !ja.has(f.mes));
  let c = novo;
  for (const f of doSite) {
    c = aplicarFatura(c, {
      fatura: f,
      lancamentos: (antigo.lancamentos || []).filter((l) => l.mes === f.mes),
      categorias: (antigo.categorias || {})[f.mes] || {},
      postos: (antigo.postos || {})[f.mes] || [],
      alertas: (antigo.alertas || []).filter((a) => a.mes === f.mes),
      parcelamentos: antigo.parcelamentos || [],
      comprometido: antigo.comprometido || {},
    });
  }
  // As prévias importadas (CSV ou OFX) das faturas que o arquivo ainda não traz fechadas também continuam
  const previas = ((antigo && antigo.previas) || []).filter((p) => !((c && c.faturas) || []).some((f) => f.mes === p.mes));
  if (previas.length) c = { ...c, previas };
  return c;
}
