// Parte comum das páginas da área restrita: conexão, exigência de login, perfil e permissões,
// menu suspenso e aviso do modo demonstração.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config-area.js";
import { criarArmazem } from "./dados.js";
import { GRUPOS, MODULOS, moduloDaPagina, pode } from "./modulos.js";
import { esc } from "./ui.js";

export const PAGINA_LOGIN = new URL("../area-restrita.html", import.meta.url).href;
export const PAGINA_INICIO = new URL("index.html", import.meta.url).href;

const $ = (sel) => document.querySelector(sel);

export function conectar() {
  return criarArmazem({ url: SUPABASE_URL, chave: SUPABASE_ANON_KEY });
}

// Tipo de aparelho e navegador, para o histórico de acessos (ex.: "Celular · Chrome")
function dispositivo() {
  const ua = navigator.userAgent;
  const tipo = /iPad|Tablet/i.test(ua) ? "Tablet" : /Mobi|Android|iPhone/i.test(ua) ? "Celular" : "Computador";
  const nav = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox"
    : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Navegador";
  return `${tipo} · ${nav}`;
}

// Abre uma página da área: sem login, volta para a tela de login (e retorna para esta página depois de entrar);
// com acesso pendente ou desativado, sai; sem permissão no módulo, volta para o início.
export async function abrirPagina(pagina) {
  let armazem;
  try {
    armazem = await conectar();
  } catch {
    mostrarErro("Não foi possível conectar ao banco de dados. Verifique a internet e a configuração.");
    return null;
  }
  const usuario = await armazem.usuario();
  if (!usuario) {
    location.replace(`${PAGINA_LOGIN}?volta=${encodeURIComponent(pagina)}`);
    return null;
  }

  let perfil;
  try {
    perfil = await armazem.registrarAcesso(pagina, dispositivo());
  } catch (err) {
    mostrarErro(err.message, armazem);
    return null;
  }
  if (!perfil) {
    mostrarErro("Não foi possível carregar o seu perfil de acesso. Saia e entre de novo; se continuar, fale com o administrador.", armazem);
    return null;
  }
  if (perfil.situacao !== "ativo") {
    await armazem.sair();
    location.replace(`${PAGINA_LOGIN}?acesso=${perfil.situacao}`);
    return null;
  }
  const modulo = moduloDaPagina(pagina);
  if (modulo && !pode(perfil, modulo.id)) {
    location.replace(`${PAGINA_INICIO}?sem-permissao=${modulo.id}`);
    return null;
  }

  montarMenu(pagina, perfil);
  $("#usuario").textContent = perfil.nome || usuario.email || "";
  $("#area-top").hidden = false;
  $("#btn-sair").addEventListener("click", () => sair(armazem));

  if (armazem.modo === "demo") {
    $("#aviso-demo").hidden = false;
    $("#btn-limpar-demo").addEventListener("click", async () => {
      if (!confirm("Apagar todos os dados de teste deste navegador (inclusive os usuários)?")) return;
      await armazem.limparTudo();
      location.reload();
    });
  }
  return { armazem, usuario, perfil };
}

async function sair(armazem) {
  await armazem.sair();
  location.replace(PAGINA_LOGIN);
}

function montarMenu(atual, perfil) {
  const lugar = $("#menu-area");
  if (!lugar) return;
  const item = (m) => `<a class="menu-item" href="${m.pagina}"${m.pagina === atual ? ' aria-current="page"' : ""}>${m.titulo}</a>`;
  const grupos = GRUPOS.map((g) => {
    const itens = MODULOS.filter((m) => m.grupo === g.id && pode(perfil, m.id)).map(item).join("");
    return itens ? `<p class="menu-grupo">${g.titulo}</p>${itens}` : "";
  }).join("");
  const inicio = atual === "index.html" ? ' aria-current="page"' : "";
  lugar.innerHTML = `<details class="menu-suspenso">
      <summary>Menu</summary>
      <div class="menu-lista"><a class="menu-item" href="index.html"${inicio}>Início</a>${grupos}<a class="menu-item menu-site" href="../index.html">Voltar ao site</a></div>
    </details>`;

  const menu = lugar.querySelector("details");
  document.addEventListener("click", (e) => {
    if (menu.open && !menu.contains(e.target)) menu.open = false;
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && menu.open) {
      menu.open = false;
      menu.querySelector("summary").focus();
    }
  });
}

function mostrarErro(texto, armazem) {
  const main = document.querySelector("main");
  main.hidden = false;
  main.insertAdjacentHTML("afterbegin", `<p class="cartao erro-geral" role="alert">${esc(texto)}</p>`);
  if (armazem) {
    $("#area-top").hidden = false;
    $("#btn-sair").addEventListener("click", () => sair(armazem));
  }
}
