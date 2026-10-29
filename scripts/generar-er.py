# Genera docs/diagrama-er.png a partir de docs/modelo-datos.json (que sale de: node scripts/extraer-modelo.js).
# Requiere Python 3 y Graphviz (comando dot).  Uso: python3 scripts/generar-er.py
import json, re, subprocess, sys, os
RAIZ = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
DOCS = os.path.join(RAIZ, 'docs')
SOLO_CLAVES = True
M = json.load(open(os.path.join(DOCS, 'modelo-datos.json')))
COL = {'usuarios': ('#E3EEFA', '#3F72AF'), 'inventario': ('#E2F2E2', '#3F8F4F'),
       'reservas': ('#FCE9D6', '#D1792B'), 'notificaciones': ('#EDE3F6', '#7E57B0')}
TITULO = {'usuarios': 'Usuarios y Autenticación · usuarios_db', 'inventario': 'Inventario · inventario_db',
          'reservas': 'Reservas y Préstamos · reservas_db', 'notificaciones': 'Notificaciones · notificaciones_db'}
def tipo(c):
    t = c['tipo']
    if c['defecto'] and 'nextval' in c['defecto']: return 'SERIAL'
    t = t.replace('character varying', 'VARCHAR').replace('timestamp with time zone', 'TIMESTAMPTZ').replace('integer', 'INTEGER').replace('boolean', 'BOOLEAN')
    return t
LOG = {  # columnas que son referencias lógicas entre bases (sin FK real)
 ('sanciones','prestamo_id'), ('laboratorios','encargado_id'), ('reservas','usuario_id'), ('reservas','recurso_id'),
 ('reservas','laboratorio_id'), ('reservas','encargado_id'), ('prestamos','entregado_por'), ('prestamos','recibido_por'),
 ('incidencias','recurso_id'), ('notificaciones','usuario_id')}
out = ['digraph ER {', ' graph [rankdir=TB, fontname="DejaVu Sans", nodesep=0.2, ranksep=0.35, pad=0.2, compound=true];',
       ' node [shape=plaintext, fontname="DejaVu Sans", fontsize=11];', ' edge [fontname="DejaVu Sans", fontsize=8];']
fk = []
for clave, bd in M.items():
    claro, fuerte = COL[clave]
    out.append(f' subgraph cluster_{clave} {{ label=<<B>{TITULO[clave]}</B>>; labeljust=l; fontsize=12; style="rounded,filled"; fillcolor="{claro}33"; color="{fuerte}"; penwidth=1.6;')
    for t, x in bd['tablas'].items():
        pk = {c for r in x['restricciones'] if r['tipo'] == 'p' for c in r['columnas']}
        uq = {c for r in x['restricciones'] if r['tipo'] == 'u' for c in r['columnas']}
        fks = {}
        for r in x['restricciones']:
            if r['tipo'] == 'f': fks[r['columnas'][0]] = r['destino']
        rows = [f'<TR><TD COLSPAN="4" BGCOLOR="{fuerte}"><FONT COLOR="white"><B>{t}</B></FONT></TD></TR>']
        for c in x['columnas']:
            n = c['nombre']; marks = []
            if SOLO_CLAVES and n not in pk and n not in uq and n not in fks and (t, n) not in LOG: continue
            if n in pk: marks.append('PK')
            if n in fks: marks.append('FK')
            elif (t, n) in LOG: marks.append('FK*')
            if n in uq: marks.append('UQ')
            nn = '' if c['nulo'] else ' <FONT COLOR="#555555">●</FONT>'
            bold = f'<B>{n}</B>' if n in pk else n
            rows.append(f'<TR><TD ALIGN="LEFT" BGCOLOR="{claro}">{('<FONT POINT-SIZE="8">'+" ".join(marks)+'</FONT>') if marks else " "}</TD><TD ALIGN="LEFT" PORT="{n}">{bold}</TD><TD ALIGN="LEFT"><FONT POINT-SIZE="8" COLOR="#444444">{tipo(c)}</FONT></TD><TD>{nn}</TD></TR>')
            if n in fks: fk.append((t, n, fks[n]))
        out.append(f' {t} [label=<<TABLE BORDER="1" COLOR="{fuerte}" CELLBORDER="0" CELLSPACING="0" CELLPADDING="3">{"".join(rows)}</TABLE>>];')
    out.append(' }')
for t, c, d in fk:
    out.append(f' {t}:{c}:e -> {d}:{"codigo" if d=="roles" else "id"}:w [dir=both, arrowtail=crow, arrowhead=tee, color="#333333", penwidth=1.5];')
CL = [  # (tabla origen, cluster origen, tabla destino, cluster destino, texto)
 ('reservas','reservas','usuarios','usuarios','reservas.usuario_id\\nreservas.encargado_id\\nprestamos.entregado_por\\nprestamos.recibido_por'),
 ('reservas','reservas','recursos','inventario','reservas.recurso_id\\nreservas.laboratorio_id\\nincidencias.recurso_id'),
 ('laboratorios','inventario','usuarios','usuarios','laboratorios.encargado_id'),
 ('notificaciones','notificaciones','usuarios','usuarios','notificaciones.usuario_id'),
 ('sanciones','usuarios','prestamos','reservas','sanciones.prestamo_id'),
]
for t, ct, d, cd, txt in CL:
    out.append(f' {t} -> {d} [ltail=cluster_{ct}, lhead=cluster_{cd}, dir=both, arrowtail=crow, arrowhead=tee, style=dashed, color="#C0392B", fontcolor="#C0392B", penwidth=1.6, fontsize=9, label="{txt}", constraint=true];')
out.append('}')
open(os.path.join(DOCS, 'diagrama-er.dot'), 'w').write('\n'.join(out))
subprocess.run(['dot', '-Tpng', '-Gdpi=200', os.path.join(DOCS, 'diagrama-er.dot'), '-o', os.path.join(DOCS, 'diagrama-er.png')], check=True)
print('ok')
