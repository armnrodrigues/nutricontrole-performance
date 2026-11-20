"""Monta a pasta dist/ para a Cloudflare a partir do app (../index.html).
O index.html do artefato não muda: só a cópia publicada na Cloudflare recebe o cf-shim.js."""
import pathlib, shutil, sys

HERE = pathlib.Path(__file__).resolve().parent
APP = HERE.parent
DIST = HERE / 'dist'

if DIST.exists():
    shutil.rmtree(DIST)
DIST.mkdir()

html = (APP / 'index.html').read_text(encoding='utf-8')
marker = '<meta charset="utf-8">'
if not html.startswith(marker):
    sys.exit('Não achei o ponto de inserção no index.html')
html = html.replace(marker, marker + '\n<script src="/cf-shim.js"></script>', 1)
(DIST / 'index.html').write_text(html, encoding='utf-8')

for name in ['foods.json', 'manifest.webmanifest', 'icon-180.png', 'icon-512.png']:
    if (APP / name).exists():
        shutil.copy(APP / name, DIST / name)
shutil.copy(HERE / 'public' / 'cf-shim.js', DIST / 'cf-shim.js')
(DIST / '_headers').write_text('/*\n  X-Robots-Tag: noindex\n  Referrer-Policy: same-origin\n/index.html\n  Cache-Control: no-cache\n/\n  Cache-Control: no-cache\n/cf-shim.js\n  Cache-Control: no-cache\n', encoding='utf-8')
print('dist pronto:', sorted(p.name for p in DIST.iterdir()))
