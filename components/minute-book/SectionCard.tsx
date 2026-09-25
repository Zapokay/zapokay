'use client';

/**
 * LE CONTENANT COMMUN DES SECTIONS — Complétude et le Livre (lot V2, 2026-09-24).
 *
 * ★ ACCORDÉON WAI-ARIA : le <h3> CONTIENT le bouton, et le bouton ne contient QUE
 * le titre — le nom accessible de l'en-tête est donc le titre exact, rien d'autre.
 * ★ L'EN-TÊTE ENTIER EST CLIQUABLE par le calque ::after du bouton (inset-0 sur
 * l'en-tête `relative`). Un seul gestionnaire, un seul basculement par clic.
 * ⚠️ RIEN DANS L'EN-TÊTE NE DOIT ÊTRE POSITIONNÉ (chevron, marqueur, qualificatif,
 * métrique) : un élément positionné passerait AU-DESSUS du calque et ne basculerait
 * plus. Mesuré avant d'écrire : aucun n'a de comportement propre.
 * ⚠️ Le PANNEAU <div id> est toujours rendu, pour qu'aria-controls pointe sur un
 * élément réel ; seul son CONTENU est démonté quand la section est fermée.
 * ⛔ Les règles d'ouverture par défaut ne vivent PAS ici : chaque section calcule
 * `defaultOpen` là où elle le calculait avant, et le passe.
 */

import { useId, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

interface SectionCardProps {
  /** Le titre EXACT — seul contenu du bouton, donc seul nom du <h3>. */
  title: string;
  /** Avant le titre, hors du <h3> : la pastille numérotée du Livre. */
  marker?: ReactNode;
  /** Après le titre, hors du <h3> : « · Archives ». */
  qualifier?: ReactNode;
  /** Collée à droite, hors du <h3>, lisible par un lecteur d'écran. */
  metric?: ReactNode;
  /** 'archive' garde la variante actuelle : fond, bordure, filet gauche, titre --text-body. */
  tone?: 'default' | 'archive';
  /** false → en-tête inerte : pas de bouton, pas de survol, chevron réservé. */
  collapsible?: boolean;
  /** Valeur INITIALE seulement (lue une fois au montage), comme les useState d'avant. */
  defaultOpen?: boolean;
  /** Filtre actif : ouvert sans toucher l'état de l'usager (OU au rendu). */
  forceOpen?: boolean;
  children?: ReactNode;
}

export default function SectionCard({
  title,
  marker,
  qualifier,
  metric,
  tone = 'default',
  collapsible = true,
  defaultOpen = true,
  forceOpen = false,
  children,
}: SectionCardProps) {
  const panelId = useId();
  const [expanded, setExpanded] = useState(defaultOpen);
  const isOpen = !collapsible || expanded || forceOpen;

  const carte =
    tone === 'archive'
      ? 'bg-[var(--archive-box-bg)] border border-[var(--archive-box-bd)] border-l-[3px] border-l-[var(--text-muted)]'
      : 'bg-[var(--card-bg)] border border-[var(--card-border)]';
  const couleurTitre = tone === 'archive' ? 'text-[var(--text-body)]' : 'text-[var(--text-heading)]';

  // Le filet bas n'existe que sous un en-tête OUVERT ; les coins suivent (13 px = 14 − la bordure).
  const enTete = `relative flex items-center gap-[9px] px-4 py-[13px] transition-colors ${
    isOpen ? 'rounded-t-[13px] border-b border-[var(--card-border)]' : 'rounded-[13px]'
  } ${collapsible ? 'hover:bg-[var(--page-bg)]' : ''}`;
  const titre = `min-w-0 text-[17px] font-semibold tracking-[-0.01em] ${couleurTitre}`;

  return (
    <div className={`rounded-[14px] ${carte}`}>
      <div className={enTete}>
        {collapsible ? (
          <ChevronDown
            aria-hidden="true"
            className={`h-4 w-4 flex-shrink-0 text-[var(--text-muted)] transition-transform duration-[140ms] motion-reduce:transition-none ${
              isOpen ? '' : '-rotate-90'
            }`}
          />
        ) : (
          // Emplacement réservé : même largeur que le chevron, pour que titres et numéros restent alignés.
          <span aria-hidden="true" className="h-4 w-4 flex-shrink-0" />
        )}
        {marker}
        <h3 className={titre}>
          {collapsible ? (
            <button
              type="button"
              aria-expanded={isOpen}
              aria-controls={panelId}
              onClick={() => setExpanded((e) => !e)}
              className="cursor-pointer text-left focus-visible:outline-none after:absolute after:inset-0 after:rounded-[13px] after:content-[''] focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-[var(--amber-400)]"
            >
              {title}
            </button>
          ) : (
            title
          )}
        </h3>
        {qualifier}
        {metric !== undefined && (
          <div className="ml-auto flex-shrink-0 text-[12.5px] text-[var(--text-muted)] tabular-nums">
            {metric}
          </div>
        )}
      </div>
      {collapsible ? <div id={panelId}>{isOpen && children}</div> : children}
    </div>
  );
}
