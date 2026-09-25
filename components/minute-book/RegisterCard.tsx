'use client'

import type { ReactNode } from 'react'
import { styleCelluleReact, STYLES_RANG, type RangBloc, type TraitementCellule } from '@/lib/minute-book/register-columns'

// V5b — 1re colonne alignée sur le titre (pl-6, 42 px dans le Livre), dernière à pr-4.
function padCellule(i: number, n: number) {
  return `${i === 0 ? 'pl-6' : 'pl-5'} ${i === n - 1 ? 'pr-4' : 'pr-5'}`
}

interface RegisterCardProps {
  title: string
  /**
   * Le RANG de la carte — registre, ou sous-section d'un registre. Absent =
   * registre. La carte et son titre suivent STYLES_RANG, la meme table que le
   * PDF : aucune decision de dessin n'est prise ici.
   */
  rang?: RangBloc
  /**
   * ⚠️ `traitement` PORTE LA COUPURE, et il vient de la declaration unique des
   * colonnes — jamais d'une decision prise ici. Facultatif : absent = defaut du
   * navigateur.
   */
  columns: {
    key: string
    label: string
    /** La seconde ligne de la cellule, si la declaration en prevoit une. */
    cleSecondaire?: string
    cleTertiaire?: string
    traitement?: TraitementCellule
  }[]
  rows: Record<string, any>[]
  emptyMessage?: string
  citation?: string
  footnote?: ReactNode
  /**
   * V5b — un GROUPE de la même table (« Anciennes détentions »), rendu en second <tbody>
   * sous un séparateur th scope="rowgroup" : mêmes colonnes, pas une carte de plus.
   */
  groupe?: { title: string; rows: Record<string, any>[] }
}

export default function RegisterCard({
  title,
  rang,
  columns,
  rows,
  emptyMessage = 'Aucune donnée enregistrée',
  citation,
  footnote,
  groupe,
}: RegisterCardProps) {
  const style = STYLES_RANG[rang ?? 'registre'].ecran
  const Titre = style.balise

  function corps(lignes: Record<string, any>[], separateur?: ReactNode) {
    return (
      <tbody>
        {separateur}
        {lignes.length === 0 ? (
          <tr>
            <td colSpan={columns.length} className="px-5 py-6 text-sm text-[var(--text-muted)] italic text-center">
              {emptyMessage}
            </td>
          </tr>
        ) : (
          lignes.map((row, i) => (
            <tr key={i} className="border-b border-[var(--card-border)] last:border-0">
              {/* ⛔ LE STYLE VA SUR LA CELLULE, PAS SUR L'EN-TETE — meme
                  regle qu'au PDF, et pour la meme raison mesuree le
                  2026-09-10 : pose sur l'en-tete, il coupait ACTIF et
                  CERT. en deux. */}
              {columns.map((col, ci) => (
                <td
                  key={col.key}
                  className={`${padCellule(ci, columns.length)} py-2.5 text-[var(--text-body)]`}
                  style={styleCelluleReact(col.traitement)}
                >
                  {row[col.key]}
                  {/* ⛔ SECONDAIRE VIDE = RIEN DU TOUT. Pas de <br />, pas
                      d'espace reserve : la rangee garde sa hauteur d'avant.
                      ⛔ AUCUNE REDUCTION DE TAILLE, AUCUN GRIS — l'adresse
                      est un contenu exige par la loi, pas une note. */}
                  {col.cleSecondaire && row[col.cleSecondaire] ? (
                    <>
                      <br />
                      {row[col.cleSecondaire]}
                    </>
                  ) : null}
                  {/* ⛔ TERTIAIRE VIDE = RIEN DU TOUT, comme le secondaire :
                      ni <br>, ni espace réservé. Les trois registres qui
                      n'en déclarent pas rendent ce qu'ils rendaient. */}
                  {col.cleTertiaire && row[col.cleTertiaire] ? (
                    <>
                      <br />
                      {row[col.cleTertiaire]}
                    </>
                  ) : null}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    )
  }

  return (
    <div className={style.carte}>
      <div className="pl-6 pr-4 py-2.5 border-b border-[var(--card-border)]">
        <Titre className={style.titre}>{title}</Titre>
      </div>
      {rows.length === 0 && !groupe ? (
        <p className="px-5 py-6 text-sm text-[var(--text-muted)] italic text-center">
          {emptyMessage}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {columns.map((col, ci) => (
                  <th
                    key={col.key}
                    className={`text-left ${padCellule(ci, columns.length)} py-2 text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-medium`}
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            {corps(rows)}
            {groupe && (
              // Le séparateur prend les classes d'« Événements de l'année », sauf pl-6 (42 px).
              corps(groupe.rows, (
                <tr className="border-t border-[var(--card-border)]">
                  <th
                    scope="rowgroup"
                    colSpan={columns.length}
                    className="pl-6 pr-4 pt-4 pb-2 text-left text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]"
                  >
                    {groupe.title}
                  </th>
                </tr>
              ))
            )}
          </table>
        </div>
      )}
      {(footnote || citation) && (
        <div className="pl-6 pr-4 py-3 border-t border-[var(--card-border)] space-y-1.5">
          {footnote}
          {/* ⚠️ YELLOW — PENDING LAWYER GREEN — stated-capital citation (art.68 LSAQ / s.26 CBCA) */}
          {citation && (
            <p className="text-[11px] italic text-[var(--text-muted)]">{citation}</p>
          )}
        </div>
      )}
    </div>
  )
}
