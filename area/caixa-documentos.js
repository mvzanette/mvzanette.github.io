// Caixa das empresas: leitura dos documentos (RDV, o relatório de despesas de viagem, e ficha de custo) e as contas
// do caixa. Os leitores procuram os rótulos do modelo das planilhas ("DISCRIMINAÇÃO", "TOTAL DE DESPESAS",
// "CENTRO DE CUSTO:", "TOTAL DA PARCELA:"...), não posições fixas, para aguentar linhas a mais ou a menos.
// Nenhum dado de empresa aqui: os nomes das empresas e dos colaboradores vêm do banco.

const semAcento = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const centavos = (v) => Math.round(v * 100) / 100;
const numero = (v) => (typeof v === "number" ? v : Number(String(v ?? "").replace(/\s|R\$/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")));
const ehTexto = (v) => typeof v === "string" && v.trim() !== "";

export const CLASSIFICACOES = { rdv: "RDV", fc: "FC", outro: "Outro" };
export const TIPOS = { entrada: "Entrada", despesa: "Despesa", adiantamento: "Adiantamento", devolucao: "Devolução" };

// Sigla de cada empresa do caixa: a primeira letra do nome, sem as palavras que todas têm ("Empresa", "Ltda");
// com letras repetidas, as primeiras até ficarem únicas
export function siglas(empresas) {
  const palavras = empresas.map((e) => semAcento(e.nome).replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((p) => p.length > 1));
  const comuns = new Set(palavras.length > 1 ? palavras[0].filter((p) => palavras.every((ps) => ps.includes(p))) : []);
  const nomes = palavras.map((ps) => (ps.filter((p) => !comuns.has(p)).join("") || ps.join("")).toUpperCase() || "E");
  const r = new Map();
  empresas.forEach((e, i) => {
    let n = 1;
    while (n < nomes[i].length && nomes.some((x, j) => j !== i && x.slice(0, n) === nomes[i].slice(0, n))) n++;
    r.set(e.id, nomes[i].slice(0, n));
  });
  return r;
}
// "RDV V", "FC T"; entradas e adiantamentos pelo tipo
export function rotuloMovimento(m, sig) {
  if (m.tipo !== "despesa") return TIPOS[m.tipo] || m.tipo;
  const s = m.empresa_id && sig.get(m.empresa_id);
  return `${CLASSIFICACOES[m.classificacao] || "Outro"}${s ? ` ${s}` : ""}`;
}

// Empresa citada num texto (título da planilha ou nome do arquivo): a que tem uma palavra do nome nele
export function empresaNoTexto(texto, empresas) {
  const t = ` ${semAcento(texto).replace(/[^a-z0-9]+/g, " ")} `;
  return empresas.find((e) => semAcento(e.nome).replace(/[^a-z0-9]+/g, " ").split(" ").filter((p) => p.length >= 3).some((p) => t.includes(` ${p} `))) || null;
}
const mesmoNome = (a, b) => { const x = semAcento(a).split(/\s+/)[0], y = semAcento(b).split(/\s+/)[0]; return !!x && x === y; };
// Nome de colaborador já usado no caixa com o mesmo primeiro nome ("Davi" e "Davi Souza" são a mesma pessoa)
export function nomeColaborador(nome, conhecidos = []) {
  const n = String(nome || "").replace(/\s+/g, " ").trim();
  if (!n) return null;
  return conhecidos.find((c) => mesmoNome(c, n)) || n;
}

// --------------------------------------------------------------- leitura das abas
const achar = (aba, re, depois = 0) => aba.celulas.find((c) => c.linha > depois && ehTexto(c.valor) && re.test(semAcento(c.valor)));
// Valor à direita de um rótulo na mesma linha (a próxima célula preenchida)
const aDireita = (aba, rotulo, filtro = () => true) => {
  if (!rotulo) return null;
  const c = aba.celulas.find((x) => x.linha === rotulo.linha && x.coluna > rotulo.coluna && filtro(x.valor));
  return c ? c.valor : null;
};
const campo = (aba, re) => { const r = achar(aba, re); const v = aDireita(aba, r); return v == null || (ehTexto(v) && /:\s*$/.test(v)) ? null : typeof v === "string" ? v.trim() : v; };
// Texto logo abaixo de um rótulo (observações)
const abaixo = (aba, rotulo) => {
  if (!rotulo) return null;
  const c = aba.celulas.find((x) => x.linha > rotulo.linha && x.linha <= rotulo.linha + 3 && x.coluna >= rotulo.coluna - 1 && ehTexto(x.valor));
  return c ? c.valor.trim() : null;
};

function lerRdv(aba) {
  const titulo = achar(aba, /relatorio de despesas de viagem/);
  const cab = achar(aba, /^discrimina/);
  const avisos = [];
  const campos = {
    obra: campo(aba, /^obra:?$/), nome: campo(aba, /^nome:?$/), emissao: campo(aba, /^emissao:?$/), periodo: campo(aba, /^periodo:?$/),
    origem: campo(aba, /^local de origem:?$/), destino: campo(aba, /^local de destino:?$/),
  };
  const itens = [];
  let total = null;
  const rotTotal = achar(aba, /total de despesas/);
  const obs = achar(aba, /^observac/);
  if (cab) {
    const col = (re) => (aba.celulas.find((c) => c.linha === cab.linha && ehTexto(c.valor) && re.test(semAcento(c.valor))) || {}).coluna;
    const cTotal = col(/^total$/), cQtd = col(/^qnt|^qtd|^quant/), cUnit = col(/unitario/), cPlaca = col(/^placa/);
    const fim = Math.min(rotTotal ? rotTotal.linha : Infinity, obs ? obs.linha : Infinity);
    const linhas = [...new Set(aba.celulas.filter((c) => c.linha > cab.linha && c.linha < fim).map((c) => c.linha))];
    for (const l of linhas) {
      const desc = aba.valor(l, cab.coluna);
      if (typeof desc === "number") { if (total == null && desc > 0) total = desc; continue; } // total sem rótulo, logo abaixo dos itens
      const v = cTotal ? Number(aba.valor(l, cTotal)) : NaN;
      if (ehTexto(desc) && v > 0) itens.push({ descricao: desc.trim(), placa: cPlaca ? aba.valor(l, cPlaca) : null, quantidade: cQtd ? aba.valor(l, cQtd) : null, unitario: cUnit ? aba.valor(l, cUnit) : null, total: centavos(v) });
    }
  }
  if (rotTotal) { const v = aDireita(aba, rotTotal, (x) => typeof x === "number"); if (v != null) total = v; }
  const soma = centavos(itens.reduce((t, i) => t + i.total, 0));
  if (total == null) total = soma;
  else if (itens.length && Math.abs(total - soma) > 0.01) avisos.push(`A soma dos itens (${soma.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}) é diferente do total da planilha.`);
  return { tipo: "rdv", titulo: titulo ? titulo.valor.trim() : "", total: centavos(total), soma, itens, campos: { ...campos, observacao: abaixo(aba, obs) }, avisos };
}

function lerFc(aba) {
  const titulo = achar(aba, /^ficha de custo/);
  const avisos = [];
  const itens = [];
  for (const r of aba.celulas.filter((c) => ehTexto(c.valor) && /^centro de custo/.test(semAcento(c.valor)))) {
    const valorRot = aba.celulas.find((c) => c.linha === r.linha && ehTexto(c.valor) && /^valor/.test(semAcento(c.valor)));
    const valor = valorRot ? aDireita(aba, valorRot, (x) => typeof x === "number") : null;
    const placaRot = aba.celulas.find((c) => c.linha === r.linha && ehTexto(c.valor) && /^placa/.test(semAcento(c.valor)));
    const cc = aDireita(aba, r, (x) => !(ehTexto(x) && /:\s*$/.test(x)));
    const placa = placaRot ? aDireita(aba, placaRot, (x) => !(ehTexto(x) && /:\s*$/.test(x))) : null;
    if (valor > 0) itens.push({ centro: cc != null && (!valorRot || r.coluna < valorRot.coluna) ? String(cc).trim() : null, placa: placa && typeof placa === "string" ? placa.trim() : null, total: centavos(valor) });
  }
  const soma = centavos(itens.reduce((t, i) => t + i.total, 0));
  const parcela = aDireita(aba, achar(aba, /^total da parcela/), (x) => typeof x === "number");
  const nota = aDireita(aba, achar(aba, /^total nota fiscal/), (x) => typeof x === "number");
  let total = parcela ?? nota ?? soma;
  if (itens.length && Math.abs(total - soma) > 0.01) avisos.push(`A soma dos centros de custo (${soma.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}) é diferente do total da parcela.`);
  const campos = { nota: campo(aba, /^n[ºo°.]* nota:?$/), vencimento: campo(aba, /^venc/), parcela: campo(aba, /^parcela:?$/), observacao: abaixo(aba, achar(aba, /^observac/)) };
  if (typeof campos.parcela === "number") campos.parcela = null; // célula auxiliar do modelo, não a parcela
  return { tipo: "fc", titulo: titulo ? titulo.valor.trim() : "", total: centavos(total), soma, itens, campos, avisos };
}

// Documentos de uma planilha: uma aba de RDV ou de ficha de custo vira um documento (as abas vazias ficam de fora).
// empresas: as do caixa; meuNome: quem usa (o RDV de outra pessoa é a prestação de contas de um colaborador)
export function lerDocumentos(planilha, { nomeArquivo = "", empresas = [], meuNome = "", colaboradores = [] } = {}) {
  const docs = [];
  for (const aba of planilha.abas) {
    const texto = aba.celulas.filter((c) => ehTexto(c.valor)).slice(0, 40).map((c) => semAcento(c.valor)).join(" ");
    const leitura = /relatorio de despesas de viagem/.test(texto) ? lerRdv(aba) : /ficha de custo/.test(texto) ? lerFc(aba) : null;
    if (!leitura || !(leitura.total > 0)) continue;
    const empresa = empresaNoTexto(leitura.titulo, empresas) || empresaNoTexto(nomeArquivo, empresas) || empresaNoTexto(aba.nome, empresas);
    const c = leitura.campos;
    const quem = leitura.tipo === "rdv" && c.nome && typeof c.nome === "string" && !(meuNome && mesmoNome(c.nome, meuNome)) ? nomeColaborador(c.nome, colaboradores) : null;
    const partes = leitura.tipo === "rdv"
      ? [c.obra && `Obra ${c.obra}`, c.destino && `${c.origem ? `${c.origem} → ` : ""}${c.destino}`, c.observacao]
      : [leitura.itens.map((i) => i.centro).filter(Boolean).length ? `CC ${leitura.itens.map((i) => i.centro).filter(Boolean).join(", ")}` : null, c.observacao];
    docs.push({ ...leitura, aba: aba.nome, empresa_id: empresa ? empresa.id : null, colaborador: quem,
      descricao: `${leitura.tipo === "rdv" ? "RDV" : "Ficha de custo"}: ${partes.filter(Boolean).join(" · ") || aba.nome}`.slice(0, 200) });
  }
  return docs;
}

// --------------------------------------------------------------- contas do caixa
// Em caixa: saldo inicial + entradas + devoluções − adiantamentos − despesas aprovadas pagas com o caixa.
// Com cada colaborador: adiantado − despesas aprovadas dele (prestação de contas) − devolvido. Positivo, o dinheiro
// está com ele; negativo, ele gastou mais do que recebeu e falta reembolsar.
export function resumoCaixa(config, movimentos, { inicio = null, fim = null } = {}) {
  const c = config || {};
  const desde = c.data_inicial || null;
  const validos = movimentos.filter((m) => !desde || m.data >= desde);
  const soma = (f) => centavos(validos.filter(f).reduce((t, m) => t + Number(m.valor), 0));
  const pagaCaixa = (m) => m.tipo === "despesa" && m.aprovado && !m.colaborador;
  const inicial = Number(c.saldo_inicial) || 0;
  const entradas = soma((m) => m.tipo === "entrada"), devolvido = soma((m) => m.tipo === "devolucao");
  const adiantado = soma((m) => m.tipo === "adiantamento"), despesas = soma(pagaCaixa);
  const emCaixa = centavos(inicial + entradas + devolvido - adiantado - despesas);
  const pessoas = new Map();
  for (const m of validos.filter((x) => x.colaborador && (x.tipo !== "despesa" || x.aprovado))) {
    const nome = nomeColaborador(m.colaborador, [...pessoas.keys()]);
    const p = pessoas.get(nome) || { nome, adiantado: 0, prestado: 0, devolvido: 0 };
    if (m.tipo === "adiantamento") p.adiantado += Number(m.valor);
    else if (m.tipo === "devolucao") p.devolvido += Number(m.valor);
    else if (m.tipo === "despesa") p.prestado += Number(m.valor);
    pessoas.set(nome, p);
  }
  const colaboradores = [...pessoas.values()].map((p) => ({ ...p, adiantado: centavos(p.adiantado), prestado: centavos(p.prestado), devolvido: centavos(p.devolvido),
    saldo: centavos(p.adiantado - p.prestado - p.devolvido) })).sort((a, b) => b.saldo - a.saldo || a.nome.localeCompare(b.nome));
  const comColaboradores = centavos(colaboradores.reduce((t, p) => t + Math.max(0, p.saldo), 0));
  const aReembolsar = centavos(colaboradores.reduce((t, p) => t + Math.max(0, -p.saldo), 0));
  const pendentes = validos.filter((m) => m.tipo === "despesa" && !m.aprovado);
  const conta = c.saldo_conta == null ? null : Number(c.saldo_conta);
  // Despesas aprovadas no período, por classificação e empresa (as dos colaboradores também: são gastos das empresas)
  const doPeriodo = validos.filter((m) => (!inicio || m.data >= inicio) && (!fim || m.data <= fim));
  const grupos = new Map();
  for (const m of doPeriodo.filter((x) => x.tipo === "despesa" && x.aprovado)) {
    const k = `${m.classificacao || "outro"}|${m.empresa_id || ""}`;
    const g = grupos.get(k) || { classificacao: m.classificacao || "outro", empresa_id: m.empresa_id || null, total: 0, n: 0 };
    g.total = centavos(g.total + Number(m.valor)); g.n++;
    grupos.set(k, g);
  }
  return {
    inicial, desde, entradas, devolvido, adiantado, despesas, emCaixa, colaboradores, comColaboradores, aReembolsar,
    saldoEmpresas: centavos(emCaixa + comColaboradores - aReembolsar),
    conta, dataConta: c.data_conta || null, diferenca: conta == null ? null : centavos(conta - emCaixa),
    aAprovar: { n: pendentes.length, total: centavos(pendentes.reduce((t, m) => t + Number(m.valor), 0)) },
    periodo: {
      despesas: [...grupos.values()].sort((a, b) => b.total - a.total),
      totalDespesas: centavos([...grupos.values()].reduce((t, g) => t + g.total, 0)),
      entradas: centavos(doPeriodo.filter((m) => m.tipo === "entrada").reduce((t, m) => t + Number(m.valor), 0)),
    },
  };
}

// Saldo em caixa depois de cada movimento (na ordem das datas), para a lista
export function saldoApos(config, movimentos) {
  const desde = (config && config.data_inicial) || null;
  let saldo = Number((config && config.saldo_inicial) || 0);
  const r = new Map();
  const efeito = (m) => (m.tipo === "entrada" || m.tipo === "devolucao" ? 1 : m.tipo === "adiantamento" || (m.tipo === "despesa" && m.aprovado && !m.colaborador) ? -1 : 0);
  for (const m of [...movimentos].filter((x) => !desde || x.data >= desde).sort((a, b) => a.data.localeCompare(b.data) || String(a.criado_em || "").localeCompare(String(b.criado_em || "")))) {
    saldo = centavos(saldo + efeito(m) * Number(m.valor));
    r.set(m.id, { saldo, mexe: efeito(m) !== 0 });
  }
  return r;
}
