# NutriControle na Cloudflare: passo a passo

O site fica em um endereço próprio, com login, banco de dados e IA.
Os dados lançados no iPhone e no Mac ficam no mesmo banco e aparecem nos dois.

## O que já está pronto

- **Banco (D1):** guarda todos os registros e sincroniza entre os aparelhos.
- **Fotos e vídeos dos exercícios (KV):** até 20 MB por arquivo.
- **IA:** leitura de rótulo, refeição por foto ou texto, print do Apple Fitness e PDF de exames, pela API da Anthropic.
- **Sem internet:** o que você digita fica guardado no aparelho e sobe sozinho quando a conexão volta.
- **Trava de segurança:** sem o login do Cloudflare Access, as rotas de dados recusam qualquer acesso.
- **O artefato não muda:** só a cópia publicada na Cloudflare recebe o arquivo `cf-shim.js`.

## O que só você pode fazer

### 1. Criar a conta na Cloudflare
Entre em https://dash.cloudflare.com/sign-up e crie uma conta grátis.

### 2. Autorizar o Mac a publicar
No Terminal, rode o comando abaixo e clique em "Allow" na página que abrir:

```bash
cd "/Users/antonio/Documents/Claude/Projects/NutriControle Performance/cloudflare" && PATH=$HOME/.local/nodejs/bin:$PATH npx wrangler login
```

Depois disso, o Claude roda o `publicar.sh`. Ele cria o banco, o depósito de arquivos e o site.

### 3. Ligar o login (Cloudflare Access)
1. No painel da Cloudflare, abra **Zero Trust** e escolha o plano **Free**, que vale para até 50 pessoas.
2. Escolha o nome da equipe, por exemplo `antonio`. O endereço da equipe fica `antonio.cloudflareaccess.com`.
3. Vá em **Access › Applications › Add an application › Self-hosted**.
4. Em domínio, coloque `nutricontrole.pages.dev`. Adicione também `*.nutricontrole.pages.dev`.
5. Crie uma política **Allow** com **Emails** igual ao seu e-mail.
6. Em métodos de login, deixe **One-time PIN**. Você recebe um código por e-mail ao entrar.
7. Copie o **Application Audience (AUD) Tag** e mande para o Claude junto com o endereço da equipe. Esses dois valores não são senhas.

### 4. Ligar a IA
1. Em https://console.anthropic.com, crie uma chave de API e coloque créditos.
2. Defina um limite mensal de gasto no próprio console.
3. Cadastre a chave você mesmo. O Claude não digita chaves. Rode:

```bash
cd "/Users/antonio/Documents/Claude/Projects/NutriControle Performance/cloudflare" && PATH=$HOME/.local/nodejs/bin:$PATH npx wrangler pages secret put ANTHROPIC_API_KEY --project-name nutricontrole
```

Cole a chave quando o comando pedir. Ela fica guardada só na Cloudflare e nunca chega ao navegador.

### 5. Levar os dados do artefato
1. No artefato, abra **Mais › Exportar backup**.
2. No site novo, abra **Mais › Importar backup** e escolha o arquivo.

As fotos e vídeos de exercício anexados no artefato não vêm junto, porque ficam guardados no Claude.

### 6. Instalar no iPhone
Abra o endereço no Safari, entre com o código do e-mail e toque em **Compartilhar › Adicionar à Tela de Início**.

## Daqui para frente

- Lance sempre pelo site da Cloudflare. O artefato e o site são bancos separados.
- A cada mudança no app, o Claude roda o `publicar.sh` de novo para atualizar o site.
- **Custos:** a Cloudflare é grátis nesse uso. A IA é cobrada pela Anthropic conforme o uso.
