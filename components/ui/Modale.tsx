'use client';

import { useEffect, type ReactNode } from 'react';

/**
 * COMMENT ON FERME UNE MODALE — UNE SEULE DÉCLARATION.
 *
 * ⚖️ DÉCISION DE DOM, 2026-09-22, lot AF : « un geste ACCIDENTEL ne ferme pas
 * une modale à champs ; un geste DÉLIBÉRÉ, oui. »
 *   · clic hors cible → accidentel → NE FERME PAS
 *   · Échap, X, « Annuler » → délibéré → ferment
 *
 * ⛔ CE COMPOSANT NE DESSINE RIEN DE NEUF. Il EXTRAIT le traitement que
 * `UploadDocumentModal` portait déjà — le seul du dépôt qui ait la bonne règle :
 * son voile n'écoute pas le clic, et sa touche Échap est gardée pendant le
 * travail. Les 16 modales de personnes et d'actions écrivaient CHACUNE leur
 * voile, à l'identique, avec `onClick={onClose}` dessus : dix-sept copies d'une
 * décision que personne n'avait prise.
 *
 * ★★ ET LA GARDE « OCCUPÉ » GÉNÉRALISE, C'EST LA RAISON DU MODÈLE. Toute modale
 *   qui soumet a un état en vol. Tant qu'il dure, AUCUNE sortie ne passe —
 *   même délibérée. Ça ferme une classe de défaut qu'on n'avait pas nommée :
 *   fermer une modale en plein enregistrement, et ne jamais savoir si l'écriture
 *   a eu lieu. `UploadDocumentModal` le faisait déjà pour son téléversement
 *   (`step !== 'uploading'`) ; ici, c'est la règle de toutes.
 *
 * ⚠️ CE QUE L'ENVELOPPEUR NE PEUT PAS GARDER : le bouton X et « Annuler » vivent
 *   dans le contenu de chaque modale et appellent `onClose` directement. Pour
 *   que « occupé » les refuse aussi, l'appelant passe la MÊME valeur à son
 *   `disabled` — ce que la plupart font déjà avec `saving`. ⛔ Une modale qui
 *   déclare `occupe` sans désactiver son X garde une porte ouverte ; la sonde
 *   ne peut pas le voir, l'œil oui.
 */
export function Modale({
  onClose,
  occupe = false,
  fermeAuClicHorsCible = false,
  classePanneau,
  children,
}: {
  onClose: () => void;
  /** Un travail est en vol : aucune sortie ne passe, même délibérée. */
  occupe?: boolean;
  /**
   * ⛔ FAUX PAR DÉFAUT, ET C'EST LE SENS DU LOT. Une modale ne se ferme au clic
   * hors cible que si elle le DEMANDE — et seules celles SANS champ ont une
   * raison de le demander : il n'y a rien à y perdre.
   */
  fermeAuClicHorsCible?: boolean;
  /** Les classes du panneau, reprises telles quelles de chaque modale. */
  classePanneau: string;
  children: ReactNode;
}) {
  useEffect(() => {
    function auClavier(e: KeyboardEvent) {
      if (e.key === 'Escape' && !occupe) onClose();
    }
    window.addEventListener('keydown', auClavier);
    return () => window.removeEventListener('keydown', auClavier);
  }, [onClose, occupe]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {/* ⛔ LE VOILE N'ÉCOUTE LE CLIC QUE SI LA MODALE LE DEMANDE. C'est la
          seule ligne du lot : seize modales à champs le portaient, et une
          saisie entière partait avec. */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        aria-hidden="true"
        onClick={fermeAuClicHorsCible && !occupe ? onClose : undefined}
      />
      {/* ⛔ `role` ET `aria-modal` SONT PORTÉS ICI, POUR TOUTES. Deux modales
          les déclaraient (`ConfirmDialog`, `ObligationModal`) ; les seize
          autres n'en avaient aucun. ⚠️ Et mon convertisseur les a d'abord
          JETÉS en annonçant les avoir conservés — c'est en les remettant ici
          qu'ils deviennent vrais des vingt-trois. */}
      <div
        className={`relative z-10 ${classePanneau}`}
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
    </div>
  );
}
