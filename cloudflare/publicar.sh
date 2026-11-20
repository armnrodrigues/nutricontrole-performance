#!/bin/zsh
# Publica o NutriControle na Cloudflare.
# Na primeira vez cria o banco (D1), o depósito de fotos e vídeos (KV) e o projeto do Pages.
# Antes: rodar "npx wrangler login" uma vez e entrar com a conta da Cloudflare.
set -e
cd "$(dirname "$0")"
export PATH="$HOME/.local/nodejs/bin:$PATH"
W() { npx wrangler "$@"; }

W whoami >/dev/null 2>&1 || { echo "Faça o login primeiro: npx wrangler login"; exit 1; }

if grep -q 'database_id = "PREENCHER_APOS_CRIAR"' wrangler.toml; then
  echo "Criando o banco D1…"
  ID=$(W d1 create nutricontrole 2>&1 | grep -Eo '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)
  [ -n "$ID" ] || ID=$(W d1 list --json | python3 -c "import json,sys;print([d['uuid'] for d in json.load(sys.stdin) if d['name']=='nutricontrole'][0])")
  sed -i '' "s/database_id = \"PREENCHER_APOS_CRIAR\"/database_id = \"$ID\"/" wrangler.toml
fi
W d1 execute nutricontrole --remote --file schema.sql -y >/dev/null
echo "Banco pronto."

if grep -q 'id = "PREENCHER_APOS_CRIAR"' wrangler.toml; then
  echo "Criando o depósito de fotos e vídeos…"
  KV=$(W kv namespace create MEDIA 2>&1 | grep -Eo '[0-9a-f]{32}' | head -1)
  sed -i '' "s/^id = \"PREENCHER_APOS_CRIAR\"/id = \"$KV\"/" wrangler.toml
fi
echo "Depósito pronto."

W pages project list 2>/dev/null | grep -q nutricontrole || W pages project create nutricontrole --production-branch main
npm run deploy
echo
echo "Publicado em https://nutricontrole.pages.dev"
