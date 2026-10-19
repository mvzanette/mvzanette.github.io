// Fatura parcial do cartão (Cartão e faturas → Importar fatura parcial): lê o CSV ou o OFX que o app do Nubank
// exporta da fatura aberta e das próximas faturas e monta a prévia que o painel usa até a fatura fechar (aí vale
// o PDF da fatura fechada). O arquivo é lido no navegador e não fica guardado; só a prévia vai para o painel.
// Nenhum dado pessoal aqui: as regras são genéricas e o histórico de categorias vem do painel de cada pessoa.
import { cabecalho, lerOfx, linhasCsv, numero } from "./financas-extrato.js";
import { categorizar } from "./financas-faturas.js";

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const centavos = (v) => Math.round(v * 100) / 100;
const dois = (n) => String(n).padStart(2, "0");
const somarMeses = (a, m, k) => { const t = a * 12 + (m - 1) + k; return [Math.floor(t / 12), (t % 12) + 1]; };
export const rotuloFatura = (a, m) => `${MESES[m - 1]}/${String(a).slice(2)}`;
// "nov/26" → 2026 * 12 + 10, para ordenar e comparar as faturas
export const ordemFatura = (rotulo) => {
  const [mm, aa] = String(rotulo || "").split("/");
  const i = MESES.indexOf(mm);
  return i < 0 || !aa ? NaN : (2000 + Number(aa)) * 12 + i;
};
const nomeBanco = (s) => (/NU PAGAMENTOS|NUBANK|^NU\b/i.test(s || "") ? "Nubank" : String(s || "").trim());

// A parcela vem no fim da descrição: "Loja - Parcela 2/10" (Nubank) ou "LOJA PARC 02/10"
function separarParcela(titulo) {
  const t = String(titulo || "").replace(/\s+/g, " ").trim();
  const m = t.match(/\s+-?\s*Parcela\s+(\d+)\s*\/\s*(\d+)$/i) || t.match(/\s+PARC\.?\s*(\d+)\s*\/\s*(\d+)$/i);
  if (m && Number(m[2]) > 1 && Number(m[1]) >= 1 && Number(m[1]) <= Number(m[2])) return { nome: t.slice(0, m.index).replace(/\s*-\s*$/, "").trim(), parcela: { k: Number(m[1]), n: Number(m[2]) } };
  return { nome: t, parcela: null };
}

const tipoDe = (nome, valor) => (valor < 0 ? "Estorno" : /\bIOF\b|juros|multa|encargo|anuidade/i.test(nome) ? "Encargo"
  : /USD|US\$|EUR|Convers[ãa]o/i.test(nome) ? "Internacional" : "Nacional");

const dataIso = (d) => {
  const s = String(d || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};

// Lê o arquivo. Erro com mensagem para a tela quando não é uma fatura de cartão que o site conhece.
export function lerFaturaParcial(texto, nomeArquivo = "") {
  const t = String(texto || "").replace(/^﻿/, "");
  if (/^%PDF-/.test(t) || /\.pdf$/i.test(nomeArquivo)) throw new Error("Este arquivo é um PDF. Para a fatura em PDF, use o botão Enviar PDF.");
  let banco = "", formato, brutos;
  if (/<OFX>|OFXHEADER/i.test(t)) {
    if (!/<CCSTMTRS>|<CREDITCARDMSGSRSV1>/i.test(t)) throw new Error("Este OFX é do extrato da conta, não da fatura do cartão. Para a conta, use Importar extrato, na aba Gastos do dia a dia.");
    const o = lerOfx(t);
    formato = "OFX";
    banco = nomeBanco(o.banco);
    // No OFX do cartão, as compras vêm negativas (débito) e o pagamento da fatura, positivo
    brutos = o.movimentos.map((m) => ({ data: m.data, titulo: m.descricao, valor: centavos(-m.valor) }));
  } else {
    const primeira = t.split(/\r?\n/)[0] || "";
    const sep = (primeira.match(/;/g) || []).length > (primeira.match(/,/g) || []).length ? ";" : ",";
    const linhas = linhasCsv(t, sep);
    const c = cabecalho(linhas[0] || []);
    if (c.includes("identificador")) throw new Error("Este CSV é do extrato da conta, não da fatura do cartão. Para a conta, use Importar extrato, na aba Gastos do dia a dia.");
    const coluna = (...nomes) => c.findIndex((x) => nomes.includes(x));
    const iData = coluna("date", "data"), iTitulo = coluna("title", "descricao", "estabelecimento", "lancamento"), iValor = coluna("amount", "valor");
    if (iData < 0 || iTitulo < 0 || iValor < 0) throw new Error("Formato não reconhecido. Use o CSV ou o OFX da fatura exportados pelo app do Nubank.");
    formato = "CSV";
    banco = /nubank/i.test(nomeArquivo) || ["date,title,amount", "date,category,title,amount"].includes(c.join(",")) ? "Nubank" : "";
    brutos = linhas.slice(1).map((l) => ({ data: dataIso(l[iData]), titulo: l[iTitulo] || "", valor: centavos(numero(l[iValor])) }));
  }
  brutos = brutos.filter((b) => b.data && Number.isFinite(b.valor) && b.valor !== 0);
  const pagamento = (b) => /^(Pagamento|Pgto)\b/i.test(b.titulo);
  // Arquivo com o sinal trocado (compras negativas): vira o sinal para as compras ficarem positivas
  const semPagamento = brutos.filter((b) => !pagamento(b));
  if (semPagamento.length && semPagamento.filter((b) => b.valor < 0).length > semPagamento.length * 0.7) brutos.forEach((b) => { b.valor = -b.valor; });
  const itens = [];
  let pagamentos = 0;
  for (const b of brutos) {
    if (b.valor < 0 && pagamento(b)) { pagamentos++; continue; }
    const { nome, parcela } = separarParcela(b.titulo);
    itens.push({ data: b.data, nome: nome.slice(0, 200) || "Lançamento", valor: b.valor, parcela, tipo: tipoDe(nome, b.valor) });
  }
  if (!itens.length) throw new Error("Não encontrei compras neste arquivo.");
  itens.sort((a, b) => a.data.localeCompare(b.data));
  // O app do Nubank põe a data de vencimento da fatura no nome do arquivo (ex.: Nubank_2026-11-05.csv)
  const v = String(nomeArquivo).match(/(\d{4})-(\d{2})-(\d{2})/);
  return { formato, banco, vencimento: v ? `${v[1]}-${v[2]}-${v[3]}` : null, inicio: itens[0].data, fim: itens.at(-1).data, itens, pagamentos };
}

// Fatura provável: a do vencimento no nome do arquivo ou, sem ele, a do mês seguinte ao da última compra à vista
export function faturaProvavel(leitura) {
  if (leitura.vencimento) { const [a, m] = leitura.vencimento.split("-").map(Number); return rotuloFatura(a, m); }
  const avista = leitura.itens.filter((i) => !i.parcela || i.parcela.k === 1).map((i) => i.data);
  const [a, m] = (avista.at(-1) || leitura.fim).split("-").map(Number);
  return rotuloFatura(...somarMeses(a, m, 1));
}

// Prévia no formato do painel: os lançamentos como os da fatura fechada (mes, data, nome, categoria, tipo, parcela)
export function montarPrevia(leitura, { mes, historico = new Map(), arquivo = "" }) {
  const lancamentos = leitura.itens.map((it) => {
    const c = categorizar(it.nome, historico);
    const l = { mes, data: it.data, nome: it.nome, cidade: "", cat: c.cat, tipo: it.tipo, parcela: it.parcela ? `${dois(it.parcela.k)}/${dois(it.parcela.n)}` : "", valor: it.valor };
    if (c.sub) l.sub = c.sub;
    if (it.parcela) {
      const [a, m] = it.data.split("-").map(Number);
      const [ca, cm] = somarMeses(a, m, -(it.parcela.k - 1));
      l.compra = `${ca}-${dois(cm)}`;
    }
    return l;
  });
  const soma = (f) => centavos(lancamentos.filter(f).reduce((t, l) => t + l.valor, 0));
  const antigas = (l) => /^(\d+)\//.test(l.parcela) && Number(l.parcela.split("/")[0]) >= 2;
  return {
    mes, banco: leitura.banco || "", formato: leitura.formato, arquivo, vencimento: leitura.vencimento, inicio: leitura.inicio, ate: leitura.fim,
    total: soma(() => true), parcelas_anteriores: soma(antigas), compras: soma((l) => !antigas(l)), n_lanc: lancamentos.length,
    importada_em: new Date().toISOString(), lancamentos,
  };
}

// Põe a prévia no cartão (substitui a do mesmo mês). Quando a fatura fecha e o PDF é lido, a prévia sai.
export function aplicarPrevia(cartao, previa) {
  const c = structuredClone(cartao || {});
  c.previas = [...(c.previas || []).filter((p) => p.mes !== previa.mes), previa].sort((a, b) => ordemFatura(a.mes) - ordemFatura(b.mes));
  return c;
}

// Banco do cartão de um painel: o nome guardado, o das faturas lidas ou o da forma de pagamento ("Cartão Itaú")
export function bancoDoCartao(dados, quem = "dono") {
  const d = dados || {};
  const p = quem === "dono" ? d : d[quem] || {};
  const c = p.cartao || {};
  const nome = p.cartao_nome || (c.faturas || []).map((f) => f.banco).find(Boolean) || (c.previas || []).map((f) => f.banco).find(Boolean);
  if (nome) return nomeBanco(nome);
  if (quem !== "dono") return "";
  for (const m of d.meses || []) for (const l of m.lancamentos || []) {
    const f = String(l.forma || "").match(/^Cart[ãa]o\s+(?!de\b)(.+)$/i);
    if (f) return nomeBanco(f[1]);
  }
  return "";
}
