# Publicar no GitHub Pages

O repositório git local já está pronto nesta pasta (branch `main`, 8 arquivos, sem dados de saúde).

## Caminho A — rápido, sem instalar nada (5 min)

1. Entre em https://github.com/new, nome `nutricontrole-performance`, **Public**, sem README. Crie.
2. Na página do repositório, "uploading an existing file": arraste estes 8 arquivos desta pasta:
   `index.html`, `foods.json`, `manifest.webmanifest`, `icon-180.png`, `icon-512.png`, `README.md`, `.gitignore`, `.nojekyll`. Commit.
3. Settings → Pages → Source "Deploy from a branch" → Branch `main` / `/ (root)` → Save.
4. Em 1–2 min o endereço aparece: `https://SEU-USUARIO.github.io/nutricontrole-performance/`.

Limitação: a cada versão nova você repete o upload do `index.html`.

## Caminho B — durável, atualizações automáticas pelo Claude

1. Instale o GitHub CLI: https://cli.github.com (pacote .pkg para macOS).
2. No Terminal: `gh auth login` → GitHub.com → HTTPS → Login with a web browser.
3. Avise o Claude. Ele cria o repositório público, faz o push, liga o Pages e, daí em diante, cada versão nova vai para o endereço público com um commit.

## O que muda fora do Claude

- Dados ficam no navegador de cada aparelho (modo local). Backup/restauração em Ajustes.
- Leitura de PDF/foto por IA não funciona (precisa de backend com chave própria).
- Instalação na tela inicial do iPhone: Safari → Compartilhar → Adicionar à Tela de Início.
