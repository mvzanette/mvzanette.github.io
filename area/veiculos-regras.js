// Regras do módulo Veículos pessoais: situação dos marcadores (leituras de km e horas) e das preventivas (por tempo,
// km ou horas, o que vencer primeiro), alertas e totais das despesas.
// Usado pela área restrita (navegador) e pela rotina diária de e-mails (Node, ferramentas/alertas-veiculos.mjs):
// não depende da página.

export const PRAZO_MARCADOR = 90; // dias: pelo menos uma leitura de km/horas a cada 3 meses
export const AVISO_MARCADOR = 75; // a partir daqui o site já pede a leitura
export const AVISO_DIAS_PADRAO = 30; // antecedência do aviso no tempo, quando a preventiva não diz
export const AVISO_KM_PADRAO = 2000; // antecedência em km, quando a preventiva não diz (no máximo metade do intervalo)
export const AVISO_FRACAO_PADRAO = 0.1; // antecedência em horas: 10% do intervalo, quando a preventiva não diz

export const TIPOS_VEICULO = [
  ["carro", "Carro"], ["moto", "Moto"], ["caminhonete", "Caminhonete"], ["caminhao", "Caminhão"], ["trator", "Trator"],
  ["barco", "Barco / jet ski"], ["gerador", "Gerador"], ["maquina", "Máquina"], ["outro", "Outro"],
];
export const MEDIDORES = [["km", "Quilometragem (hodômetro)"], ["horas", "Horas de uso (horímetro)"], ["ambos", "Quilometragem e horas"]];
export const TIPOS_SERVICO = [
  ["preventiva", "Manutenção preventiva"], ["corretiva", "Manutenção corretiva"], ["peca", "Troca de peça"], ["despesa", "Outra despesa"],
];
export const CATEGORIAS_DESPESA = [
  "Combustível", "IPVA e licenciamento", "Seguro", "Pneus", "Lavagem e estética", "Estacionamento e pedágio", "Multas",
  "Acessórios", "Documentação", "Outros",
];
// Preventivas comuns, para começar rápido (o intervalo de cada uma vem do manual do veículo)
export const SUGESTOES_PREVENTIVA = [
  "Troca de óleo do motor e filtro", "Filtro de ar", "Filtro de combustível", "Filtro de cabine (ar-condicionado)",
  "Fluido de freio", "Pastilhas e discos de freio", "Correia dentada", "Líquido de arrefecimento", "Velas de ignição",
  "Alinhamento e balanceamento", "Rodízio de pneus", "Bateria", "Revisão geral", "Relação (corrente, coroa e pinhão)",
  "Óleo hidráulico", "Óleo da transmissão", "Graxa / lubrificação",
];

const DIA = 86400000;
const usaKm = (v) => !v || v.medidor !== "horas";
const usaHoras = (v) => !!v && v.medidor !== "km";
export { usaKm, usaHoras };

export function hojeISO(agora = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
}
export const diasEntre = (de, ate) => Math.round((Date.parse(ate + "T00:00:00Z") - Date.parse(de + "T00:00:00Z")) / DIA);
export const somarDias = (iso, n) => new Date(Date.parse(iso + "T00:00:00Z") + Math.round(n) * DIA).toISOString().slice(0, 10);
export function somarMeses(iso, meses) {
  const inteiros = Math.floor(meses);
  const [a, m, d] = iso.split("-").map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + inteiros, 1));
  const fimMes = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  alvo.setUTCDate(Math.min(d, fimMes));
  const base = alvo.toISOString().slice(0, 10);
  return meses > inteiros ? somarDias(base, (meses - inteiros) * 30.4) : base;
}
export const dataBR = (iso) => (iso ? iso.split("-").reverse().join("/") : "—");
const n = (v) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
export const numBR = (v, casas = 0) => (v == null ? "—" : Number(v).toLocaleString("pt-BR", { maximumFractionDigits: casas }));
export const kmBR = (v) => (v == null ? "—" : `${numBR(v)} km`);
export const horasBR = (v) => (v == null ? "—" : `${numBR(v, 1)} h`);
const plural = (q, um, varios) => `${numBR(q)} ${Math.abs(q) === 1 ? um : varios}`;
export const textoDias = (d) => (d === 0 ? "hoje" : d > 0 ? `em ${plural(d, "dia", "dias")}` : `há ${plural(-d, "dia", "dias")}`);

// Todas as leituras de um veículo: os marcadores e os km/horas anotados nos serviços, da mais antiga para a mais nova
export function leiturasDo(veiculoId, marcadores = [], servicos = []) {
  const de = (x) => x.veiculo_id === veiculoId && x.data && (n(x.km) != null || n(x.horas) != null);
  return [
    ...marcadores.filter(de).map((m) => ({ data: m.data, km: n(m.km), horas: n(m.horas), origem: "marcador", id: m.id })),
    ...servicos.filter(de).map((s) => ({ data: s.data, km: n(s.km), horas: n(s.horas), origem: "servico", id: s.id })),
  ].sort((a, b) => a.data.localeCompare(b.data) || (a.km ?? 0) - (b.km ?? 0));
}

// Leitura atual: a última data com leitura e os maiores km e horas já anotados (hodômetro e horímetro só sobem)
export function leituraAtual(leituras) {
  if (!leituras.length) return null;
  const maior = (campo) => {
    const vals = leituras.filter((l) => l[campo] != null);
    if (!vals.length) return { valor: null, data: null };
    const top = vals.reduce((a, b) => (b[campo] >= a[campo] ? b : a));
    return { valor: top[campo], data: top.data };
  };
  const km = maior("km"), horas = maior("horas");
  return { data: leituras[leituras.length - 1].data, km: km.valor, kmData: km.data, horas: horas.valor, horasData: horas.data };
}

// Uso médio por dia (km/dia e h/dia), com as leituras do último ano (precisa de pelo menos 14 dias entre a primeira e a última)
export function ritmo(leituras, hoje = hojeISO()) {
  const recentes = leituras.filter((l) => diasEntre(l.data, hoje) <= 400);
  const calc = (campo) => {
    const vals = recentes.filter((l) => l[campo] != null);
    if (vals.length < 2) return null;
    const a = vals[0], b = vals[vals.length - 1];
    const dias = diasEntre(a.data, b.data);
    if (dias < 14 || b[campo] <= a[campo]) return null;
    return (b[campo] - a[campo]) / dias;
  };
  return { kmDia: calc("km"), horasDia: calc("horas") };
}

// Marcador: ok · atualizar (passou de 75 dias) · atrasado (passou de 3 meses) · sem (nenhuma leitura)
export function situacaoMarcador(atual, hoje = hojeISO()) {
  if (!atual) return { estado: "sem", dias: null, texto: "Nenhuma leitura de km/horas ainda" };
  const dias = diasEntre(atual.data, hoje);
  const limite = somarDias(atual.data, PRAZO_MARCADOR);
  if (dias > PRAZO_MARCADOR) return { estado: "atrasado", dias, limite, texto: `Última leitura há ${plural(dias, "dia", "dias")}: passou dos 3 meses` };
  if (dias >= AVISO_MARCADOR) return { estado: "atualizar", dias, limite, texto: `Leitura vence ${textoDias(diasEntre(hoje, limite))} (${dataBR(limite)})` };
  return { estado: "ok", dias, limite, texto: `Última leitura há ${plural(dias, "dia", "dias")}` };
}

// Última vez que a preventiva foi feita: o serviço mais recente ligado a ela ou, sem serviço, a informada no cadastro
export function ultimaDoPlano(plano, servicos = []) {
  const feitos = servicos.filter((s) => s.veiculo_id === plano.veiculo_id && (s.planos || []).includes(plano.id))
    .sort((a, b) => b.data.localeCompare(a.data) || (n(b.km) ?? 0) - (n(a.km) ?? 0));
  if (feitos.length) return { data: feitos[0].data, km: n(feitos[0].km), horas: n(feitos[0].horas), servico: feitos[0], vezes: feitos.length };
  if (plano.ultima_data || n(plano.ultima_km) != null || n(plano.ultima_horas) != null)
    return { data: plano.ultima_data || null, km: n(plano.ultima_km), horas: n(plano.ultima_horas), servico: null, vezes: 0 };
  return null;
}

const ORDEM = { vencida: 3, proxima: 2, ok: 1, sem: 0 };
export const avisoKm = (p) => n(p.aviso_km) ?? (n(p.intervalo_km) ? Math.min(AVISO_KM_PADRAO, Math.round(n(p.intervalo_km) / 2)) : null);
export const avisoHoras = (p) => n(p.aviso_horas) ?? (n(p.intervalo_horas) ? Math.round(n(p.intervalo_horas) * AVISO_FRACAO_PADRAO * 10) / 10 : null);
export const avisoDias = (p) => n(p.aviso_dias) ?? AVISO_DIAS_PADRAO;

// Situação de uma preventiva: a última, a próxima (data, km, horas), quanto falta em cada critério e o estado
// (vencida · proxima · ok · sem = falta informar quando foi feita). Vale o critério que vencer primeiro.
export function situacaoPlano(plano, veiculo, { servicos = [], atual = null, uso = {}, hoje = hojeISO() } = {}) {
  const ultima = ultimaDoPlano(plano, servicos);
  const r = { plano, ultima, proxima: {}, criterios: [], estado: "sem", previsao: null };
  if (!ultima) {
    r.texto = "Informe quando foi feita pela última vez";
    return r;
  }
  const meses = n(plano.intervalo_meses), ikm = usaKm(veiculo) ? n(plano.intervalo_km) : null, ih = usaHoras(veiculo) ? n(plano.intervalo_horas) : null;
  const est = (falta, aviso) => (falta <= 0 ? "vencida" : falta <= aviso ? "proxima" : "ok");
  if (meses && ultima.data) {
    const data = somarMeses(ultima.data, meses);
    const falta = diasEntre(hoje, data);
    r.proxima.data = data;
    r.criterios.push({ tipo: "tempo", falta, estado: est(falta, avisoDias(plano)), quando: data,
      texto: falta < 0 ? `venceu em ${dataBR(data)} (${textoDias(falta)})` : `vence em ${dataBR(data)} (${textoDias(falta)})` });
  }
  if (ikm && ultima.km != null) {
    const alvo = ultima.km + ikm;
    r.proxima.km = alvo;
    if (atual && atual.km != null) {
      const falta = alvo - atual.km;
      const quando = uso.kmDia && falta > 0 ? somarDias(hoje, falta / uso.kmDia) : null;
      r.criterios.push({ tipo: "km", falta, estado: est(falta, avisoKm(plano)), quando,
        texto: falta <= 0 ? `passou ${kmBR(-falta)} dos ${kmBR(alvo)}` : `faltam ${kmBR(falta)} (aos ${kmBR(alvo)})` });
    }
  }
  if (ih && ultima.horas != null) {
    const alvo = ultima.horas + ih;
    r.proxima.horas = alvo;
    if (atual && atual.horas != null) {
      const falta = alvo - atual.horas;
      const quando = uso.horasDia && falta > 0 ? somarDias(hoje, falta / uso.horasDia) : null;
      r.criterios.push({ tipo: "horas", falta, estado: est(falta, avisoHoras(plano)), quando,
        texto: falta <= 0 ? `passou ${horasBR(-falta)} das ${horasBR(alvo)}` : `faltam ${horasBR(falta)} (às ${horasBR(alvo)})` });
    }
  }
  if (!r.criterios.length) {
    r.texto = ultima.km == null && ikm ? "Informe a quilometragem da última vez" : ultima.horas == null && ih ? "Informe as horas da última vez"
      : "Lance uma leitura de km/horas para calcular";
    return r;
  }
  // O critério que manda: o pior estado e, no empate, o que acontece primeiro (data prevista)
  const peso = (c) => (c.quando ? diasEntre(hoje, c.quando) : c.tipo === "tempo" ? c.falta : Infinity);
  const principal = [...r.criterios].sort((a, b) => ORDEM[b.estado] - ORDEM[a.estado] || peso(a) - peso(b))[0];
  r.estado = principal.estado;
  r.principal = principal;
  const datas = r.criterios.map((c) => c.quando).filter(Boolean).sort();
  r.previsao = datas[0] || null; // data prevista da próxima (pelo tempo ou pelo ritmo de uso)
  r.texto = `${{ tempo: "Tempo", km: "Km", horas: "Horas" }[principal.tipo]}: ${principal.texto}`;
  return r;
}

export const ROTULO_ESTADO = { vencida: "Vencida", proxima: "Próxima", ok: "Em dia", sem: "Sem base" };
export const CLASSE_ESTADO = { vencida: "s-vencida", proxima: "s-vencendo", ok: "s-ativa", sem: "s-sem-data" };
export const ROTULO_MARCADOR = { atrasado: "Leitura atrasada", atualizar: "Atualizar leitura", ok: "Leitura em dia", sem: "Sem leitura" };
export const CLASSE_MARCADOR = { atrasado: "s-vencida", atualizar: "s-vencendo", ok: "s-ativa", sem: "s-sem-data" };

// Quadro completo de um veículo: leituras, leitura atual, ritmo de uso, marcador e preventivas
export function quadroVeiculo(veiculo, { marcadores = [], planos = [], servicos = [], hoje = hojeISO() } = {}) {
  const leituras = leiturasDo(veiculo.id, marcadores, servicos);
  const atual = leituraAtual(leituras);
  const uso = ritmo(leituras, hoje);
  const marcador = situacaoMarcador(atual, hoje);
  const doVeiculo = servicos.filter((s) => s.veiculo_id === veiculo.id);
  const preventivas = planos.filter((p) => p.veiculo_id === veiculo.id && p.ativo !== false)
    .map((p) => situacaoPlano(p, veiculo, { servicos: doVeiculo, atual, uso, hoje }))
    .sort((a, b) => ORDEM[b.estado] - ORDEM[a.estado] || String(a.previsao || "9999").localeCompare(String(b.previsao || "9999")));
  const estado = veiculo.ativo === false ? "inativo"
    : preventivas.some((p) => p.estado === "vencida") || marcador.estado === "atrasado" ? "vencida"
    : preventivas.some((p) => p.estado === "proxima") || marcador.estado === "atualizar" ? "proxima" : "ok";
  return { veiculo, leituras, atual, uso, marcador, preventivas, estado };
}

// Alertas (tela e e-mail): preventivas vencidas e próximas, leituras atrasadas ou perto do prazo e veículos sem leitura.
// A chave identifica o aviso (o e-mail não repete a mesma chave): muda quando a preventiva é feita ou há leitura nova.
export function alertasVeiculos(quadros, hoje = hojeISO()) {
  const semana = semanaISO(hoje);
  const lista = [];
  for (const q of quadros) {
    if (q.veiculo.ativo === false) continue;
    const v = q.veiculo;
    if (q.marcador.estado === "atrasado" || q.marcador.estado === "atualizar" || q.marcador.estado === "sem") {
      const base = q.atual ? q.atual.data : "nunca";
      lista.push({ tipo: "marcador", gravidade: q.marcador.estado === "atrasado" ? "vencida" : "proxima", veiculo: v,
        titulo: q.marcador.estado === "sem" ? `${v.nome}: lance a primeira leitura de ${medidorTexto(v)}` : `${v.nome}: ${ROTULO_MARCADOR[q.marcador.estado].toLowerCase()} de ${medidorTexto(v)}`,
        texto: q.marcador.texto + ". A leitura precisa ser feita pelo menos a cada 3 meses.",
        chave: `m:${v.id}:${base}:${q.marcador.estado}${q.marcador.estado === "atrasado" ? ":" + semana : ""}` });
    }
    for (const p of q.preventivas) {
      if (p.estado !== "vencida" && p.estado !== "proxima") continue;
      const base = p.ultima ? `${p.ultima.data || ""}/${p.ultima.km ?? ""}/${p.ultima.horas ?? ""}` : "";
      lista.push({ tipo: "preventiva", gravidade: p.estado, veiculo: v, plano: p.plano,
        titulo: `${v.nome}: ${p.plano.nome} ${p.estado === "vencida" ? "vencida" : "está próxima"}`,
        texto: `${p.texto}.${p.ultima && p.ultima.data ? ` Última em ${dataBR(p.ultima.data)}${p.ultima.km != null ? ` com ${kmBR(p.ultima.km)}` : ""}${p.ultima.horas != null ? ` e ${horasBR(p.ultima.horas)}` : ""}.` : ""}`,
        chave: `p:${p.plano.id}:${base}:${p.estado}${p.estado === "vencida" ? ":" + semana : ""}` });
    }
  }
  return lista.sort((a, b) => ORDEM[b.gravidade] - ORDEM[a.gravidade]);
}
export const medidorTexto = (v) => (v.medidor === "horas" ? "horas" : v.medidor === "ambos" ? "km e horas" : "km");

// Semana do ano (AAAA-Www): o lembrete do que está vencido sai uma vez por semana
export function semanaISO(iso) {
  const d = new Date(iso + "T00:00:00Z");
  const dia = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dia + 3);
  const primeira = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const semana = 1 + Math.round(((d - primeira) / DIA - 3 + ((primeira.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(semana).padStart(2, "0")}`;
}

// Despesas: total por veículo, por tipo/categoria e por mês, num período (datas AAAA-MM-DD, inclusive)
export function resumoDespesas(servicos, { de = null, ate = null } = {}) {
  const dentro = servicos.filter((s) => n(s.valor) && (!de || s.data >= de) && (!ate || s.data <= ate));
  const somar = (chave) => {
    const m = new Map();
    for (const s of dentro) m.set(chave(s), (m.get(chave(s)) || 0) + n(s.valor));
    return [...m.entries()].map(([k, v]) => ({ chave: k, total: Math.round(v * 100) / 100 })).sort((a, b) => b.total - a.total);
  };
  return {
    total: Math.round(dentro.reduce((t, s) => t + n(s.valor), 0) * 100) / 100,
    n: dentro.length,
    porVeiculo: somar((s) => s.veiculo_id),
    porCategoria: somar(categoriaDe),
    porMes: somar((s) => s.data.slice(0, 7)).sort((a, b) => a.chave.localeCompare(b.chave)),
  };
}
export const categoriaDe = (s) => (s.tipo === "despesa" ? s.categoria || "Outros" : (TIPOS_SERVICO.find(([k]) => k === s.tipo) || [, "Serviço"])[1]);

// Custo por km rodado no período (quando há leituras de km no começo e no fim)
export function custoPorKm(total, leituras, de, ate) {
  const km = leituras.filter((l) => l.km != null && (!de || l.data >= de) && (!ate || l.data <= ate));
  if (km.length < 2) return null;
  const rodado = Math.max(...km.map((l) => l.km)) - Math.min(...km.map((l) => l.km));
  return rodado > 0 ? total / rodado : null;
}

// Quadros e alertas de todos os veículos que a pessoa vê (início e tarefas pendentes)
export async function carregarAlertasVeiculos(armazem, hoje = hojeISO()) {
  const ler = (nome) => armazem.colecao(nome).listar();
  const [veiculos, marcadores, planos, servicos] = await Promise.all(["veiculos", "veiculos_marcadores", "veiculos_planos", "veiculos_servicos"].map(ler));
  const quadros = veiculos.filter((v) => v.ativo !== false).map((v) => quadroVeiculo(v, { marcadores, planos, servicos, hoje }));
  return { quadros, alertas: alertasVeiculos(quadros, hoje) };
}

// Lançamento nas Finanças pessoais: categoria Transporte e a subcategoria mais próxima
export function subcategoriaFinancas(s) {
  if (s.tipo !== "despesa") return "Manutenção do carro";
  return { "Combustível": "Combustível", "Estacionamento e pedágio": "Estacionamento", "Pneus": "Manutenção do carro",
    "Lavagem e estética": "Manutenção do carro", "Acessórios": "Manutenção do carro" }[s.categoria] || s.categoria || "Manutenção do carro";
}
