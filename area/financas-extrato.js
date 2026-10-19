// Importação do extrato da conta (Finanças pessoais → Importar extrato): lê o arquivo OFX, que os bancos
// exportam no app ou no internet banking, ou o CSV da conta do Nubank, e separa as saídas que viram gastos
// lançados pelo site (Pix, débito, boletos, saques). Entradas, pagamento da fatura do cartão, aplicações e
// transferências entre contas próprias não entram, para não contar duas vezes. O arquivo é lido no navegador
// e não fica guardado.
// Nenhum dado pessoal aqui: as regras são genéricas e o histórico de categorias vem do painel de cada pessoa.
import { categorizar } from "./financas-faturas.js";

const BANCOS = { 1: "Banco do Brasil", 33: "Santander", 77: "Inter", 104: "Caixa", 237: "Bradesco", 260: "Nubank", 290: "PagBank", 336: "C6 Bank", 341: "Itaú", 380: "PicPay" };

const centavos = (v) => Math.round(v * 100) / 100;

// O OFX costuma vir em Windows-1252 (CHARSET:1252); os demais, em UTF-8
export function decodificarExtrato(bytes) {
  const inicio = new TextDecoder("latin1").decode(bytes.slice(0, 600));
  if (/CHARSET:\s*1252|ENCODING:\s*USASCII|encoding="(windows-1252|iso-8859-1)"/i.test(inicio)) return new TextDecoder("windows-1252").decode(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

// ---------------------------------------------------------------- formatos
const ENTIDADES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&nbsp;": " " };
const semEntidades = (s) => String(s || "").replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (e) => ENTIDADES[e]);
const dataOfx = (v) => { const m = String(v || "").match(/^(\d{4})(\d{2})(\d{2})/); return m ? `${m[1]}-${m[2]}-${m[3]}` : null; };
export const numero = (v) => {
  const s = String(v || "").trim().replace(/\s/g, "");
  if (!s) return NaN;
  // "1.234,56" ou "-150,00" (vírgula decimal) e "-150.00" (ponto decimal)
  return Number(/,\d{1,2}$/.test(s) ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, ""));
};

export function lerOfx(texto) {
  const tag = (bloco, nome) => { const m = bloco.match(new RegExp(`<${nome}>([^<\\r\\n]*)`, "i")); return m ? semEntidades(m[1]).trim() : ""; };
  const blocos = texto.split(/<STMTTRN>/i).slice(1).map((b) => b.split(/<\/STMTTRN>/i)[0]);
  const movimentos = blocos.map((b) => {
    const nome = tag(b, "NAME"), memo = tag(b, "MEMO");
    const descricao = !memo ? nome : !nome || memo.includes(nome) ? memo : nome.includes(memo) ? nome : `${nome} ${memo}`;
    return { data: dataOfx(tag(b, "DTPOSTED")), valor: centavos(numero(tag(b, "TRNAMT"))), descricao, id: tag(b, "FITID"), tipo: tag(b, "TRNTYPE").toUpperCase() };
  }).filter((m) => m.data && Number.isFinite(m.valor) && m.valor !== 0);
  const codigo = Number(tag(texto, "BANKID")) || null;
  return { formato: "OFX", banco: (codigo && BANCOS[codigo]) || tag(texto, "ORG") || (codigo ? `Banco ${codigo}` : ""), inicio: dataOfx(tag(texto, "DTSTART")), fim: dataOfx(tag(texto, "DTEND")), movimentos };
}

// Linhas de um CSV simples (aspas duplas, vírgula ou ponto e vírgula)
export function linhasCsv(texto, sep) {
  return texto.split(/\r?\n/).filter((l) => l.trim()).map((l) => {
    const campos = [];
    let atual = "", aspas = false;
    for (let i = 0; i < l.length; i++) {
      const c = l[i];
      if (aspas) {
        if (c === '"' && l[i + 1] === '"') { atual += '"'; i++; } else if (c === '"') aspas = false; else atual += c;
      } else if (c === '"') aspas = true;
      else if (c === sep) { campos.push(atual); atual = ""; } else atual += c;
    }
    campos.push(atual);
    return campos.map((x) => x.trim());
  });
}

const CSV_CARTAO = "Este CSV é da fatura do cartão, não do extrato da conta. Use Importar fatura parcial, no quadro de PDFs da aba Cartão e faturas.";
export const cabecalho = (l) => l.map((c) => c.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase());

function lerCsv(texto) {
  const primeira = texto.replace(/^﻿/, "").split(/\r?\n/)[0] || "";
  const sep = (primeira.match(/;/g) || []).length > (primeira.match(/,/g) || []).length ? ";" : ",";
  const linhas = linhasCsv(texto.replace(/^﻿/, ""), sep);
  const c = cabecalho(linhas[0] || []);
  if (c.join(",") === "date,title,amount" || c.join(",") === "date,category,title,amount") throw new Error(CSV_CARTAO);
  const iData = c.indexOf("data"), iValor = c.indexOf("valor"), iDesc = c.findIndex((x) => x === "descricao" || x === "historico");
  if (iData < 0 || iValor < 0 || iDesc < 0) throw new Error("Formato de extrato não reconhecido. Use o arquivo OFX do extrato (ou o CSV da conta do Nubank).");
  const iId = c.indexOf("identificador");
  const movimentos = linhas.slice(1).map((l) => {
    const d = (l[iData] || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return { data: d ? `${d[3]}-${d[2]}-${d[1]}` : null, valor: centavos(numero(l[iValor])), descricao: l[iDesc] || "", id: iId >= 0 ? l[iId] : "", tipo: "" };
  }).filter((m) => m.data && Number.isFinite(m.valor) && m.valor !== 0);
  const datas = movimentos.map((m) => m.data).sort();
  return { formato: "CSV", banco: iId >= 0 ? "Nubank" : "", inicio: datas[0] || null, fim: datas.at(-1) || null, movimentos };
}

// Lê o arquivo do extrato. Erro com mensagem para a tela quando o formato não é conhecido.
export function lerExtrato(texto, nomeArquivo = "") {
  const t = String(texto || "");
  if (/^%PDF-/.test(t) || /\.pdf$/i.test(nomeArquivo)) throw new Error("O extrato em PDF ainda não é lido. No app ou no internet banking do banco, exporte o extrato em OFX e escolha esse arquivo.");
  if (/<CCSTMTRS>|<CREDITCARDMSGSRSV1>/i.test(t)) throw new Error(CSV_CARTAO.replace("Este CSV", "Este OFX"));
  const leitura = /<OFX>|OFXHEADER/i.test(t) ? lerOfx(t) : lerCsv(t);
  if (!leitura.movimentos.length) throw new Error("Não encontrei movimentos neste extrato.");
  return leitura;
}

// ---------------------------------------------------------------- saídas que viram gastos
// Descrição mais curta: sem CPF mascarado, agência e conta, e com os textos mais comuns do Nubank resumidos
export function limparDescricao(d) {
  let s = String(d || "").replace(/\s+/g, " ").trim();
  s = s.replace(/^Transfer[êe]ncia enviada pelo Pix - ([^-]+?) - .*$/i, "Pix para $1")
    .replace(/^Transfer[êe]ncia enviada - ([^-]+?)( - .*)?$/i, "Transferência para $1")
    .replace(/^Pagamento de boleto efetuado - /i, "Boleto: ")
    .replace(/^Compra no d[ée]bito( via NuPay)? - /i, "")
    .replace(/^(SISPAG )?PIX TRANSF(ERENCIA)?\s+/i, "Pix para ")
    .replace(/^(SISPAG )?PIX (QRS?|QR CODE|PAGTO|PAG)\s+/i, "")
    .replace(/^PAG(TO)? BOLETO\s+/i, "Boleto: ")
    .replace(/[•*]{3}\.\d{3}\.\d{3}-[•*]{2}/g, "")
    .replace(/\s*-?\s*Ag[êe]ncia:.*$/i, "")
    .replace(/(?<=[A-Za-zÀ-ÿ ])\d{2}\/\d{2}$/, "")
    .replace(/\s*-\s*$/, "")
    .replace(/\s+/g, " ").trim();
  return s.slice(0, 120) || "Saída do extrato";
}

const FATURA_CARTAO = /FATURA|CART[AÃ]O DE CR[EÉ]DITO|CARTAO CRED|ITAUCARD|PAG(TO)?\.? ?CART[AÃ]O/i;
const INVESTIMENTO = /APLICA[CÇ][AÃ]O|\bAPLIC\b|RESGATE|\bCDB\b|\bLC[IA]\b|POUPAN[CÇ]A|TESOURO|INVESTIMENTO|\bRDB\b|CAIXINHA|COFRINHO|CORRETORA/i;
const CONTA_PROPRIA = /MESMA TITULARIDADE|ENTRE CONTAS|CONTA PR[OÓ]PRIA|TRANSF(ER[EÊ]NCIA)? PR[OÓ]PRIA/i;
export const MOTIVOS = { fatura: "pagamento da fatura do cartão", investimento: "aplicação ou investimento", propria: "transferência entre contas próprias", repetido: "já está no painel" };

// Separa as saídas (com forma, categoria sugerida e se entram ou não) das entradas.
// jaNoPainel: lançamentos que já existem ({ data, valor }), do projeto e os lançados pelo site. O mesmo valor com
// até um dia de diferença conta como repetido (um Pix lançado à mão na noite anterior, por exemplo).
export function saidasDoExtrato(leitura, { historico = new Map(), jaNoPainel = [] } = {}) {
  const usados = new Set();
  const dia = (iso) => Date.parse(iso + "T12:00:00Z") / 864e5;
  const repetido = (m) => {
    const i = jaNoPainel.findIndex((x, k) => !usados.has(k) && Math.abs(dia(x.data) - dia(m.data)) <= 1 && Math.abs(Math.abs(x.valor) - Math.abs(m.valor)) < 0.01);
    if (i >= 0) usados.add(i);
    return i >= 0;
  };
  const saidas = leitura.movimentos.filter((m) => m.valor < 0).map((m) => {
    const bruto = m.descricao;
    const descricao = limparDescricao(bruto);
    const forma = /\bPIX\b/i.test(bruto) ? "pix" : /SAQUE/i.test(bruto) ? "dinheiro" : "debito";
    const motivo = FATURA_CARTAO.test(bruto) ? "fatura" : INVESTIMENTO.test(bruto) ? "investimento" : CONTA_PROPRIA.test(bruto) ? "propria"
      : repetido(m) ? "repetido" : null;
    const c = categorizar(descricao, historico);
    return { data: m.data, valor: centavos(-m.valor), descricao, forma, categoria: c.cat, subcategoria: c.sub, motivo, marcado: !motivo };
  }).sort((a, b) => a.data.localeCompare(b.data));
  const entradas = leitura.movimentos.filter((m) => m.valor > 0);
  return { saidas, entradas: { quantidade: entradas.length, total: centavos(entradas.reduce((t, m) => t + m.valor, 0)) } };
}
