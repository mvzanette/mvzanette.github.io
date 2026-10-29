-- ============================================================
-- Área restrita (usuários e permissões, Controle de ART, financeiro, demandas, finanças das empresas e
-- finanças pessoais) – estrutura do banco (Supabase)
-- Cole tudo no SQL Editor do Supabase e clique em "Run". Pode rodar de novo depois de
-- atualizações: o script só cria ou ajusta o que falta e não apaga dados.
-- ============================================================

-- ARTs cadastradas
create table if not exists public.arts (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid default auth.uid() references auth.users (id) on delete set null,
  numero          text not null,
  crea            text not null default 'MG' check (crea in ('MG', 'RJ', 'SP', 'Outro')),
  tipo            text,
  forma           text,
  contratante     text,
  contratante_doc text,
  proprietario    text,
  local           text,
  endereco        text,
  contrato        text,
  valor           numeric(14, 2),
  taxa            numeric(10, 2),
  celebrado       date,
  inicio          date,
  fim             date,
  registrada      date,
  atividades      jsonb not null default '[]'::jsonb,
  tos             text[] not null default '{}',
  observacao      text,
  chave           text,
  tipo_servico    text check (tipo_servico in ('pontual', 'continuo')),
  baixa_data      date,
  baixa_motivo    text check (baixa_motivo in ('conclusao', 'interrupcao')),
  anterior_id     uuid references public.arts (id) on delete set null,
  pdf_path        text,
  notas           text,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

create index if not exists arts_fim_idx on public.arts (user_id, fim) where baixa_data is null;

-- Alertas: um registro por ART e marco (30 dias, 7 dias, no dia, semanas de atraso)
create table if not exists public.alertas (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid default auth.uid() references auth.users (id) on delete set null,
  art_id           uuid not null references public.arts (id) on delete cascade,
  marco            text not null,
  mensagem         text not null,
  criado_em        timestamptz not null default now(),
  lido_em          timestamptz,
  email_enviado_em timestamptz,
  unique (art_id, marco)
);

-- Demandas: solicitações de clientes, propostas e andamento dos serviços
create table if not exists public.demandas (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid default auth.uid() references auth.users (id) on delete set null,
  titulo        text not null,
  cliente       text,
  contato       text,
  email         text,
  telefone      text,
  cidade        text,
  uf            text,
  servico       text,
  origem        text not null default 'site' check (origem in ('site', 'whatsapp', 'email', 'telefone', 'indicacao', 'outro')),
  etapa         text not null default 'recebida' check (etapa in ('recebida', 'proposta', 'aprovada', 'execucao', 'concluida', 'perdida')),
  valor         numeric(14, 2),
  recebida_em   date not null default current_date,
  proposta_em   date,
  aprovada_em   date,
  concluida_em  date,
  prazo         date,
  art_id        uuid references public.arts (id) on delete set null,
  observacao    text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists demandas_etapa_idx on public.demandas (user_id, etapa);

-- Lançamentos financeiros: receitas e despesas
create table if not exists public.lancamentos (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid default auth.uid() references auth.users (id) on delete set null,
  tipo          text not null check (tipo in ('receita', 'despesa')),
  descricao     text not null,
  categoria     text,
  cliente       text,
  valor         numeric(14, 2) not null check (valor >= 0),
  competencia   date not null default current_date,
  vencimento    date,
  pago_em       date,
  forma         text,
  art_id        uuid references public.arts (id) on delete set null,
  demanda_id    uuid references public.demandas (id) on delete set null,
  observacao    text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists lancamentos_data_idx on public.lancamentos (user_id, tipo, pago_em);

-- Os dados de engenharia são compartilhados por quem tem permissão no módulo. O user_id indica só quem
-- criou o registro; apagar a conta de alguém não apaga o que essa pessoa lançou.
-- (Ajusta bancos criados com a versão anterior deste arquivo, em que cada usuário tinha os próprios dados.)
do $$
declare
  t text;
begin
  foreach t in array array['arts', 'alertas', 'demandas', 'lancamentos'] loop
    execute format('alter table public.%I alter column user_id drop not null', t);
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_user_id_fkey');
    execute format('alter table public.%I add constraint %I foreign key (user_id) references auth.users (id) on delete set null', t, t || '_user_id_fkey');
  end loop;
end $$;

-- Cada ART aparece uma vez só, qualquer que seja o usuário que a importou
alter table public.arts drop constraint if exists arts_user_id_numero_key;
create unique index if not exists arts_numero_key on public.arts (numero);

-- Ação planejada para a ART vencida ou perto de vencer: dar baixa, emitir ART substituta, complementar ou nova, ou
-- arquivar (encerrada aqui sem outra ART que a continue; arquivada_em guarda o dia)
alter table public.arts add column if not exists acao text;
alter table public.arts drop constraint if exists arts_acao_check;
alter table public.arts add constraint arts_acao_check check (acao is null or acao in ('baixa', 'substituta', 'complementar', 'nova', 'arquivada'));
alter table public.arts add column if not exists arquivada_em date;
-- Taxa da ART já paga (pela empresa, pelo caixa das empresas ou por você): sem reembolso pendente
alter table public.arts add column if not exists taxa_paga boolean default false;
-- Baixa por substituição: a ART foi substituída por outra, que fica vinculada a ela (anterior_id)
alter table public.arts drop constraint if exists arts_baixa_motivo_check;
alter table public.arts add constraint arts_baixa_motivo_check check (baixa_motivo in ('conclusao', 'interrupcao', 'substituicao'));

-- ------------------------------------------------------------
-- Usuários: perfil de acesso e histórico
-- ------------------------------------------------------------
-- Um perfil por pessoa. O administrador cadastra pelo site (nome, e-mail, perfil e módulos) e cria
-- o acesso (e-mail e senha) no Supabase; no primeiro login, o perfil se liga à conta pelo e-mail.
--   papel:    adm (acesso total) · pessoal (família e pessoas próximas) · cliente
--   modulos:  módulos liberados para pessoal e cliente (o administrador acessa todos)
--   situacao: ativo · inativo (bloqueado) · pendente (conta criada sem cadastro, aguardando liberação)
create table if not exists public.perfis (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid unique references auth.users (id) on delete set null,
  email           text not null,
  nome            text,
  papel           text not null default 'cliente' check (papel in ('adm', 'pessoal', 'cliente')),
  modulos         text[] not null default '{}',
  situacao        text not null default 'ativo' check (situacao in ('ativo', 'inativo', 'pendente')),
  link_financas   text check (link_financas is null or link_financas ~ '^https://'),
  observacao      text,
  primeiro_acesso timestamptz,
  ultimo_acesso   timestamptz,
  visita_anterior timestamptz,
  acessos         integer not null default 0,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

create unique index if not exists perfis_email_key on public.perfis (email);

-- Finanças em casal: as duas pessoas veem e alteram as finanças pessoais uma da outra. O vínculo vale nos dois
-- sentidos (perfis_casal) e o administrador liga e desliga em Usuários e permissões.
alter table public.perfis add column if not exists casal_com uuid references public.perfis (id) on delete set null;
alter table public.perfis drop constraint if exists perfis_casal_check;
alter table public.perfis add constraint perfis_casal_check check (casal_com is null or casal_com <> id);

-- Módulos que podem ser liberados (refeito a cada versão, para incluir os módulos novos)
alter table public.perfis drop constraint if exists perfis_modulos_check;
alter table public.perfis add constraint perfis_modulos_check
  check (modulos <@ array['art', 'financeiro', 'demandas', 'financas', 'empresas']::text[]);

-- Histórico de acessos: página aberta, data e hora e tipo de aparelho (guarda 180 dias)
create table if not exists public.acessos (
  id          bigint generated always as identity primary key,
  perfil_id   uuid not null references public.perfis (id) on delete cascade,
  user_id     uuid references auth.users (id) on delete set null,
  pagina      text,
  dispositivo text,
  em          timestamptz not null default now()
);

create index if not exists acessos_perfil_em_idx on public.acessos (perfil_id, em desc);
create index if not exists acessos_em_idx on public.acessos (em desc);

-- Finanças pessoais: o painel do projeto Financeiro de cada pessoa (gastos, cartão e faturas,
-- investimentos), importado do arquivo do painel. Separado do controle financeiro da engenharia.
--   modo: completo (todas as abas) · faturas (só o cartão e as faturas da pessoa)
create table if not exists public.financas (
  id             uuid primary key default gen_random_uuid(),
  perfil_id      uuid not null unique references public.perfis (id) on delete cascade,
  modo           text not null default 'completo' check (modo in ('completo', 'faturas')),
  dados          jsonb not null,
  investimentos  jsonb,
  arquivo        text,
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid default auth.uid() references auth.users (id) on delete set null
);

-- Gastos lançados pelo site em Finanças pessoais. Somam com os do projeto Financeiro no painel;
-- os de cartão entram na fatura (parcelados, uma parcela por fatura).
create table if not exists public.financas_gastos (
  id          uuid primary key default gen_random_uuid(),
  perfil_id   uuid not null references public.perfis (id) on delete cascade,
  data        date not null default current_date,
  descricao   text not null check (length(trim(descricao)) > 0),
  valor       numeric(12, 2) not null check (valor > 0),
  forma       text not null check (forma in ('cartao', 'pix', 'debito', 'dinheiro', 'outro')),
  parcelas    integer not null default 1 check (parcelas between 1 and 48),
  categoria   text,
  essencial   boolean,
  observacao  text,
  criado_em   timestamptz not null default now(),
  criado_por  uuid default auth.uid() references auth.users (id) on delete set null
);

create index if not exists financas_gastos_perfil_data_idx on public.financas_gastos (perfil_id, data);

-- Subcategoria e conta do gasto. Conta (de quem é o dinheiro): pessoal de quem é o painel (padrão), "casal"
-- (compartilhado do casal), engenharia (trabalho autônomo), uma empresa ("empresa:" e o id), a outra pessoa do
-- casal ("pessoa:" e o id do perfil) ou empresas unidas numa conta só ("grupo:" e o id, nas preferências)
alter table public.financas_gastos add column if not exists subcategoria text;
alter table public.financas_gastos add column if not exists conta text
  check (conta is null or conta ~ '^(pessoal|casal|engenharia|(empresa|pessoa|grupo):[0-9a-f-]{36})$');

-- Pagamento recorrente que este gasto paga (id do recorrente nas preferências ou "p:" e o nome do fixo do projeto)
alter table public.financas_gastos add column if not exists recorrente text check (recorrente is null or length(recorrente) between 1 and 120);

-- Entradas lançadas pelo site em Finanças pessoais: o salário (holerite, com o bruto e os descontos) e outros
-- recebimentos. Somam com as receitas do projeto Financeiro no mês em que entraram (data).
create table if not exists public.financas_entradas (
  id          uuid primary key default gen_random_uuid(),
  perfil_id   uuid not null references public.perfis (id) on delete cascade,
  data        date not null default current_date,
  tipo        text not null check (tipo in ('salario', 'outro')),
  descricao   text not null check (length(trim(descricao)) > 0),
  bruto       numeric(12, 2) check (bruto is null or bruto >= 0),
  -- [{ "nome": "INSS", "valor": 988.07 }, ...]
  descontos   jsonb not null default '[]'::jsonb check (jsonb_typeof(descontos) = 'array'),
  liquido     numeric(12, 2) not null check (liquido > 0),
  conta       text check (conta is null or conta ~ '^(pessoal|casal|engenharia|(empresa|pessoa|grupo):[0-9a-f-]{36})$'),
  observacao  text,
  criado_em   timestamptz not null default now(),
  criado_por  uuid default auth.uid() references auth.users (id) on delete set null
);

create index if not exists financas_entradas_perfil_data_idx on public.financas_entradas (perfil_id, data);

-- Como é o recebimento (para o fluxo de caixa e a previsão):
--   depois: trabalha o mês e recebe depois (ex.: salário até o dia 10 do mês seguinte)
--   antes: recebe no começo e usa no mês (ex.: ticket alimentação)
--   avulso: recebimento sem mês de trabalho
-- referencia: mês de trabalho a que a entrada se refere (AAAA-MM). repete: entra na previsão dos meses seguintes.
alter table public.financas_entradas add column if not exists recebimento text check (recebimento in ('depois', 'antes', 'avulso'));
alter table public.financas_entradas add column if not exists referencia text check (referencia ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
alter table public.financas_entradas add column if not exists repete boolean not null default false;

-- Empresas com que há movimento financeiro: onde você trabalha ou que pagam as ARTs que você tira.
-- Os nomes ficam só aqui no banco (o código do site é público).
create table if not exists public.empresas (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null check (length(trim(nome)) > 0),
  observacao text,
  ordem      integer not null default 0,
  criado_em  timestamptz not null default now(),
  criado_por uuid default auth.uid() references auth.users (id) on delete set null
);

create unique index if not exists empresas_nome_key on public.empresas (lower(trim(nome)));

-- ART tirada para uma empresa (que paga a taxa) ou para um cliente particular
alter table public.arts add column if not exists vinculo text check (vinculo in ('empresa', 'particular'));
alter table public.arts add column if not exists empresa_id uuid references public.empresas (id) on delete set null;

-- Lançamento com empresa fica na página da empresa; sem empresa, é da engenharia (Controle financeiro).
-- Empresa com lançamentos não pode ser apagada (os lançamentos passariam para a engenharia).
alter table public.lancamentos add column if not exists empresa_id uuid references public.empresas (id) on delete restrict;
create index if not exists lancamentos_empresa_idx on public.lancamentos (empresa_id);

-- Preferências de cada pessoa nas finanças: lista de categorias e subcategorias (com o padrão essencial
-- ou não) e o plano da lista de desejos (quanto guardar por mês)
create table if not exists public.financas_preferencias (
  perfil_id     uuid primary key references public.perfis (id) on delete cascade,
  categorias    jsonb not null default '{}'::jsonb,
  plano         jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now()
);

-- Contas do painel (Cadastros): empresas unidas numa conta só ({ "grupos": [{ "id", "nome", "empresas": [ids] }] })
-- e as contas escondidas nos formulários ({ "ocultas": [ids] })
alter table public.financas_preferencias add column if not exists contas jsonb not null default '{}'::jsonb;

-- Fluxo de caixa: saldo da conta informado no início de um mês ({ "saldos": { "2026-10": 1234.56 } }); os meses
-- seguintes continuam a partir dele. Também guarda (sem mudar a tabela) os gastos do site ainda a pagar
-- ("aPagar": [id]), os fixos do projeto tirados ou trocados por um recorrente do site ("fixosOcultos": ["p:<nome>"])
-- e as previsões do mês ("metas": { "investimento_mensal", "investimento_nome", "cartao_mensal" }).
alter table public.financas_preferencias add column if not exists caixa jsonb not null default '{}'::jsonb;

-- Pagamentos recorrentes lançados no site: [{ "id", "nome", "valor", "dia", "forma", "categoria", "subcategoria",
-- "conta", "inicio": "AAAA-MM", "ativo" }]. Cada mês ficam pendentes até o pagamento ser marcado (vira um gasto
-- lançado com o id do recorrente em financas_gastos.recorrente)
alter table public.financas_preferencias add column if not exists recorrentes jsonb not null default '[]'::jsonb
  check (jsonb_typeof(recorrentes) = 'array');

-- Investimentos individuais de cada pessoa (aba Investimentos): [{ "id", "nome", "tipo", "instituicao", "indexador",
-- "taxa", "vencimento", "conta", "meses": { "AAAA-MM": { "data", "saldo", "aplicado", "resgatado", "rendeu" } } }].
-- O saldo de cada mês vem da atualização dos saldos; o rendimento do mês é o informado ou a diferença dos saldos
alter table public.financas_preferencias add column if not exists investimentos jsonb not null default '[]'::jsonb
  check (jsonb_typeof(investimentos) = 'array');

-- Classificação feita no site para os lançamentos que vêm do projeto Financeiro (gastos do dia a dia e
-- lançamentos das faturas): categoria, subcategoria, essencial, conta e um complemento de texto.
-- A chave identifica o lançamento (data, valor e descrição) e continua valendo depois de cada importação.
create table if not exists public.financas_ajustes (
  id            uuid primary key default gen_random_uuid(),
  perfil_id     uuid not null references public.perfis (id) on delete cascade,
  chave         text not null check (length(chave) between 3 and 400),
  categoria     text,
  subcategoria  text,
  essencial     boolean,
  complemento   text,
  conta         text check (conta is null or conta ~ '^(pessoal|casal|engenharia|(empresa|pessoa|grupo):[0-9a-f-]{36})$'),
  atualizado_em timestamptz not null default now(),
  unique (perfil_id, chave)
);

-- Bancos criados antes das contas do casal e das empresas unidas: a regra da conta passa a aceitar os valores novos
do $$
declare t text;
begin
  foreach t in array array['financas_gastos', 'financas_entradas', 'financas_ajustes'] loop
    execute format('alter table public.%I drop constraint if exists %I', t, t || '_conta_check');
    execute format('alter table public.%I add constraint %I check (conta is null or conta ~ %L)', t, t || '_conta_check',
      '^(pessoal|casal|engenharia|(empresa|pessoa|grupo):[0-9a-f-]{36})$');
  end loop;
end $$;

-- Lista de desejos de compra.
--   quem: eu (quem cadastrou compra) · outra (a pessoa de outra_id compra) · conjunto (os dois; parte = % de quem cadastrou)
--   O item aparece também para a pessoa de outra_id.
create table if not exists public.financas_desejos (
  id            uuid primary key default gen_random_uuid(),
  perfil_id     uuid not null references public.perfis (id) on delete cascade,
  nome          text not null check (length(trim(nome)) > 0),
  valor         numeric(12, 2) not null check (valor > 0),
  prioridade    smallint not null default 3 check (prioridade between 1 and 5),
  quem          text not null default 'eu' check (quem in ('eu', 'outra', 'conjunto')),
  outra_id      uuid references public.perfis (id) on delete set null,
  parte         numeric(5, 2) not null default 50 check (parte between 0 and 100),
  forma         text not null default 'avista' check (forma in ('avista', 'parcelado')),
  parcelas      integer not null default 1 check (parcelas between 1 and 48),
  quando        date,
  guardado      numeric(12, 2) not null default 0 check (guardado >= 0),
  categoria     text,
  link          text check (link is null or link ~ '^https://'),
  observacao    text,
  situacao      text not null default 'desejo' check (situacao in ('desejo', 'comprado', 'desistiu')),
  comprado_em   date,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  criado_por    uuid default auth.uid() references auth.users (id) on delete set null
);

create index if not exists financas_desejos_perfil_idx on public.financas_desejos (perfil_id);
create index if not exists financas_desejos_outra_idx on public.financas_desejos (outra_id);

-- ------------------------------------------------------------
-- Funções e gatilhos
-- ------------------------------------------------------------
-- Atualiza "atualizado_em" a cada alteração
create or replace function public.tocar_atualizado_em() returns trigger
language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

drop trigger if exists arts_atualizado_em on public.arts;
create trigger arts_atualizado_em before update on public.arts
  for each row execute function public.tocar_atualizado_em();

drop trigger if exists demandas_atualizado_em on public.demandas;
create trigger demandas_atualizado_em before update on public.demandas
  for each row execute function public.tocar_atualizado_em();

drop trigger if exists lancamentos_atualizado_em on public.lancamentos;
create trigger lancamentos_atualizado_em before update on public.lancamentos
  for each row execute function public.tocar_atualizado_em();

drop trigger if exists perfis_atualizado_em on public.perfis;
create trigger perfis_atualizado_em before update on public.perfis
  for each row execute function public.tocar_atualizado_em();

drop trigger if exists financas_atualizado_em on public.financas;
create trigger financas_atualizado_em before update on public.financas
  for each row execute function public.tocar_atualizado_em();

drop trigger if exists financas_preferencias_atualizado_em on public.financas_preferencias;
create trigger financas_preferencias_atualizado_em before update on public.financas_preferencias
  for each row execute function public.tocar_atualizado_em();

drop trigger if exists financas_ajustes_atualizado_em on public.financas_ajustes;
create trigger financas_ajustes_atualizado_em before update on public.financas_ajustes
  for each row execute function public.tocar_atualizado_em();

drop trigger if exists financas_desejos_atualizado_em on public.financas_desejos;
create trigger financas_desejos_atualizado_em before update on public.financas_desejos
  for each row execute function public.tocar_atualizado_em();

-- E-mail sempre em minúsculas; cliente nunca fica com módulo profissional
create or replace function public.perfis_normalizar() returns trigger
language plpgsql as $$
begin
  new.email := lower(trim(new.email));
  new.nome := nullif(trim(new.nome), '');
  new.link_financas := nullif(trim(new.link_financas), '');
  if new.papel = 'cliente' then
    new.modulos := array(select m from unnest(new.modulos) as m where m not in ('art', 'financeiro', 'demandas', 'empresas'));
  end if;
  return new;
end $$;

drop trigger if exists perfis_normalizar on public.perfis;
create trigger perfis_normalizar before insert or update on public.perfis
  for each row execute function public.perfis_normalizar();

-- Sempre sobra pelo menos um administrador ativo
create or replace function public.proteger_ultimo_adm() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.papel = 'adm' and old.situacao = 'ativo'
     and (tg_op = 'DELETE' or new.papel <> 'adm' or new.situacao <> 'ativo')
     and not exists (select 1 from public.perfis where papel = 'adm' and situacao = 'ativo' and id <> old.id) then
    raise exception 'É preciso manter pelo menos um administrador ativo.';
  end if;
  return coalesce(new, old);
end $$;

drop trigger if exists perfis_ultimo_adm on public.perfis;
create trigger perfis_ultimo_adm before update or delete on public.perfis
  for each row execute function public.proteger_ultimo_adm();

-- Quem está logado é administrador ativo?
create or replace function public.eh_adm() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.perfis
    where user_id = auth.uid() and papel = 'adm' and situacao = 'ativo'
  );
$$;

-- Permissão de módulo: o administrador acessa tudo; pessoal e cliente, os módulos liberados no cadastro.
-- Os módulos profissionais (ART, financeiro, demandas e finanças das empresas) nunca ficam abertos para clientes.
create or replace function public.pode(p_modulo text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.perfis
    where user_id = auth.uid() and situacao = 'ativo'
      and (papel = 'adm'
        or (p_modulo = any (modulos)
          and not (papel = 'cliente' and p_modulo in ('art', 'financeiro', 'demandas', 'empresas'))))
  );
$$;

-- Pessoas que usam as finanças pessoais (para dividir desejos de compra): só o primeiro nome,
-- e só para quem também usa as finanças (administrador ou perfil pessoal)
create or replace function public.pessoas_financas() returns table (id uuid, nome text)
language sql stable security definer set search_path = '' as $$
  select p.id, coalesce(nullif(split_part(p.nome, ' ', 1), ''), split_part(p.email, '@', 1))
  from public.perfis p
  where p.situacao = 'ativo'
    and (p.papel = 'adm' or (p.papel = 'pessoal' and 'financas' = any (p.modulos)))
    and exists (
      select 1 from public.perfis eu
      where eu.user_id = auth.uid() and eu.situacao = 'ativo'
        and (eu.papel = 'adm' or (eu.papel = 'pessoal' and 'financas' = any (eu.modulos)))
    )
  order by 2;
$$;

-- Mantém o casal nos dois sentidos: ao formar um par, a outra pessoa aponta de volta (e desfaz o par anterior
-- de cada um); ao desfazer, a outra pessoa também deixa de apontar
create or replace function public.perfis_casal() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if pg_trigger_depth() > 1 then return null; end if;
  if tg_op = 'UPDATE' and old.casal_com is not null and old.casal_com is distinct from new.casal_com then
    update public.perfis set casal_com = null where id = old.casal_com and casal_com = new.id;
  end if;
  if new.casal_com is not null then
    update public.perfis set casal_com = null where casal_com = new.casal_com and id <> new.id;
    update public.perfis set casal_com = new.id where id = new.casal_com and casal_com is distinct from new.id;
  end if;
  return null;
end $$;

drop trigger if exists perfis_casal on public.perfis;
create trigger perfis_casal after insert or update of casal_com on public.perfis
  for each row execute function public.perfis_casal();

-- Quem pode ver e alterar as finanças pessoais de um perfil: o administrador, a própria pessoa (com o módulo)
-- e quem forma casal com ela nas finanças (as duas ativas, o vínculo nos dois sentidos)
create or replace function public.financas_acesso(alvo uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.eh_adm() or (public.pode('financas') and exists (
    select 1 from public.perfis eu
    where eu.user_id = auth.uid() and eu.situacao = 'ativo'
      and (eu.id = alvo
        or (eu.papel = 'pessoal' and eu.casal_com = alvo
          and exists (select 1 from public.perfis par where par.id = alvo and par.casal_com = eu.id and par.situacao = 'ativo')))
  ));
$$;

-- O mesmo para a pasta dos PDFs das finanças (o nome da pasta é o id do perfil)
create or replace function public.financas_acesso_pasta(pasta text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when pasta ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then public.financas_acesso(pasta::uuid) else false end;
$$;

-- Chamada a cada página aberta: liga a conta ao cadastro, registra o acesso e devolve o perfil.
-- Na primeira vez (banco sem administrador), quem entra vira o administrador.
create or replace function public.registrar_acesso(p_pagina text default null, p_dispositivo text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := auth.uid();
  v_email  text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_perfil public.perfis%rowtype;
  v_tem_adm boolean;
begin
  if v_uid is null then
    return null;
  end if;

  select * into v_perfil from public.perfis where user_id = v_uid;

  -- Cadastro feito antes no site: liga pelo e-mail no primeiro acesso
  if v_perfil.id is null and v_email <> '' then
    update public.perfis set user_id = v_uid
    where email = v_email and user_id is null
    returning * into v_perfil;
  end if;

  -- Conta criada no Supabase sem cadastro no site
  if v_perfil.id is null then
    v_tem_adm := exists (select 1 from public.perfis where papel = 'adm' and situacao = 'ativo');
    insert into public.perfis (user_id, email, papel, situacao, observacao)
    values (
      v_uid, v_email,
      case when v_tem_adm then 'cliente' else 'adm' end,
      case when v_tem_adm then 'pendente' else 'ativo' end,
      case when v_tem_adm then 'Conta criada sem cadastro no site: defina o perfil e libere o acesso.' end
    )
    on conflict do nothing
    returning * into v_perfil;
    if v_perfil.id is null then
      select * into v_perfil from public.perfis where user_id = v_uid; -- criado agora por outra aba
    end if;
  end if;

  if v_perfil.id is null then
    return null;
  end if;

  if v_perfil.situacao = 'ativo' then
    -- Nova visita depois de 30 minutos parado: conta um acesso e guarda o fim da visita anterior
    update public.perfis
       set acessos = acessos + case when ultimo_acesso is null or ultimo_acesso < now() - interval '30 minutes' then 1 else 0 end,
           visita_anterior = case when ultimo_acesso is null or ultimo_acesso < now() - interval '30 minutes' then ultimo_acesso else visita_anterior end,
           primeiro_acesso = coalesce(primeiro_acesso, now()),
           ultimo_acesso = now()
     where id = v_perfil.id
    returning * into v_perfil;

    -- Histórico: a mesma página reaberta em menos de 5 minutos não repete
    if not exists (
      select 1 from public.acessos
      where perfil_id = v_perfil.id and pagina is not distinct from left(p_pagina, 60) and em > now() - interval '5 minutes'
    ) then
      insert into public.acessos (perfil_id, user_id, pagina, dispositivo)
      values (v_perfil.id, v_uid, left(p_pagina, 60), left(p_dispositivo, 60));
    end if;
    delete from public.acessos where perfil_id = v_perfil.id and em < now() - interval '180 days';
  end if;

  return to_jsonb(v_perfil);
end $$;

-- O próprio usuário só altera o nome (perfil, módulos e situação ficam com o administrador)
create or replace function public.atualizar_meu_nome(p_nome text) returns void
language sql security definer set search_path = '' as $$
  update public.perfis set nome = left(p_nome, 80) where user_id = auth.uid();
$$;

revoke all on function public.eh_adm() from public, anon;
revoke all on function public.pode(text) from public, anon;
revoke all on function public.registrar_acesso(text, text) from public, anon;
revoke all on function public.atualizar_meu_nome(text) from public, anon;
revoke all on function public.pessoas_financas() from public, anon;
revoke all on function public.financas_acesso(uuid), public.financas_acesso_pasta(text) from public, anon;
grant execute on function public.eh_adm(), public.pode(text), public.registrar_acesso(text, text),
  public.atualizar_meu_nome(text), public.pessoas_financas(), public.financas_acesso(uuid), public.financas_acesso_pasta(text)
  to authenticated, service_role;

-- ------------------------------------------------------------
-- Segurança: só entra quem tem perfil ativo, e cada módulo só abre para quem tem permissão
-- ------------------------------------------------------------
alter table public.arts enable row level security;
alter table public.alertas enable row level security;
alter table public.demandas enable row level security;
alter table public.lancamentos enable row level security;
alter table public.perfis enable row level security;
alter table public.acessos enable row level security;
alter table public.financas enable row level security;
alter table public.financas_gastos enable row level security;
alter table public.financas_entradas enable row level security;
alter table public.empresas enable row level security;
alter table public.financas_preferencias enable row level security;
alter table public.financas_ajustes enable row level security;
alter table public.financas_desejos enable row level security;

-- Acesso pela API, mesmo em projetos criados sem expor tabelas novas
-- automaticamente. As políticas abaixo continuam decidindo quais linhas cada um vê.
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete
  on public.arts, public.alertas, public.demandas, public.lancamentos, public.perfis, public.financas, public.financas_gastos,
     public.financas_entradas, public.empresas, public.financas_preferencias, public.financas_ajustes, public.financas_desejos
  to authenticated, service_role;
grant select on public.acessos to authenticated;
grant select, insert, update, delete on public.acessos to service_role;

-- Políticas da versão anterior (cada usuário com os próprios dados)
drop policy if exists "arts do proprio usuario" on public.arts;
drop policy if exists "alertas do proprio usuario" on public.alertas;
drop policy if exists "demandas do proprio usuario" on public.demandas;
drop policy if exists "lancamentos do proprio usuario" on public.lancamentos;

drop policy if exists "arts com permissao" on public.arts;
create policy "arts com permissao" on public.arts
  for all to authenticated
  using ((select public.pode('art')))
  with check ((select public.pode('art')));

drop policy if exists "alertas com permissao" on public.alertas;
create policy "alertas com permissao" on public.alertas
  for all to authenticated
  using ((select public.pode('art')))
  with check ((select public.pode('art')));

drop policy if exists "demandas com permissao" on public.demandas;
create policy "demandas com permissao" on public.demandas
  for all to authenticated
  using ((select public.pode('demandas')))
  with check ((select public.pode('demandas')));

-- Lançamentos da engenharia (sem empresa) com o módulo financeiro; os de uma empresa, com o módulo das empresas
drop policy if exists "lancamentos com permissao" on public.lancamentos;
create policy "lancamentos com permissao" on public.lancamentos
  for all to authenticated
  using (case when empresa_id is null then (select public.pode('financeiro')) else (select public.pode('empresas')) end)
  with check (case when empresa_id is null then (select public.pode('financeiro')) else (select public.pode('empresas')) end);

-- Empresas: quem cuida das finanças das empresas cadastra; ART e financeiro leem os nomes para classificar
drop policy if exists "empresas - ler" on public.empresas;
create policy "empresas - ler" on public.empresas
  for select to authenticated
  using ((select public.pode('empresas')) or (select public.pode('art')) or (select public.pode('financeiro')));

drop policy if exists "empresas - alterar" on public.empresas;
create policy "empresas - alterar" on public.empresas
  for all to authenticated
  using ((select public.pode('empresas')))
  with check ((select public.pode('empresas')));

-- Perfis: cada um lê o próprio; o administrador lê e altera todos
drop policy if exists "perfis - ler" on public.perfis;
create policy "perfis - ler" on public.perfis
  for select to authenticated
  using (user_id = auth.uid() or (select public.eh_adm()));

drop policy if exists "perfis - cadastrar" on public.perfis;
create policy "perfis - cadastrar" on public.perfis
  for insert to authenticated
  with check ((select public.eh_adm()));

drop policy if exists "perfis - alterar" on public.perfis;
create policy "perfis - alterar" on public.perfis
  for update to authenticated
  using ((select public.eh_adm()))
  with check ((select public.eh_adm()));

drop policy if exists "perfis - excluir" on public.perfis;
create policy "perfis - excluir" on public.perfis
  for delete to authenticated
  using ((select public.eh_adm()));

-- Finanças pessoais: cada pessoa vê e atualiza o próprio painel (com a permissão do módulo);
-- o administrador atualiza o painel de quem ele cuida (ex.: as faturas de alguém da família) e quem forma casal nas
-- finanças vê e altera o painel do outro. O mesmo vale para gastos, entradas, preferências e classificação.
drop policy if exists "financas do proprio perfil" on public.financas;
create policy "financas do proprio perfil" on public.financas
  for all to authenticated
  using (public.financas_acesso(perfil_id))
  with check (public.financas_acesso(perfil_id));

drop policy if exists "gastos do proprio perfil" on public.financas_gastos;
create policy "gastos do proprio perfil" on public.financas_gastos
  for all to authenticated
  using (public.financas_acesso(perfil_id))
  with check (public.financas_acesso(perfil_id));

drop policy if exists "entradas do proprio perfil" on public.financas_entradas;
create policy "entradas do proprio perfil" on public.financas_entradas
  for all to authenticated
  using (public.financas_acesso(perfil_id))
  with check (public.financas_acesso(perfil_id));

drop policy if exists "preferencias do proprio perfil" on public.financas_preferencias;
create policy "preferencias do proprio perfil" on public.financas_preferencias
  for all to authenticated
  using (public.financas_acesso(perfil_id))
  with check (public.financas_acesso(perfil_id));

drop policy if exists "ajustes do proprio perfil" on public.financas_ajustes;
create policy "ajustes do proprio perfil" on public.financas_ajustes
  for all to authenticated
  using (public.financas_acesso(perfil_id))
  with check (public.financas_acesso(perfil_id));

-- Desejos: de quem cadastrou (e de quem forma casal com ela) e da outra pessoa do item (compra dela ou em conjunto)
drop policy if exists "desejos do proprio perfil ou compartilhados" on public.financas_desejos;
create policy "desejos do proprio perfil ou compartilhados" on public.financas_desejos
  for all to authenticated
  using (public.financas_acesso(perfil_id)
    or ((select public.pode('financas')) and outra_id in (select id from public.perfis where user_id = auth.uid())))
  with check (public.financas_acesso(perfil_id)
    or ((select public.pode('financas')) and outra_id in (select id from public.perfis where user_id = auth.uid())));

-- Histórico: cada um vê o próprio; o administrador vê todos. Só a função registrar_acesso grava.
drop policy if exists "acessos - ler" on public.acessos;
create policy "acessos - ler" on public.acessos
  for select to authenticated
  using (user_id = auth.uid() or (select public.eh_adm()));

-- ------------------------------------------------------------
-- Arquivos: só PDF, até 20 MB, em espaços privados
--   arts:     PDFs das ARTs, abertos a quem tem o módulo de ART
--   financas: faturas, relatórios e outros PDFs das finanças pessoais, uma pasta por pessoa
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('arts', 'arts', false, 20971520, '{application/pdf}'),
       ('financas', 'financas', false, 20971520, '{application/pdf}')
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "pdfs do proprio usuario - ler" on storage.objects;
drop policy if exists "pdfs do proprio usuario - enviar" on storage.objects;
drop policy if exists "pdfs do proprio usuario - atualizar" on storage.objects;
drop policy if exists "pdfs do proprio usuario - apagar" on storage.objects;

drop policy if exists "pdfs das arts - ler" on storage.objects;
create policy "pdfs das arts - ler" on storage.objects
  for select to authenticated
  using (bucket_id = 'arts' and (select public.pode('art')));

drop policy if exists "pdfs das arts - enviar" on storage.objects;
create policy "pdfs das arts - enviar" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'arts' and (select public.pode('art')));

drop policy if exists "pdfs das arts - atualizar" on storage.objects;
create policy "pdfs das arts - atualizar" on storage.objects
  for update to authenticated
  using (bucket_id = 'arts' and (select public.pode('art')));

drop policy if exists "pdfs das arts - apagar" on storage.objects;
create policy "pdfs das arts - apagar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'arts' and (select public.pode('art')));

-- PDFs das finanças: cada pessoa na própria pasta (nome da pasta = id do perfil); o administrador em todas e quem
-- forma casal nas finanças também na pasta do outro
drop policy if exists "pdfs das financas - ler" on storage.objects;
create policy "pdfs das financas - ler" on storage.objects
  for select to authenticated
  using (bucket_id = 'financas' and public.financas_acesso_pasta((storage.foldername(name))[1]));

drop policy if exists "pdfs das financas - enviar" on storage.objects;
create policy "pdfs das financas - enviar" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'financas' and public.financas_acesso_pasta((storage.foldername(name))[1]));

drop policy if exists "pdfs das financas - atualizar" on storage.objects;
create policy "pdfs das financas - atualizar" on storage.objects
  for update to authenticated
  using (bucket_id = 'financas' and public.financas_acesso_pasta((storage.foldername(name))[1]));

drop policy if exists "pdfs das financas - apagar" on storage.objects;
create policy "pdfs das financas - apagar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'financas' and public.financas_acesso_pasta((storage.foldername(name))[1]));

-- ------------------------------------------------------------
-- Caixa das empresas: o dinheiro que as empresas adiantam (um caixa só para as empresas escolhidas, mesmo que cada
-- despesa seja de uma delas). Saldo inicial, saldo informado da conta separada do caixa e os movimentos:
--   entrada:      dinheiro que uma empresa manda para o caixa (adiantamento, reposição)
--   despesa:      gasto pago com o caixa (RDV ou ficha de custo de uma empresa); só conta depois de aprovado
--   adiantamento: dinheiro entregue a um colaborador (sai do caixa e fica com ele até prestar contas)
--   devolucao:    colaborador devolve dinheiro ao caixa
-- A despesa com colaborador é a prestação de contas dele: abate o que ele tem do caixa, sem mexer no caixa.
-- Os nomes das empresas e dos colaboradores ficam só aqui no banco.
-- ------------------------------------------------------------
create table if not exists public.caixa_config (
  id            smallint primary key default 1 check (id = 1),
  empresas      uuid[] not null default '{}',
  saldo_inicial numeric(12, 2) not null default 0,
  data_inicial  date,
  saldo_conta   numeric(12, 2),
  data_conta    date,
  atualizado_em timestamptz not null default now()
);

create table if not exists public.caixa_movimentos (
  id             uuid primary key default gen_random_uuid(),
  data           date not null,
  tipo           text not null check (tipo in ('entrada', 'despesa', 'adiantamento', 'devolucao')),
  classificacao  text check (classificacao is null or classificacao in ('rdv', 'fc', 'outro')),
  empresa_id     uuid references public.empresas (id) on delete restrict,
  valor          numeric(12, 2) not null check (valor > 0),
  descricao      text check (descricao is null or length(descricao) <= 200),
  colaborador    text check (colaborador is null or length(colaborador) between 1 and 80),
  aprovado       boolean not null default true,
  documento      text check (documento is null or length(documento) <= 300),
  documento_nome text check (documento_nome is null or length(documento_nome) <= 200),
  detalhes       jsonb not null default '{}'::jsonb,
  observacao     text check (observacao is null or length(observacao) <= 500),
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  criado_por     uuid default auth.uid() references auth.users (id) on delete set null
);
create index if not exists caixa_movimentos_data_idx on public.caixa_movimentos (data);

drop trigger if exists caixa_config_atualizado_em on public.caixa_config;
create trigger caixa_config_atualizado_em before update on public.caixa_config
  for each row execute function public.tocar_atualizado_em();
drop trigger if exists caixa_movimentos_atualizado_em on public.caixa_movimentos;
create trigger caixa_movimentos_atualizado_em before update on public.caixa_movimentos
  for each row execute function public.tocar_atualizado_em();

alter table public.caixa_config enable row level security;
alter table public.caixa_movimentos enable row level security;
grant select, insert, update, delete on public.caixa_config, public.caixa_movimentos to authenticated, service_role;

drop policy if exists "caixa - config" on public.caixa_config;
create policy "caixa - config" on public.caixa_config
  for all to authenticated
  using ((select public.pode('empresas')))
  with check ((select public.pode('empresas')));

drop policy if exists "caixa - movimentos" on public.caixa_movimentos;
create policy "caixa - movimentos" on public.caixa_movimentos
  for all to authenticated
  using ((select public.pode('empresas')))
  with check ((select public.pode('empresas')));

-- RDV e fichas de custo anexados aos movimentos (planilha, PDF ou foto), até 20 MB, só para o módulo das empresas
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('caixa', 'caixa', false, 20971520, '{application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/pdf,image/jpeg,image/png}')
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "documentos do caixa - ler" on storage.objects;
create policy "documentos do caixa - ler" on storage.objects
  for select to authenticated
  using (bucket_id = 'caixa' and (select public.pode('empresas')));

drop policy if exists "documentos do caixa - enviar" on storage.objects;
create policy "documentos do caixa - enviar" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'caixa' and (select public.pode('empresas')));

drop policy if exists "documentos do caixa - apagar" on storage.objects;
create policy "documentos do caixa - apagar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'caixa' and (select public.pode('empresas')));

-- ================================================================ contatos do site (pedidos de orçamento)
-- O formulário de contato do site grava aqui, sem login (chave pública): o site só consegue enviar; ler, mudar a
-- situação e apagar é só do administrador. A cada contato novo, o banco manda o e-mail "ALERTA DE CONTATO NA
-- PLATAFORMA" para mvszanette@gmail.com pelo Resend (extensão pg_net), com o resumo e os próximos passos. A chave do
-- Resend fica no Vault do Supabase, com o nome resend_api_key (rodar uma vez no SQL Editor, com a chave no lugar de re_…):
--   select vault.create_secret('re_…', 'resend_api_key', 'Chave do Resend para os e-mails do site');
-- Sem a chave, o contato fica guardado do mesmo jeito, só não sai o e-mail.
do $$ begin
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    begin
      create extension pg_net with schema extensions;
    exception when others then
      begin
        create extension pg_net;
      exception when others then
        raise notice 'pg_net indisponível (%): os contatos ficam guardados, sem o e-mail.', sqlerrm;
      end;
    end;
  end if;
end $$;

create table if not exists public.contatos (
  id uuid primary key default gen_random_uuid(),
  criado_em timestamptz not null default now(),
  nome text not null check (length(nome) between 2 and 120),
  email text not null check (length(email) between 5 and 160 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  whatsapp text not null check (length(whatsapp) between 8 and 30),
  empresa text check (empresa is null or length(empresa) <= 120),
  cidade text not null check (length(cidade) between 2 and 80),
  uf text not null check (uf ~ '^[A-Z]{2}$'),
  documento text check (documento is null or length(documento) <= 30),
  quantidade text check (quantidade is null or length(quantidade) <= 30),
  servico text not null check (length(servico) between 2 and 200),
  codigo_tos text check (codigo_tos is null or length(codigo_tos) <= 1000),
  equipamento text check (equipamento is null or length(equipamento) <= 200),
  mensagem text check (mensagem is null or length(mensagem) <= 4000),
  pagina text check (pagina is null or length(pagina) <= 120),
  situacao text not null default 'novo' check (situacao in ('novo', 'respondido', 'proposta', 'fechado', 'descartado'))
);
create index if not exists contatos_criado_em_idx on public.contatos (criado_em desc);

alter table public.contatos enable row level security;
grant usage on schema public to anon;
grant insert on public.contatos to anon;
revoke select, update, delete, truncate on public.contatos from anon;
grant select, insert, update, delete on public.contatos to authenticated, service_role;

drop policy if exists "contatos - o site envia" on public.contatos;
create policy "contatos - o site envia" on public.contatos
  for insert to anon, authenticated
  with check (true);

drop policy if exists "contatos - administrador" on public.contatos;
create policy "contatos - administrador" on public.contatos
  for all to authenticated
  using ((select public.eh_adm()))
  with check ((select public.eh_adm()));

-- Antes de gravar: data, situação e id são do banco (não do site), e um limite contra robôs
create or replace function public.contato_preparar() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.id := gen_random_uuid();
  new.criado_em := now();
  new.situacao := 'novo';
  new.nome := btrim(new.nome);
  new.email := lower(btrim(new.email));
  new.uf := upper(btrim(new.uf));
  if (select count(*) from public.contatos where criado_em > now() - interval '1 hour') >= 30
     or (select count(*) from public.contatos where email = new.email and criado_em > now() - interval '1 hour') >= 5 then
    raise exception 'Muitos pedidos em pouco tempo. Tente mais tarde ou fale pelo WhatsApp.';
  end if;
  return new;
end $$;

drop trigger if exists contatos_preparar on public.contatos;
create trigger contatos_preparar before insert on public.contatos
  for each row execute function public.contato_preparar();

create or replace function public.html_esc(t text) returns text
language sql immutable set search_path = '' as $$
  select replace(replace(replace(replace(replace(coalesce(t, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;');
$$;

-- Depois de gravar: o e-mail de alerta com o resumo do contato e os próximos passos. Uma falha aqui nunca impede de
-- guardar o contato.
create or replace function public.contato_avisar() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  chave text;
  quando text := to_char(new.criado_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI');
  fone text := regexp_replace(new.whatsapp, '\D', '', 'g');
  pedir text;
  resumo text;
  linhas_html text;
  linhas_texto text;
  passos text[];
  html text;
  texto text;
  td text := 'padding:6px 12px 6px 0;vertical-align:top;border-bottom:1px solid #e6e6e6';
begin
  select decrypted_secret into chave from vault.decrypted_secrets where name = 'resend_api_key' limit 1;
  if coalesce(chave, '') = '' then
    return new;
  end if;
  if length(fone) in (10, 11) then
    fone := '55' || fone;
  end if;

  -- O que pedir ao cliente para montar a proposta, conforme o serviço
  pedir := case
    when new.servico ilike '%NR-12%' then 'fabricante, modelo, ano e número de série, fotos da placa de identificação e do equipamento e o local de uso'
    when new.servico ilike '%NR-13%' then 'pressão máxima de operação, volume do reservatório e fotos da placa de identificação e do equipamento'
    when new.servico ilike '%PMOC%' or new.servico ilike '%ar-condicionado%' then 'quantidade, tipo e capacidade dos aparelhos de ar-condicionado e a área atendida'
    when new.servico ilike '%frota%' then 'tamanho e composição da frota, tipo de operação e os dados de manutenção disponíveis'
    else 'fabricante, modelo e ano do equipamento, fotos e o local do serviço'
  end;
  resumo := new.nome || coalesce(' (' || nullif(new.empresa, '') || ')', '') || ', de ' || new.cidade || '/' || new.uf
    || ', pediu orçamento de ' || new.servico
    || coalesce(' para ' || nullif(new.quantidade, '') || ' equipamento(s)', '')
    || coalesce('. Equipamento: ' || nullif(new.equipamento, ''), '') || '.';

  select string_agg(format('<tr><td style="%s;color:#666;white-space:nowrap">%s</td><td style="%s">%s</td></tr>',
                           td, rotulo, td, replace(public.html_esc(valor), E'\n', '<br>')), '' order by n),
         string_agg(rotulo || ': ' || valor, E'\n' order by n)
    into linhas_html, linhas_texto
    from unnest(
      array['Nome', 'E-mail', 'WhatsApp', 'Empresa', 'Cidade', 'CPF/CNPJ', 'Nº de equipamentos', 'Serviço', 'Código TOS (CREA)', 'Equipamento', 'Mensagem', 'Página'],
      array[new.nome, new.email, new.whatsapp, new.empresa, new.cidade || '/' || new.uf, new.documento, new.quantidade, new.servico,
            new.codigo_tos, new.equipamento, new.mensagem, new.pagina]
    ) with ordinality as t(rotulo, valor, n)
    where coalesce(btrim(valor), '') <> '';

  passos := array[
    'Responder em até 1 dia útil: responda este e-mail (a resposta vai direto para ' || new.email || ') ou chame no WhatsApp ' || new.whatsapp || '.',
    'Confirmar os dados do serviço: pedir ' || pedir || '.',
    'Enviar a proposta técnica com escopo, prazo, valor e a ART do serviço.',
    'Serviço fechado: emitir a ART e cadastrar no Controle de ART da área restrita.'
  ];

  html := '<div style="font-family:Arial,Helvetica,sans-serif;color:#1b1d21;max-width:640px;line-height:1.5">'
    || '<div style="height:6px;background:#f5b800"></div>'
    || '<h2 style="margin:18px 0 4px">Novo pedido de orçamento pelo site</h2>'
    || '<p style="margin:0 0 18px;color:#666">Recebido em ' || quando || '.</p>'
    || '<h3 style="margin:0 0 6px">Resumo</h3><p style="margin:0 0 14px">' || public.html_esc(resumo) || '</p>'
    || '<table style="border-collapse:collapse;font-size:14px;margin-bottom:22px">' || coalesce(linhas_html, '') || '</table>'
    || '<h3 style="margin:0 0 6px">Próximos passos</h3><ol style="margin:0 0 20px;padding-left:20px">'
    || (select string_agg('<li style="margin-bottom:6px">' || public.html_esc(p) || '</li>', '') from unnest(passos) as p)
    || '</ol>'
    || '<p style="margin:0 0 24px">'
    || '<a href="https://wa.me/' || fone || '" style="display:inline-block;background:#25d366;color:#fff;text-decoration:none;font-weight:bold;padding:10px 16px;margin:0 8px 8px 0">Chamar no WhatsApp</a>'
    || '<a href="mailto:' || public.html_esc(new.email) || '?subject=Proposta%20t%C3%A9cnica%20%E2%80%93%20Marcos%20Zanette" style="display:inline-block;background:#1b1d21;color:#fff;text-decoration:none;font-weight:bold;padding:10px 16px;margin:0 8px 8px 0">Responder por e-mail</a>'
    || '</p>'
    || '<p style="font-size:12px;color:#888;margin:0">Aviso automático do formulário de contato do site. O pedido também fica guardado na plataforma (tabela contatos).</p>'
    || '</div>';
  texto := 'Novo pedido de orçamento pelo site, recebido em ' || quando || '.' || E'\n\n'
    || 'RESUMO' || E'\n' || resumo || E'\n\n' || coalesce(linhas_texto, '') || E'\n\n'
    || 'PRÓXIMOS PASSOS' || E'\n'
    || (select string_agg(n || '. ' || p, E'\n' order by n) from unnest(passos) with ordinality as t(p, n))
    || E'\n\nWhatsApp: https://wa.me/' || fone;

  perform net.http_post(
    url := 'https://api.resend.com/emails',
    body := jsonb_build_object(
      'from', 'Site Marcos Zanette <onboarding@resend.dev>',
      'to', jsonb_build_array('mvszanette@gmail.com'),
      'reply_to', new.email,
      'subject', 'ALERTA DE CONTATO NA PLATAFORMA – ' || left(new.nome, 60),
      'html', html,
      'text', texto),
    headers := jsonb_build_object('Authorization', 'Bearer ' || chave, 'Content-Type', 'application/json'),
    timeout_milliseconds := 10000);
  return new;
exception when others then
  raise warning 'Contato guardado, mas o e-mail de alerta não saiu: %', sqlerrm;
  return new;
end $$;

drop trigger if exists contatos_avisar on public.contatos;
create trigger contatos_avisar after insert on public.contatos
  for each row execute function public.contato_avisar();

revoke all on function public.contato_preparar(), public.contato_avisar() from public, anon, authenticated;

-- ================================================================ demandas automáticas e resumo diário
-- Cada pedido do formulário do site vira uma demanda (etapa "Recebida", com prazo de resposta no próximo dia útil),
-- ligada ao contato. Todo dia às 7h (Brasília, antes do horário comercial) o banco manda o e-mail "RESUMO DIÁRIO DAS
-- DEMANDAS" com as demandas em andamento (recebida, proposta enviada, aprovada, em execução): dias corridos, etapa,
-- prazo e próximo passo, desde a chegada até ficar concluída ou não aprovada. O envio usa o Resend (chave
-- resend_api_key no Vault) ou, sem ela, o Web3Forms (chave web3forms_key no Vault). O próximo passo de cada etapa é o
-- mesmo do alerta em tela (area/regras-gestao.js, proximoPasso).
alter table public.demandas add column if not exists contato_id uuid references public.contatos (id) on delete set null;

-- Opção do formulário do site → tipo de serviço das demandas e do financeiro (o mesmo de area/demandas.js)
create or replace function public.servico_da_demanda(p text) returns text
language sql immutable set search_path = '' as $$
  select case
    when p ~* 'nr-?12' then 'Laudo NR-12'
    when p ~* 'nr-?13' then 'Laudo NR-13'
    when p ~* 'pmoc|climatiza|ar-condicionado' then 'PMOC e climatização'
    when p ~* 'eletrifica' then 'Eletrificação de frota'
    when p ~* 'treinamento' then 'Treinamentos técnicos'
    when p ~* 'insumo' then 'Indicação de serviços técnicos'
    when p ~* 'industri' then 'Manutenção industrial'
    when p ~* 'frota' then 'Consultoria em gestão de frotas e ativos'
    when p ~* 'laudo' then 'Laudos mecânicos e eletromecânicos'
    else 'Outros'
  end;
$$;

create or replace function public.contato_para_demanda() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  dia date := (new.criado_em at time zone 'America/Sao_Paulo')::date;
begin
  insert into public.demandas (titulo, servico, cliente, contato, email, telefone, cidade, uf, origem, etapa, recebida_em, prazo,
                               observacao, contato_id, user_id)
  values (left(new.servico, 200), public.servico_da_demanda(new.servico), coalesce(nullif(new.empresa, ''), new.nome), new.nome,
          new.email, new.whatsapp, new.cidade, new.uf, 'site', 'recebida', dia,
          -- responder até o próximo dia útil
          dia + case extract(isodow from dia)::int when 5 then 3 when 6 then 2 else 1 end,
          concat_ws(E'\n',
            'Pedido pelo formulário do site em ' || to_char(new.criado_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI')
              || coalesce(' (' || nullif(new.pagina, '') || ')', '') || '.',
            'Equipamento: ' || nullif(new.equipamento, ''),
            'Nº de equipamentos: ' || nullif(new.quantidade, ''),
            'CPF/CNPJ: ' || nullif(new.documento, ''),
            'Código TOS: ' || nullif(new.codigo_tos, ''),
            'Mensagem: ' || nullif(new.mensagem, '')),
          new.id, null);
  return new;
exception when others then
  raise warning 'Contato guardado, mas a demanda não foi criada: %', sqlerrm;
  return new;
end $$;

drop trigger if exists contatos_demanda on public.contatos;
create trigger contatos_demanda after insert on public.contatos
  for each row execute function public.contato_para_demanda();

-- E-mail para mvszanette@gmail.com: Resend (com HTML) ou Web3Forms (texto), conforme a chave guardada no Vault
create or replace function public.enviar_aviso(p_assunto text, p_texto text, p_html text default null, p_responder text default null)
returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  resend text;
  web3 text;
  req bigint;
begin
  select decrypted_secret into resend from vault.decrypted_secrets where name = 'resend_api_key' limit 1;
  select decrypted_secret into web3 from vault.decrypted_secrets where name = 'web3forms_key' limit 1;
  if coalesce(resend, '') <> '' then
    select net.http_post(
      url := 'https://api.resend.com/emails',
      body := jsonb_strip_nulls(jsonb_build_object('from', 'Plataforma Marcos Zanette <onboarding@resend.dev>',
        'to', jsonb_build_array('mvszanette@gmail.com'), 'reply_to', p_responder, 'subject', p_assunto, 'text', p_texto, 'html', p_html)),
      headers := jsonb_build_object('Authorization', 'Bearer ' || resend, 'Content-Type', 'application/json'),
      timeout_milliseconds := 15000) into req;
  elsif coalesce(web3, '') <> '' then
    select net.http_post(
      url := 'https://api.web3forms.com/submit',
      body := jsonb_strip_nulls(jsonb_build_object('access_key', web3, 'subject', p_assunto, 'from_name', 'Plataforma Marcos Zanette',
        'replyto', p_responder, 'message', p_texto)),
      headers := jsonb_build_object('Content-Type', 'application/json', 'Accept', 'application/json'),
      timeout_milliseconds := 15000) into req;
  end if;
  return req;
end $$;

create or replace function public.texto_dias(n int) returns text
language sql immutable set search_path = '' as $$
  select n || case when abs(n) = 1 then ' dia' else ' dias' end;
$$;

-- Resumo diário das demandas em andamento. Devolve o texto (ou o motivo de não enviar), para conferir no SQL Editor.
create or replace function public.demandas_resumo_diario(p_enviar boolean default true) returns text
language plpgsql security definer set search_path = '' as $$
declare
  hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  n int;
  vencidas int;
  blocos text;
  contagem text;
  assunto text;
  texto text;
  link text := 'https://mvzanette.github.io/area/demandas.html#acompanhamento';
begin
  with abertas as (
    select d.*,
      hoje - d.recebida_em as dias_aberta,
      hoje - coalesce(case d.etapa when 'proposta' then d.proposta_em when 'aprovada' then d.aprovada_em
                                   when 'execucao' then d.aprovada_em end, d.recebida_em) as dias_etapa,
      d.prazo - hoje as dias_prazo,
      case d.etapa when 'recebida' then 'Recebida' when 'proposta' then 'Proposta enviada'
                   when 'aprovada' then 'Aprovada' else 'Em execução' end as rotulo,
      case d.etapa
        when 'recebida' then 'Responder o cliente e levantar os dados para a proposta.'
        when 'proposta' then 'Cobrar o retorno do cliente sobre a proposta.'
        when 'aprovada' then case when d.art_id is null then 'Emitir a ART e agendar a execução do serviço.'
                                  else 'Agendar a execução do serviço.' end
        else case when d.art_id is null then 'Emitir a ART, concluir o serviço e entregar o laudo.'
                  else 'Concluir o serviço, entregar o laudo e lançar a receita.' end
      end as passo
    from public.demandas d
    where d.etapa in ('recebida', 'proposta', 'aprovada', 'execucao')
  ), ordenadas as (
    select a.*, row_number() over (order by coalesce(a.dias_prazo, 100000), a.dias_aberta desc, a.titulo) as ordem from abertas a
  )
  select count(*), count(*) filter (where dias_prazo < 0),
    string_agg(
      ordem || '. ' || titulo || coalesce(' · ' || coalesce(nullif(cliente, ''), contato), '')
        || coalesce(' (' || nullif(cidade, '') || coalesce('/' || uf, '') || ')', '') || E'\n'
        || '   Etapa: ' || rotulo || case when etapa <> 'recebida' then ' há ' || public.texto_dias(dias_etapa) else '' end
        || ' · ' || case when dias_aberta <= 0 then 'aberta hoje' else 'aberta há ' || public.texto_dias(dias_aberta) end
        || ' (desde ' || to_char(recebida_em, 'DD/MM') || ')' || E'\n'
        || coalesce('   Prazo: ' || case when dias_prazo < 0 then 'atrasado há ' || public.texto_dias(-dias_prazo)
                                         when dias_prazo = 0 then 'vence hoje'
                                         when dias_prazo = 1 then 'vence amanhã'
                                         else 'em ' || public.texto_dias(dias_prazo) end
                    || ' (' || to_char(prazo, 'DD/MM') || ')' || E'\n', '')
        || '   Próximo passo: ' || passo,
      E'\n\n' order by ordem)
    into n, vencidas, blocos
    from ordenadas;
  if n = 0 then
    return 'Nenhuma demanda em andamento: o resumo não foi enviado.';
  end if;
  select string_agg(r || ': ' || q, ' · ' order by o) into contagem
    from (select case etapa when 'recebida' then 'Recebidas' when 'proposta' then 'Propostas enviadas'
                            when 'aprovada' then 'Aprovadas' else 'Em execução' end as r,
                 count(*) as q, min(array_position(array['recebida', 'proposta', 'aprovada', 'execucao'], etapa)) as o
            from public.demandas where etapa in ('recebida', 'proposta', 'aprovada', 'execucao') group by etapa) t;
  assunto := 'RESUMO DIÁRIO DAS DEMANDAS – ' || n || ' em andamento'
    || case when vencidas > 0 then ', ' || vencidas || ' com prazo vencido' else '' end || ' (' || to_char(hoje, 'DD/MM') || ')';
  texto := 'Demandas em andamento em ' || to_char(hoje, 'DD/MM/YYYY') || '.' || E'\n' || contagem || E'\n\n'
    || blocos || E'\n\n'
    || 'Ver e atualizar na plataforma: ' || link || E'\n'
    || 'Este resumo chega todo dia enquanto houver demanda em andamento (de recebida até concluída ou não aprovada).';
  if p_enviar then
    perform public.enviar_aviso(assunto, texto,
      '<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#1b1d21;max-width:680px">'
      || '<div style="height:6px;background:#f5b800;margin-bottom:14px"></div>'
      || '<pre style="font-family:inherit;white-space:pre-wrap;margin:0 0 18px">' || public.html_esc(texto) || '</pre>'
      || '<a href="' || link || '" style="display:inline-block;background:#1b1d21;color:#fff;text-decoration:none;font-weight:bold;padding:10px 16px">Abrir as demandas</a></div>');
  end if;
  return assunto || E'\n\n' || texto;
end $$;

revoke all on function public.contato_para_demanda(), public.enviar_aviso(text, text, text, text),
  public.demandas_resumo_diario(boolean) from public, anon, authenticated;

-- Agenda do resumo: 10h UTC = 7h em Brasília
do $$ begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    begin
      create extension pg_cron;
    exception when others then
      raise notice 'pg_cron indisponível (%): sem o resumo diário automático.', sqlerrm;
    end;
  end if;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('resumo-diario-demandas', '0 10 * * *', 'select public.demandas_resumo_diario()');
  end if;
end $$;
