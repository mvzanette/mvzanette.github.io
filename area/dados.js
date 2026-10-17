// Login e armazenamento da área restrita: modo demonstração (navegador) ou Supabase (produção).
import { ENGENHARIA } from "./modulos.js";

const COLUNAS = [
  "id", "numero", "crea", "tipo", "forma", "contratante", "contratante_doc", "proprietario", "local",
  "endereco", "contrato", "valor", "taxa", "celebrado", "inicio", "fim", "registrada", "atividades",
  "tos", "observacao", "chave", "tipo_servico", "baixa_data", "baixa_motivo", "anterior_id", "pdf_path", "notas",
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
      "forma", "art_id", "demanda_id", "observacao"],
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
  const lerPerfis = () => lerJson(PERFIS, []);
  const eu = () => {
    const email = (sessao.ler() || "").toLowerCase();
    return lerPerfis().find((p) => p.email === email) || null;
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
      const { error } = await sb.storage.from("arts").upload(caminho, arquivo, { upsert: true, contentType: "application/pdf" });
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
