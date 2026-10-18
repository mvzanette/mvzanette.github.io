// Funções de tela usadas pelas páginas da área restrita.

export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

export const esc = (v) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const moeda = (n) => (n == null || Number.isNaN(n) ? "—" : n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }));

// Valores grandes em formato curto para os cards do painel (R$ 12,4 mil)
export function moedaCurta(n) {
  if (n == null) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e6) return `R$ ${(n / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (abs >= 1e4) return `R$ ${(n / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil`;
  return moeda(n);
}

export const porcento = (x) => (x == null ? "—" : `${Math.round(x * 100)}%`);

// Valor digitado no padrão brasileiro: 1.234,56 · 2.800 · 1234,5 · 1234.56
export const numeroDigitado = (texto) => {
  if (texto == null || String(texto).trim() === "") return null;
  const limpo = String(texto).replace(/[^\d,.-]/g, "");
  let n;
  if (limpo.includes(",")) n = Number(limpo.replace(/\./g, "").replace(",", "."));
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(limpo)) n = Number(limpo.replace(/\./g, "")); // ponto como milhar
  else n = Number(limpo);
  return Number.isFinite(n) ? n : null;
};

// Só PDF de verdade antes de enviar: extensão ou tipo de PDF, até 20 MB (o limite do banco) e "%PDF-" no
// começo do arquivo. Devolve o problema encontrado ou null.
export async function conferirPdf(arquivo) {
  if (!/\.pdf$/i.test(arquivo.name) && arquivo.type !== "application/pdf") return `${arquivo.name}: só arquivos PDF são aceitos.`;
  if (arquivo.size > 20 * 1024 * 1024) return `${arquivo.name}: o PDF passa de 20 MB.`;
  try {
    return (await arquivo.slice(0, 1024).text()).includes("%PDF-") ? null : `${arquivo.name} não é um PDF válido.`;
  } catch {
    return `Não foi possível ler ${arquivo.name}.`;
  }
}

let tempoToast;
export function avisar(texto) {
  const t = $("#toast");
  t.textContent = texto;
  t.hidden = false;
  clearTimeout(tempoToast);
  tempoToast = setTimeout(() => (t.hidden = true), 4500);
}

// Planilha CSV que abre direto no Excel em português (separador ; e acentos preservados)
export function baixarCsv(nome, cabecalho, linhas) {
  const celula = (v) => {
    const s = v == null ? "" : typeof v === "number" ? v.toLocaleString("pt-BR") : String(v);
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [cabecalho, ...linhas].map((l) => l.map(celula).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: nome });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const opcoes = (lista, atual) =>
  lista
    .map((item) => {
      const [valor, rotulo] = Array.isArray(item) ? item : [item, item];
      return `<option value="${esc(valor)}"${valor === atual ? " selected" : ""}>${esc(rotulo)}</option>`;
    })
    .join("");

// Fecha diálogos ao clicar fora e nos botões com data-fechar
export function prepararDialogos() {
  $$("dialog").forEach((d) => {
    d.addEventListener("click", (e) => {
      if (e.target === d || e.target.closest("[data-fechar]")) d.close();
    });
  });
}
