// Modo claro ou escuro na área restrita: a pessoa escolhe no topo da página (Claro | Escuro) e a escolha fica lembrada
// neste navegador. Cada página aplica a escolha já no <head> (sem piscar) e este módulo monta o seletor.
const CHAVE = "mz-area-tema";
export const temaAtual = () => {
  try {
    return localStorage.getItem(CHAVE) === "escuro" ? "escuro" : "claro";
  } catch {
    return "claro";
  }
};
const aplicar = (tema) => {
  if (tema === "escuro") document.documentElement.dataset.tema = "escuro";
  else delete document.documentElement.dataset.tema;
};

export function prepararTema() {
  aplicar(temaAtual());
  const lugar = document.getElementById("area-top");
  if (!lugar || document.getElementById("tema-escolha")) return;
  const grupo = document.createElement("div");
  grupo.id = "tema-escolha";
  grupo.className = "tema-escolha";
  grupo.setAttribute("role", "group");
  grupo.setAttribute("aria-label", "Aparência");
  grupo.innerHTML = '<button type="button" data-tema="claro">Claro</button><button type="button" data-tema="escuro">Escuro</button>';
  const marcar = () => grupo.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tema === temaAtual())));
  grupo.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-tema]");
    if (!b) return;
    try {
      localStorage.setItem(CHAVE, b.dataset.tema);
    } catch {
      /* sem armazenamento: vale só nesta página */
    }
    aplicar(b.dataset.tema);
    marcar();
  });
  marcar();
  lugar.insertBefore(grupo, lugar.firstChild);
}
