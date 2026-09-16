#!/bin/sh
# PORTE D'IDENTITÉ DU MESSAGE DE COMMIT — elle ARRÊTE la chaîne de déploiement.
#
#   usage : npm run porte:identite -- <fichier-message> [rev]   (rev défaut : HEAD)
#   rc=0  → identique, la chaîne continue
#   rc=1  → écart, la chaîne s'arrête
#
# ⛔ CE N'EST PAS UNE DIXIÈME GARDE, ET IL NE FAUT PAS L'AJOUTER AU RANG DES
# NEUF. Ce n'est pas le même MOMENT : les neuf `check:*` tournent AVANT le
# commit, sur l'arbre. Celle-ci tourne APRÈS le commit et AVANT le push, sur
# l'objet commit — elle n'a rien à mesurer tant que le commit n'existe pas.
#
# ⛔ NE JAMAIS MESURER AVEC `git log --pretty=%B` : il ajoute UN saut de ligne
# terminal, donc il lève sur tout message BIEN FORMÉ. Mesuré le 2026-09-16 sur
# ca184b4 (+1 octet) et sur le témoin 009ef61, un commit qui avait déjà passé la
# porte : l'écart est constant et appartient à %B, pas au commit.
# ★ Une porte qui crie au loup à chaque passage cesse d'être une porte.
#
# La seule mesure juste : les octets de l'OBJET commit, après ses en-têtes.
set -eu
[ $# -ge 1 ] || { echo "usage: $0 <fichier-message> [rev]" >&2; exit 2; }
FICHIER=$1
REV=${2:-HEAD}
python3 - "$FICHIER" "$REV" <<'PY'
import hashlib, subprocess, sys
fichier, rev = sys.argv[1], sys.argv[2]

def run(*a, stdin=None):
    p = subprocess.run(a, stdin=stdin, capture_output=True)
    if p.returncode: sys.exit(f"⛔ {' '.join(a)} : {p.stderr.decode(errors='replace').strip()}")
    return p.stdout

# les octets stockés : en-têtes, ligne vide, puis le message
stocke  = run('git', 'cat-file', 'commit', rev).split(b'\n\n', 1)[1]
attendu = run('git', 'stripspace', stdin=open(fichier, 'rb'))
h = lambda b: hashlib.sha256(b).hexdigest()[:16]

print(f"  objet {rev:<10} {len(stocke):6d} o  {h(stocke)}")
print(f"  stripspace       {len(attendu):6d} o  {h(attendu)}")
if stocke == attendu:
    print("  ✔ IDENTIQUE — la chaîne continue")
    sys.exit(0)
print(f"  ⛔ ÉCART de {len(stocke)-len(attendu):+d} octet(s) — LA CHAÎNE S'ARRÊTE")
import difflib
d = list(difflib.unified_diff(attendu.decode('utf-8','replace').split('\n'),
                              stocke.decode('utf-8','replace').split('\n'),
                              'stripspace', f'objet {rev}', lineterm='', n=1))
print('\n'.join('    ' + l for l in d[:24]))
sys.exit(1)
PY
