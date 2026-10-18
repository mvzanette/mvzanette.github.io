// Login e armazenamento da área restrita: modo demonstração (navegador) ou Supabase (produção).
import { ENGENHARIA } from "./modulos.js";

const COLUNAS = [
  "id", "numero", "crea", "tipo", "forma", "contratante", "contratante_doc", "proprietario", "local",
  "endereco", "contrato", "valor", "taxa", "celebrado", "inicio", "fim", "registrada", "atividades",
  "tos", "observacao", "chave", "tipo_servico", "baixa_data", "baixa_motivo", "anterior_id", "pdf_path", "notas",
  "vinculo", "empresa_id",
];

const somenteColunas = (art) => Object.fromEntries(COLUNAS.filter((c) => c in art).map((c) => [c, art[c] ?? null]));

const novoId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));

// ART com todas as colunas e com id: várias ARTs (novas e já cadastradas) gravam juntas sem apagar campos
const PADRAO_ART = { crea: "MG", atividades: [], tos: [] };
const linhaArt = (art) => ({ ...Object.fromEntries(COLUNAS.map((c) => [c, art[c] ?? PADRAO_ART[c] ?? null])), id: art.id || novoId() });

// Demais tabelas da área restrita (financeiro e demandas): colunas gravadas e colunas numéricas
const TABELAS = {
  demandas: {
    colunas: ["id", "titulo", "cliente", "contato", "email", "telefone", "cidade", "uf", "servico", "origem", "etapa",
      "valor", "recebida_em", "proposta_em", "aprovada_em", "concluida_em", "prazo", "art_id", "observacao"],
    numeros: ["valor"],
  },
  lancamentos: {
    colunas: ["id", "tipo", "descricao", "categoria", "cliente", "valor", "competencia", "vencimento", "pago_em",
      "forma", "art_id", "demanda_id", "observacao", "empresa_id"],
    numeros: ["valor"],
  },
};

const limpar = (nome, obj) => {
  const { colunas } = TABELAS[nome];
  return Object.fromEntries(colunas.filter((c) => c in obj).map((c) => [c, obj[c] === "" ? null : obj[c] ?? null]));
};
const numeros = (nome, obj) => {
  for (const c of TABELAS[nome].numeros) if (obj[c] != null) obj[c] = Number(obj[c]);
  return obj;
};

// Cadastro de usuários: o que o administrador grava (o resto o banco preenche a cada acesso)
const COLUNAS_PERFIL = ["email", "nome", "papel", "modulos", "situacao", "link_financas", "observacao"];
const SEM_ADM = "É preciso manter pelo menos um administrador ativo.";
export const BANCO_DESATUALIZADO =
  "O banco de dados precisa ser atualizado: rode de novo o arquivo supabase/schema.sql no SQL Editor do Supabase.";

// Mesmas regras do banco: e-mail em minúsculas, link só https e cliente sem módulo de engenharia
function regrasPerfil(p) {
  const linha = Object.fromEntries(COLUNAS_PERFIL.filter((c) => c in p).map((c) => [c, p[c] === "" ? null : p[c] ?? null]));
  if ("email" in linha) linha.email = String(linha.email || "").trim().toLowerCase();
  if ("nome" in linha) linha.nome = linha.nome ? String(linha.nome).trim() || null : null;
  if ("link_financas" in linha) {
    linha.link_financas = linha.link_financas ? String(linha.link_financas).trim() || null : null;
    if (linha.link_financas && !/^https:\/\//.test(linha.link_financas)) throw new Error("O link do painel precisa começar com https://");
  }
  if (linha.modulos && linha.papel === "cliente") linha.modulos = linha.modulos.filter((m) => !ENGENHARIA.includes(m));
  return linha;
}

// Texto opcional aparado e cortado no tamanho da coluna (vazio vira null)
const texto = (v, max) => String(v ?? "").trim().slice(0, max) || null;
const simNao = (v) => (v === true || v === false ? v : null);
const soCampos = (obj, campos) => Object.fromEntries(campos.filter((c) => c in obj).map((c) => [c, obj[c]]));
const hojeLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

// Conta de um lançamento das finanças pessoais: pessoal, engenharia (trabalho autônomo) ou uma empresa
const contaValida = (v) => (/^(pessoal|engenharia|empresa:[0-9a-f-]{36})$/.test(String(v || "")) ? v : null);

// Gasto lançado pelo site em Finanças pessoais: só as colunas da tabela, com tipos certos
const FORMAS_GASTO = ["cartao", "pix", "debito", "dinheiro", "outro"];
function limparGasto(g) {
  const forma = FORMAS_GASTO.includes(g.forma) ? g.forma : "outro";
  const valor = Math.round(Number(g.valor) * 100) / 100;
  if (!(valor > 0)) throw new Error("Informe um valor maior que zero.");
  if (!String(g.descricao || "").trim()) throw new Error("Informe a descrição do gasto.");
  return {
    perfil_id: g.perfil_id,
    data: g.data,
    descricao: String(g.descricao).trim().slice(0, 120),
    valor,
    forma,
    parcelas: forma === "cartao" ? Math.min(48, Math.max(1, parseInt(g.parcelas, 10) || 1)) : 1,
    categoria: String(g.categoria || "").trim().slice(0, 60) || null,
    essencial: g.essencial === true || g.essencial === false ? g.essencial : null,
    observacao: String(g.observacao || "").trim().slice(0, 300) || null,
    subcategoria: texto(g.subcategoria, 60),
    conta: contaValida(g.conta),
  };
}

// Entrada lançada pelo site: salário (holerite com bruto e descontos) ou outro recebimento
function limparEntrada(e) {
  const liquido = Math.round(Number(e.liquido) * 100) / 100;
  if (!(liquido > 0)) throw new Error("Informe o valor líquido (maior que zero).");
  if (!String(e.descricao || "").trim()) throw new Error("Informe a descrição da entrada.");
  const salario = e.tipo === "salario";
  const bruto = salario && e.bruto != null && e.bruto !== "" ? Math.round(Number(e.bruto) * 100) / 100 : null;
  if (bruto != null && !(bruto >= 0)) throw new Error("Valor bruto inválido.");
  const descontos = salario ? (Array.isArray(e.descontos) ? e.descontos : [])
    .map((d) => ({ nome: texto(d && d.nome, 60), valor: Math.round(Number(d && d.valor) * 100) / 100 }))
    .filter((d) => d.nome && d.valor > 0).slice(0, 20) : [];
  return {
    perfil_id: e.perfil_id,
    data: e.data,
    tipo: salario ? "salario" : "outro",
    descricao: String(e.descricao).trim().slice(0, 120),
    bruto,
    descontos,
    liquido,
    conta: contaValida(e.conta),
    observacao: texto(e.observacao, 300),
  };
}
const numerosEntrada = (e) => ({ ...e, liquido: Number(e.liquido), bruto: e.bruto == null ? null : Number(e.bruto),
  descontos: (e.descontos || []).map((d) => ({ nome: d.nome, valor: Number(d.valor) })) });

// Classificação de um gasto lançado pelo site (o que dá para mudar depois de lançado)
const limparClassificacao = (c) => ({
  categoria: texto(c.categoria, 60),
  subcategoria: texto(c.subcategoria, 60),
  essencial: simNao(c.essencial),
  observacao: texto(c.observacao, 300),
  conta: contaValida(c.conta),
});

// Classificação de um lançamento que vem do projeto Financeiro (gastos do dia a dia e faturas)
const limparAjuste = (a) => ({
  perfil_id: a.perfil_id,
  chave: String(a.chave).slice(0, 400),
  categoria: texto(a.categoria, 60),
  subcategoria: texto(a.subcategoria, 60),
  essencial: simNao(a.essencial),
  complemento: texto(a.complemento, 200),
  conta: contaValida(a.conta),
});

// Desejo de compra: só as colunas da tabela, com tipos certos
function limparDesejo(d) {
  const valor = Math.round(Number(d.valor) * 100) / 100;
  if (!String(d.nome || "").trim()) throw new Error("Informe o que você quer comprar.");
  if (!(valor > 0)) throw new Error("Informe o valor (maior que zero).");
  const quem = ["eu", "outra", "conjunto"].includes(d.quem) ? d.quem : "eu";
  if (quem === "outra" && !d.outra_id) throw new Error("Escolha a pessoa que vai comprar.");
  const link = texto(d.link, 500);
  if (link && !/^https:\/\//.test(link)) throw new Error("O link precisa começar com https://");
  const forma = d.forma === "parcelado" ? "parcelado" : "avista";
  const situacao = ["desejo", "comprado", "desistiu"].includes(d.situacao) ? d.situacao : "desejo";
  return {
    ...(d.id ? { id: d.id } : {}),
    perfil_id: d.perfil_id,
    nome: String(d.nome).trim().slice(0, 120),
    valor,
    prioridade: Math.min(5, Math.max(1, parseInt(d.prioridade, 10) || 3)),
    quem,
    outra_id: quem === "eu" ? null : d.outra_id || null,
    parte: Math.min(100, Math.max(0, Number.isFinite(Number(d.parte)) ? Number(d.parte) : 50)),
    forma,
    parcelas: forma === "parcelado" ? Math.min(48, Math.max(2, parseInt(d.parcelas, 10) || 2)) : 1,
    quando: /^\d{4}-\d{2}$/.test(d.quando || "") ? `${d.quando}-01` : d.quando || null,
    guardado: Math.max(0, Math.round(Number(d.guardado || 0) * 100) / 100),
    categoria: texto(d.categoria, 60),
    link,
    observacao: texto(d.observacao, 300),
    situacao,
    comprado_em: situacao === "comprado" ? d.comprado_em || hojeLocal() : null,
  };
}
const numerosDesejo = (d) => ({ ...d, valor: Number(d.valor), guardado: Number(d.guardado), parte: Number(d.parte) });

// Empresa (os nomes ficam só no banco)
function limparEmpresa(e) {
  const nome = String(e.nome || "").trim().slice(0, 80);
  if (!nome) throw new Error("Informe o nome da empresa.");
  return { nome, observacao: texto(e.observacao, 300), ordem: Number.isFinite(Number(e.ordem)) ? Number(e.ordem) : 0 };
}
const EMPRESA_REPETIDA = "Já existe uma empresa com esse nome.";
const EMPRESA_COM_LANCAMENTOS = "Esta empresa tem lançamentos. Apague-os antes de remover a empresa.";

// Nome guardado do PDF: data de envio na frente (evita sobrescrever) e só letras, números, ponto e hífen
const nomeArquivoPdf = (nome) => {
  const base = String(nome || "arquivo").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\.pdf$/i, "").replace(/[^\w.-]+/g, "_").slice(0, 80) || "arquivo";
  return `${Date.now()}-${base}.pdf`;
};
const nomeOriginalPdf = (guardado) => guardado.replace(/^\d{10,}-/, "");
// O cliente do Supabase envia o arquivo com o tipo que o navegador deu a ele (às vezes vazio) e os espaços
// de arquivos só aceitam PDF: o arquivo, já conferido como PDF, vai sempre marcado como application/pdf
const comoPdf = (arquivo) => arquivo.slice(0, arquivo.size, "application/pdf");

const mensagemPerfil = (error) =>
  error.code === "23505" ? "Já existe um cadastro com este e-mail."
  : error.code === "23514" ? "Dados inválidos: confira o e-mail e o link do painel (precisa começar com https://)."
  : error.code === "PGRST116" || error.code === "42501" ? "Sem permissão para alterar usuários."
  : error.message;

export async function criarArmazem({ url, chave }) {
  return url && chave ? armazemSupabase(url, chave) : armazemDemo();
}

// ---------------------------------------------------------------- demonstração
function armazemDemo() {
  const CHAVE = "mz-art-demo-v1";
  // Sessão de demonstração: dura até fechar a aba. Não protege nada; serve só para testar o fluxo de login.
  const SESSAO = "mz-area-demo-sessao";
  const sessao = {
    ler() {
      try {
        return sessionStorage.getItem(SESSAO);
      } catch {
        return null;
      }
    },
    gravar(valor) {
      try {
        if (valor) sessionStorage.setItem(SESSAO, valor);
        else sessionStorage.removeItem(SESSAO);
      } catch {
        /* sem armazenamento: a sessão não se mantém entre as páginas */
      }
    },
  };
  const pdfs = new Map(); // PDFs só durante a sessão
  const lerJson = (chave, padrao) => {
    try {
      return JSON.parse(localStorage.getItem(chave)) ?? padrao;
    } catch {
      return padrao;
    }
  };
  const gravarJson = (chave, valor) => {
    try {
      localStorage.setItem(chave, JSON.stringify(valor));
    } catch {
      /* navegador sem armazenamento: os dados valem só até fechar a página */
    }
  };
  const ler = () => lerJson(CHAVE, { arts: [], tratados: [] });
  const gravar = (d) => gravarJson(CHAVE, d);
  let estado = ler();

  const colecaoDemo = (nome) => {
    const chave = `mz-area-demo-${nome}`;
    let lista = lerJson(chave, []);
    return {
      async listar() {
        return structuredClone(lista);
      },
      async salvar(obj) {
        const linha = limpar(nome, obj);
        const existente = linha.id && lista.find((x) => x.id === linha.id);
        let r;
        if (existente) r = Object.assign(existente, linha);
        else lista.push((r = { ...linha, id: linha.id || novoId() }));
        gravarJson(chave, lista);
        return structuredClone(r);
      },
      async remover(idItem) {
        lista = lista.filter((x) => x.id !== idItem);
        gravarJson(chave, lista);
      },
      limpar() {
        lista = [];
        gravarJson(chave, lista);
      },
    };
  };
  const colecoes = Object.fromEntries(Object.keys(TABELAS).map((n) => [n, colecaoDemo(n)]));

  const salvarUm = (art) => {
    const linha = somenteColunas(art);
    const existente = estado.arts.find((a) => (linha.id && a.id === linha.id) || a.numero === linha.numero);
    if (existente) Object.assign(existente, linha, { id: existente.id });
    else estado.arts.push({ ...linha, id: linha.id || novoId() });
    return existente || estado.arts[estado.arts.length - 1];
  };

  // Usuários e histórico de acessos da demonstração (o primeiro e-mail que entra vira o administrador)
  const PERFIS = "mz-area-demo-perfis";
  const ACESSOS = "mz-area-demo-acessos";
  const FINANCAS = "mz-area-demo-financas";
  const GASTOS = "mz-area-demo-financas-gastos";
  const ENTRADAS = "mz-area-demo-financas-entradas";
  const EMPRESAS = "mz-area-demo-empresas";
  const PREFS = "mz-area-demo-financas-prefs";
  const AJUSTES = "mz-area-demo-financas-ajustes";
  const DESEJOS = "mz-area-demo-financas-desejos";
  const pdfsFinancas = []; // PDFs só durante a sessão
  const lerPerfis = () => lerJson(PERFIS, []);
  const eu = () => {
    const email = (sessao.ler() || "").toLowerCase();
    return lerPerfis().find((p) => p.email === email) || null;
  };
  // Mesmas regras do banco para as finanças pessoais: a própria pessoa ou o administrador
  const exigirDono = (perfilId) => {
    const p = eu();
    if (!p || (p.papel !== "adm" && perfilId !== p.id)) throw new Error("Sem permissão para alterar este painel.");
  };
  const doDesejo = (d) => {
    const p = eu();
    return !!p && (p.papel === "adm" || d.perfil_id === p.id || d.outra_id === p.id);
  };
  const exigirAdm = () => {
    const p = eu();
    if (!p || p.papel !== "adm" || p.situacao !== "ativo") throw new Error("Sem permissão para alterar usuários.");
  };
  const algumAdm = (perfis, exceto) => perfis.some((p) => p.id !== exceto && p.papel === "adm" && p.situacao === "ativo");

  return {
    modo: "demo",
    async usuario() {
      const email = sessao.ler();
      return email ? { email } : null;
    },
    async entrar(email, senha) {
      if (!email || !senha) throw new Error("Informe usuário e senha.");
      sessao.gravar(email.trim().toLowerCase());
    },
    async recuperarSenha() {},
    async definirSenha() {},
    async sair() {
      sessao.gravar(null);
    },
    async registrarAcesso(pagina, dispositivo) {
      const email = (sessao.ler() || "").toLowerCase();
      if (!email) return null;
      const perfis = lerPerfis();
      const agora = new Date().toISOString();
      let p = perfis.find((x) => x.email === email);
      if (!p) {
        const temAdm = algumAdm(perfis);
        p = {
          id: novoId(), email, nome: null, papel: temAdm ? "cliente" : "adm", modulos: [],
          situacao: temAdm ? "pendente" : "ativo", link_financas: null,
          observacao: temAdm ? "Conta criada sem cadastro no site: defina o perfil e libere o acesso." : null,
          primeiro_acesso: null, ultimo_acesso: null, visita_anterior: null, acessos: 0, criado_em: agora,
        };
        perfis.push(p);
      }
      p.user_id = p.user_id || `demo:${email}`;
      if (p.situacao === "ativo") {
        if (!p.ultimo_acesso || Date.now() - Date.parse(p.ultimo_acesso) > 30 * 60e3) {
          p.acessos += 1;
          p.visita_anterior = p.ultimo_acesso;
        }
        p.primeiro_acesso = p.primeiro_acesso || agora;
        p.ultimo_acesso = agora;
        const log = lerJson(ACESSOS, []);
        const repetido = log.some((a) => a.perfil_id === p.id && a.pagina === pagina && Date.now() - Date.parse(a.em) < 5 * 60e3);
        if (!repetido) log.unshift({ id: novoId(), perfil_id: p.id, pagina, dispositivo, em: agora });
        gravarJson(ACESSOS, log.slice(0, 500));
      }
      gravarJson(PERFIS, perfis);
      return structuredClone(p);
    },
    usuarios: {
      async listar() {
        exigirAdm();
        return lerPerfis();
      },
      async salvar(perfil) {
        exigirAdm();
        const linha = regrasPerfil(perfil);
        const perfis = lerPerfis();
        if (perfis.some((p) => p.email === linha.email && p.id !== perfil.id)) throw new Error("Já existe um cadastro com este e-mail.");
        let p = perfil.id && perfis.find((x) => x.id === perfil.id);
        if (p) {
          if (p.papel === "adm" && p.situacao === "ativo" && (linha.papel !== "adm" || linha.situacao !== "ativo") && !algumAdm(perfis, p.id))
            throw new Error(SEM_ADM);
          Object.assign(p, linha);
        } else {
          p = { id: novoId(), user_id: null, nome: null, papel: "cliente", modulos: [], situacao: "ativo", link_financas: null,
            observacao: null, primeiro_acesso: null, ultimo_acesso: null, visita_anterior: null, acessos: 0,
            criado_em: new Date().toISOString(), ...linha };
          perfis.push(p);
        }
        gravarJson(PERFIS, perfis);
        return structuredClone(p);
      },
      async remover(idPerfil) {
        exigirAdm();
        const perfis = lerPerfis();
        const p = perfis.find((x) => x.id === idPerfil);
        if (p && p.papel === "adm" && p.situacao === "ativo" && !algumAdm(perfis, p.id)) throw new Error(SEM_ADM);
        gravarJson(PERFIS, perfis.filter((x) => x.id !== idPerfil));
        gravarJson(ACESSOS, lerJson(ACESSOS, []).filter((a) => a.perfil_id !== idPerfil));
      },
    },
    async acessos({ limite = 300 } = {}) {
      const p = eu();
      const log = lerJson(ACESSOS, []);
      return (p && p.papel === "adm" ? log : log.filter((a) => p && a.perfil_id === p.id)).slice(0, limite);
    },
    async atualizarMeuNome(nome) {
      const perfis = lerPerfis();
      const p = perfis.find((x) => x.email === (sessao.ler() || "").toLowerCase());
      if (p) p.nome = String(nome || "").trim().slice(0, 80) || null;
      gravarJson(PERFIS, perfis);
    },
    // Finanças pessoais: um painel por pessoa (o administrador atualiza o de quem ele cuida)
    financas: {
      async ler(perfilId) {
        return lerJson(FINANCAS, {})[perfilId] || null;
      },
      async salvar(registro) {
        const p = eu();
        if (!p || (p.papel !== "adm" && registro.perfil_id !== p.id)) throw new Error("Sem permissão para atualizar este painel.");
        const todos = lerJson(FINANCAS, {});
        todos[registro.perfil_id] = { id: novoId(), ...registro, atualizado_em: new Date().toISOString() };
        gravarJson(FINANCAS, todos);
        return structuredClone(todos[registro.perfil_id]);
      },
      async gastos(perfilId) {
        return lerJson(GASTOS, []).filter((g) => g.perfil_id === perfilId);
      },
      async salvarGasto(gasto) {
        const p = eu();
        if (!p || (p.papel !== "adm" && gasto.perfil_id !== p.id)) throw new Error("Sem permissão para lançar neste painel.");
        const linha = { id: novoId(), criado_em: new Date().toISOString(), ...limparGasto(gasto) };
        gravarJson(GASTOS, [...lerJson(GASTOS, []), linha]);
        return structuredClone(linha);
      },
      async salvarGastos(lista) {
        const p = eu();
        if (!p || lista.some((g) => p.papel !== "adm" && g.perfil_id !== p.id)) throw new Error("Sem permissão para lançar neste painel.");
        const linhas = lista.map((g) => ({ id: novoId(), criado_em: new Date().toISOString(), ...limparGasto(g) }));
        gravarJson(GASTOS, [...lerJson(GASTOS, []), ...linhas]);
        return structuredClone(linhas);
      },
      async apagarGasto(idGasto) {
        gravarJson(GASTOS, lerJson(GASTOS, []).filter((g) => g.id !== idGasto));
      },
      async entradas(perfilId) {
        return lerJson(ENTRADAS, []).filter((e) => e.perfil_id === perfilId);
      },
      async salvarEntrada(entrada) {
        const p = eu();
        if (!p || (p.papel !== "adm" && entrada.perfil_id !== p.id)) throw new Error("Sem permissão para lançar neste painel.");
        const linha = { id: novoId(), criado_em: new Date().toISOString(), ...limparEntrada(entrada) };
        gravarJson(ENTRADAS, [...lerJson(ENTRADAS, []), linha]);
        return structuredClone(linha);
      },
      async apagarEntrada(idEntrada) {
        gravarJson(ENTRADAS, lerJson(ENTRADAS, []).filter((e) => e.id !== idEntrada));
      },
      async pdfs(perfilId) {
        return pdfsFinancas.filter((a) => a.caminho.startsWith(`${perfilId}/`)).map(({ url, ...a }) => a);
      },
      async enviarPdf(perfilId, arquivo) {
        const guardado = nomeArquivoPdf(arquivo.name);
        pdfsFinancas.unshift({ caminho: `${perfilId}/${guardado}`, nome: nomeOriginalPdf(guardado), tamanho: arquivo.size, criado_em: new Date().toISOString(), url: URL.createObjectURL(arquivo) });
        return pdfsFinancas[0].caminho;
      },
      async urlPdf(caminho) {
        return (pdfsFinancas.find((a) => a.caminho === caminho) || {}).url || null;
      },
      async baixarPdf(caminho) {
        const url = (pdfsFinancas.find((a) => a.caminho === caminho) || {}).url;
        if (!url) throw new Error("PDF não encontrado.");
        return (await fetch(url)).blob();
      },
      async apagarPdf(caminho) {
        const i = pdfsFinancas.findIndex((a) => a.caminho === caminho);
        if (i >= 0) pdfsFinancas.splice(i, 1);
      },
      async atualizarGasto(idGasto, campos) {
        const todos = lerJson(GASTOS, []);
        const g = todos.find((x) => x.id === idGasto);
        if (!g) throw new Error("Gasto não encontrado.");
        exigirDono(g.perfil_id);
        Object.assign(g, limparClassificacao(campos));
        gravarJson(GASTOS, todos);
        return structuredClone(g);
      },
      async preferencias(perfilId) {
        return lerJson(PREFS, {})[perfilId] || null;
      },
      async salvarPreferencias(perfilId, campos) {
        exigirDono(perfilId);
        const todos = lerJson(PREFS, {});
        todos[perfilId] = { perfil_id: perfilId, categorias: {}, plano: {}, ...todos[perfilId], ...soCampos(campos, ["categorias", "plano"]),
          atualizado_em: new Date().toISOString() };
        gravarJson(PREFS, todos);
        return structuredClone(todos[perfilId]);
      },
      async ajustes(perfilId) {
        return lerJson(AJUSTES, []).filter((a) => a.perfil_id === perfilId);
      },
      async salvarAjustes(lista) {
        const todos = lerJson(AJUSTES, []);
        const salvos = lista.map((a) => {
          exigirDono(a.perfil_id);
          const linha = { ...limparAjuste(a), atualizado_em: new Date().toISOString() };
          let x = todos.find((t) => t.perfil_id === linha.perfil_id && t.chave === linha.chave);
          if (x) Object.assign(x, linha);
          else todos.push((x = { id: novoId(), ...linha }));
          return structuredClone(x);
        });
        gravarJson(AJUSTES, todos);
        return salvos;
      },
      async apagarAjuste(idAjuste) {
        gravarJson(AJUSTES, lerJson(AJUSTES, []).filter((a) => a.id !== idAjuste));
      },
      async desejos() {
        return lerJson(DESEJOS, []).filter(doDesejo);
      },
      async salvarDesejo(desejo) {
        const linha = limparDesejo(desejo);
        const todos = lerJson(DESEJOS, []);
        let d = linha.id && todos.find((x) => x.id === linha.id);
        if (!doDesejo(linha) || (d && !doDesejo(d))) throw new Error("Sem permissão para alterar este desejo.");
        const agora = new Date().toISOString();
        if (d) Object.assign(d, linha, { atualizado_em: agora });
        else todos.push((d = { id: novoId(), criado_em: agora, ...linha, atualizado_em: agora }));
        gravarJson(DESEJOS, todos);
        return structuredClone(d);
      },
      async apagarDesejo(idDesejo) {
        gravarJson(DESEJOS, lerJson(DESEJOS, []).filter((d) => d.id !== idDesejo || !doDesejo(d)));
      },
      // Quem usa as finanças (para dividir desejos): só o primeiro nome
      async pessoas() {
        const usa = (x) => x.situacao === "ativo" && (x.papel === "adm" || (x.papel === "pessoal" && (x.modulos || []).includes("financas")));
        const p = eu();
        if (!p || !usa(p)) return [];
        return lerPerfis().filter(usa).map((x) => ({ id: x.id, nome: (x.nome || x.email).split(/[\s@]/)[0] }))
          .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
      },
    },
    // Empresas com que há movimento financeiro (os nomes ficam só nos dados)
    empresas: {
      async listar() {
        return lerJson(EMPRESAS, []).sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome, "pt-BR"));
      },
      async salvar(empresa) {
        const linha = limparEmpresa(empresa);
        const lista = lerJson(EMPRESAS, []);
        if (lista.some((x) => x.id !== empresa.id && x.nome.toLowerCase() === linha.nome.toLowerCase())) throw new Error(EMPRESA_REPETIDA);
        let e = empresa.id && lista.find((x) => x.id === empresa.id);
        if (e) Object.assign(e, linha);
        else lista.push((e = { id: novoId(), criado_em: new Date().toISOString(), ...linha }));
        gravarJson(EMPRESAS, lista);
        return structuredClone(e);
      },
      async remover(idEmpresa) {
        if ((await colecoes.lancamentos.listar()).some((l) => l.empresa_id === idEmpresa)) throw new Error(EMPRESA_COM_LANCAMENTOS);
        gravarJson(EMPRESAS, lerJson(EMPRESAS, []).filter((x) => x.id !== idEmpresa));
        estado.arts.forEach((a) => {
          if (a.empresa_id === idEmpresa) a.empresa_id = null;
        });
        gravar(estado);
      },
    },
    async listar() {
      return structuredClone(estado.arts);
    },
    async salvar(art) {
      const r = salvarUm(art);
      gravar(estado);
      return structuredClone(r);
    },
    async salvarVarios(arts) {
      const r = arts.map(salvarUm);
      gravar(estado);
      return structuredClone(r);
    },
    async remover(idArt) {
      estado.arts = estado.arts.filter((a) => a.id !== idArt);
      gravar(estado);
    },
    async enviarPdf(art, arquivo) {
      const caminho = `demo/${art.numero}.pdf`;
      pdfs.set(caminho, URL.createObjectURL(arquivo));
      return caminho;
    },
    async urlPdf(caminho) {
      return pdfs.get(caminho) || null;
    },
    async tratados() {
      return new Set(estado.tratados);
    },
    async marcarTratado(alerta) {
      if (!estado.tratados.includes(alerta.chave)) estado.tratados.push(alerta.chave);
      gravar(estado);
    },
    colecao(nome) {
      return colecoes[nome];
    },
    async limparTudo() {
      estado = { arts: [], tratados: [] };
      gravar(estado);
      Object.values(colecoes).forEach((c) => c.limpar());
      gravarJson(PERFIS, []);
      gravarJson(ACESSOS, []);
      gravarJson(FINANCAS, {});
      gravarJson(GASTOS, []);
      gravarJson(ENTRADAS, []);
      gravarJson(EMPRESAS, []);
      gravarJson(PREFS, {});
      gravarJson(AJUSTES, []);
      gravarJson(DESEJOS, []);
    },
  };
}

// ---------------------------------------------------------------- Supabase
async function armazemSupabase(url, chave) {
  const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm");
  const sb = createClient(url, chave);
  const falhou = (error) => {
    if (error) throw new Error(error.message);
  };

  return {
    modo: "supabase",
    async usuario() {
      const { data } = await sb.auth.getSession();
      return data.session ? data.session.user : null;
    },
    async entrar(email, senha) {
      const { error } = await sb.auth.signInWithPassword({ email, password: senha });
      falhou(error);
    },
    // O link do e-mail volta para a página de login, que então pede a nova senha
    async recuperarSenha(email) {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
      falhou(error);
    },
    async definirSenha(senha) {
      const { error } = await sb.auth.updateUser({ password: senha });
      falhou(error);
    },
    async sair() {
      await sb.auth.signOut();
    },
    // Liga a conta ao cadastro, registra o acesso e devolve o perfil (papel, módulos, situação)
    async registrarAcesso(pagina, dispositivo) {
      const { data, error } = await sb.rpc("registrar_acesso", { p_pagina: pagina, p_dispositivo: dispositivo });
      if (error) throw new Error(error.code === "PGRST202" || /registrar_acesso/.test(error.message) ? BANCO_DESATUALIZADO : error.message);
      return data;
    },
    usuarios: {
      async listar() {
        const { data, error } = await sb.from("perfis").select("*").order("criado_em");
        falhou(error);
        return data || [];
      },
      async salvar(perfil) {
        const linha = regrasPerfil(perfil);
        const consulta = perfil.id ? sb.from("perfis").update(linha).eq("id", perfil.id) : sb.from("perfis").insert(linha);
        const { data, error } = await consulta.select().single();
        if (error) throw new Error(mensagemPerfil(error));
        return data;
      },
      async remover(idPerfil) {
        const { error } = await sb.from("perfis").delete().eq("id", idPerfil);
        if (error) throw new Error(mensagemPerfil(error));
      },
    },
    async acessos({ limite = 300 } = {}) {
      const { data, error } = await sb
        .from("acessos")
        .select("id, perfil_id, pagina, dispositivo, em")
        .order("em", { ascending: false })
        .limit(limite);
      falhou(error);
      return data || [];
    },
    async atualizarMeuNome(nome) {
      const { error } = await sb.rpc("atualizar_meu_nome", { p_nome: nome });
      falhou(error);
    },
    financas: {
      async ler(perfilId) {
        const { data, error } = await sb.from("financas").select("*").eq("perfil_id", perfilId).maybeSingle();
        if (error) throw new Error(/financas/.test(error.message) && /exist|schema cache/.test(error.message) ? BANCO_DESATUALIZADO : error.message);
        return data;
      },
      async salvar({ perfil_id, modo, dados, investimentos, arquivo }) {
        const { data, error } = await sb
          .from("financas")
          .upsert({ perfil_id, modo, dados, investimentos, arquivo }, { onConflict: "perfil_id" })
          .select()
          .single();
        if (error) throw new Error(error.code === "42501" || error.code === "PGRST116" ? "Sem permissão para atualizar este painel." : error.message);
        return data;
      },
      async gastos(perfilId) {
        const { data, error } = await sb.from("financas_gastos").select("*").eq("perfil_id", perfilId).order("data");
        if (error) throw new Error(/financas_gastos/.test(error.message) ? BANCO_DESATUALIZADO : error.message);
        return (data || []).map((g) => ({ ...g, valor: Number(g.valor) }));
      },
      async salvarGasto(gasto) {
        const { data, error } = await sb.from("financas_gastos").insert(limparGasto(gasto)).select().single();
        if (error) throw new Error(error.code === "42501" || error.code === "PGRST116" ? "Sem permissão para lançar neste painel." : error.message);
        return { ...data, valor: Number(data.valor) };
      },
      async salvarGastos(lista) {
        const { data, error } = await sb.from("financas_gastos").insert(lista.map(limparGasto)).select();
        if (error) throw new Error(error.code === "42501" ? "Sem permissão para lançar neste painel." : error.message);
        return (data || []).map((g) => ({ ...g, valor: Number(g.valor) }));
      },
      async apagarGasto(idGasto) {
        const { error } = await sb.from("financas_gastos").delete().eq("id", idGasto);
        falhou(error);
      },
      async entradas(perfilId) {
        const { data, error } = await sb.from("financas_entradas").select("*").eq("perfil_id", perfilId).order("data");
        if (error) throw new Error(/financas_entradas/.test(error.message) ? BANCO_DESATUALIZADO : error.message);
        return (data || []).map(numerosEntrada);
      },
      async salvarEntrada(entrada) {
        const { data, error } = await sb.from("financas_entradas").insert(limparEntrada(entrada)).select().single();
        if (error) throw new Error(error.code === "42501" || error.code === "PGRST116" ? "Sem permissão para lançar neste painel."
          : /financas_entradas/.test(error.message) ? BANCO_DESATUALIZADO : error.message);
        return numerosEntrada(data);
      },
      async apagarEntrada(idEntrada) {
        const { error } = await sb.from("financas_entradas").delete().eq("id", idEntrada);
        falhou(error);
      },
      async pdfs(perfilId) {
        const { data, error } = await sb.storage.from("financas").list(perfilId, { limit: 200, sortBy: { column: "created_at", order: "desc" } });
        falhou(error);
        return (data || [])
          .filter((o) => o.id && /\.pdf$/i.test(o.name))
          .map((o) => ({ caminho: `${perfilId}/${o.name}`, nome: nomeOriginalPdf(o.name), tamanho: o.metadata ? o.metadata.size : null, criado_em: o.created_at }));
      },
      async enviarPdf(perfilId, arquivo) {
        const caminho = `${perfilId}/${nomeArquivoPdf(arquivo.name)}`;
        const { error } = await sb.storage.from("financas").upload(caminho, comoPdf(arquivo), { contentType: "application/pdf", upsert: false });
        if (error) {
          const m = String(error.message || "");
          throw new Error(/size|exceed|large/i.test(m) ? "O PDF passa de 20 MB." : /mime|type/i.test(m) ? "Só arquivos PDF são aceitos."
            : /row-level|policy|unauthorized/i.test(m) ? "Sem permissão para guardar PDFs neste painel." : /bucket/i.test(m) ? BANCO_DESATUALIZADO : m);
        }
        return caminho;
      },
      async urlPdf(caminho) {
        const { data, error } = await sb.storage.from("financas").createSignedUrl(caminho, 600);
        falhou(error);
        return data.signedUrl;
      },
      async baixarPdf(caminho) {
        const { data, error } = await sb.storage.from("financas").download(caminho);
        falhou(error);
        return data;
      },
      async apagarPdf(caminho) {
        const { error } = await sb.storage.from("financas").remove([caminho]);
        falhou(error);
      },
      async atualizarGasto(idGasto, campos) {
        const { data, error } = await sb.from("financas_gastos").update(limparClassificacao(campos)).eq("id", idGasto).select().single();
        if (error) throw new Error(error.code === "42501" || error.code === "PGRST116" ? "Sem permissão para alterar este gasto." : error.message);
        return { ...data, valor: Number(data.valor) };
      },
      async preferencias(perfilId) {
        const { data, error } = await sb.from("financas_preferencias").select("*").eq("perfil_id", perfilId).maybeSingle();
        if (error) throw new Error(/financas_preferencias/.test(error.message) ? BANCO_DESATUALIZADO : error.message);
        return data;
      },
      async salvarPreferencias(perfilId, campos) {
        const { data, error } = await sb
          .from("financas_preferencias")
          .upsert({ perfil_id: perfilId, ...soCampos(campos, ["categorias", "plano"]) }, { onConflict: "perfil_id" })
          .select()
          .single();
        if (error) throw new Error(error.code === "42501" || error.code === "PGRST116" ? "Sem permissão para alterar estas preferências." : error.message);
        return data;
      },
      async ajustes(perfilId) {
        const { data, error } = await sb.from("financas_ajustes").select("*").eq("perfil_id", perfilId);
        if (error) throw new Error(/financas_ajustes/.test(error.message) ? BANCO_DESATUALIZADO : error.message);
        return data || [];
      },
      async salvarAjustes(lista) {
        if (!lista.length) return [];
        const { data, error } = await sb.from("financas_ajustes").upsert(lista.map(limparAjuste), { onConflict: "perfil_id,chave" }).select();
        if (error) throw new Error(error.code === "42501" ? "Sem permissão para classificar neste painel." : error.message);
        return data || [];
      },
      async apagarAjuste(idAjuste) {
        const { error } = await sb.from("financas_ajustes").delete().eq("id", idAjuste);
        falhou(error);
      },
      async desejos() {
        const { data, error } = await sb.from("financas_desejos").select("*").order("prioridade").order("criado_em");
        if (error) throw new Error(/financas_desejos/.test(error.message) ? BANCO_DESATUALIZADO : error.message);
        return (data || []).map(numerosDesejo);
      },
      async salvarDesejo(desejo) {
        const { id, ...campos } = limparDesejo(desejo);
        const consulta = id ? sb.from("financas_desejos").update(campos).eq("id", id) : sb.from("financas_desejos").insert(campos);
        const { data, error } = await consulta.select().single();
        if (error) throw new Error(error.code === "42501" || error.code === "PGRST116" ? "Sem permissão para alterar este desejo." : error.message);
        return numerosDesejo(data);
      },
      async apagarDesejo(idDesejo) {
        const { error } = await sb.from("financas_desejos").delete().eq("id", idDesejo);
        falhou(error);
      },
      async pessoas() {
        const { data, error } = await sb.rpc("pessoas_financas");
        if (error) throw new Error(error.code === "PGRST202" || /pessoas_financas/.test(error.message) ? BANCO_DESATUALIZADO : error.message);
        return data || [];
      },
    },
    empresas: {
      async listar() {
        const { data, error } = await sb.from("empresas").select("*").order("ordem").order("nome");
        if (error) throw new Error(/empresas/.test(error.message) && /exist|schema cache/.test(error.message) ? BANCO_DESATUALIZADO : error.message);
        return data || [];
      },
      async salvar(empresa) {
        const linha = limparEmpresa(empresa);
        const consulta = empresa.id ? sb.from("empresas").update(linha).eq("id", empresa.id) : sb.from("empresas").insert(linha);
        const { data, error } = await consulta.select().single();
        if (error) {
          throw new Error(error.code === "23505" ? EMPRESA_REPETIDA
            : error.code === "42501" || error.code === "PGRST116" ? "Sem permissão para alterar as empresas." : error.message);
        }
        return data;
      },
      async remover(idEmpresa) {
        const { error } = await sb.from("empresas").delete().eq("id", idEmpresa);
        if (error) throw new Error(error.code === "23503" ? EMPRESA_COM_LANCAMENTOS : error.message);
      },
    },
    async listar() {
      const { data, error } = await sb.from("arts").select("*").order("fim", { ascending: true, nullsFirst: false });
      falhou(error);
      return (data || []).map((a) => ({ ...a, valor: a.valor === null ? null : Number(a.valor), taxa: a.taxa === null ? null : Number(a.taxa) }));
    },
    async salvar(art) {
      const [r] = await this.salvarVarios([art]);
      return r;
    },
    async salvarVarios(arts) {
      const { data, error } = await sb.from("arts").upsert(arts.map(linhaArt), { onConflict: "id" }).select();
      if (error) throw new Error(error.code === "23505" ? "Já existe uma ART com este número." : error.message);
      return data;
    },
    async remover(idArt) {
      const { data } = await sb.from("arts").select("pdf_path").eq("id", idArt).single();
      if (data && data.pdf_path) await sb.storage.from("arts").remove([data.pdf_path]);
      const { error } = await sb.from("arts").delete().eq("id", idArt);
      falhou(error);
    },
    async enviarPdf(art, arquivo) {
      const caminho = `pdf/${art.numero.replace(/[^\w.-]/g, "_")}.pdf`;
      const { error } = await sb.storage.from("arts").upload(caminho, comoPdf(arquivo), { upsert: true, contentType: "application/pdf" });
      falhou(error);
      return caminho;
    },
    async urlPdf(caminho) {
      const { data, error } = await sb.storage.from("arts").createSignedUrl(caminho, 600);
      falhou(error);
      return data.signedUrl;
    },
    colecao(nome) {
      return {
        async listar() {
          const { data, error } = await sb.from(nome).select("*");
          falhou(error);
          return (data || []).map((x) => numeros(nome, x));
        },
        async salvar(obj) {
          const linha = limpar(nome, obj);
          if (!linha.id) delete linha.id;
          const { data, error } = await sb.from(nome).upsert(linha).select().single();
          falhou(error);
          return numeros(nome, data);
        },
        async remover(idItem) {
          const { error } = await sb.from(nome).delete().eq("id", idItem);
          falhou(error);
        },
      };
    },
    async tratados() {
      const { data, error } = await sb.from("alertas").select("art_id, marco").not("lido_em", "is", null);
      falhou(error);
      return new Set((data || []).map((a) => `${a.art_id}:${a.marco}`));
    },
    async marcarTratado(alerta) {
      const { error } = await sb.from("alertas").upsert(
        { art_id: alerta.art.id, marco: alerta.marco, mensagem: alerta.mensagem, lido_em: new Date().toISOString() },
        { onConflict: "art_id,marco" }
      );
      falhou(error);
    },
  };
}
