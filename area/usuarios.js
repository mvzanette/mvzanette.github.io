// Usuários e permissões (area/usuarios.html, só administrador): cadastro e perfis de acesso, módulos
// liberados, situação, histórico de acessos e o passo a passo para criar o login no Supabase.
import { abrirPagina, PAGINA_LOGIN } from "./sessao.js";
import { SUPABASE_URL } from "./config-area.js";
import { MODULOS, PAPEIS, PERMISSOES, SITUACOES, liberavel, situacaoDe } from "./modulos.js";
import { $, $$, esc, avisar, opcoes, prepararDialogos } from "./ui.js";

let armazem;
let perfil; // quem está usando a página
let usuarios = [];
let acessos = [];
let editando = null; // cadastro aberto no diálogo (null = novo)
const filtro = { busca: "", papel: "", situacao: "" };

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const dataHora = (iso) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString("pt-BR")} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
};
function relativo(iso) {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 2) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${plural(h, "hora", "horas")}`;
  const d = Math.round(h / 24);
  if (d < 30) return `há ${plural(d, "dia", "dias")}`;
  const m = Math.round(d / 30);
  return m < 12 ? `há ${plural(m, "mês", "meses")}` : `há ${plural(Math.round(m / 12), "ano", "anos")}`;
}
const online = (u) => u.ultimo_acesso && Date.now() - Date.parse(u.ultimo_acesso) < 10 * 60e3;
const nomeModulo = (id) => (PERMISSOES.find((p) => p.id === id) || {}).titulo || id;
const nomePagina = (pagina) => (pagina === "index.html" ? "Início" : (MODULOS.find((m) => m.pagina === pagina) || {}).titulo || pagina || "—");
const nomeDe = (u) => u.nome || u.email;

// Tela de usuários do projeto no painel do Supabase (Authentication → Users)
function linkSupabase() {
  const ref = (SUPABASE_URL.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/) || [])[1];
  return ref ? `https://supabase.com/dashboard/project/${ref}/auth/users` : "https://supabase.com/dashboard";
}

// ---------------------------------------------------------------- abas
function prepararAbas() {
  const abas = $$("[role=tab]");
  const ir = (aba, foco) => {
    abas.forEach((a) => {
      const sel = a === aba;
      a.setAttribute("aria-selected", String(sel));
      a.tabIndex = sel ? 0 : -1;
      $(`#${a.getAttribute("aria-controls")}`).hidden = !sel;
    });
    if (foco) aba.focus();
    history.replaceState(null, "", aba.id === "aba-usuarios" ? location.pathname : `#${aba.id.slice(4)}`);
  };
  abas.forEach((a) => a.addEventListener("click", () => ir(a)));
  $(".abas").addEventListener("keydown", (e) => {
    const i = abas.findIndex((a) => a.getAttribute("aria-selected") === "true");
    const j = e.key === "ArrowRight" ? (i + 1) % abas.length : e.key === "ArrowLeft" ? (i - 1 + abas.length) % abas.length : -1;
    if (j < 0) return;
    e.preventDefault();
    ir(abas[j], true);
  });
  const inicial = abas.find((a) => `#${a.id.slice(4)}` === location.hash);
  if (inicial) ir(inicial);
}

// ---------------------------------------------------------------- usuários
function renderKpis() {
  const conta = (s) => usuarios.filter((u) => situacaoDe(u) === s).length;
  const semana = usuarios.filter((u) => u.ultimo_acesso && Date.now() - Date.parse(u.ultimo_acesso) < 7 * 864e5).length;
  const pendentes = conta("pendente");
  const kpi = (rotulo, valor, detalhe, situacao, alerta = false) =>
    `<button type="button" class="kpi kpi-botao${alerta ? " kpi-alerta" : ""}" data-situacao="${situacao}" aria-pressed="${filtro.situacao === situacao}">
      <span class="kpi-rotulo">${rotulo}</span><strong class="kpi-valor">${valor}</strong><span class="kpi-detalhe">${detalhe}</span>
    </button>`;
  $("#kpis-usuarios").innerHTML = [
    kpi("Usuários ativos", conta("ativo"), `${plural(semana, "pessoa acessou", "pessoas acessaram")} nos últimos 7 dias`, "ativo"),
    kpi("Aguardando 1º acesso", conta("aguardando"), "cadastrados, ainda sem entrar", "aguardando"),
    kpi("Aguardando liberação", pendentes, pendentes ? "defina o perfil e libere" : "nenhuma conta pendente", "pendente", pendentes > 0),
    kpi("Inativos", conta("inativo"), "sem acesso à área", "inativo"),
  ].join("");
}

function renderLista() {
  const termo = filtro.busca.trim().toLowerCase();
  const ordem = { pendente: 0, ativo: 1, aguardando: 2, inativo: 3 };
  const lista = usuarios
    .filter((u) => (!filtro.papel || u.papel === filtro.papel) && (!filtro.situacao || situacaoDe(u) === filtro.situacao))
    .filter((u) => !termo || `${u.nome || ""} ${u.email}`.toLowerCase().includes(termo))
    .sort((a, b) => ordem[situacaoDe(a)] - ordem[situacaoDe(b)] || nomeDe(a).localeCompare(nomeDe(b), "pt-BR"));

  $("#lista-usuarios").innerHTML = lista.length
    ? lista.map((u) => {
        const sit = situacaoDe(u);
        const mods = (u.modulos || []).filter((m) => liberavel(u.papel, m));
        const acesso = !u.ultimo_acesso ? '<span class="sem">Nunca entrou</span>'
          : online(u) ? `<span class="online">Online agora</span><small>${dataHora(u.ultimo_acesso)}</small>`
          : `${dataHora(u.ultimo_acesso)}<small>${relativo(u.ultimo_acesso)}</small>`;
        return `<tr class="clicavel" data-id="${esc(u.id)}" tabindex="0">
          <td><span class="usuario-nome">${esc(u.nome || "Sem nome")}${u.id === perfil.id ? ' <span class="voce">você</span>' : ""}</span>
            <small class="usuario-email">${esc(u.email)}</small></td>
          <td><span class="papel papel-${u.papel}">${PAPEIS[u.papel].titulo}</span></td>
          <td class="modulos-celula">${u.papel === "adm" ? "Todos" : mods.length ? esc(mods.map(nomeModulo).join(", ")) : '<span class="sem">Nenhum</span>'}</td>
          <td><span class="etiqueta sit-${sit}">${SITUACOES[sit]}</span></td>
          <td class="data">${acesso}</td>
          <td class="num">${u.acessos || 0}</td>
        </tr>`;
      }).join("")
    : `<tr><td colspan="6" class="vazio">${usuarios.length ? "Nenhum usuário com esses filtros." : "Nenhum usuário cadastrado."}</td></tr>`;
}

// ---------------------------------------------------------------- perfis e permissões
function renderPermissoes() {
  $("#papeis-resumo").innerHTML = Object.entries(PAPEIS)
    .map(([id, p]) => {
      const n = usuarios.filter((u) => u.papel === id && u.situacao !== "inativo").length;
      return `<div class="papel-card"><span class="papel papel-${id}">${p.titulo}</span><p>${p.descricao}</p><small>${plural(n, "usuário", "usuários")}</small></div>`;
    })
    .join("");
  const sempre = '<span class="acesso acesso-sim">Sempre</span>';
  const seLiberado = '<span class="acesso acesso-se">Se liberado</span>';
  const nunca = '<span class="acesso acesso-nao">Nunca</span>';
  const comLink = "<small>o próprio painel, depois de importado</small>";
  const linha = (titulo, adm, pessoal, cliente) => `<tr><th scope="row">${titulo}</th><td>${adm}</td><td>${pessoal}</td><td>${cliente}</td></tr>`;
  $("#matriz").innerHTML = [
    linha("Painel gerencial", sempre, '<span class="acesso acesso-se">Com algum módulo profissional</span>', nunca),
    linha("Controle de ART", sempre, seLiberado, nunca),
    linha("Controle financeiro", sempre, seLiberado, nunca),
    linha("Controle de demandas", sempre, seLiberado, nunca),
    linha("Finanças pessoais", sempre + comLink, '<span class="acesso acesso-se">Liberado por padrão</span>' + comLink, seLiberado + comLink),
    linha("Usuários e permissões", sempre, nunca, nunca),
    linha("Minha conta", sempre, sempre, sempre),
  ].join("");
}

// ---------------------------------------------------------------- histórico de acessos
function renderAcessos() {
  const seletor = $("#filtro-acesso-usuario");
  const quem = seletor.value;
  seletor.innerHTML = opcoes([["", "Todos os usuários"], ...usuarios.map((u) => [u.id, nomeDe(u)])], quem);
  const dias = Number($("#filtro-acesso-periodo").value);
  const inicioHoje = new Date().setHours(0, 0, 0, 0);
  const desde = dias === 1 ? inicioHoje : Date.now() - dias * 864e5;
  const lista = acessos.filter((a) => (!quem || a.perfil_id === quem) && Date.parse(a.em) >= desde);
  const nomes = Object.fromEntries(usuarios.map((u) => [u.id, nomeDe(u)]));
  const pessoas = new Set(lista.map((a) => a.perfil_id)).size;
  $("#resumo-acessos").textContent = `${plural(lista.length, "página aberta", "páginas abertas")} · ${plural(pessoas, "pessoa", "pessoas")}`;
  $("#lista-acessos").innerHTML = lista.length
    ? lista.map((a) => `<tr>
        <td class="data">${dataHora(a.em)}</td>
        <td>${esc(nomes[a.perfil_id] || "Cadastro excluído")}</td>
        <td>${esc(nomePagina(a.pagina))}</td>
        <td>${esc(a.dispositivo || "—")}</td>
      </tr>`).join("")
    : `<tr><td colspan="4" class="vazio">Nenhum acesso no período.</td></tr>`;
}

function renderTudo() {
  renderKpis();
  renderLista();
  renderPermissoes();
  renderAcessos();
}

async function recarregar() {
  try {
    [usuarios, acessos] = await Promise.all([armazem.usuarios.listar(), armazem.acessos({ limite: 1000 })]);
  } catch (err) {
    avisar("Não foi possível carregar os usuários: " + err.message);
  }
  renderTudo();
}

// ---------------------------------------------------------------- cadastro
function infoAcesso(u) {
  if (!u) return "";
  const linha = (rotulo, valor) => `<div><span>${rotulo}</span><strong>${valor}</strong></div>`;
  const dados = [
    linha("Cadastrado em", dataHora(u.criado_em)),
    linha("Primeiro acesso", u.primeiro_acesso ? dataHora(u.primeiro_acesso) : "—"),
    linha("Último acesso", u.ultimo_acesso ? `${dataHora(u.ultimo_acesso)} (${relativo(u.ultimo_acesso)})` : "—"),
    linha("Acessos", u.acessos || 0),
  ].join("");
  const semLogin = !u.user_id && u.situacao !== "pendente"
    ? `<p class="dica">Ainda sem login. <button class="btn-link" type="button" id="btn-ver-acesso">Ver como criar o acesso no Supabase</button></p>`
    : "";
  return `<h3>Acesso</h3><div class="info-grade">${dados}</div>${semLogin}`;
}

function abrirCadastro(u = null) {
  editando = u;
  const form = $("#form-usuario");
  form.reset();
  const eu = !!u && u.id === perfil.id;
  $("#titulo-usuario").textContent = u ? nomeDe(u) : "Novo usuário";
  form.elements.nome.value = u ? u.nome || "" : "";
  form.elements.email.value = u ? u.email : "";
  form.elements.email.readOnly = !!(u && u.user_id);
  $("#dica-email").hidden = !(u && u.user_id);

  const papel = u ? u.papel : "pessoal";
  $("#opcoes-papel").innerHTML = Object.entries(PAPEIS)
    .map(([id, p]) => `<label class="papel-opcao"><input type="radio" name="papel" value="${id}"${id === papel ? " checked" : ""}${eu ? " disabled" : ""}>
        <span><strong>${p.titulo}</strong><small>${p.descricao}</small></span></label>`)
    .join("");
  $("#dica-papel").hidden = !eu;

  const marcados = new Set(u ? u.modulos || [] : PAPEIS[papel].padrao);
  $("#opcoes-modulos").innerHTML = PERMISSOES.map((p) => `<label class="permissao"><input type="checkbox" name="modulos" value="${p.id}"${marcados.has(p.id) ? " checked" : ""}>
      <span><strong>${p.titulo}</strong><small>${p.detalhe}</small></span></label>`).join("");
  form.elements.link_financas.value = u ? u.link_financas || "" : "";

  const sit = u ? u.situacao : "ativo";
  const situacoes = [
    ["ativo", sit === "pendente" ? "Liberar acesso" : "Ativo"],
    ...(sit === "pendente" ? [["pendente", "Manter aguardando liberação"]] : []),
    ["inativo", "Inativo (sem acesso)"],
  ];
  $("#opcoes-situacao").innerHTML = situacoes
    .map(([v, r]) => `<label><input type="radio" name="situacao" value="${v}"${v === sit ? " checked" : ""}${eu ? " disabled" : ""}> ${r}</label>`)
    .join("");
  form.elements.observacao.value = u ? u.observacao || "" : "";

  $("#info-acesso").innerHTML = infoAcesso(u);
  $("#info-acesso").hidden = !u;
  const ver = $("#btn-ver-acesso");
  if (ver) ver.addEventListener("click", () => mostrarAcesso(u));
  $("#btn-excluir").hidden = !u || eu;
  $("#erro-usuario").hidden = true;
  atualizarModulos(false);
  $("#dlg-usuario").showModal();
  form.elements.nome.focus();
}

// Módulos conforme o perfil: administrador tem todos; cliente nunca recebe os profissionais.
// Ao trocar o perfil, os módulos voltam ao padrão do novo perfil.
function atualizarModulos(aplicarPadrao) {
  const form = $("#form-usuario");
  const papel = form.elements.papel.value;
  const caixas = $$("[name=modulos]", form);
  if (aplicarPadrao) caixas.forEach((c) => (c.checked = PAPEIS[papel].padrao.includes(c.value)));
  for (const c of caixas) {
    const adm = papel === "adm";
    const vetado = !adm && !liberavel(papel, c.value);
    c.disabled = adm || vetado;
    if (adm) c.checked = true;
    if (vetado) c.checked = false;
    c.closest(".permissao").classList.toggle("vetada", vetado);
  }
  $("#dica-modulos").textContent =
    papel === "adm" ? "O administrador acessa todos os módulos."
    : papel === "cliente" ? "Clientes nunca acessam os módulos profissionais."
    : "Marque o que esta pessoa pode abrir.";
  $("#campo-link").hidden = !caixas.find((c) => c.value === "financas").checked;
}

async function salvarCadastro(e) {
  e.preventDefault();
  const form = e.target;
  const erro = $("#erro-usuario");
  erro.hidden = true;
  const eu = !!editando && editando.id === perfil.id;
  const papel = eu ? editando.papel : form.elements.papel.value;
  const email = form.elements.email.value.trim().toLowerCase();
  const falha = (texto) => {
    erro.textContent = texto;
    erro.hidden = false;
  };
  if (!form.elements.nome.value.trim()) return falha("Informe o nome.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return falha("Informe um e-mail válido.");
  const link = form.elements.link_financas.value.trim();
  if (link && !/^https:\/\/\S+$/.test(link)) return falha("O link do painel precisa começar com https://");

  const dados = {
    id: editando ? editando.id : undefined,
    nome: form.elements.nome.value,
    email,
    papel,
    modulos: papel === "adm" ? [] : $$("[name=modulos]:checked", form).map((c) => c.value).filter((m) => liberavel(papel, m)),
    situacao: eu ? editando.situacao : form.elements.situacao.value,
    link_financas: link || null,
    observacao: form.elements.observacao.value.trim() || null,
  };
  const botao = form.querySelector("[type=submit]");
  botao.disabled = true;
  try {
    const salvo = await armazem.usuarios.salvar(dados);
    $("#dlg-usuario").close();
    await recarregar();
    if (!editando && armazem.modo === "supabase") mostrarAcesso(salvo);
    else avisar(editando ? "Cadastro salvo." : "Cadastro salvo. No modo demonstração, basta entrar com este e-mail.");
  } catch (err) {
    falha(err.message);
  } finally {
    botao.disabled = false;
  }
}

async function excluirCadastro() {
  if (!editando) return;
  const texto = `Excluir o cadastro de ${nomeDe(editando)}?\n\n` +
    "A conta de login no Supabase continua existindo: se a pessoa entrar de novo, volta como “aguardando liberação”. " +
    "Para bloquear o acesso, prefira marcar a situação como Inativo.";
  if (!confirm(texto)) return;
  try {
    await armazem.usuarios.remover(editando.id);
    $("#dlg-usuario").close();
    await recarregar();
    avisar("Cadastro excluído.");
  } catch (err) {
    $("#erro-usuario").textContent = err.message;
    $("#erro-usuario").hidden = false;
  }
}

// Passo a passo do login no Supabase e a mensagem pronta para a pessoa (sem a senha, que vai em separado)
function mostrarAcesso(u) {
  $("#acesso-email").textContent = u.email;
  $("#link-supabase").href = linkSupabase();
  const nome = u.nome ? `, ${u.nome.split(" ")[0]}` : "";
  $("#mensagem-acesso").value = [
    `Olá${nome}! Seu acesso à área restrita está pronto.`,
    "",
    `Endereço: ${PAGINA_LOGIN}`,
    `Usuário: ${u.email}`,
    "Senha provisória: envio em uma mensagem separada.",
    "",
    "No primeiro acesso, troque a senha em Menu › Minha conta.",
  ].join("\n");
  if ($("#dlg-usuario").open) $("#dlg-usuario").close();
  $("#dlg-acesso").showModal();
}

async function copiarMensagem() {
  const campo = $("#mensagem-acesso");
  try {
    await navigator.clipboard.writeText(campo.value);
    avisar("Mensagem copiada.");
  } catch {
    campo.select();
    avisar("Mensagem selecionada: use Ctrl+C para copiar.");
  }
}

// ---------------------------------------------------------------- início
async function iniciar() {
  const sessao = await abrirPagina("usuarios.html");
  if (!sessao) return;
  ({ armazem, perfil } = sessao);
  prepararDialogos();
  prepararAbas();

  $("#filtro-papel").innerHTML = opcoes([["", "Todos os perfis"], ...Object.entries(PAPEIS).map(([id, p]) => [id, p.titulo])], "");
  $("#filtro-situacao").innerHTML = opcoes([["", "Todas as situações"], ...Object.entries(SITUACOES)], "");
  $("#busca").addEventListener("input", (e) => {
    filtro.busca = e.target.value;
    renderLista();
  });
  $("#filtro-papel").addEventListener("change", (e) => {
    filtro.papel = e.target.value;
    renderLista();
  });
  $("#filtro-situacao").addEventListener("change", (e) => {
    filtro.situacao = e.target.value;
    renderKpis();
    renderLista();
  });
  $("#kpis-usuarios").addEventListener("click", (e) => {
    const k = e.target.closest("[data-situacao]");
    if (!k) return;
    filtro.situacao = filtro.situacao === k.dataset.situacao ? "" : k.dataset.situacao;
    $("#filtro-situacao").value = filtro.situacao;
    renderKpis();
    renderLista();
  });
  const abrirLinha = (tr) => abrirCadastro(usuarios.find((u) => u.id === tr.dataset.id));
  $("#lista-usuarios").addEventListener("click", (e) => {
    const tr = e.target.closest("tr[data-id]");
    if (tr) abrirLinha(tr);
  });
  $("#lista-usuarios").addEventListener("keydown", (e) => {
    const tr = e.target.closest("tr[data-id]");
    if (tr && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      abrirLinha(tr);
    }
  });
  $("#filtro-acesso-usuario").addEventListener("change", renderAcessos);
  $("#filtro-acesso-periodo").addEventListener("change", renderAcessos);
  $("#btn-novo").addEventListener("click", () => abrirCadastro());
  $("#opcoes-papel").addEventListener("change", () => atualizarModulos(true));
  $("#opcoes-modulos").addEventListener("change", () => atualizarModulos(false));
  $("#form-usuario").addEventListener("submit", salvarCadastro);
  $("#btn-excluir").addEventListener("click", excluirCadastro);
  $("#btn-copiar").addEventListener("click", copiarMensagem);

  $("#conteudo").hidden = false;
  await recarregar();

  // Endereço com ?editar=<id>: abre o cadastro pedido
  const pedido = usuarios.find((u) => u.id === new URLSearchParams(location.search).get("editar"));
  if (pedido) {
    history.replaceState(null, "", location.pathname);
    abrirCadastro(pedido);
  }
}

iniciar();
