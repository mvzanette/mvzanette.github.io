// Leitura automática dos PDFs do CREA.
// Recebe as linhas extraídas por pdf-texto.js e devolve uma lista de ARTs no formato da plataforma.
//
// Formatos reconhecidos:
//   - ART individual do CREA-MG
//   - ART individual do CREA-RJ
//   - Relatório "ARTs (Todas)" do CREA-MG (várias ARTs de uma vez)
// O CREA-SP ainda não tem leitor: falta um PDF de exemplo.

const DATA = /(\d{2})\/(\d{2})\/(\d{4})/;

export function dataISO(br) {
  const m = br && String(br).match(DATA);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

export function valorNumero(texto) {
  if (!texto) return null;
  const limpo = String(texto).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(limpo);
  return Number.isFinite(n) ? n : null;
}

const limpar = (s) => (s || "").replace(/\s+/g, " ").trim() || null;

function capitalizarLocal(cidade, uf) {
  if (!cidade) return null;
  const c = cidade
    .toLowerCase()
    .replace(/(^|\s)(\S)/g, (m, esp, l) => esp + l.toUpperCase())
    .replace(/\s(De|Da|Do|Das|Dos|E)\s/g, (m) => m.toLowerCase());
  return uf ? `${c}/${uf}` : c;
}

function trecho(linhas, inicio, fim) {
  const i = linhas.findIndex((l) => inicio.test(l));
  if (i < 0) return [];
  const resto = linhas.slice(i + 1);
  const j = resto.findIndex((l) => fim.test(l));
  return j < 0 ? resto : resto.slice(0, j);
}

function atividadesDeTexto(texto) {
  // Captura cada "#código - descrição" da atividade técnica
  const lista = [];
  const re = /#?(\d{1,2}(?:\.\d+){1,4})\s*-\s*([^>#]+?)(?=\s{2,}|\s\d+[,.]\d{2}\s|$)/g;
  let m;
  while ((m = re.exec(texto))) {
    if (!/^\d{1,2}\.\d/.test(m[1])) continue;
    lista.push({ tos: m[1], descricao: limpar(m[2]) });
  }
  return lista;
}

// ------------------------------------------------------------------ detecção
export function detectarFormato(linhas) {
  const t = linhas.join("\n");
  if (/Total de Registros:/i.test(t) && /ARTs \(/i.test(t)) return "relatorio-mg";
  if (/CREA-MG/.test(t) && /N[ºo°]\s*MG\d{6,}/.test(t)) return "art-mg";
  if (/CREA-RJ/.test(t) && /Anota[çc][ãa]o de Responsabilidade T[ée]cnica/.test(t)) return "art-rj";
  if (/CREA-SP/.test(t)) return "art-sp";
  return "desconhecido";
}

// ------------------------------------------------------------------ ART CREA-MG
export function lerArtMG(linhas) {
  const t = linhas.join("\n");
  const g = (re) => {
    const m = t.match(re);
    return m ? m[1].trim() : null;
  };
  const obra = trecho(linhas, /^3\.\s*Dados da Obra/i, /^4\.\s*Atividade/i).join("\n");
  const cidadeObra = obra.match(/Cidade:\s*(.+?)\s{2,}UF:\s*([A-Z]{2})/);
  const enderecoObra = obra.split("\n")[0];
  const ativ = trecho(linhas, /^Quantidade\s+Unidade/i, /Após a conclusão/i);
  const atividades = [];
  let atual = null;
  for (const l of ativ) {
    const m = l.match(/^\d+\s*-\s*(.+?)\s*>/);
    if (m) {
      atual = { atividade: limpar(m[1]), texto: l };
      atividades.push(atual);
    } else if (atual) {
      atual.texto += " " + l;
    }
  }
  const lista = atividades.flatMap((a) =>
    atividadesDeTexto(a.texto.replace(/\s{2,}\d+[,.]\d+\s{2,}\S+/g, "")).map((x) => ({ atividade: a.atividade, ...x }))
  );
  const obs = trecho(linhas, /^5\.\s*Observa/i, /^6\.\s*Declara/i);

  return [{
    numero: g(/N[ºo°]\s*(MG\d+)/),
    crea: "MG",
    tipo: limpar(g(/ART\s+(OBRA \/ SERVIÇO|CARGO OU FUNÇÃO)\s*$/m)) || "OBRA / SERVIÇO",
    forma: g(/^(INICIAL|RETIFICADORA|COMPLEMENTAR|SUBSTITUI[ÇC][ÃA]O[^\n]*|VINCULADA[^\n]*)$/m),
    contratante: g(/Contratante:\s*(.+?)\s{2,}CPF\/CNPJ/),
    contratante_doc: g(/Contratante:.+?CPF\/CNPJ:\s*(\S+)/),
    proprietario: g(/Propriet[áa]rio:\s*(.+?)\s{2,}CPF\/CNPJ/),
    contrato: limpar(g(/Contrato::?\s*(.+?)\s{2,}Celebrado/)),
    celebrado: dataISO(g(/Celebrado em:\s*(\S+)/)),
    valor: valorNumero(g(/^Valor:\s*(R\$\s*[\d.,]+)/m)),
    local: cidadeObra ? capitalizarLocal(cidadeObra[1], cidadeObra[2]) : null,
    endereco: limpar(enderecoObra),
    inicio: dataISO(g(/Data de In[íi]cio:\s*(\S+)/)),
    fim: dataISO(g(/Previs[ãa]o de t[ée]rmino:\s*(\S+)/)),
    atividades: lista,
    tos: [...new Set(lista.map((a) => a.tos))],
    observacao: limpar(obs.join(" ")),
    taxa: valorNumero(g(/Valor da ART:\s*(R\$\s*[\d.,]+)/)),
    registrada: dataISO(g(/Registrada em:\s*(\S+)/)),
    chave: g(/com a chave:\s*(\w+)/),
  }];
}

// ------------------------------------------------------------------ ART CREA-RJ
export function lerArtRJ(linhas) {
  const t = linhas.join("\n");
  const g = (re) => {
    const m = t.match(re);
    return m ? m[1].trim() : null;
  };
  const obra = trecho(linhas, /^3\.\s*Dados da Obra/i, /^4\.\s*Atividade/i).join("\n");
  const cidadeObra = obra.match(/Cidade:\s*(.+?)\s{2,}UF:\s*([A-Z]{2})/);
  const logradouro = obra.match(/Logradouro:\s*(.+?)\s{2,}N[ºo°]:\s*(\S+)/);
  const ativTexto = trecho(linhas, /^4\.\s*Atividade/i, /Após a conclusão/i).join("  ");
  const nivel = ativTexto.match(/Nv Atua[çc][ãa]o:\s*(.+?)\s{2,}/);
  const atividade = ativTexto.match(/Atividade:\s*(.+?)\s{2,}/);
  const tos = [...ativTexto.matchAll(/TOS:\s*(\d+(?:\.\d+)+)\s*-?\s*(.+?)(?=\s{2,}Qtde|$)/g)].map((m) => ({
    atividade: limpar([nivel && nivel[1], atividade && atividade[1]].filter(Boolean).join(" – ")),
    tos: m[1],
    descricao: limpar(m[2]),
  }));
  const obsAtividade = g(/^Observa[çc][ãa]o:\s*(.+)$/m);
  const obs = trecho(linhas, /^5\.\s*Observa/i, /^6\.\s*Declara/i);

  return [{
    numero: g(/(?:dezembro de|^)\s*(\d{12,14})\s*$/m),
    crea: "RJ",
    tipo: limpar(g(/(ART de [^\n]+?)\s*$/m)) || "ART de Obra ou Serviço",
    forma: limpar(g(/Tipo de Contrato:\s*(.+)$/m)),
    contratante: g(/Contratante:\s*(.+?)\s{2,}CPF\/CNPJ/),
    contratante_doc: g(/Contratante:.+?CPF\/CNPJ:\s*(\S+)/),
    proprietario: g(/Propriet[áa]rio:\s*(.+?)\s{2,}CPF\/CNPJ/),
    contrato: limpar(g(/^Contrato:\s*(.+?)\s{2,}Celebrado/m)),
    celebrado: dataISO(g(/Celebrado em:\s*(\S+)/)),
    valor: valorNumero(g(/Valor do Contrato:\s*(R\$\s*[\d.,]+)/)),
    local: cidadeObra ? capitalizarLocal(cidadeObra[1], cidadeObra[2]) : null,
    endereco: logradouro ? limpar(`${logradouro[1]}, ${logradouro[2]}`) : null,
    inicio: dataISO(g(/In[íi]cio em:\s*(\S+)/)),
    fim: dataISO(g(/Fim em:\s*(\S+)/)),
    atividades: tos,
    tos: [...new Set(tos.map((a) => a.tos))],
    observacao: limpar([obsAtividade, obs.join(" ").replace(/^Caso este campo.*?análise\.?/i, "")].filter(Boolean).join(" – ")),
    taxa: null,
    registrada: null,
    chave: g(/validarAssinatura\/(\w+)/),
  }];
}

// ------------------------------------------------------------------ Relatório CREA-MG
const CABECALHO_RELATORIO = [
  /^CONSELHO REGIONAL DE ENGENHARIA E AGRONOMIA DE MINAS GERAIS/i,
  /^LEI N[ºo°] 5\.194/i,
  /^ARTs \(/i,
  /^P[áa]gina \d+\/\d+/i,
  /^--- fim da página/,
  /^Conselho Regional de Engenharia e Agronomia de Minas Gerais$/i,
  /^Avenida Alvares Cabral/i,
  /^Tel:\s*0800/i,
];

export function lerRelatorioMG(linhas) {
  const limpas = linhas.filter((l) => !CABECALHO_RELATORIO.some((re) => re.test(l.trim())));
  const blocos = [];
  for (const l of limpas) {
    if (/^MG\d{11}\s/.test(l)) blocos.push([l]);
    else if (blocos.length) blocos[blocos.length - 1].push(l);
  }

  return blocos.map((b) => {
    const [cab] = b;
    const colunas = cab.split(/\s{2,}/);
    const datasCab = cab.match(/\d{2}\/\d{2}\/\d{4}/g) || [];
    const corpo = b.slice(1);
    const texto = corpo.join("\n");
    const g = (re) => {
      const m = texto.match(re);
      return m ? m[1].trim() : null;
    };

    const obs = trecho(corpo, /^Observa[çc][ãa]o:/i, /^Contratos:/i);
    const iContrato = corpo.findIndex((l) => /^N[úu]mero\s+Valor/i.test(l));
    let contrato = null, valor = null, inicio = null, fim = null, endereco = null;
    if (iContrato >= 0) {
      const linha = corpo[iContrato + 1] || "";
      const m = linha.match(/^(?:(.+?)\s{2,})?R\$\s?([\d.,]+)\s+(\d{2}\/\d{2}\/\d{4})?\s*(\d{2}\/\d{2}\/\d{4})?\s*(.*)$/);
      if (m) {
        contrato = limpar(m[1]);
        valor = valorNumero(m[2]);
        inicio = dataISO(m[3]);
        fim = dataISO(m[4]);
        const extra = [];
        for (const l of corpo.slice(iContrato + 2)) {
          if (/^Atividades:/i.test(l)) break;
          extra.push(l);
        }
        endereco = limpar([m[5], ...extra].join(" ").replace(/\s-\s(\d{8})$/, " – CEP $1"));
      }
    }
    const localM = endereco && endereco.match(/-\s*([^-]+?)\/([A-Z]{2})\b/);

    const iAtiv = corpo.findIndex((l) => /^N[íi]vel\s+Atividade/i.test(l));
    const ativLinhas = iAtiv >= 0 ? corpo.slice(iAtiv + 1) : [];
    const atividades = [];
    let atual = null;
    for (const l of ativLinhas) {
      const m = l.match(/^([A-ZÀ-Ú][a-zà-ú]+(?: [a-zà-ú]+)*)\s+([A-ZÀ-Ú]{3,}[A-ZÀ-Ú ,]*\s>\s.*)$/);
      if (m) {
        atual = { nivel: m[1], texto: m[2] };
        atividades.push(atual);
      } else if (atual) {
        atual.texto += "  " + l;
      }
    }
    const lista = atividades.flatMap((a) => atividadesDeTexto(a.texto).map((x) => ({ atividade: a.nivel, ...x })));

    return {
      numero: colunas[0],
      crea: "MG",
      tipo: colunas[1] || null,
      forma: colunas[3] || null,
      contratante: g(/^Contratante:\s*(.+?)\s{2,}(?:CNPJ|CPF)/m),
      contratante_doc: g(/^Contratante:.+?(?:CNPJ|CPF):\s*(\S+)/m),
      proprietario: g(/^Propriet[áa]rio:\s*(.+?)\s{2,}(?:CNPJ|CPF)/m),
      contrato,
      celebrado: null,
      valor,
      local: localM ? capitalizarLocal(localM[1], localM[2]) : null,
      endereco,
      inicio,
      fim,
      atividades: lista,
      tos: [...new Set(lista.map((a) => a.tos))],
      observacao: limpar(obs.join(" ")),
      taxa: null,
      registrada: dataISO(datasCab[datasCab.length - 1]),
      chave: null,
    };
  });
}

// ------------------------------------------------------------------ entrada única
export function lerPdf(linhas) {
  const formato = detectarFormato(linhas);
  const leitores = { "art-mg": lerArtMG, "art-rj": lerArtRJ, "relatorio-mg": lerRelatorioMG };
  const ler = leitores[formato];
  if (!ler) return { formato, arts: [] };
  return { formato, arts: ler(linhas).filter((a) => a.numero) };
}
