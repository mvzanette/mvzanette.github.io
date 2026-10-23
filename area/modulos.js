// Catálogo da área restrita: módulos, grupos do menu, perfis de acesso e regras de permissão.
// As regras daqui só decidem o que aparece na tela; quem protege os dados é o banco (supabase/schema.sql),
// que aplica as mesmas regras. Para incluir um módulo novo: acrescente um item em MODULOS e crie a página.

const svg = (caminhos) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${caminhos}</svg>`;

// Profissional: as funções da engenharia e as finanças das empresas onde você trabalha. Pessoal: finanças
// pessoais (gastos e investimentos de cada pessoa), separadas do controle financeiro da engenharia.
export const GRUPOS = [
  { id: "profissional", titulo: "Profissional" },
  { id: "pessoal", titulo: "Pessoal" },
  { id: "admin", titulo: "Administração" },
  { id: "conta", titulo: "Sua conta" },
];

// Módulos profissionais (dados da engenharia e das empresas): nunca ficam abertos para clientes
export const ENGENHARIA = ["art", "financeiro", "demandas", "empresas"];
// Módulos que aparecem no painel gerencial
const DO_PAINEL = ["art", "financeiro", "demandas"];

export const MODULOS = [
  {
    id: "painel",
    grupo: "profissional",
    titulo: "Painel gerencial",
    descricao: "Indicadores de ARTs, financeiro e demandas, gráfico mensal e prazos da semana.",
    pagina: "painel.html",
    icone: svg('<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>'),
  },
  {
    id: "art",
    grupo: "profissional",
    titulo: "Controle de ART",
    descricao: "Prazos, alertas de vencimento, baixas e renovação das ARTs.",
    pagina: "art.html",
    icone: svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="m9 15 2 2 4-4"/>'),
  },
  {
    id: "financeiro",
    grupo: "profissional",
    titulo: "Controle financeiro",
    descricao: "Receitas e despesas da engenharia: valores a receber e em atraso, resumo mensal e exportação em planilha.",
    pagina: "financeiro.html",
    icone: svg('<rect x="2" y="5" width="20" height="14" rx="1"/><path d="M2 10h20"/><path d="M6 15h4"/>'),
  },
  {
    // No menu e no início aparece uma entrada por empresa cadastrada (os nomes vêm do banco)
    id: "empresas",
    grupo: "profissional",
    titulo: "Finanças das empresas",
    descricao: "Valores com as empresas onde você trabalha: reembolsos, ARTs pagas por elas e o que falta receber.",
    pagina: "empresas.html",
    paginas: ["caixa.html"], // o caixa das empresas (adiantamentos, RDV e fichas de custo) é do mesmo módulo
    icone: svg('<path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-4h6v4"/><path d="M9 10h.01M15 10h.01M9 14h.01M15 14h.01"/>'),
  },
  {
    id: "demandas",
    grupo: "profissional",
    titulo: "Controle de demandas",
    descricao: "Solicitações de clientes, propostas, etapas, prazos e lembretes de cada serviço.",
    pagina: "demandas.html",
    icone: svg('<path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4"/>'),
  },
  {
    id: "financas",
    grupo: "pessoal",
    titulo: "Finanças pessoais",
    descricao: "Gastos do dia a dia, cartão e faturas e investimentos: o painel do projeto Financeiro, de cada pessoa.",
    pagina: "financas.html",
    icone: svg('<path d="M12 2v20"/><path d="M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>'),
  },
  {
    id: "usuarios",
    grupo: "admin",
    titulo: "Usuários e permissões",
    descricao: "Cadastro de usuários, perfis de acesso, módulos liberados e histórico de acessos.",
    pagina: "usuarios.html",
    somenteAdm: true,
    icone: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18.5 14.5A6.5 6.5 0 0 1 21.5 20"/>'),
  },
  {
    id: "conta",
    grupo: "conta",
    titulo: "Minha conta",
    descricao: "Seus dados, troca de senha e seus últimos acessos.",
    pagina: "conta.html",
    todos: true,
    icone: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  },
];

// Módulos que o administrador libera no cadastro de cada pessoa (ele próprio acessa todos)
export const PERMISSOES = [
  { id: "art", titulo: "Controle de ART", detalhe: "Todas as ARTs, alertas e PDFs." },
  { id: "financeiro", titulo: "Controle financeiro", detalhe: "Todos os lançamentos de receitas e despesas da engenharia." },
  { id: "empresas", titulo: "Finanças das empresas", detalhe: "Lançamentos com as empresas cadastradas: reembolsos, ARTs pagas por elas e valores a receber." },
  { id: "demandas", titulo: "Controle de demandas", detalhe: "Todas as solicitações de clientes, propostas e prazos." },
  { id: "financas", titulo: "Finanças pessoais", detalhe: "Gastos, cartão e investimentos: o painel do projeto Financeiro da própria pessoa." },
];

export const PAPEIS = {
  adm: {
    titulo: "Administrador",
    descricao: "Acesso total, inclusive usuários e permissões.",
    padrao: [],
  },
  pessoal: {
    titulo: "Pessoal",
    descricao: "Família e pessoas próximas. Recebe os módulos que você liberar.",
    padrao: ["financas"],
  },
  cliente: {
    titulo: "Cliente",
    descricao: "Clientes da engenharia. Nunca acessam os módulos profissionais.",
    padrao: [],
  },
};

export const SITUACOES = {
  ativo: "Ativo",
  aguardando: "Aguardando 1º acesso",
  pendente: "Aguardando liberação",
  inativo: "Inativo",
};

// Situação mostrada na tela: o cadastro ativo que ainda não entrou fica "aguardando 1º acesso"
export const situacaoDe = (p) => (p.situacao === "ativo" && !p.user_id ? "aguardando" : p.situacao);

export const moduloDaPagina = (pagina) => MODULOS.find((m) => m.pagina === pagina || (m.paginas || []).includes(pagina)) || null;

// Módulo que pode ser liberado para o papel (cliente nunca recebe módulo profissional)
export const liberavel = (papel, modulo) => papel !== "cliente" || !ENGENHARIA.includes(modulo);

export function pode(perfil, modulo) {
  if (!perfil || perfil.situacao !== "ativo") return false;
  const m = MODULOS.find((x) => x.id === modulo);
  if (m && m.todos) return true;
  if (perfil.papel === "adm") return true;
  if (m && m.somenteAdm) return false;
  if (modulo === "painel") return DO_PAINEL.some((e) => pode(perfil, e));
  return liberavel(perfil.papel, modulo) && (perfil.modulos || []).includes(modulo);
}

// Link do painel original no Claude, onde ficam o envio de faturas e os PDFs (só endereços https)
export const linkFinancas = (perfil) =>
  perfil && /^https:\/\/\S+$/.test(perfil.link_financas || "") ? perfil.link_financas : null;
