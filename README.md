# Marcos Zanette — Engenharia Mecânica

Site institucional estático (HTML + CSS + JS, sem servidor) para captação de clientes: laudo NR-12 de equipamentos móveis, gestão e eletrificação de frotas, manutenção industrial, laudos NR-13, PMOC e ART. O formulário de proposta chega por e-mail.

Custo: **R$ 0** (hospedagem no GitHub Pages + formulário pelo FormSubmit).

## Arquivos

| Arquivo | O que é |
| --- | --- |
| `config.js` | **Dados de contato** (e-mail, WhatsApp, CREA). Edite só este arquivo para trocar contatos. |
| `ferramentas/gerar_site.py` | **Todos os textos das páginas.** Gera os arquivos `.html` (ver "Alterar textos"). |
| `index.html`, `projetos.html`, `laudo-nr12.html`, `laudo-nr13.html`, `pmoc.html`, `obrigado.html`, `politica-de-privacidade.html` | Páginas geradas pelo script acima. Não edite à mão. |
| `tos-mecanica.js` | Tabela de Obras e Serviços (TOS) do CREA, área 16 (Mecânica), usada no formulário. |
| `styles.css` | Visual do site (fundo branco, grafite e amarelo industrial). |
| `main.js` | Menu do celular e formulário. Não precisa mexer. |
| `img/` | Fotos do site (ver "Fotos"). |
| `area-restrita.html`, `area/` | **Área restrita**: login, início com os módulos (Profissional e Pessoal), usuários e permissões (ver seção própria abaixo). |
| `supabase/schema.sql` | Estrutura do banco de dados da área restrita. |
| `ferramentas/alertas-art.mjs`, `.github/workflows/alertas-art.yml` | Rotina diária que envia por e-mail os alertas de ART, os prazos das demandas e os recebimentos em atraso. |
| `ferramentas/versionar_area.py` | Põe a versão nos endereços dos arquivos da área restrita (rode depois de alterar a área; ver "Testes locais"). |

## Fotos

Enquanto uma foto não existir, o site mostra um espaço reservado com um ícone. Para colocar a foto, salve o arquivo **com o nome exato abaixo** na pasta indicada. Uma mesma foto pode ser usada em mais de um lugar (basta copiar com outro nome).

| Arquivo | Onde aparece | Formato ideal |
| --- | --- | --- |
| `img/hero.jpg` | Faixa do topo da página inicial, à direita (o texto fica sobre o fundo preto, à esquerda) | Horizontal, 1600 px ou mais |
| `img/perfil.jpg` | Card "Sobre o profissional" (enquadrada no rosto; no celular aparece acima do texto) | Vertical (retrato) |
| `img/equipamentos.jpg` | Foto ao lado da lista "Equipamentos atendidos" (enquanto não existir, usa `img/servicos/insumos.jpg`) | Vertical ou quadrada |
| `img/projetos.jpg` | Faixa do topo da página Projetos (foto do pátio) | Horizontal, 1600 px ou mais |
| `img/servicos/laudo-nr12.jpg` | Destaque do Laudo NR-12 (página inicial e página Projetos) | Horizontal ou quadrada |
| `img/servicos/consultoria-frotas.jpg`, `eletrificacao.jpg`, `manutencao-industrial.jpg` | Cards de "Projetos" na página inicial: Consultoria para gestão de frotas, Eletrificação de frotas e Manutenção industrial. `eletrificacao` e `manutencao-industrial` também aparecem, em faixa larga, na página Projetos | Horizontal |
| `img/servicos/laudo-nr12.jpg`, `laudo-nr13.jpg`, `pmoc.jpg` | Faixa do topo das páginas Laudo NR-12, Laudo NR-13 e PMOC (gere as páginas de novo depois de incluir a foto) | Horizontal, 1600 px ou mais |

**Ilustrações:** os três cards de Projetos da página inicial (`consultoria-frotas.jpg`, `eletrificacao.jpg` e `manutencao-industrial.jpg`) usam ilustrações originais, no mesmo estilo, que também aparecem em faixa larga na página Projetos. Foram desenhadas para o site (sem direitos de terceiros). Os desenhos editáveis ficam em `ferramentas/ilustracoes/` (SVG). Para trocar por fotos próprias, basta salvar a foto com o mesmo nome; para gerar o JPG de novo a partir do SVG: `node ferramentas/ilustracoes/renderizar.cjs ferramentas/ilustracoes/eletrificacao.svg img/servicos/eletrificacao.jpg` (precisa do Playwright e do ImageMagick).

Use apenas fotos com direito de uso (próprias, com autorização, ou de bancos de imagem com licença comercial), de preferência sem logos de fabricantes ou placas em destaque.

**Nunca publique** laudos, fotos de laudos, números de série, placas ou códigos internos de clientes. Na foto do pátio (`img/projetos.jpg`), o número de frota do equipamento foi desfocado antes da publicação. A seção "Experiência" traz apenas descrições do tipo de trabalho, sem nomes de clientes.

## Alterar textos

Os textos ficam em `ferramentas/gerar_site.py`. Depois de editar, gere as páginas de novo, na pasta do site:

```
python3 ferramentas/gerar_site.py
```

Cabeçalho, formulário e rodapé são iguais em todas as páginas e saem do mesmo lugar no script.

## Formulário de proposta

- **Lista de serviços** (`SERVICOS_FORM` no script): cada opção leva o código TOS do CREA correspondente, que chega no e-mail junto com o pedido.
- **"Outro serviço – escolher na lista do CREA"** abre a lista completa da área de Mecânica em cascata (subárea → obra/serviço → complemento), a partir de `tos-mecanica.js` (Árvore TOS do CREA-RJ).
- Obrigatórios: nome, e-mail, WhatsApp, cidade, estado e serviço.

## 1. Publicar de graça no GitHub Pages

1. O repositório precisa ser **público** (no plano gratuito do GitHub).
2. Nome do repositório: `mzengenharia` (*Settings → General → Repository name → Rename*). O nome do repositório é o que aparece no endereço.
3. No GitHub: **Settings → Pages → Build and deployment**.
4. Em *Source*, escolha **Deploy from a branch**, selecione a branch principal do repositório (hoje `claude/exciting-curie-vngk32`) e a pasta `/ (root)`. Clique em **Save**.
5. Em 1 ou 2 minutos o site estará no ar em `https://mvzanette.github.io/mzengenharia/`.

A cada alteração enviada para essa branch, o GitHub publica a nova versão sozinho (leva 1 ou 2 minutos).

**Endereço mais curto:** renomeie o repositório para `mvzanette.github.io` (o site passa a ficar em `https://mvzanette.github.io/`) ou use um domínio próprio (passo 3).

### Ver o site no computador, sem publicar

1. No GitHub: **Code → Download ZIP** e descompacte.
2. Dê dois cliques em `index.html`: o site abre no navegador como um arquivo comum.

Nesse modo o formulário não envia e a área restrita não abre (o navegador bloqueia os módulos dela em arquivos locais). Para testar tudo, use o endereço do GitHub Pages.

## 2. Ativar o formulário (uma única vez)

O formulário usa o [FormSubmit](https://formsubmit.co), gratuito e sem cadastro.

1. Com o site no ar, envie o formulário uma vez.
2. O FormSubmit envia um e-mail pedindo **confirmação**. Clique em *Activate*.
3. A partir daí, cada solicitação chega no e-mail em formato de tabela, com o assunto `Solicitação de proposta: <serviço> – <nome>`. *Responder* responde direto ao cliente, que também recebe uma confirmação automática.
4. *(Opcional)* No e-mail de ativação vem um código aleatório. Cole em `formsubmitId` no `config.js` para esconder o e-mail do código do site.

**Se começar a chegar spam:** em `ferramentas/gerar_site.py`, troque `name="_captcha" value="false"` por `value="true"` e gere as páginas de novo.

## 3. Domínio próprio (recomendado, ~R$ 40/ano)

1. Registre o domínio em [registro.br](https://registro.br) (ex.: `marcoszanette.eng.br` ou `.com.br`).
2. No GitHub: **Settings → Pages → Custom domain**, digite o domínio e salve.
3. No registro.br, configure o DNS conforme a [documentação do GitHub Pages](https://docs.github.com/pt/pages/configuring-a-custom-domain-for-your-github-pages-site).
4. Marque **Enforce HTTPS**.

## 4. Para aparecer no Google

- **Perfil da Empresa no Google** (gratuito): [google.com/business](https://www.google.com/business/), com o link do site.
- **Google Search Console** (gratuito): [search.google.com/search-console](https://search.google.com/search-console), para indexar o site mais rápido.
- Link do site no LinkedIn, no WhatsApp Business e na assinatura de e-mail.

---

# Área restrita

Endereço: `area-restrita.html` (link discreto no rodapé do site; não aparece no Google).

## Como funciona

1. **Login** (`area-restrita.html`): usuário (e-mail) e senha. Tem "Esqueci a senha", que envia um link para criar uma senha nova.
2. **Início** (`area/index.html`): o índice da área, com saudação, data do último acesso e um card para cada módulo liberado ao perfil, em divisões:
   - **Profissional** (as funções da engenharia e as empresas onde você trabalha): Painel gerencial, Controle de ART, Controle financeiro, Finanças de cada empresa cadastrada e Controle de demandas;
   - **Pessoal**: Finanças pessoais (gastos e investimentos, de cada pessoa);
   - **Administração** (só o administrador): Usuários e permissões;
   - **Sua conta**: Minha conta.

   Cada card mostra o que pede atenção (alertas de ART, recebimentos em atraso, prazos vencidos, contas aguardando liberação).
3. **Menu** no alto de todas as páginas da área, com as mesmas divisões, "Voltar ao site" e **Sair**.
4. Qualquer página da área aberta sem login volta para a tela de login e, depois de entrar, retorna para a página pedida. Página de um módulo não liberado volta para o início com um aviso.

Módulos:

| Divisão | Módulo | Página |
| --- | --- | --- |
| Profissional | Painel gerencial | `area/painel.html` |
| Profissional | Controle de ART | `area/art.html` |
| Profissional | Controle financeiro (da engenharia) | `area/financeiro.html` |
| Profissional | Finanças das empresas (uma entrada por empresa) | `area/empresas.html` |
| Profissional | Controle de demandas | `area/demandas.html` |
| Pessoal | Finanças pessoais | `area/financas.html` |
| Administração | Usuários e permissões | `area/usuarios.html` |
| Sua conta | Minha conta | `area/conta.html` |

**Para incluir um módulo novo:** acrescente um item em `area/modulos.js` e crie a página na pasta `area/` (use `area/financeiro.html` como modelo: o cabeçalho, o menu, o login e a checagem de permissão vêm de `area/sessao.js`). Se o módulo guardar dados, crie a tabela e a política de acesso em `supabase/schema.sql`.

## Usuários e permissões

Perfis de acesso:

| Perfil | Para quem | O que acessa |
| --- | --- | --- |
| **Administrador** | você | Tudo, inclusive Usuários e permissões |
| **Pessoal** | família e pessoas próximas | Os módulos que você liberar; por padrão, Finanças pessoais |
| **Cliente** | clientes da engenharia | Os módulos que você liberar, **nunca** os profissionais (o banco bloqueia) |

- Os módulos profissionais mostram **os mesmos dados** para todos que têm permissão (não existe cópia separada por pessoa). Ex.: liberando o Controle financeiro para alguém, a pessoa vê os lançamentos da engenharia.
- A página **Usuários e permissões** tem três partes: **Usuários** (lista com perfil, módulos, situação, último acesso e número de visitas, com busca e filtros), **Perfis e permissões** (quadro do que cada perfil acessa) e **Histórico de acessos** (data, hora, página e aparelho de cada acesso, dos últimos 180 dias).
- **Situações:** ativo; aguardando 1º acesso (cadastrado, ainda não entrou); aguardando liberação (conta criada no Supabase sem cadastro no site); inativo (perde o acesso na hora). Sempre fica pelo menos um administrador ativo.
- Na primeira vez que o banco é usado, quem entra primeiro vira o administrador.

**Cadastrar alguém:**

1. Na área, **Usuários e permissões → Novo usuário**: nome, e-mail, perfil e módulos.
2. No Supabase, **Authentication → Users → Add user → Create new user**: o mesmo e-mail, uma senha provisória e **Auto Confirm User** marcado. O site mostra o botão que abre essa tela e uma mensagem pronta para enviar à pessoa (sem a senha, que vai em separado).
3. No primeiro acesso, a pessoa troca a senha em **Minha conta**.

**Se alguém esquecer a senha:** o "Esqueci a senha" só envia e-mail para quem faz parte da equipe do projeto no Supabase (o envio para outros endereços exige configurar um servidor de e-mail próprio, SMTP). Para os demais, exclua a conta da pessoa em **Authentication → Users** e crie de novo com o mesmo e-mail e uma senha provisória: o cadastro dela no site (perfil, módulos e histórico) se liga de novo sozinho no próximo acesso.

## Finanças pessoais

Separado do Controle financeiro da engenharia: é o **painel do projeto Financeiro** dentro da área, com as quatro abas do painel original (**visão geral** do mês, **gastos do dia a dia**, **cartão e faturas** e **investimentos**) e os mesmos cálculos.

- **Cada pessoa vê só o próprio painel.** Os dados ficam no banco, protegidos pelo login e pelas regras de acesso, e nunca no código do site (que é público).
- **Uso do dinheiro do mês:** a aba Gastos do dia a dia começa pela porcentagem das receitas do mês que já está gasta ou comprometida (investimento, cartão, Pix, débito, dinheiro e fixos que ainda vão cair), com a barra dividida por tipo e a marca de 85%. Logo abaixo vêm os alertas: a partir de **85% usado**, **saldo negativo** e os do cartão (fatura acima ou perto da sua previsão). Os mesmos alertas aparecem na visão geral.
- **Lançar gasto:** pelo botão da aba Gastos, com valor, descrição, data, categoria, forma de pagamento e, se quiser, essencial ou não. Os gastos lançados pelo site somam com os do projeto Financeiro (aparecem com a marca "lançado no site" e podem ser apagados ali):
  - **no cartão**, o gasto entra na fatura do mês; **parcelado**, cada parcela cai numa fatura e a compra aparece em "Compras parceladas a vencer";
  - Pix, débito e dinheiro saem do saldo do mês na hora;
  - se o mesmo gasto (mesma data e mesmo valor) já estiver no projeto Financeiro, ele não conta duas vezes.

  Os lançados aqui ficam no site e continuam valendo depois de cada importação; o projeto Financeiro no Claude não os recebe sozinho.
- **PDFs das faturas e relatórios:** na aba Cartão e faturas, **Enviar PDF** guarda o arquivo em armazenamento privado, numa pasta de cada pessoa (só PDF, até 20 MB; o site confere se o arquivo é mesmo um PDF antes de enviar). A lista tem **Abrir** (link temporário, válido por 10 minutos) e **Apagar**. O site guarda o PDF, mas não lê os valores dele: os números das faturas continuam vindo do projeto Financeiro.
- **Para atualizar os dados:** em Finanças pessoais, **Atualizar dados** e escolha o arquivo HTML do painel gerado pelo projeto Financeiro (o mesmo arquivo do painel; se precisar, peça no chat do projeto). O site lê os dados do arquivo, mostra um resumo e grava. A lista de arquivos do computador e as anotações internas do arquivo não são importadas. Esse botão não recebe PDF (para PDFs, use Enviar PDF).
- **Faturas de outra pessoa e carteira conjunta:** quando o arquivo traz as faturas de alguém da família, o administrador escolhe na importação o painel dessa pessoa; ela passa a ver só o próprio cartão e as próprias faturas, sem nenhum dado do dono do painel. Com **"Mostrar também a carteira de investimentos"** marcado, a carteira conjunta (com os aportes mensais de cada um) vai junto e aparece na aba Investimentos dessa pessoa.
- **Abrir no Claude** (opcional): a leitura de faturas novas continua no painel original. Cadastre o link do painel no Claude no cadastro da pessoa, em Usuários e permissões.

**Classificar os lançamentos.** Cada lançamento (gastos do dia a dia, lançamentos das faturas e gastos lançados no site) tem o botão **Classificar**, sempre com a lista de opções:

- **Categoria e subcategoria** (ex.: Saúde › Farmácia), escolhidas na lista da pessoa; "Nova categoria…" e "Nova subcategoria…" acrescentam na hora;
- **Essencial**, **não essencial** ou o padrão (o que veio do projeto ou, sem isso, o padrão da categoria);
- **Conta**, de quem é o dinheiro: **pessoal**, **engenharia (autônomo)** ou uma das **empresas** cadastradas;
- **Complemento**: um texto livre, por exemplo "PlayStation 5 comprado no Mercado Livre" para uma cobrança que aparece na fatura só como MERCADOLIVRE.

A classificação fica no site e continua valendo depois de cada importação (o arquivo do projeto Financeiro não muda). "Voltar ao original" desfaz. As análises usam os valores ajustados: por categoria (com as subcategorias), essencial e não essencial, e o total por conta quando há lançamentos fora da conta pessoal. Na mesma compra parcelada, a classificação vale para todas as parcelas.

**Lista de categorias.** O botão **Categorias** (nas abas Gastos e Cartão) abre a lista de cada pessoa: renomear (os lançamentos já classificados e os que vêm do projeto com o nome antigo passam para o novo), apagar, criar, acrescentar ou tirar subcategorias e marcar o padrão de cada categoria (essencial, não essencial ou depende). A primeira lista junta uma lista padrão às categorias que aparecem nos dados.

**Lista de desejos.** Aba própria, para cada pessoa:

- cada desejo tem valor, prioridade (1 urgente a 5 algum dia), quem compra (você, a outra pessoa ou **em conjunto**, com a sua parte), à vista ou parcelado no cartão, até quando quer comprar, quanto já está guardado, categoria, link e observação;
- **Quanto guardar por mês**: um valor para os seus desejos, um para os em conjunto (os dois juntos) e um para os da outra pessoa. A sugestão usa a previsão do painel: a sobra de cada mês (receitas menos investimento, cartão e gastos fixos) menos o gasto médio fora do cartão;
- **Quando dá para comprar**: na ordem de prioridade, guardando o valor do plano; à vista, quando o guardado alcança o valor; parcelado, quando a parcela cabe no plano. Para cada desejo com data, mostra quanto guardar por mês para chegar lá;
- **Projeção de 12 meses**: o que fica livre em cada mês, as compras previstas e quanto ainda cabe no cartão para ficar na sua previsão, já contando as parcelas das compras planejadas;
- o desejo em conjunto ou da outra pessoa aparece também para ela (só esses; os seus continuam só seus). "Comprei" tira da lista e guarda em "Comprados".

## Finanças das empresas

Uma página para cada empresa com que você tem movimento financeiro (onde trabalha, ou que paga as ARTs que você tira), com entrada própria no menu e card no início. Os **nomes das empresas ficam só no banco**: o código do site é público e não cita nenhuma empresa. Cadastre, renomeie ou remova pelo botão **Empresas** da página.

- **Lançamentos com a empresa:** receita é o que a empresa paga a você (reembolso, taxa de ART, salário, bônus); despesa é o que você pagou pela empresa ou para ela. Com vencimento, recebido em, situação (a receber, atrasado), resumo mensal e exportação em planilha, como no Controle financeiro, mas separado dele: não entra no lucro da engenharia nem no painel gerencial.
- **ARTs tiradas para a empresa:** as ARTs marcadas com ela no Controle de ART, com a taxa e um botão para lançar o reembolso.
- **Pagos com o seu dinheiro:** os lançamentos das Finanças pessoais que você marcou com a conta da empresa (ex.: um hotel pago no seu cartão). "Lançar a receber" cria o valor a cobrar; depois aparece "já lançado".
- Empresa com lançamentos não pode ser removida (os lançamentos iriam para a engenharia). Remover uma empresa deixa as ARTs dela sem empresa.

## Painel gerencial

Fica em `area/painel.html`. Cada bloco aparece só para quem tem permissão no módulo correspondente. Escolha o período no alto (este ano, este mês, últimos 12 meses, ano anterior ou todo o período). Cada indicador leva ao recurso correspondente.

- **ARTs:** ativas, próximas do vencimento (fim previsto nos próximos 45 dias), vencidas sem baixa e alertas pendentes.
- **Financeiro:** lucro líquido (com a margem), total recebido, gastos totais, a receber, em atraso e ticket médio. Os valores do período seguem o regime de caixa: contam a data em que o dinheiro foi recebido ou pago.
- **Demandas:** em aberto, propostas aguardando resposta (com o valor), taxa de aprovação das propostas, carteira aprovada (aprovadas e em execução) e prazos vencidos.
- **Gráfico** do recebido e do gasto por mês (com "Ver em tabela"), **receita por tipo de serviço** e listas de ARTs a vencer, prazos das demandas e recebimentos em atraso.

## Controle financeiro

O dinheiro da engenharia que você faz por conta própria (autônomo). Os lançamentos com as empresas ficam nas páginas delas.

- **Receitas e despesas** com categoria, cliente ou fornecedor, valor, data do serviço, vencimento, data de recebimento/pagamento e forma de pagamento.
- **Pagos com o seu dinheiro:** os lançamentos das Finanças pessoais marcados com a conta "engenharia (autônomo)", com o botão para lançar como despesa da engenharia.
- **Ligação com a ART e com a demanda:** ao escolher a ART, a receita puxa o cliente e o valor do contrato; a despesa "Taxa de ART" puxa a taxa. Dentro de cada ART e de cada demanda há botões para lançar a receita ou a taxa direto.
- **Situação automática:** recebido/pago, a receber/a pagar e atrasado (vencimento passado sem recebimento).
- **Resumo mensal** (recebido, gastos e resultado de cada mês) e **exportação em planilha**.
- Valores podem ser digitados como `2.800`, `2.800,50` ou `2800`.

## Controle de demandas

- Cada **solicitação de cliente**, com serviço, cliente, contato, cidade, origem (site, WhatsApp, e-mail, telefone, indicação), valor da proposta e ART vinculada.
- **Etapas:** recebida → proposta enviada → aprovada → em execução → concluída (ou não aprovada). Ao mudar a etapa, a data correspondente é registrada.
- **"Colar e-mail do site":** cole o e-mail que o formulário do site envia e os dados do cliente e do serviço são preenchidos sozinhos.
- **Prazos e lembretes:** o prazo aparece no painel e no e-mail diário (na véspera, no dia e uma vez por semana enquanto estiver atrasado).
- Bloco **Financeiro** em cada demanda, com o que já foi recebido e o que falta receber, e **exportação em planilha**.

## Controle de ART

- **Importa PDFs com leitura automática** (só PDF, até 20 MB por arquivo): ART individual do CREA-MG e do CREA-RJ, e o relatório "ARTs (Todas)" do CREA-MG (várias ARTs de uma vez). O CREA-SP ainda não tem leitor (falta um PDF de exemplo); por enquanto, cadastre manualmente.
- **Quadro de ARTs:** ativas, que vencem em até 30 dias, vencidas sem baixa e baixadas, com busca e filtros por CREA, situação e para quem foi tirada.
- **Tirada para:** uma **empresa** cadastrada (ela paga a taxa; os lançamentos da ART vão para a página da empresa) ou um **cliente particular** seu (o serviço e a taxa ficam no Controle financeiro da engenharia). Aparece na coluna "Para", no filtro, na exportação e, na importação de PDFs, dá para marcar todas as ARTs do arquivo de uma vez.
- **Alertas** na plataforma (sino) e por e-mail, com base no **fim previsto** da ART:
  - 30 dias antes: "Daqui a 30 dias a ART nº … do cliente … vencerá (fim previsto em …)."
  - 7 dias antes e no dia;
  - depois de vencida, uma vez por semana até a baixa ser registrada.
- **Ajuda na decisão:** para serviço pontual (laudo, vistoria, projeto), pergunta se foi concluído; para serviço contínuo (PMOC, manutenção), pergunta se o contrato foi renovado. Indica se é caso de dar baixa, de emitir nova ART ou de ajustar a data.
- **Registro de baixa**, vínculo entre a ART anterior e a nova (renovação) e **"Copiar dados para nova ART"**, para colar no portal do CREA.
- **Exportação em planilha (CSV)**, que também serve como cópia de segurança.

A emissão e a baixa da ART continuam sendo feitas no portal de cada CREA. Nenhum dos três CREAs oferece integração oficial para sistemas externos; por isso a plataforma trabalha com os PDFs.

## Modo demonstração

Enquanto `area/config-area.js` estiver vazio, a área restrita funciona em **modo demonstração**: a tela de login aparece, mas **qualquer usuário e senha entram**; os dados ficam só no navegador em uso e os e-mails não são enviados. Serve para testar as telas. O acesso só fica protegido de verdade depois de ativar o Supabase (abaixo).

## Ativar de verdade (uma única vez, ~20 minutos)

### 1. Supabase (banco de dados e login – gratuito)

1. Crie a conta em [supabase.com](https://supabase.com) e um projeto (região **South America (São Paulo)**). Guarde a senha do banco.
2. Em **SQL Editor**, cole todo o conteúdo de `supabase/schema.sql` e clique em **Run** (com o seletor ao lado do botão em **Primary Database**). Depois de atualizações do site, rode de novo: o script só cria ou ajusta o que falta e não apaga dados. Se a área mostrar "O banco de dados precisa ser atualizado", é este passo.
3. Em **Authentication → Users → Add user**, crie o seu usuário (e-mail e senha, marcando *Auto Confirm User*). No primeiro login, ele vira o administrador da área.
4. Em **Authentication → Sign In / Providers**, **desative "Allow new users to sign up"**: assim ninguém mais consegue criar conta.
5. Em **Authentication → URL Configuration**:
   - *Site URL*: `https://mvzanette.github.io/mzengenharia/`;
   - *Redirect URLs* → **Add URL**: `https://mvzanette.github.io/mzengenharia/area-restrita.html` (para onde volta o link de "Esqueci a senha").
6. Em **Project Settings → API Keys**, copie:
   - **Project URL** e a chave **Publishable** (`sb_publishable_…`, ou a **anon public** nos projetos antigos) → cole em `area/config-area.js`;
   - a chave **Secret** (`sb_secret_…`, ou a **service_role** nos projetos antigos) → **não** coloque no site; ela vai só para o GitHub (passo 3).

### 2. Resend (envio dos e-mails – gratuito até 3.000/mês)

1. Crie a conta em [resend.com](https://resend.com) com o e-mail que vai receber os alertas.
2. Em **API Keys**, crie uma chave e copie.
   Sem domínio próprio, o Resend envia apenas para o e-mail da própria conta, o que basta para os alertas.

### 3. GitHub (rotina diária)

Em **Settings → Secrets and variables → Actions**:

- aba **Secrets** → *New repository secret*: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY` e `ALERTA_EMAIL` (o e-mail que recebe os alertas);
- aba **Variables** → `ALERTA_LINK` = `https://mvzanette.github.io/mzengenharia/area/art.html` (link do e-mail; se não houver login, pede a senha e depois abre o Controle de ART).

Para testar na hora: **Actions → Alertas de ART → Run workflow**. Depois disso a rotina roda todo dia às 8h (Brasília).

Observações:

- A rotina agendada roda a partir da branch principal do repositório.
- Em repositório público, o GitHub pausa rotinas agendadas depois de 60 dias sem nenhuma alteração no repositório. Ele avisa por e-mail antes; basta clicar em **Enable workflow** em *Actions*.
- A execução diária também mantém o projeto do Supabase ativo (o plano gratuito pausa projetos parados por uma semana).

## Segurança e privacidade

- O código do site é público, mas os dados não: ficam no Supabase, protegidos pelo login e por regras de acesso no banco. Só entra quem tem cadastro ativo, cada módulo só abre para quem tem permissão e clientes nunca acessam os módulos profissionais. Os PDFs ficam em armazenamento privado.
- As finanças pessoais ficam no banco, um painel por pessoa: só a própria pessoa e o administrador (que faz a importação) acessam. A carteira de investimentos conjunta aparece só nos painéis em que o administrador a incluiu. Os gastos lançados, a classificação, a lista de categorias e os PDFs das finanças seguem a mesma regra (cada pessoa só os próprios). Um desejo de compra aparece também para a pessoa que vai comprar ou dividir a compra. Nenhum valor, nome ou cartão fica no código do site.
- Os nomes das empresas e dos clientes ficam só no banco, e as finanças das empresas só abrem para quem tem esse módulo (nunca para clientes).
- Os espaços de arquivos (PDFs das ARTs e das finanças) só aceitam PDF, até 20 MB.
- **Nunca** coloque PDFs de ART, relatórios ou planilhas exportadas dentro do repositório (o `.gitignore` já bloqueia `.pdf`, `.csv` e `.xlsx`).
- A chave Secret (`sb_secret_…` ou `service_role`) dá acesso total ao banco: guarde-a só nos *Secrets* do GitHub, no `SUPABASE_SERVICE_ROLE_KEY`.

## Testes locais

```
node ferramentas/alertas-art.mjs --teste   # simula o e-mail do dia com dados fictícios
python3 ferramentas/versionar_area.py      # depois de alterar arquivos da área restrita, antes de publicar
```

O `versionar_area.py` atualiza, em cada página da área, a versão dos estilos e dos módulos (import map). Assim, depois de publicar, o navegador busca os arquivos novos de uma vez, sem misturar com cópias antigas em cache. O GitHub Pages ainda guarda as páginas por até 10 minutos: se a área parecer antiga logo depois de publicar, aperte **Ctrl+F5**.
