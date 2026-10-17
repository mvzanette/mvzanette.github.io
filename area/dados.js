// Login e armazenamento da área restrita: modo demonstração (navegador) ou Supabase (produção).

const COLUNAS = [
  "id", "numero", "crea", "tipo", "forma", "contratante", "contratante_doc", "proprietario", "local",
  "endereco", "contrato", "valor", "taxa", "celebrado", "inicio", "fim", "registrada", "atividades",
  "tos", "observacao", "chave", "tipo_servico", "baixa_data", "baixa_motivo", "anterior_id", "pdf_path", "notas",
];

const somenteColunas = (art) => Object.fromEntries(COLUNAS.filter((c) => c in art).map((c) => [c, art[c] ?? null]));

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
  const ler = () => {
    try {
      return JSON.parse(localStorage.getItem(CHAVE)) || { arts: [], tratados: [] };
    } catch {
      return { arts: [], tratados: [] };
    }
  };
  const gravar = (d) => {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(d));
    } catch {
      /* navegador sem armazenamento: os dados valem só até fechar a página */
    }
  };
  let estado = ler();
  const id = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));

  const colecaoDemo = (nome) => {
    const chave = `mz-area-demo-${nome}`;
    const lerColecao = () => {
      try {
        return JSON.parse(localStorage.getItem(chave)) || [];
      } catch {
        return [];
      }
    };
    const gravarColecao = (lista) => {
      try {
        localStorage.setItem(chave, JSON.stringify(lista));
      } catch {
        /* sem armazenamento: vale até fechar a página */
      }
    };
    let lista = lerColecao();
    return {
      async listar() {
        return structuredClone(lista);
      },
      async salvar(obj) {
        const linha = limpar(nome, obj);
        const existente = linha.id && lista.find((x) => x.id === linha.id);
        let r;
        if (existente) r = Object.assign(existente, linha);
        else lista.push((r = { ...linha, id: linha.id || id() }));
        gravarColecao(lista);
        return structuredClone(r);
      },
      async remover(idItem) {
        lista = lista.filter((x) => x.id !== idItem);
        gravarColecao(lista);
      },
      limpar() {
        lista = [];
        gravarColecao(lista);
      },
    };
  };
  const colecoes = Object.fromEntries(Object.keys(TABELAS).map((n) => [n, colecaoDemo(n)]));

  const salvarUm = (art) => {
    const linha = somenteColunas(art);
    const existente = estado.arts.find((a) => (linha.id && a.id === linha.id) || a.numero === linha.numero);
    if (existente) Object.assign(existente, linha, { id: existente.id });
    else estado.arts.push({ ...linha, id: linha.id || id() });
    return existente || estado.arts[estado.arts.length - 1];
  };

  return {
    modo: "demo",
    async usuario() {
      const email = sessao.ler();
      return email ? { email } : null;
    },
    async entrar(email, senha) {
      if (!email || !senha) throw new Error("Informe usuário e senha.");
      sessao.gravar(email);
    },
    async recuperarSenha() {},
    async definirSenha() {},
    async sair() {
      sessao.gravar(null);
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
  const uid = async () => {
    const { data } = await sb.auth.getSession();
    return data.session && data.session.user.id;
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
      const user_id = await uid();
      const linhas = arts.map((a) => {
        const l = { ...somenteColunas(a), user_id };
        if (!l.id) delete l.id;
        return l;
      });
      const { data, error } = await sb.from("arts").upsert(linhas, { onConflict: "user_id,numero" }).select();
      falhou(error);
      return data;
    },
    async remover(idArt) {
      const { data } = await sb.from("arts").select("pdf_path").eq("id", idArt).single();
      if (data && data.pdf_path) await sb.storage.from("arts").remove([data.pdf_path]);
      const { error } = await sb.from("arts").delete().eq("id", idArt);
      falhou(error);
    },
    async enviarPdf(art, arquivo) {
      const caminho = `${await uid()}/${art.numero.replace(/[^\w.-]/g, "_")}.pdf`;
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
          const linha = { ...limpar(nome, obj), user_id: await uid() };
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
        { user_id: await uid(), art_id: alerta.art.id, marco: alerta.marco, mensagem: alerta.mensagem, lido_em: new Date().toISOString() },
        { onConflict: "art_id,marco" }
      );
      falhou(error);
    },
  };
}
