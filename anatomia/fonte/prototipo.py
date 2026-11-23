#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Monta anatomia/prototipo.html (página única, sem dependência externa) a partir de
figura.svg e musculos.json. Uso: python3 anatomia/fonte/prototipo.py"""
import os, json
AQUI = os.path.dirname(os.path.abspath(__file__)); RAIZ = os.path.join(AQUI, '..')
EXEMPLOS = ['Supino Inclinado Máquina', 'Remada Baixa Triângulo', 'Agachamento Hack']
mapa = json.load(open(os.path.join(RAIZ, 'musculos.json'), encoding='utf-8'))
svg = open(os.path.join(RAIZ, 'figura.svg'), encoding='utf-8').read().strip()
exs = [next(e for e in mapa['exercicios'] if e['nome'] == n) for n in EXEMPLOS]
dados = {'musculos': {k: v['nome'] for k, v in mapa['musculos'].items()}, 'exercicios': exs}

HTML = r"""<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Protótipo · Grupo muscular</title>
<style>
/* Variáveis de tema copiadas do :root do index.html (somente as usadas aqui) */
:root{
  --bg:#ffffff; --surface:#ffffff; --surface-2:#f1f1f4; --line:#e4e4e9; --line-2:#cfcfd6;
  --ink:#111114; --ink-2:#4b4b55; --muted:#6b6b76;
  --acao:#111114; --acao-ink:#ffffff; --link:#1f6feb; --warn-text:#92400e;
  --veu:rgba(0,0,0,.45);
  --s1:4px; --s2:8px; --s3:12px; --s4:16px; --s5:24px; --gutter:12px;
  --f-xs:12px; --f-sm:13px; --f-md:15px; --f-lg:17px; --f-xl:20px;
  --font-display:"Inter Tight","Inter",system-ui,-apple-system,"Segoe UI",sans-serif;
  --font-body:"Inter",system-ui,-apple-system,"Segoe UI",sans-serif;
  --r-sm:8px; --r:14px; --h:44px;
  /* novas, da figura */
  --m-principal:var(--link);
  --m-secundario:color-mix(in srgb,var(--m-principal) 42%,var(--surface));
  --m-estab:var(--m-principal);
  --m-base:#dcdce2; --m-corpo:#f1f1f4; --m-traco:var(--surface); --m-rotulo:var(--muted);
  color-scheme:light;
}
:root[data-theme="dark"]{
  --bg:#0a0a0a; --surface:#141414; --surface-2:#1d1d1d; --line:#2a2a2a; --line-2:#383838;
  --ink:#f6f4ef; --ink-2:#b3ada3; --muted:#8f897f;
  --acao:#e5b654; --acao-ink:#1d1300; --link:#e5b654; --warn-text:#fdba74;
  --veu:rgba(0,0,0,.7);
  --m-base:#3b3a37; --m-corpo:#222120; --m-secundario:color-mix(in srgb,var(--m-principal) 55%,var(--surface));
  color-scheme:dark;
}
*{box-sizing:border-box}
html,body{margin:0}
body{background:var(--bg);color:var(--ink);font:var(--f-md)/1.45 var(--font-body);-webkit-text-size-adjust:100%}
h1,h2,h3,h4,p,ol,dl,dd{margin:0}
.pagina{max-width:640px;margin:0 auto;padding:var(--s4) var(--gutter) 96px}
.topo{display:flex;justify-content:space-between;align-items:center;gap:var(--s2);margin-bottom:var(--s4)}
.topo h1{font:700 var(--f-xl)/1.2 var(--font-display)}
.aviso{color:var(--muted);font-size:var(--f-sm);margin-bottom:var(--s4)}
.bloco{border-top:1px solid var(--line);padding:var(--s3) 0}
.bloco h2{font:700 var(--f-lg)/1.25 var(--font-display)}
.bloco .mini{color:var(--muted);font-size:var(--f-sm);margin:2px 0 var(--s2)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:var(--s2);border:1px solid var(--line-2);background:var(--surface);color:var(--ink);
  min-height:var(--h);padding:0 var(--s3);border-radius:var(--r-sm);font:600 var(--f-sm)/1 var(--font-body);cursor:pointer}
.btn:active{background:var(--surface-2)}
.btn svg{width:16px;height:16px;flex:none}
.icon-btn{width:var(--h);height:var(--h);border-radius:var(--r-sm);border:0;background:transparent;cursor:pointer;display:grid;place-items:center;color:var(--ink-2);flex:none;font-size:var(--f-md)}
/* janela flutuante: mesma estrutura do #sheet do app */
#sheet{position:fixed;inset:0;z-index:80;background:var(--veu);display:flex;align-items:flex-end;justify-content:center}
#sheet[hidden]{display:none}
#sheet .panel{background:var(--surface);width:100%;max-width:640px;max-height:min(92vh,calc(100dvh - env(safe-area-inset-top,0px) - 8px));overflow:auto;
  border-radius:var(--r) var(--r) 0 0;padding:0 max(var(--s4),env(safe-area-inset-right,0px)) 0 max(var(--s4),env(safe-area-inset-left,0px))}
@media (min-width:700px){#sheet{align-items:center}#sheet .panel{border-radius:var(--r);max-height:88vh}}
.sheet-h{display:flex;justify-content:space-between;align-items:center;gap:var(--s2);position:sticky;top:0;z-index:2;background:var(--surface);padding:var(--s2) 0;margin-bottom:var(--s1)}
.sheet-h h3{font-size:var(--f-lg);font-weight:700}
#sheetBody{padding-bottom:calc(var(--s4) + env(safe-area-inset-bottom,0px))}
/* conteúdo "Grupo muscular" */
.gm-nome{font:700 var(--f-xl)/1.2 var(--font-display);margin-top:var(--s2)}
.gm-grupo{color:var(--ink-2);font-size:var(--f-sm);margin-top:2px}
.gm-grupo b{color:var(--ink);font-weight:700}
.gm-fig{margin:var(--s3) auto var(--s1);max-width:330px}
.gm-fig svg{display:block;width:100%;height:auto}
.gm-leg{display:flex;justify-content:center;gap:var(--s4);flex-wrap:wrap;font-size:var(--f-xs);color:var(--ink-2);margin-bottom:var(--s4)}
.gm-leg span{display:inline-flex;align-items:center;gap:6px}
.gm-leg i{width:12px;height:12px;border-radius:3px;flex:none}
.gm-leg .p{background:var(--m-principal)}
.gm-leg .s{background:var(--m-secundario)}
.gm-leg .e{background:var(--m-base);box-shadow:inset 0 0 0 1.6px var(--m-estab)}
.gm-rot{font-size:var(--f-xs);font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--muted)}
.gm-foco{border-left:3px solid var(--m-principal);padding:2px 0 2px var(--s3);margin-bottom:var(--s4)}
.gm-foco p{font-size:var(--f-lg);line-height:1.35;font-weight:600;margin-top:2px}
.gm-lista{border-top:1px solid var(--line);margin-bottom:var(--s4)}
.gm-lista div{display:grid;grid-template-columns:124px 1fr;gap:var(--s3);padding:10px 0;border-bottom:1px solid var(--line);align-items:baseline}
.gm-lista dd{font-size:var(--f-md)}
.gm-lista .pri dd{font-weight:700}
.gm-sec{margin-bottom:var(--s4)}
.gm-sec ol{padding-left:20px;margin-top:var(--s1)}
.gm-sec li{padding:3px 0}
.gm-sec p{margin-top:var(--s1)}
.gm-nota{font-size:var(--f-sm);color:var(--muted);border-top:1px solid var(--line);padding-top:var(--s3)}
</style>
</head>
<body>
<div class="pagina">
  <div class="topo"><h1>Treino</h1><button class="btn" id="btTema" type="button">Tema escuro</button></div>
  <p class="aviso">Protótipo do botão "Grupo muscular". Toque no botão de um exercício para abrir a janela.</p>
  <div id="blocos"></div>
</div>

<div id="sheet" hidden><div class="panel" role="dialog" aria-modal="true" aria-labelledby="sheetTitle">
  <div class="sheet-h"><h3 id="sheetTitle">Grupo muscular</h3><button class="icon-btn" id="btFechar" type="button" aria-label="Fechar">✕</button></div>
  <div id="sheetBody"></div>
</div></div>

<template id="figura">__SVG__</template>

<script>
const GM = __DADOS__;
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const nomes = ids => ids.map(i => GM.musculos[i] || i);

/* Pinta a figura: principal cheio, secundário mais claro, estabilizador em contorno.
   Os músculos ativos vão para o fim do grupo para o contorno não ficar por baixo dos vizinhos. */
function pintarFigura(svg, ex){
  const papel = {};
  ex.estabilizadores.forEach(i => papel[i] = 'm-e');
  ex.secundarios.forEach(i => papel[i] = 'm-s');
  ex.principal.forEach(i => papel[i] = 'm-p');
  ['m-s','m-p','m-e'].forEach(cls => {
    svg.querySelectorAll('[data-m]').forEach(el => {
      if (papel[el.dataset.m] === cls) { el.classList.add(cls); el.parentNode.appendChild(el); }
    });
  });
}

function htmlGrupoMuscular(ex){
  const linha = (rot, ids, cls) => ids.length ? `<div class="${cls}"><dt class="gm-rot">${rot}</dt><dd>${nomes(ids).map(esc).join('<br>')}</dd></div>` : '';
  return `
  <h4 class="gm-nome">${esc(ex.nome)}</h4>
  <p class="gm-grupo">Grupo: <b>${esc(ex.grupo)}</b></p>
  <div class="gm-fig" id="gmFig"></div>
  <div class="gm-leg" aria-hidden="true"><span><i class="p"></i>Principal</span><span><i class="s"></i>Secundário</span><span><i class="e"></i>Estabilizador</span></div>
  <div class="gm-foco"><span class="gm-rot">Onde sentir</span><p>${esc(ex.foco)}</p></div>
  <dl class="gm-lista">
    ${linha('Principal', ex.principal, 'pri')}
    ${linha('Secundários', ex.secundarios, '')}
    ${linha('Estabilizadores', ex.estabilizadores, '')}
  </dl>
  <div class="gm-sec"><span class="gm-rot">Execução</span><ol>${ex.execucao.map(t => `<li>${esc(t)}</li>`).join('')}</ol></div>
  <div class="gm-sec"><span class="gm-rot">Erro comum</span><p>${esc(ex.erro_comum)}</p></div>
  ${ex.duvida ? `<p class="gm-nota">Observação sobre o nome: ${esc(ex.duvida)}</p>` : ''}`;
}

function abrir(i){
  const ex = GM.exercicios[i];
  $('#sheetBody').innerHTML = htmlGrupoMuscular(ex);
  const fig = $('#gmFig');
  fig.appendChild($('#figura').content.cloneNode(true));
  pintarFigura(fig.querySelector('svg'), ex);
  $('#sheet').hidden = false; $('#sheet .panel').scrollTop = 0; document.body.style.overflow = 'hidden';
}
function fechar(){ $('#sheet').hidden = true; $('#sheetBody').innerHTML = ''; document.body.style.overflow = ''; }
function tema(escuro){
  document.documentElement.dataset.theme = escuro ? 'dark' : 'light';
  $('#btTema').textContent = escuro ? 'Tema claro' : 'Tema escuro';
}

const ICONE = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="2.8" r="1.6"/><path d="M4 6.2h8M8 6.2v4.3M8 10.5l-2.4 4M8 10.5l2.4 4"/></svg>';
$('#blocos').innerHTML = GM.exercicios.map((ex, i) => `
  <section class="bloco"><h2>${esc(ex.nome)}</h2><p class="mini">${esc(ex.grupo)}</p>
  <button class="btn" type="button" data-abrir="${i}">${ICONE}Grupo muscular</button></section>`).join('');
document.addEventListener('click', e => {
  const b = e.target.closest('[data-abrir]'); if (b) abrir(+b.dataset.abrir);
  if (e.target.id === 'sheet' || e.target.closest('#btFechar')) fechar();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') fechar(); });
$('#btTema').addEventListener('click', () => tema(document.documentElement.dataset.theme !== 'dark'));

/* para as capturas: prototipo.html?ex=0|1|2&tema=escuro */
const q = new URLSearchParams(location.search);
if (q.get('tema') === 'escuro') tema(true);
if (q.has('ex')) abrir(Math.min(GM.exercicios.length - 1, Math.max(0, +q.get('ex') || 0)));
</script>
</body>
</html>
"""
out = HTML.replace('__SVG__', svg).replace('__DADOS__', json.dumps(dados, ensure_ascii=False))
open(os.path.join(RAIZ, 'prototipo.html'), 'w', encoding='utf-8').write(out)
print('prototipo.html', len(out), 'bytes')
