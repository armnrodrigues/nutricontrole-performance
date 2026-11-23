#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Fonte da figura anatômica (anatomia/figura.svg). Desenho próprio.
Cada músculo é uma lista de pontos da metade direita do desenho (eixo x=100, corpo de 200 x 452);
o gerador suaviza a curva, espelha o outro lado e desloca a vista de costas em +200.
Uso: python3 anatomia/fonte/figura.py   -> regrava anatomia/figura.svg
"""
import os, math
AQUI = os.path.dirname(os.path.abspath(__file__))
CX = 100.0

def f(v):
    s = ('%.1f' % v).rstrip('0').rstrip('.')
    return s if s not in ('-0', '') else '0'

def curva(pts, t=0.5):
    """Curva fechada suave (Catmull-Rom -> Bézier cúbica) pelos pontos."""
    n = len(pts); d = 'M%s %s' % (f(pts[0][0]), f(pts[0][1]))
    for i in range(n):
        p0, p1, p2, p3 = pts[(i-1) % n], pts[i], pts[(i+1) % n], pts[(i+2) % n]
        c1 = (p1[0] + (p2[0]-p0[0]) * t / 3, p1[1] + (p2[1]-p0[1]) * t / 3)
        c2 = (p2[0] - (p3[0]-p1[0]) * t / 3, p2[1] - (p3[1]-p1[1]) * t / 3)
        d += 'C%s %s %s %s %s %s' % tuple(f(v) for v in (c1[0], c1[1], c2[0], c2[1], p2[0], p2[1]))
    return d + 'Z'

def canto(pts, r=2.5):
    """Polígono com cantos arredondados."""
    n = len(pts); d = ''
    for i in range(n):
        a, b, c = pts[(i-1) % n], pts[i], pts[(i+1) % n]
        def corta(p, q):
            L = math.hypot(q[0]-p[0], q[1]-p[1]) or 1; k = min(r, L/2) / L
            return (p[0] + (q[0]-p[0]) * k, p[1] + (q[1]-p[1]) * k)
        e, s = corta(b, a), corta(b, c)
        d += ('M' if i == 0 else 'L') + '%s %s' % (f(e[0]), f(e[1]))
        d += 'Q%s %s %s %s' % (f(b[0]), f(b[1]), f(s[0]), f(s[1]))
    return d + 'Z'

def esp(pts):
    return [(2*CX - x, y) for x, y in reversed(pts)]

# ---------------------------------------------------------------- silhueta
MEIO = [  # do alto do pescoço, descendo pelo lado direito, até a virilha
 (108,50),(109,60),(115,67),(129,72),(144,75.5),(154,81),(159.5,92),(161,106),(164.5,122),(168.5,140),(171,156),
 (176,172),(179,190),(179.5,208),(179,220),(182,232),(181,244),(176,252),(170,249),(168,236),(168,222),
 (165,204),(160.5,186),(156,168),(152,153),(148,137),(145,123),(143,116),(143,128),(141,146),(136,164),(132.5,180),
 (133.5,196),(137.5,212),(141.5,230),(143.5,250),(142.5,272),(139.5,294),(134.5,312),(132.5,324),(135.5,340),
 (136.5,356),(133.5,376),(128.5,394),(126.5,406),(129,416),(134,424),(132,429.5),(116,429.5),(111,422),(112,408),
 (112,394),(110,372),(108.5,352),(110.5,336),(111.5,322),(109.5,306),(106.5,284),(103.5,258),(101,239),
]
SILHUETA = curva(MEIO + esp(MEIO), 0.5)
CABECA = (100, 31, 18, 23)

# ---------------------------------------------------------------- músculos
# (id, tipo, pontos[, raio]) ; tipo 'c' = curva suave, 'r' = polígono de cantos arredondados
FRENTE = [
 ('trapezio_superior','c',[(110.5,61),(115.5,67.5),(128,71.8),(140,74.6),(128,76),(112,74.2)]),
 ('peitoral_clavicular','c',[(102,78),(118,77),(134,78.5),(137.5,89),(128,89.5),(114,88.5),(102,89)]),
 ('peitoral_esternal','c',[(102,91.5),(116,91),(130,92),(138.5,94),(142,105),(139.5,113),(129,117),(114,117),(102,116)]),
 ('peitoral_abdominal','c',[(102,118.5),(114,119.5),(128,119.5),(138,116.5),(134,123.5),(124,127),(112,127),(102,125)]),
 ('deltoide_anterior','c',[(136.5,77.5),(146,77.5),(151,84),(151.5,98),(149,109),(145,114),(141.5,104),(139,92)]),
 ('deltoide_lateral','c',[(148.5,78),(154.5,82),(158.5,92),(159.5,105),(157,115),(152,113),(153.5,98),(152.5,85)]),
 ('serratil','c',[(128,130),(135,125.5),(138,134),(136.5,146),(132,152),(128,142)]),
 ('latissimo','c',[(140,120),(142,128),(140.5,142),(137.5,155),(138.5,142),(140,132)]),
 ('reto_abdominal_superior','r',[(102,129.5),(119.5,130.5),(120,142),(102,142)],3),
 ('reto_abdominal_superior','r',[(102,144.5),(120,144.5),(120,157.5),(102,157.5)],3),
 ('reto_abdominal_inferior','r',[(102,160),(120,160),(119.5,174.5),(102,174.5)],3),
 ('reto_abdominal_inferior','r',[(102,177),(119.5,177),(118,194),(112,210),(104.5,219),(102,219)],3),
 ('obliquos','c',[(123,149),(128.5,153),(133.5,157),(134,165),(131,180),(132,196),(135.5,208),(127,214),(122,205),(122,172)]),
 ('transverso','r',[(103,181),(130,181),(131,195),(121,199),(103,199)],3),
 ('flexores_quadril','c',[(136,216),(140,226),(134,236),(124,238),(112,236),(108,230),(122,223)]),
 ('adutores','c',[(103.5,240),(110,238),(120,242),(117.5,262),(113.5,284),(109.5,298),(106.5,280),(104.5,258)]),
 ('quadriceps_reto_femoral','c',[(124,242),(132,240),(134,262),(131,290),(126.5,308),(121.5,310),(119.5,290),(120,262)]),
 ('quadriceps_vastos','c',[(136.5,238),(141.5,250),(141,272),(138,296),(133,312),(129.5,314),(133.5,292),(136.5,264)]),
 ('quadriceps_vastos','c',[(114,288),(118,294),(120,308),(118,318),(112.5,318),(109.5,308),(110.5,296)]),
 ('tibial_anterior','c',[(123,334),(129,338),(129.5,360),(125.5,388),(121.5,398),(119.5,370),(120,346)]),
 ('gastrocnemio','c',[(112,336),(117,342),(117,368),(114,382),(111.5,368),(110.5,350)]),
 ('soleo','c',[(131.5,342),(134.5,354),(133,372),(129,392),(127,392),(131,366)]),
 ('biceps','c',[(146.5,121),(153,117),(158.5,128),(162,146),(162,156),(156.5,158),(151.5,150),(148,134)]),
 ('braquial','c',[(160.5,124),(164,129),(167.5,146),(169,156),(165,157.5),(164,146),(161,133)]),
 ('braquiorradial','c',[(167.5,160.5),(172.5,164),(176.5,178),(177.5,194),(175.5,204),(173.5,198),(171,180)]),
 ('flexores_antebraco','c',[(155,163),(164,161.5),(168,176),(171,194),(173.5,208),(175,220),(169.5,221),(164,204),(159,184)]),
]
COSTAS = [
 ('trapezio_superior','c',[(101,56),(108,57),(111.5,64),(118,69.5),(132,73.5),(146,77),(134,81),(118,82),(101,82)]),
 ('trapezio_medio','c',[(101,84.5),(118,84.5),(133,83.5),(138,86),(130,93),(116,97),(101,98)]),
 ('trapezio_inferior','c',[(101,100.5),(113,99),(112,112),(107,130),(101,146)]),
 ('romboides','c',[(115.5,99),(128,94.5),(126,108),(119,118),(114,116)]),
 ('deltoide_posterior','c',[(139.5,84.5),(147,79.5),(152,86),(152,100),(148.5,112),(144.5,116),(141.5,104),(139,94)]),
 ('deltoide_lateral','c',[(149.5,78.5),(155,81.5),(159,91.5),(160,105),(157.5,116),(152.5,113.5),(154.5,99),(153.5,86)]),
 ('infraespinal_redondo_menor','c',[(129.5,96),(136,93.5),(139.5,104),(141.5,113),(134,115),(127.5,110)]),
 ('redondo_maior','c',[(126.5,113.5),(134,117.5),(142,116.5),(143,121.5),(136,126),(127.5,121.5)]),
 ('latissimo','c',[(116,120),(127,124.5),(137,129),(142,124.5),(142,134),(140,148),(136,164),(132,178),(124,184),(114,178),(109,164),(107,150),(110,138),(113,128)]),
 ('eretores_espinha','c',[(101,150.5),(104,154),(106,166),(109,182),(110,196),(108,208),(101,210)]),
 ('obliquos','c',[(114,187.5),(123,188.5),(131.5,184.5),(132,194),(135,205),(124,206.5),(113.5,205.5),(113,196)]),
 ('gluteo_medio','c',[(111,209.5),(124,209),(136.5,209.5),(140.5,221),(140,232),(131,226.5),(119,219)]),
 ('gluteo_maximo','c',[(101.5,215),(111,216),(121,222),(131,229.5),(140,236),(141,250),(130,258),(114,258),(105.5,254),(102.5,240)]),
 ('isquiotibiais','c',[(106.5,261),(118,263),(130,262),(140.5,255),(141,274),(138,296),(133,312),(126.5,318),(122,304),(118,318),(112.5,318),(109.5,304),(107,282)]),
 ('gastrocnemio','c',[(110.5,332),(118,331.5),(120,346),(119,362),(115,372),(111.5,362),(109.8,346)]),
 ('gastrocnemio','c',[(121.5,331.5),(130,332.5),(135,346),(134,360),(128,372),(122.5,364),(121.8,346)]),
 ('soleo','c',[(112.5,375),(116,376),(121,369.5),(127,376),(133,367),(132,380),(128,394),(124,402),(116,402),(112.5,392)]),
 ('triceps_longa','c',[(146.5,121),(151.5,117.5),(155,130),(157.5,146),(155.5,154),(151.5,150),(148.5,136)]),
 ('triceps_lateral_medial','c',[(157.5,119.5),(162,122.5),(166.5,138),(169,152),(165,156.5),(160,154.5),(159.5,140),(157,128)]),
 ('extensores_antebraco','c',[(161,162.5),(170.5,160.5),(176.5,176),(178,194),(178,220),(172.5,221),(168.5,204),(163.5,184)]),
 ('flexores_antebraco','c',[(155,165),(158.5,167),(162,186),(167,206),(170,221),(168,221),(160.5,196),(155.5,176)]),
]
PROFUNDOS = {'transverso'}  # sem área própria na superfície: só aparece quando o exercício o usa

def caminhos(lista, dx):
    out = []
    for item in lista:
        mid, tipo, pts = item[0], item[1], item[2]
        r = item[3] if len(item) > 3 else 2.5
        for lado in (pts, esp(pts)):
            p = [(x + dx, y) for x, y in lado]
            d = curva(p, 0.5) if tipo == 'c' else canto(p, r)
            cls = ' class="m-prof"' if mid in PROFUNDOS else ''
            out.append('<path data-m="%s"%s d="%s"/>' % (mid, cls, d))
    return out

def corpo(dx):
    sil = curva([(x + dx, y) for x, y in MEIO + esp(MEIO)], 0.5)
    cx, cy, rx, ry = CABECA
    return ['<path d="%s"/>' % sil, '<ellipse cx="%s" cy="%s" rx="%s" ry="%s"/>' % (f(cx + dx), f(cy), f(rx), f(ry))]

ESTILO = """
.fig-musc{--_base:var(--m-base,#d9d9df);--_p:var(--m-principal,#1f6feb);--_s:var(--m-secundario,color-mix(in srgb,var(--_p) 45%,var(--_base)));--_e:var(--m-estab,var(--_p));--_corpo:var(--m-corpo,#f1f1f4);--_traco:var(--m-traco,#fff);--_rot:var(--m-rotulo,#6b6b76)}
.fig-musc .corpo>*{fill:var(--_corpo)}
.fig-musc [data-m]{fill:var(--_base);stroke:var(--_traco);stroke-width:1;stroke-linejoin:round;vector-effect:non-scaling-stroke}
.fig-musc .m-prof{fill:none;stroke:none}
.fig-musc [data-m].m-s{fill:var(--_s)}
.fig-musc [data-m].m-p{fill:var(--_p)}
.fig-musc [data-m].m-e{fill:var(--_base);stroke:var(--_e);stroke-width:1.6}
.fig-musc .m-prof.m-e,.fig-musc .m-prof.m-s,.fig-musc .m-prof.m-p{fill:none;stroke:var(--_e);stroke-width:1.6;stroke-dasharray:3 2.5}
.fig-musc text{fill:var(--_rot);font:600 9px system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.08em;text-anchor:middle}
""".strip()

def svg():
    L = ['<svg xmlns="http://www.w3.org/2000/svg" class="fig-musc" viewBox="0 0 400 452" role="img" aria-label="Corpo masculino de frente e de costas com os músculos do exercício destacados">',
         '<style>' + ESTILO + '</style>']
    for nome, lista, dx, rot in (('frente', FRENTE, 0, 'FRENTE'), ('costas', COSTAS, 200, 'COSTAS')):
        L.append('<g data-vista="%s">' % nome)
        L.append('<g class="corpo">' + ''.join(corpo(dx)) + '</g>')
        L.append('<g class="musc">' + '\n'.join(caminhos(lista, dx)) + '</g>')
        L.append('<text x="%s" y="447">%s</text>' % (f(100 + dx), rot))
        L.append('</g>')
    L.append('</svg>')
    return '\n'.join(L)

def vistas():
    v = {}
    for nome, lista in (('frente', FRENTE), ('costas', COSTAS)):
        for it in lista:
            v.setdefault(it[0], [])
            if nome not in v[it[0]]: v[it[0]].append(nome)
    return v

if __name__ == '__main__':
    s = svg()
    open(os.path.join(AQUI, '..', 'figura.svg'), 'w', encoding='utf-8').write(s + '\n')
    print('figura.svg', len(s), 'bytes;', len(vistas()), 'músculos')
