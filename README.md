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

   Cada card mostra o que pede atenção (ARTs que precisam de baixa ou ação, alertas de ART, recebimentos em atraso, prazos vencidos, lançamentos a classificar, contas aguardando liberação).

   **Tarefas pendentes:** ao entrar no sistema, uma janela mostra o que espera uma decisão de quem está usando, cada item com o botão para a página onde se resolve: **lançamentos a classificar** no próprio painel de finanças (vale para cada pessoa, inclusive quem só tem as finanças), **ARTs que precisam de baixa ou ação** e **documentos do caixa a aprovar**. Ela abre uma vez por sessão do navegador sempre que houver alguma tarefa (fechou o navegador, abre de novo na próxima entrada) e não aparece quando não há nada. Uma faixa no início lembra as tarefas e reabre a janela. A página de finanças também abre a janela quando a pessoa entra direto nela.
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
- No cadastro de quem usa as finanças pessoais, **Finanças em casal com** liga duas pessoas: cada uma passa a ver e alterar as finanças pessoais da outra. Vale nos dois sentidos; "Ninguém" desliga para os dois.
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

- **Cada pessoa vê só o próprio painel**, a não ser quem forma casal nas finanças (abaixo). Os dados ficam no banco, protegidos pelo login e pelas regras de acesso, e nunca no código do site (que é público).
- **Finanças em casal:** com o casal ligado em Usuários e permissões, aparece no topo a escolha do painel: **o seu**, **o da outra pessoa** e **Casal**.
  - No painel de cada um, os dois veem tudo e podem alterar tudo: lançar gastos, Pix e entradas, importar extrato, processar faturas, classificar, mudar categorias, desejos e PDFs. O que se faz ali vale para o dono do painel.
  - **Casal** mostra o mês dos dois lado a lado, com os mesmos cálculos dos painéis: entradas, investimento, cartão, gastos fora do cartão, fixos e saldo de cada um e do casal, os totais do casal, a carteira de investimentos e as entradas de cada um. Transferências entre os dois (como o investimento na conta conjunta) contam como saída de quem transfere.
- **Visão geral de cada mês, numa base só: o que entra e sai da conta.**
  - **Balanço do mês:** o dinheiro que entra e sai da conta, pela data em que entra ou sai, separado em **realizado** (com data até hoje) e **previsto**: entradas, **gastos pagos no mês** (a fatura do cartão que vence no mês, com o período das compras dela, Pix, débito, dinheiro e fixos fora do cartão) e **investimento**. Para o mês atual, mostra quanto entrou e saiu até hoje.
    - Entradas: pela data do recebimento.
    - Fatura do cartão: inteira, na data de vencimento. As compras no cartão só mexem no caixa quando a fatura é paga; as de outubro entram na fatura que vence em novembro.
    - Pix, débito e dinheiro: na data do gasto.
    - Também saem os fixos fora do cartão, os pagamentos recorrentes ainda não pagos e o investimento do mês. O que é lançado na categoria **Investimentos** (o Pix para a corretora, por exemplo) sai como investimento, não como gasto, e a previsão de investimento do projeto conta só no que ainda não foi lançado.
    - A fatura que ainda não fechou é prevista pelas parcelas agendadas, pelas compras no cartão lançadas no mês da compra e pelos fixos. A aberta vem do print do app ou da prévia importada. Sem a data, o vencimento é o dia de vencimento da última fatura.
    - **Saldo em conta no início do mês:** você informa o saldo da conta no dia 1º de um mês. Os meses seguintes continuam a partir dele (saldo do fim do mês anterior), e dá para corrigir qualquer mês. Sem ele, o caixa mostra só as entradas e as saídas do próprio mês.
    - As entradas marcadas como **repete todo mês** ficam previstas nos meses seguintes, no mesmo dia do mês, até a próxima ser lançada.
  - **Gastos pagos no mês:** a mesma conta do balanço, sem o investimento, por forma de pagamento e por categoria. A fatura que vence no mês entra com os lançamentos dela, com as mesmas categorias da aba Cartão e faturas (inclusive as parcelas de compras antigas). Da fatura que ainda não fechou, entram as compras no cartão do mês da compra, as parcelas agendadas e os fixos no cartão que vão cair; o que o total visto no app tem a mais fica como **não detalhado**, até a fatura ou a prévia ser importada com os lançamentos. Cada categoria abre nas subcategorias, e cada subcategoria nos gastos dela (**Expandir tudo** abre todas).
  - **Comprado no mês:** tudo o que foi comprado no mês, pela data da compra e pelo valor inteiro. A compra parcelada entra com o total (10x de R$ 100 = R$ 1.000), com a lista das parceladas (quantas parcelas, de quanto e a fatura da primeira). O que foi no cartão vai para a fatura seguinte e entra nos gastos pagos do mês em que ela vence. Um **ajuste** do projeto Financeiro (compras no cartão somadas sem o detalhe) aparece com um aviso.
  - **Pagamentos recorrentes:** os gastos fixos do projeto Financeiro e os cadastrados no site (aluguel, condomínio, escola, assinaturas), com o nome, o valor de todo mês, o dia do vencimento, a forma de pagamento, a categoria, a conta, o primeiro e o último mês. Em cada mês eles ficam **pendentes** até serem marcados como pagos: a marca abre o lançamento do gasto já preenchido (valor, data e forma para conferir) e, ao lançar, o pagamento fica marcado. Desmarcar apaga esse gasto. O valor de um recorrente do site dá para mudar só num mês (a conta de luz, por exemplo), sem mudar os outros meses. No cartão, a cobrança que aparece nos lançamentos com o mesmo nome conta como lançada sozinha. Os recorrentes também ficam na aba Cadastros, para criar, editar e apagar.
- **Fechamento do mês (aba Gastos do dia a dia):** começa pelo valor em R$ que **ainda pode gastar** no Pix, no débito e no dinheiro, que é o saldo previsto do caixa no fim do mês, com quanto cabe por dia. Logo abaixo vêm:
  - as entradas e as saídas do caixa (pagas e previstas) e as compras do mês (pela data, como na lista de lançamentos);
  - a barra das saídas por tipo, com a marca de 85%;
  - o aviso da fatura em que entram as compras no cartão do mês;
  - o gráfico **Saldo na conta, dia a dia**: realizado até hoje e previsto tracejado, com os valores de cada dia ao passar o mouse (ou com as setas do teclado) e uma tabela.

  No gráfico de gasto por dia, a linha tracejada mostra quanto cabe por dia até o fim do mês. Depois vêm os alertas: **caixa negativo**, saídas a partir de **85%** do que há no caixa e os do cartão (fatura acima ou perto da sua previsão). Os mesmos alertas aparecem na visão geral. A previsão dos próximos meses, a comparação com a sua previsão e a visão do casal usam o mesmo caixa: em cada mês sai a fatura que vence nele.
- **Lançar gasto ou Pix:** pelo botão no topo da página (em qualquer aba) ou na aba Gastos, com valor, descrição, data, categoria, forma de pagamento (cartão, Pix, débito, dinheiro ou boleto) e, se quiser, essencial ou não. Na mesma visita, o próximo lançamento já abre na forma de pagamento do anterior. Os gastos lançados pelo site somam com os do projeto Financeiro (aparecem com a marca "lançado no site" e podem ser apagados ali):
  - **no cartão**, o gasto entra na fatura do mês; **parcelado**, cada parcela cai numa fatura e a compra aparece em "Compras parceladas a vencer";
  - Pix, débito e dinheiro saem do saldo do mês na hora;
  - se o mesmo gasto (mesma data e mesmo valor) já estiver no projeto Financeiro, ele não conta duas vezes.

  Os lançados aqui ficam no site e continuam valendo depois de cada importação; o projeto Financeiro no Claude não os recebe sozinho.
- **Lançar entrada:** pelo botão no topo ou na visão geral.
  - **Salário (holerite):** o bruto e cada desconto com o nome e o valor (INSS, IRRF, plano de saúde, coparticipação, previdência etc.; os mais comuns já vêm com o nome). O líquido é calculado e dá para corrigir se o holerite tiver outro valor.
  - **Outro recebimento:** recebimentos por fora, com a conta (de quem é o dinheiro) quando houver mais de uma.
  - **Como é esse recebimento?** O formulário pergunta como é cada entrada:
    - **trabalho o mês e recebo depois:** como o salário, que cai até o dia 10 do mês seguinte; o mês de trabalho é o anterior ao recebimento;
    - **recebo antes e uso no mês:** como o ticket alimentação, que cai no dia 1º; o mês de trabalho é o próprio;
    - **avulso:** sem mês de trabalho.

    O mês de trabalho dá para trocar, e **repete todo mês** põe a entrada na previsão dos meses seguintes. No fluxo de caixa, cada entrada lançada tem a mesma caixa de seleção para corrigir depois.

  A entrada soma no caixa do mês em que entrou. O salário lançado substitui o do projeto Financeiro no mesmo mês (que às vezes é só uma estimativa), e outro recebimento igual a um do projeto no mesmo mês não conta duas vezes. Na visão geral, o salário lançado aparece com o bruto e os descontos, e cada entrada lançada pelo site pode ser apagada.
- **Importar extrato:** traz de uma vez os Pix, débitos, boletos e saques do mês. Use o arquivo **OFX** que o app ou o internet banking do banco exporta (em Extrato, "Exportar" ou "Salvar em OFX") ou o **CSV da conta do Nubank**. O arquivo é lido no navegador e não fica guardado. Antes de gravar, a lista mostra cada saída com a forma de pagamento e a categoria sugerida, e dá para desmarcar o que não for gasto. Já vêm desmarcados:
  - o pagamento da fatura do cartão (as compras já estão na fatura);
  - aplicações e investimentos;
  - transferências entre contas próprias;
  - o que já está no painel (mesmo valor, com até um dia de diferença), inclusive um Pix lançado à mão, e as saídas de um extrato que já foi importado.

  As entradas do extrato não entram. As saídas marcadas viram gastos lançados pelo site, que podem ser classificados ou apagados depois. O extrato em PDF ainda não é lido.
- **PDFs das faturas e relatórios:** na aba Cartão e faturas, **Enviar PDF** guarda o arquivo em armazenamento privado, numa pasta de cada pessoa (só PDF, até 20 MB; o site confere se o arquivo é mesmo um PDF antes de enviar). A lista tem **Processar**, **Abrir** (link temporário, válido por 10 minutos) e **Apagar**.
- **Faturas do Nubank em PDF:** o site lê a fatura no próprio navegador e atualiza o cartão. Ao enviar o PDF, a leitura já abre; depois, o botão **Processar** lê de novo. Antes de gravar, uma prévia mostra:
  - o mês, o vencimento, o período das compras e o total;
  - se a soma dos lançamentos confere com o total;
  - as parcelas a vencer, os pontos de atenção e a lista dos lançamentos com a categoria sugerida.

  O cartão é escolhido pelo nome do titular (o seu ou o da outra pessoa do painel), e o administrador pode atualizar junto o painel dessa pessoa. A leitura monta a análise da fatura igual à do projeto Financeiro:
  - à vista, parcelas e encargos (o IOF e os juros do Pix ou boleto pagos no crédito);
  - categorias, sugeridas pelo que a pessoa já classificou no mesmo estabelecimento e, sem isso, por regras genéricas;
  - postos de combustível;
  - pontos de atenção: cobrança repetida, várias no mesmo dia, juros no crédito e compra parcelada nova;
  - compras parceladas a vencer e o quanto já está comprometido em cada fatura seguinte.

  A fatura do mesmo mês é substituída, e a classificação feita no site continua valendo, inclusive nas próximas parcelas da mesma compra. Na fatura seguinte (PDF ou fatura parcial), cada lançamento ainda sem classificação no site pega a da fatura anterior: a próxima parcela da mesma compra leva a categoria, a subcategoria, o essencial, a conta e o complemento; uma compra nova no mesmo estabelecimento leva a categoria, a subcategoria, o essencial e a conta. A prévia avisa quantos lançamentos herdaram a classificação. Na lista de PDFs, o arquivo já lido aparece com a fatura que gerou. Faturas de outros bancos continuam vindo do projeto Financeiro (cada banco novo precisa de um PDF de exemplo para ganhar leitor).
- **Fatura parcial (CSV ou OFX do app):** a fatura que ainda não fechou, e as próximas, entram por **Importar fatura parcial**, no quadro de PDFs. No app do Nubank, abra a fatura e exporte em CSV ou OFX. O arquivo é lido no navegador e não fica guardado. A prévia mostra o período das compras, o total até agora, o que é compra à vista ou primeira parcela e o que são parcelas de compras anteriores. A fatura vem do vencimento no nome do arquivo (dá para trocar), e o cartão é escolhido pelo banco. Um arquivo do Nubank não entra no cartão de outro banco, porque o painel guarda um cartão por pessoa. A prévia vira a fatura aberta da aba Cartão e faturas, com os gastos no cartão lançados depois dela. As próximas faturas aparecem na linha do tempo do cartão, e as parcelas de cada mês passam a vir da prévia. Quando a fatura fecha e o PDF é lido, a prévia sai. O extrato da conta recusa o CSV e o OFX do cartão e indica este botão.
- **Conferência dos gastos do dia a dia com o cartão:** cada compra das faturas conhecidas (as fechadas e as prévias) é procurada nos gastos do dia a dia, pelo mesmo valor e com até 3 dias de diferença. Um gasto lançado em outra forma conta só se for do mesmo dia e tiver o nome parecido. A compra que não está lá entra nos gastos do mês da compra, marcada **da fatura** e com a classificação da fatura. As parcelas de compras antigas ficam nas parcelas do mês, não nos gastos. Na lista de lançamentos aparecem marcados:
  - **não achado na fatura:** o gasto no cartão dentro do período de uma fatura que não aparece nela;
  - **está na fatura:** o lançado como Pix, débito ou dinheiro que está na fatura do cartão;
  - **vai entrar na fatura:** o gasto no cartão lançado depois da última compra conhecida;
  - **conferido na fatura:** o gasto que bate com a fatura.

  O quadro **Conferência com o cartão** mostra o que cada fatura trouxe e os avisos do mês, com **Ver na lista**; o filtro **Conferência** separa cada grupo. O ajuste de "gastos no cartão não anotados" de um período que a fatura detalha sai, porque a fatura traz cada compra.
- **Para atualizar os dados:** em Finanças pessoais, **Atualizar dados** e escolha o arquivo HTML do painel gerado pelo projeto Financeiro (o mesmo arquivo do painel; se precisar, peça no chat do projeto). O site lê os dados do arquivo, mostra um resumo e grava. A lista de arquivos do computador e as anotações internas do arquivo não são importadas. As faturas lidas pelo site que o arquivo não traz continuam no painel; se o arquivo trouxer o mesmo mês, vale o do arquivo. Esse botão não recebe PDF (para PDFs, use Enviar PDF).
- **Faturas de outra pessoa e carteira conjunta:** quando o arquivo traz as faturas de alguém da família, o administrador escolhe na importação o painel dessa pessoa; ela passa a ver só o próprio cartão e as próprias faturas, sem nenhum dado do dono do painel. Nesse painel, a pessoa também lança os próprios recebimentos (salário e outros), gastos e Pix, e pode importar o extrato da conta dela: com isso aparecem a visão geral do mês e os gastos do dia a dia, calculados só com o que ela lançou e com o cartão dela. Com **"Mostrar também a carteira de investimentos"** marcado, a carteira conjunta (com os aportes mensais de cada um) vai junto e aparece na aba Investimentos dessa pessoa.
- **Abrir no Claude** (opcional): a leitura das faturas que o site não lê continua no painel original. Cadastre o link do painel no Claude no cadastro da pessoa, em Usuários e permissões.

**Classificar os lançamentos.** Cada lançamento (gastos do dia a dia, lançamentos das faturas e gastos lançados no site) tem o botão **Classificar**, sempre com a lista de opções. Na visão geral, cada lançamento das categorias de "Gastos pagos" e da lista de "Comprado em" tem o botão **Editar**, que abre a mesma classificação: depois de salvar, a categoria nova abre com o lançamento em destaque.

- **Categoria e subcategoria** (ex.: Saúde › Farmácia), escolhidas na lista da pessoa; "Nova categoria…" e "Nova subcategoria…" acrescentam na hora;
- **Essencial**, **não essencial** ou o padrão (o que veio do projeto ou, sem isso, o padrão da categoria);
- **Conta**, de quem é o dinheiro: **pessoal** de quem é o painel, **pessoal da outra pessoa** do casal, **compartilhado do casal**, **engenharia (autônomo)**, uma das **empresas** cadastradas ou empresas **unidas numa conta só** (aba Cadastros);
- **Observação**: um texto livre, por exemplo "PlayStation 5 comprado no Mercado Livre" para uma cobrança que aparece na fatura só como MERCADOLIVRE. Ela aparece embaixo do lançamento nas listas.

A classificação fica no site e continua valendo depois de cada importação (o arquivo do projeto Financeiro não muda). "Voltar ao original" desfaz. As análises usam os valores ajustados: por categoria (com as subcategorias), essencial e não essencial, e o total por conta quando há lançamentos fora da conta pessoal. Na mesma compra parcelada, a classificação vale para todas as parcelas.

- **Nenhum lançamento em "Outros":** a categoria fica só para o ajuste de gastos no cartão não detalhados. O que vem sem categoria ou em Outros (da fatura, do projeto ou lançado no site) aparece como **A classificar**, com a marca "a classificar" nas listas, e não dá para escolher Outros ao classificar nem ao lançar.
- **Compra e gasto com a mesma classificação:** a compra da fatura e o gasto do dia a dia conferido com ela são o mesmo lançamento. Classificar um vale para o outro (as duas classificações são gravadas), e um gasto lançado no site já classificado classifica a compra da fatura quando ela chega.
- **Lançamentos a classificar:** no topo da página, a lista de tudo o que está a classificar no painel aberto, cada lançamento uma vez só. Escolha a categoria e a subcategoria e salve um por um ou **Salvar os escolhidos**; **Mais opções** abre o diálogo completo. Quando a lista zera, aparece "Tudo classificado". As tarefas pendentes levam direto para ela (`financas.html#classificar`).

**Cadastros.** Última aba do menu, ao lado de Visão geral, Gastos do dia a dia, Cartão e faturas, Investimentos e Lista de desejos (os botões **Categorias** das abas Gastos e Cartão levam para ela):
- **Categorias e subcategorias:** a lista de cada painel. Dá para renomear (os lançamentos já classificados e os que vêm do projeto com o nome antigo passam para o novo), apagar, criar, acrescentar ou tirar subcategorias e marcar o padrão de cada categoria (essencial, não essencial ou depende). A primeira lista junta uma lista padrão às categorias que aparecem nos dados. As mudanças ficam na tela até **Salvar categorias**; **Desfazer mudanças** volta ao que está salvo. Categoria nova criada ao lançar ou classificar entra na lista na hora.
  - **Juntar categorias numa só:** marque as categorias e escreva a que fica (uma da lista ou uma nova). As marcadas viram subcategorias dela, com as subcategorias que já tinham e com o padrão essencial de cada uma (ex.: Mercado e padaria e Restaurantes dentro de Alimentação). Ao salvar, os lançamentos classificados com elas passam para a que ficou, e os sem subcategoria ganham a subcategoria que a categoria virou; os que vêm do projeto com o nome antigo também.
  - A lista padrão traz **Alimentação** (supermercado, padaria, hortifrúti, açougue, restaurante, almoço, jantar, lanche e café e delivery) e **Investimentos**, com os tipos como subcategorias.
- **Pagamentos recorrentes:** a lista dos cadastrados no site, com **Novo recorrente** e **Editar** (que também apaga). Os pagamentos já marcados continuam nos gastos.
- **Contas (de quem é o dinheiro):** pessoal de quem é o painel (sempre aparece), pessoal da outra pessoa do casal, compartilhado do casal, engenharia (autônomo) e as empresas. Desmarcar esconde a conta ao lançar e classificar; os lançamentos antigos continuam com ela. **Unir empresas numa conta só** junta duas ou mais empresas numa conta com nome próprio (que dá para renomear ou **Separar**). A conta unida aparece no lugar delas nos formulários e nos totais por conta, e os lançamentos dela entram em "Pagos com o seu dinheiro" na página de cada empresa unida. Os nomes das pessoas e das empresas vêm do banco.

**Investimentos individuais.** Na aba Investimentos, cada painel tem os investimentos da própria pessoa, um a um, separados da carteira conjunta do projeto Financeiro (que continua embaixo, quando existe):

- **Novo investimento:** nome como aparece no banco, tipo, instituição, indexador, taxa, vencimento, conta e o saldo de hoje. O tipo, o indexador, a taxa e o vencimento vêm preenchidos pelo nome (ex.: "LCA BANCO X CDI 90% 25/06/2031"). Tipos: CDB, RDB, LCI, LCA, LC, Letra Financeira, LIG, poupança, conta remunerada, CRA, CRI, debêntures (comuns e incentivadas), Tesouro Selic, Prefixado, IPCA+ (com e sem juros semestrais), Renda+ e Educa+, fundos (renda fixa, multimercado, ações e cambial), previdência PGBL e VGBL, ações, FII, Fiagro, ETF, BDR, COE, criptoativos, ouro e outros. "É uma aplicação nova" lança a saída no caixa.
- **Aplicar e Resgatar:** somam ou tiram do saldo do mês, sem contar como rendimento, e podem lançar no caixa a saída (gasto na categoria Investimentos, com o tipo como subcategoria) ou a entrada do resgate.
- **Atualizar saldos:** todo mês, o saldo de cada investimento copiado do app do banco (dá para informar meses anteriores). O rendimento do mês é a diferença para o saldo anterior, sem as aplicações e os resgates; se o app mostrar quanto rendeu, dá para informar.
- **Painel:** total investido, rendimento do mês (com o % sobre o que estava aplicado) e do ano, a parte isenta de IR, a divisão **por classe** (renda fixa bancária, crédito privado, Tesouro, fundos, previdência, renda variável, cripto e outros), **por tipo** e **por indexador** (com o % de cada um), o gráfico dos **rendimentos mensais** dos últimos 12 meses (com tabela), os **próximos vencimentos** e a lista por classe com o saldo e o rendimento do mês de cada investimento.

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
- **Pagos com o seu dinheiro:** os lançamentos das Finanças pessoais que você marcou com a conta da empresa ou com uma conta unida de que ela faz parte (ex.: um hotel pago no seu cartão). "Lançar a receber" cria o valor a cobrar; depois aparece "já lançado".
- Empresa com lançamentos não pode ser removida (os lançamentos iriam para a engenharia). Remover uma empresa deixa as ARTs dela sem empresa.

### Caixa das empresas

Para o dinheiro que as empresas adiantam (`area/caixa.html`, no menu e no início no lugar dos cards das empresas que fazem parte dele). As empresas escolhidas dividem um caixa só: cada despesa sai classificada para uma delas, mas o saldo é um. Em **Configurar**, escolha as empresas, o saldo inicial e a data dele, e o saldo de hoje na conta separada do caixa.

- **Painel, ao abrir:** o **saldo estimado das empresas** (o que deveria estar na conta mais o antecipado a colaboradores, menos o que falta reembolsar a eles), o **antecipado a colaboradores** (quanto com cada um), **na conta do caixa** (o saldo informado e quanto deveria ter: o saldo estimado menos o antecipado), o **usado no pessoal, a repor** (a diferença entre o que deveria estar na conta e o saldo informado), **a aprovar** e os **gastos do período** (este mês, mês passado, este ano ou desde o saldo inicial).
- **Classificação das despesas:** RDV (relatório de despesas de viagem) ou FC (ficha de custo) de cada empresa, com a sigla dela (ex.: RDV V, FC T, pela primeira letra do nome), ou outra despesa. Os gastos do período aparecem por classificação.
- **Importar RDV ou ficha de custo:** a planilha (.xlsx) é lida no navegador. Cada aba preenchida vira um documento, com o total, a empresa (pelo título do RDV ou pelo nome do arquivo), os itens (do RDV: discriminação, placa, quantidade e valor; da ficha: centro de custo, placa e valor), a obra, a origem e o destino e as observações. O RDV com o nome de outra pessoa é a prestação de contas de um colaborador. Confira a classificação, o valor e a data. O arquivo fica anexado, e o mesmo documento importado de novo aparece desmarcado. PDF e foto também podem ser anexados, com o valor digitado.
- **Aprovado:** a despesa importada fica **a aprovar**, fora do saldo, até você marcar a caixa Aprovado (no quadro A aprovar ou na lista). Desmarcar tira do saldo de novo. A despesa lançada à mão já vem aprovada.
- **Colaboradores:** adiantar sai do caixa e fica com o colaborador. O RDV dele, aprovado, abate o adiantamento sem sair do caixa de novo. Se ele gastou mais do que recebeu, aparece **a reembolsar** (com o botão Reembolsar já com o valor); se sobrou, **Devolução** traz o dinheiro de volta ao caixa.
- **Entradas:** o dinheiro que uma empresa manda para o caixa (adiantamento ou reposição).
- A lista de movimentos é a do caixa atual (desde o saldo inicial), com a busca, os filtros (classificação, empresa e aprovação) e quanto deveria estar na conta depois de cada movimento. Os movimentos de antes do saldo inicial (notas de caixas passados, já acertadas) ficam registrados com o anexo, não contam e aparecem só em **Situação → Caixa anterior**. Os nomes das empresas e dos colaboradores ficam só no banco.

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
- **Resumo dos vencimentos ao entrar:** sempre que o Controle de ART abre, uma janela mostra quantas ARTs estão **vencidas sem baixa**, quantas **vencem nos próximos 30 dias** e quantas **vencem em 31 a 90 dias** (três meses), com o indicador de ação, a lista de cada grupo e quantas ainda estão sem ação definida. Cada número leva para a lista filtrada; o botão **Vencimentos** reabre a janela. A ART baixada ou arquivada não entra: ela não vence mais.
- **Indicador "precisam de baixa ou ação":** no alto da página, quantas ARTs (vencidas, vencendo em até 30 dias ou com uma ação ainda a fazer) esperam uma decisão, separadas em **sem ação definida**, **a dar baixa** e **aguardando substituta, complementar ou nova ART**. **Ver as …** filtra a lista; **Só as sem ação** mostra as que ainda não têm ação. Aparece também no início e nas tarefas pendentes (`art.html#acao` abre direto essa lista).
- **Ação para cada ART:** uma caixa de seleção, na lista, na janela dos vencimentos e na ficha da ART, com **dar baixa (obra ou serviço concluído)**, **emitir ART substituta**, **emitir ART complementar**, **emitir nova ART** ou **arquivar** (quando não há substituta, complementar ou nova que a continue), e os passos de cada uma. A sem ação aparece em destaque. Arquivar guarda o dia e tira a ART dos vencimentos, dos alertas e do indicador; escolher outra ação volta a acompanhá-la. Importada como "nova ART vinculada", a substituta deixa a anterior **baixada por substituição** e a nova ART deixa a anterior **arquivada**.
- **Seleção em lote:** marque as ARTs na lista (ou todas as da lista, pela caixa do cabeçalho) e aplique uma ação a todas de uma vez, por exemplo arquivar as antigas.
- **Quadro de ARTs:** vencidas sem baixa, que vencem em até 30 dias, em 31 a 90 dias, ativas e baixadas ou arquivadas, com busca e filtros por CREA, situação, para quem foi tirada, **cliente**, **ano de registro** e **ação** (inclusive "sem ação definida"). A lista abre **em aberto** (sem as baixadas e as arquivadas); a situação "Baixadas e arquivadas" ou "Todas" mostra as outras.
- **Análise**, que segue os filtros e conta todas as ARTs emitidas (inclusive baixadas e arquivadas, quando nenhuma situação está escolhida): ARTs **por cliente** (a matriz e as filiais juntas pela raiz do CNPJ, com as vencidas, as baixadas ou arquivadas e o valor dos contratos; clicar no cliente filtra a lista), **por ano de registro** e CREA, as **atividades (TOS) mais frequentes** e para quem foram tiradas. A exportação em planilha leva a ação, a taxa paga e a data do arquivamento e segue os filtros.
- **Tirada para:** uma **empresa** cadastrada (ela paga a taxa; os lançamentos da ART vão para a página da empresa) ou um **cliente particular** seu (o serviço e a taxa ficam no Controle financeiro da engenharia). Aparece na coluna "Para", no filtro, na exportação e, na importação de PDFs, dá para marcar todas as ARTs do arquivo de uma vez.
- **Taxa já paga:** marcada na ficha da ART (pela empresa, pelo caixa das empresas ou por você). Na página da empresa, a ART com a taxa paga aparece como "taxa paga", sem o botão de lançar reembolso.
- **Alertas** na plataforma (sino) e por e-mail, com base no **fim previsto** da ART:
  - 30 dias antes: "Daqui a 30 dias a ART nº … do cliente … vencerá (fim previsto em …)."
  - 7 dias antes e no dia;
  - depois de vencida, uma vez por semana até a baixa ser registrada ou a ART ser arquivada.
- **Registro de baixa** (conclusão, interrupção ou substituição), vínculo entre a ART anterior e a nova (renovação, substituta ou complementar) e **"Copiar dados para nova ART"**, para colar no portal do CREA.
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
- As finanças pessoais ficam no banco, um painel por pessoa: só a própria pessoa, quem forma casal com ela nas finanças e o administrador (que faz a importação) acessam. A carteira de investimentos conjunta aparece só nos painéis em que o administrador a incluiu. Os gastos e as entradas lançados (com os descontos do holerite), a classificação, a lista de categorias e os PDFs das finanças seguem a mesma regra (cada pessoa só os próprios). Um desejo de compra aparece também para a pessoa que vai comprar ou dividir a compra. Nenhum valor, nome ou cartão fica no código do site.
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
