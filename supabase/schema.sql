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

-- Subcategoria e conta do gasto. Conta: pessoal (padrão), engenharia (trabalho autônomo) ou uma empresa
-- ("empresa:" seguido do id da empresa)
alter table public.financas_gastos add column if not exists subcategoria text;
alter table public.financas_gastos add column if not exists conta text
  check (conta is null or conta ~ '^(pessoal|engenharia|empresa:[0-9a-f-]{36})$');

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
  conta         text check (conta is null or conta ~ '^(pessoal|engenharia|empresa:[0-9a-f-]{36})$'),
  atualizado_em timestamptz not null default now(),
  unique (perfil_id, chave)
);

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
grant execute on function public.eh_adm(), public.pode(text), public.registrar_acesso(text, text),
  public.atualizar_meu_nome(text), public.pessoas_financas() to authenticated, service_role;

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
alter table public.empresas enable row level security;
alter table public.financas_preferencias enable row level security;
alter table public.financas_ajustes enable row level security;
alter table public.financas_desejos enable row level security;

-- Acesso pela API, mesmo em projetos criados sem expor tabelas novas
-- automaticamente. As políticas abaixo continuam decidindo quais linhas cada um vê.
grant usage on schema public to authenticated, service_role;
grant select, insert, update, delete
  on public.arts, public.alertas, public.demandas, public.lancamentos, public.perfis, public.financas, public.financas_gastos,
     public.empresas, public.financas_preferencias, public.financas_ajustes, public.financas_desejos
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
-- o administrador atualiza o painel de quem ele cuida (ex.: as faturas de alguém da família)
drop policy if exists "financas do proprio perfil" on public.financas;
create policy "financas do proprio perfil" on public.financas
  for all to authenticated
  using (
    (select public.eh_adm())
    or ((select public.pode('financas')) and perfil_id in (select id from public.perfis where user_id = auth.uid()))
  )
  with check (
    (select public.eh_adm())
    or ((select public.pode('financas')) and perfil_id in (select id from public.perfis where user_id = auth.uid()))
  );

drop policy if exists "gastos do proprio perfil" on public.financas_gastos;
create policy "gastos do proprio perfil" on public.financas_gastos
  for all to authenticated
  using (
    (select public.eh_adm())
    or ((select public.pode('financas')) and perfil_id in (select id from public.perfis where user_id = auth.uid()))
  )
  with check (
    (select public.eh_adm())
    or ((select public.pode('financas')) and perfil_id in (select id from public.perfis where user_id = auth.uid()))
  );

drop policy if exists "preferencias do proprio perfil" on public.financas_preferencias;
create policy "preferencias do proprio perfil" on public.financas_preferencias
  for all to authenticated
  using (
    (select public.eh_adm())
    or ((select public.pode('financas')) and perfil_id in (select id from public.perfis where user_id = auth.uid()))
  )
  with check (
    (select public.eh_adm())
    or ((select public.pode('financas')) and perfil_id in (select id from public.perfis where user_id = auth.uid()))
  );

drop policy if exists "ajustes do proprio perfil" on public.financas_ajustes;
create policy "ajustes do proprio perfil" on public.financas_ajustes
  for all to authenticated
  using (
    (select public.eh_adm())
    or ((select public.pode('financas')) and perfil_id in (select id from public.perfis where user_id = auth.uid()))
  )
  with check (
    (select public.eh_adm())
    or ((select public.pode('financas')) and perfil_id in (select id from public.perfis where user_id = auth.uid()))
  );

-- Desejos: de quem cadastrou e da outra pessoa do item (compra dela ou em conjunto)
drop policy if exists "desejos do proprio perfil ou compartilhados" on public.financas_desejos;
create policy "desejos do proprio perfil ou compartilhados" on public.financas_desejos
  for all to authenticated
  using (
    (select public.eh_adm())
    or ((select public.pode('financas')) and (perfil_id in (select id from public.perfis where user_id = auth.uid())
      or outra_id in (select id from public.perfis where user_id = auth.uid())))
  )
  with check (
    (select public.eh_adm())
    or ((select public.pode('financas')) and (perfil_id in (select id from public.perfis where user_id = auth.uid())
      or outra_id in (select id from public.perfis where user_id = auth.uid())))
  );

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

-- PDFs das finanças: cada pessoa na própria pasta (nome da pasta = id do perfil); o administrador em todas
drop policy if exists "pdfs das financas - ler" on storage.objects;
create policy "pdfs das financas - ler" on storage.objects
  for select to authenticated
  using (bucket_id = 'financas' and ((select public.eh_adm())
    or ((select public.pode('financas')) and (storage.foldername(name))[1] in (select id::text from public.perfis where user_id = auth.uid()))));

drop policy if exists "pdfs das financas - enviar" on storage.objects;
create policy "pdfs das financas - enviar" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'financas' and ((select public.eh_adm())
    or ((select public.pode('financas')) and (storage.foldername(name))[1] in (select id::text from public.perfis where user_id = auth.uid()))));

drop policy if exists "pdfs das financas - atualizar" on storage.objects;
create policy "pdfs das financas - atualizar" on storage.objects
  for update to authenticated
  using (bucket_id = 'financas' and ((select public.eh_adm())
    or ((select public.pode('financas')) and (storage.foldername(name))[1] in (select id::text from public.perfis where user_id = auth.uid()))));

drop policy if exists "pdfs das financas - apagar" on storage.objects;
create policy "pdfs das financas - apagar" on storage.objects
  for delete to authenticated
  using (bucket_id = 'financas' and ((select public.eh_adm())
    or ((select public.pode('financas')) and (storage.foldername(name))[1] in (select id::text from public.perfis where user_id = auth.uid()))));
