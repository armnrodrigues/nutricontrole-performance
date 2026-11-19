# NutriControle Performance

Plataforma pessoal de treino, nutrição, peso, bioimpedância, exames laboratoriais, medicamentos e dados do Apple Watch. Um único arquivo `index.html` (HTML, CSS e JavaScript, sem build), mais `foods.json` (base de alimentos TACO + rótulos) e os ícones do PWA.

## Como usar

- Abra `index.html` por qualquer servidor estático (GitHub Pages, Netlify, `python3 -m http.server`).
- Fora do Claude a plataforma roda em **modo local**: os dados ficam no `localStorage` do navegador. Use Ajustes → Backup para exportar e importar entre aparelhos.
- Dentro do artefato do Claude ela sincroniza na nuvem e lê PDFs e fotos por IA.

## Estrutura

| Arquivo | Função |
|---|---|
| `index.html` | A aplicação inteira |
| `foods.json` | Base de alimentos por 100 g |
| `manifest.webmanifest`, `icon-180.png`, `icon-512.png` | Instalação na tela inicial |

Dados de saúde, exports do Apple Saúde, protocolos e relatórios de exemplo ficam fora do repositório (`.gitignore`).
