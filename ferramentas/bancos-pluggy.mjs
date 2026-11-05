// Rotina dos bancos conectados (executada pelo GitHub Actions, duas vezes por dia).
// Para cada conexão cadastrada no site (tabela bancos_conexoes), lê no Pluggy (Open Finance, pelo Meu Pluggy) os
// saldos das contas, os cartões, os investimentos e o extrato, e grava no Supabase (bancos_contas e
// bancos_movimentos). As chaves ficam só nos secrets do GitHub; o site nunca as vê.
// O repositório e o log são públicos: o log mostra só contagens, nunca nomes, descrições ou valores.
//
// Teste local, sem Pluggy e sem banco:  node ferramentas/bancos-pluggy.mjs --teste

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: CHAVE, PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET } = process.env;
const TESTE = process.argv.includes("--teste");
const PLUGGY = "https://api.pluggy.ai";

// Primeira leitura: os últimos 12 meses (o que o Open Finance costuma dar). Depois, os últimos 30 dias de novo, para
// pegar o que o banco confirmou ou corrigiu depois.
const DIAS_PRIMEIRA = 365;
const DIAS_SEGUINTES = 30;

const centavos = (v) => (v == null || !Number.isFinite(Number(v)) ? null : Math.round(Number(v) * 100) / 100);
const diaIso = (v) => (v ? String(v).slice(0, 10) : null);
const diasAtras = (n, hoje = new Date()) => new Date(hoje.getTime() - n * 864e5).toISOString().slice(0, 10);
const texto = (v, max = 200) => {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  return s ? s.slice(0, max) : null;
};

// ---------------------------------------------------------------- conversões (testadas no --teste)
// Conta ou cartão do Pluggy → linha de bancos_contas
export function linhaConta(a, conexao) {
  const cartao = a.type === "CREDIT";
  const c = a.creditData || {};
  return {
    id: String(a.id),
    conexao_id: conexao.id,
    perfil_id: conexao.perfil_id,
    tipo: cartao ? "cartao" : "conta",
    subtipo: texto(a.subtype, 40),
    nome: texto(a.marketingName || a.name, 80),
    final: a.number ? String(a.number).replace(/\D/g, "").slice(-4) || null : null,
    saldo: centavos(a.balance),
    limite: cartao ? centavos(c.creditLimit) : null,
    limite_disponivel: cartao ? centavos(c.availableCreditLimit) : null,
    vencimento: cartao ? diaIso(c.balanceDueDate) : null,
    dados_em: a.updatedAt || null,
    atualizado_em: new Date().toISOString(),
  };
}

// Investimento do Pluggy → linha de bancos_contas (tipo investimento)
export function linhaInvestimento(i, conexao) {
  return {
    id: String(i.id),
    conexao_id: conexao.id,
    perfil_id: conexao.perfil_id,
    tipo: "investimento",
    subtipo: texto(i.subtype || i.type, 40),
    nome: texto(i.name, 80),
    final: null,
    saldo: centavos(i.balance ?? i.amount),
    limite: null,
    limite_disponivel: null,
    vencimento: diaIso(i.dueDate),
    dados_em: i.date || null,
    atualizado_em: new Date().toISOString(),
  };
}

// Transação do Pluggy → linha de bancos_movimentos. Saída (DEBIT) fica negativa, entrada (CREDIT) positiva, seja
// qual for o sinal que o banco mandou. Pendente não entra (o banco troca o id quando confirma).
export function linhaMovimento(t, conta) {
  if (!t || !t.id || String(t.status || "POSTED").toUpperCase() === "PENDING") return null;
  const bruto = Math.abs(Number(t.amount));
  if (!Number.isFinite(bruto) || bruto === 0) return null;
  const saida = String(t.type || "").toUpperCase() === "DEBIT" || (!t.type && Number(t.amount) < 0);
  return {
    id: String(t.id),
    conta_id: conta.id,
    perfil_id: conta.perfil_id,
    data: diaIso(t.date),
    descricao: texto(t.description || t.descriptionRaw, 200) || "Movimento",
    descricao_banco: texto(t.descriptionRaw, 200),
    valor: centavos(saida ? -bruto : bruto),
    categoria: texto(t.category, 80),
    saldo_apos: centavos(t.balance),
  };
}

// ---------------------------------------------------------------- Pluggy
let apiKey = null;
async function pluggy(caminho) {
  const r = await fetch(PLUGGY + caminho, { headers: { "X-API-KEY": apiKey, Accept: "application/json" } });
  if (!r.ok) {
    const corpo = await r.text().catch(() => "");
    const err = new Error(`Pluggy ${r.status}`);
    err.status = r.status;
    err.detalhe = corpo.slice(0, 300);
    throw err;
  }
  return r.json();
}

async function entrarPluggy() {
  const r = await fetch(PLUGGY + "/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ clientId: PLUGGY_CLIENT_ID, clientSecret: PLUGGY_CLIENT_SECRET }),
  });
  if (!r.ok) throw new Error(`Não foi possível entrar no Pluggy (${r.status}). Confira PLUGGY_CLIENT_ID e PLUGGY_CLIENT_SECRET.`);
  apiKey = (await r.json()).apiKey;
}

// Lista paginada por número de página (contas e investimentos)
async function todasAsPaginas(caminho) {
  const itens = [];
  for (let pagina = 1; pagina <= 50; pagina++) {
    const sep = caminho.includes("?") ? "&" : "?";
    const r = await pluggy(`${caminho}${sep}page=${pagina}&pageSize=500`);
    itens.push(...(r.results || []));
    if (!r.totalPages || pagina >= r.totalPages) break;
  }
  return itens;
}

// Extrato de uma conta desde uma data (lista por cursor: "next" vem pronto para pôr no fim do caminho)
async function transacoes(contaId, desde) {
  const itens = [];
  let caminho = `/v2/transactions?accountId=${encodeURIComponent(contaId)}&dateFrom=${desde}`;
  for (let voltas = 0; caminho && voltas < 200; voltas++) {
    const r = await pluggy(caminho);
    itens.push(...(r.results || []));
    caminho = r.next ? `/v2/transactions${r.next.startsWith("?") ? r.next : "?" + r.next.replace(/^&/, "")}` : null;
  }
  return itens;
}

// ---------------------------------------------------------------- Supabase
async function rest(caminho, opcoes = {}) {
  const resposta = await fetch(`${SUPABASE_URL}/rest/v1/${caminho}`, {
    ...opcoes,
    headers: {
      apikey: CHAVE,
      ...(CHAVE.startsWith("sb_") ? {} : { Authorization: `Bearer ${CHAVE}` }),
      "Content-Type": "application/json",
      ...(opcoes.headers || {}),
    },
  });
  if (!resposta.ok) throw new Error(`Supabase ${resposta.status}: ${(await resposta.text()).slice(0, 300)}`);
  return resposta.status === 204 || resposta.status === 201 ? null : resposta.json();
}

// Grava (ou atualiza) em lotes. As colunas que não vêm no lote ficam como estão (o "revisado" dos movimentos).
async function gravar(tabela, linhas) {
  for (let i = 0; i < linhas.length; i += 500) {
    await rest(`${tabela}?on_conflict=id`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(linhas.slice(i, i + 500)),
    });
  }
}

const marcarConexao = (id, campos) => rest(`bancos_conexoes?id=eq.${id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(campos) });

// ---------------------------------------------------------------- uma conexão
async function sincronizar(conexao) {
  const item = await pluggy(`/items/${conexao.item_id}`);
  const contasPluggy = await todasAsPaginas(`/accounts?itemId=${conexao.item_id}`);
  const contas = contasPluggy.map((a) => linhaConta(a, conexao));
  // Investimentos: nem todo banco manda; sem permissão ou sem o produto, segue sem eles
  let investimentos = [];
  try {
    investimentos = (await todasAsPaginas(`/investments?itemId=${conexao.item_id}`))
      .filter((i) => String(i.status || "ACTIVE").toUpperCase() !== "TOTAL_WITHDRAWAL")
      .map((i) => linhaInvestimento(i, conexao));
  } catch (e) {
    if (!e.status || e.status >= 500) throw e;
  }
  await gravar("bancos_contas", [...contas, ...investimentos]);

  const desde = diasAtras(conexao.sincronizado_em ? DIAS_SEGUINTES : DIAS_PRIMEIRA);
  let movimentos = 0;
  for (const conta of contas) {
    const linhas = (await transacoes(conta.id, desde)).map((t) => linhaMovimento(t, conta)).filter((l) => l && l.data);
    await gravar("bancos_movimentos", linhas);
    movimentos += linhas.length;
  }

  const conector = item.connector && item.connector.name;
  await marcarConexao(conexao.id, {
    banco: conector && !/meu ?pluggy/i.test(conector) ? texto(conector, 60) : texto(contasPluggy[0] && contasPluggy[0].name, 60),
    situacao: texto(item.status, 40),
    erro: item.error ? texto(item.error.providerMessage || item.error.message || item.error.code, 300) : null,
    consentimento_ate: item.consentExpiresAt || null,
    banco_atualizado_em: item.lastUpdatedAt || null,
    sincronizado_em: new Date().toISOString(),
  });
  return { contas: contas.length, investimentos: investimentos.length, movimentos };
}

// ---------------------------------------------------------------- teste local
function teste() {
  const conexao = { id: "c1", perfil_id: "p1" };
  const conta = linhaConta({ id: "a1", type: "BANK", subtype: "CHECKING_ACCOUNT", name: "Conta", number: "0001/12345-6", balance: 1234.567 }, conexao);
  const cartao = linhaConta({ id: "a2", type: "CREDIT", name: "Cartão", balance: 800, creditData: { creditLimit: 5000, availableCreditLimit: 4200, balanceDueDate: "2026-11-10T00:00:00.000Z" } }, conexao);
  const inv = linhaInvestimento({ id: "i1", name: "CDB", type: "FIXED_INCOME", balance: 10000 }, conexao);
  const saida = linhaMovimento({ id: "t1", type: "DEBIT", amount: 50, date: "2026-11-03T00:00:00.000Z", description: "Pix enviado", status: "POSTED" }, conta);
  const entrada = linhaMovimento({ id: "t2", type: "CREDIT", amount: -20, date: "2026-11-04T00:00:00.000Z", description: "Pix recebido" }, conta);
  const pendente = linhaMovimento({ id: "t3", type: "DEBIT", amount: 10, date: "2026-11-05", status: "PENDING" }, conta);
  const checar = (nome, ok) => { console.log(`${ok ? "ok " : "ERRO"} ${nome}`); if (!ok) process.exitCode = 1; };
  checar("conta: só o final do número", conta.final === "3456");
  checar("conta: saldo arredondado", conta.saldo === 1234.57 && conta.tipo === "conta");
  checar("cartão: limite e vencimento", cartao.tipo === "cartao" && cartao.limite_disponivel === 4200 && cartao.vencimento === "2026-11-10");
  checar("investimento", inv.tipo === "investimento" && inv.saldo === 10000);
  checar("saída negativa", saida.valor === -50 && saida.data === "2026-11-03");
  checar("entrada positiva pelo tipo", entrada.valor === 20);
  checar("pendente fica de fora", pendente === null);
}

// ---------------------------------------------------------------- execução
async function principal() {
  if (TESTE) return teste();
  if (!PLUGGY_CLIENT_ID || !PLUGGY_CLIENT_SECRET) {
    console.log("::notice::Bancos conectados ainda não configurados (README, seção \"Bancos conectados\"). Nada a fazer.");
    return;
  }
  if (!SUPABASE_URL || !CHAVE) throw new Error("Faltam SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY nos secrets.");
  let conexoes;
  try {
    conexoes = await rest("bancos_conexoes?select=id,perfil_id,item_id,sincronizado_em");
  } catch (e) {
    if (/bancos_conexoes/.test(e.message)) throw new Error("O banco ainda não tem as tabelas dos bancos: rode de novo supabase/schema.sql no SQL Editor do Supabase.");
    throw e;
  }
  if (!conexoes.length) {
    console.log("::notice::Nenhum banco cadastrado no site ainda (Finanças pessoais → aba Bancos → Conectar banco).");
    return;
  }
  await entrarPluggy();
  let falhas = 0;
  for (const [n, conexao] of conexoes.entries()) {
    try {
      const r = await sincronizar(conexao);
      console.log(`Conexão ${n + 1}: ${r.contas} conta(s) ou cartão(ões), ${r.investimentos} investimento(s), ${r.movimentos} movimento(s) lidos.`);
    } catch (e) {
      falhas++;
      const motivo = e.status === 404 ? "conexão não encontrada no Pluggy (confira o código no site)" : e.status === 403 || e.status === 401 ? "sem permissão no Pluggy" : "erro ao ler";
      console.log(`::warning::Conexão ${n + 1}: ${motivo} (${e.status || "-"}).`);
      await marcarConexao(conexao.id, { situacao: "ERRO", erro: `${motivo[0].toUpperCase()}${motivo.slice(1)}.`}).catch(() => {});
    }
  }
  if (falhas === conexoes.length) throw new Error("Nenhuma conexão foi lida.");
}

principal().catch((e) => {
  console.log(`::error::${e.message}`);
  process.exit(1);
});
