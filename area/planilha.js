// Leitura de planilhas do Excel (.xlsx) no navegador, sem biblioteca: o .xlsx é um zip com arquivos XML. Devolve as
// abas com o valor de cada célula (nas fórmulas, o resultado que o Excel guardou). Usado pelos leitores de RDV e de
// ficha de custo do caixa das empresas. O arquivo é lido no navegador e nada sai dele aqui.

const texto = new TextDecoder("utf-8");
const ENTIDADES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const semEntidades = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e) =>
  e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENTIDADES[e.toLowerCase()]);

// Arquivos do zip: nome → { metodo, dados (ainda comprimidos) }
function lerZip(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let fim = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { fim = i; break; }
  }
  if (fim < 0) throw new Error("Este arquivo não é uma planilha .xlsx (salve no Excel como Pasta de Trabalho do Excel).");
  const arquivos = new Map();
  let p = dv.getUint32(fim + 16, true);
  const total = dv.getUint16(fim + 10, true);
  for (let k = 0; k < total && dv.getUint32(p, true) === 0x02014b50; k++) {
    const metodo = dv.getUint16(p + 10, true), tamanho = dv.getUint32(p + 20, true);
    const nLen = dv.getUint16(p + 28, true), eLen = dv.getUint16(p + 30, true), cLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const nome = texto.decode(bytes.subarray(p + 46, p + 46 + nLen));
    const inicio = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true);
    arquivos.set(nome, { metodo, dados: bytes.subarray(inicio, inicio + tamanho) });
    p += 46 + nLen + eLen + cLen;
  }
  return arquivos;
}

async function extrair(arquivos, nome) {
  const a = arquivos.get(nome) || arquivos.get(nome.replace(/^\//, ""));
  if (!a) return null;
  if (a.metodo === 0) return texto.decode(a.dados);
  if (a.metodo !== 8) throw new Error("Planilha com compressão não suportada.");
  const fluxo = new Blob([a.dados]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return texto.decode(new Uint8Array(await new Response(fluxo).arrayBuffer()));
}

const atributo = (tag, nome) => { const m = tag.match(new RegExp(`\\b${nome}="([^"]*)"`)); return m ? semEntidades(m[1]) : null; };
const textos = (xml) => [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, "").matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => semEntidades(m[1])).join("");
// "AB12" → { coluna: 28, linha: 12 }
export function posicao(ref) {
  const m = String(ref).match(/^([A-Z]+)(\d+)$/);
  if (!m) return null;
  let coluna = 0;
  for (const ch of m[1]) coluna = coluna * 26 + ch.charCodeAt(0) - 64;
  return { coluna, linha: Number(m[2]) };
}
export const nomeColuna = (n) => { let s = ""; for (let x = n; x > 0; x = Math.floor((x - 1) / 26)) s = String.fromCharCode(65 + ((x - 1) % 26)) + s; return s; };

// Lê o .xlsx (ArrayBuffer ou Uint8Array). Cada aba: { nome, visivel, celulas: [{ linha, coluna, ref, valor }], valor(l, c) }
export async function lerPlanilha(conteudo) {
  const bytes = conteudo instanceof Uint8Array ? conteudo : new Uint8Array(conteudo);
  const arquivos = lerZip(bytes);
  const livro = await extrair(arquivos, "xl/workbook.xml");
  if (!livro) throw new Error("Este arquivo não é uma planilha .xlsx.");
  const rels = (await extrair(arquivos, "xl/_rels/workbook.xml.rels")) || "";
  const alvo = new Map([...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => [atributo(m[0], "Id"), atributo(m[0], "Target")]));
  const compartilhadas = [...((await extrair(arquivos, "xl/sharedStrings.xml")) || "").matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => textos(m[1]));
  const abas = [];
  for (const m of livro.matchAll(/<sheet\b[^>]*>/g)) {
    const destino = alvo.get(atributo(m[0], "r:id"));
    if (!destino) continue;
    const caminho = destino.startsWith("/") ? destino.slice(1) : `xl/${destino.replace(/^\.\//, "")}`;
    const xml = (await extrair(arquivos, caminho)) || "";
    const celulas = [];
    for (const c of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const pos = posicao(atributo(c[1], "r"));
      if (!pos || !c[2]) continue;
      const tipo = atributo(c[1], "t");
      const v = (c[2].match(/<v>([\s\S]*?)<\/v>/) || [])[1];
      let valor = null;
      if (tipo === "s") valor = v == null ? null : compartilhadas[Number(v)] ?? null;
      else if (tipo === "inlineStr") valor = textos(c[2]);
      else if (tipo === "str") valor = v == null ? null : semEntidades(v);
      else if (tipo === "b") valor = v === "1";
      else if (tipo === "e") valor = null;
      else if (v != null && v !== "") valor = Number(v);
      if (valor === null || valor === "" || (typeof valor === "number" && !Number.isFinite(valor))) continue;
      celulas.push({ ...pos, ref: `${nomeColuna(pos.coluna)}${pos.linha}`, valor: typeof valor === "string" ? valor : valor });
    }
    celulas.sort((a, b) => a.linha - b.linha || a.coluna - b.coluna);
    const mapa = new Map(celulas.map((x) => [`${x.linha}:${x.coluna}`, x.valor]));
    abas.push({ nome: atributo(m[0], "name") || `Aba ${abas.length + 1}`, visivel: !/hidden/.test(atributo(m[0], "state") || ""), celulas, valor: (l, c) => mapa.get(`${l}:${c}`) ?? null });
  }
  if (!abas.length) throw new Error("Não encontrei abas nesta planilha.");
  return { abas };
}
