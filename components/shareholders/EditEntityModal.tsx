'use client';

/**
 * CORRECTION D'UNE ENTITÉ ACTIONNAIRE — identité et adresse.
 *
 * ⛔ AVANT CET ÉCRAN, UNE ENTITÉ ÉTAIT INCORRIGIBLE. Mesuré le 2026-09-10 : zéro
 * UPDATE sur shareholder_entities, ni en code ni en SQL, et la suppression
 * verrouillée par deux clés étrangères en RESTRICT. Une dénomination mal
 * saisie, un NEQ faux ou une adresse fabriquée restaient pour toujours.
 *
 * ★ LE FORMULAIRE N'EST PAS RÉÉCRIT ICI : c'est EntityForm, le même que la
 * création monte. Ce que la valeur devient en base est décidé par
 * lib/entity-payload.ts — `valeurDepuisEntite` à l'ouverture, `correctifEntite`
 * à l'enregistrement.
 *
 * ⛔ CE QU'IL NE CORRIGE PAS :
 *   · les signataires — des rattachements vers company_people, qui a déjà son
 *     propre chemin de correction ;
 *   · `jurisdiction` — colonne morte, jamais écrite ni lue.
 *
 * ⭑ DEUX GARDES QUE SON PATRON, EditPersonModal, N'A PAS — et qu'on ne propage
 * pas en le recopiant :
 *   · aucun `err.message` brut à l'écran : un texte Postgres n'aide personne et
 *     expose la structure de la base ;
 *   · le nombre de lignes RÉELLEMENT modifiées est vérifié. Une absence
 *     d'erreur n'est pas un succès — voir lib/verdict-mise-a-jour.ts.
 */

import { useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useTranslations } from 'next-intl';
import { X, Pencil, Loader2 } from 'lucide-react';
import type { ShareholderEntity } from '@/lib/supabase/people-types';
import {
  adresseDeLaValeur,
  correctifEntite,
  valeurDepuisEntite,
  type CorrectifEntite,
  type ValeurEntite,
} from '@/lib/entity-payload';
import { CHAMPS_REQUIS_ENTITE, champsVidesParLaCorrection } from '@/lib/data-gaps';
import { verdictMiseAJour } from '@/lib/verdict-mise-a-jour';
import { logActivity } from '@/lib/activity-log';
import { CLE_CHAMP_ADRESSE_ENTITE, CLE_CORRIGER_ENTITE } from '@/lib/entity-labels';
import EntityForm from '@/components/shareholders/EntityForm';

interface EditEntityModalProps {
  /** La ligne shareholder_entities à corriger, telle qu'elle est en base. */
  entity: ShareholderEntity;
  companyId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditEntityModal({
  entity,
  companyId,
  onClose,
  onSuccess,
}: EditEntityModalProps) {
  const t = useTranslations('shareholders');
  const supabase = createClient();

  // ⚠️ Construite UNE fois, à l'ouverture : la valeur vient de la ligne en base,
  //    et une colonne NULL y devient un champ VIDE, jamais une valeur par défaut.
  const [valeur, setValeur] = useState<ValeurEntite>(() => valeurDepuisEntite(entity));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ⚖️ DÉCISION DE DOM, 2026-09-13 — EMPÊCHER DE VIDER, PAS IMPOSER DE REMPLIR. Une
  //   correction est refusée si elle VIDE un champ de CHAMPS_REQUIS_ENTITE qui portait une
  //   valeur ENREGISTRÉE ; une entité déjà sans ville ou sans pays s'enregistre, et son nom
  //   se corrige sans que l'adresse absente le bloque. Même fonction que la correction d'une
  //   personne (EditPersonModal) : deux règles écrites séparément recréeraient l'asymétrie
  //   que le lot C a fermée. L'astérisque d'EntityForm reste : il dit ce qui est exigé.
  //   ⚠️ CETTE MODALE NE LIT PAS SI L'ENTITÉ DÉTIENT ENCORE : la règle vaut pour toute
  //   entité, là où la personne n'est tenue que par un rôle actif.
  const vides = champsVidesParLaCorrection(CHAMPS_REQUIS_ENTITE, entity, adresseDeLaValeur(valeur));
  const messageAdresse =
    vides.length > 0
      ? t('errorEntityAddress', { champs: vides.map((c) => t(CLE_CHAMP_ADRESSE_ENTITE[c])).join(', ') })
      : undefined;

  const handleSave = useCallback(async () => {
    // Les deux gardes d'identité de la CRÉATION, reprises telles quelles ; celle de
    // l'adresse ne refuse que ce que la saisie VIDE (voir `vides`).
    if (!valeur.legalName.trim()) {
      setError(t('errorEntityName'));
      return;
    }
    if (valeur.entityType === 'corporation' && !valeur.entityNumber.trim()) {
      setError(t('errorNeq'));
      return;
    }
    const videes = champsVidesParLaCorrection(CHAMPS_REQUIS_ENTITE, entity, adresseDeLaValeur(valeur));
    if (videes.length > 0) {
      setError(t('errorEntityAddress', { champs: videes.map((c) => t(CLE_CHAMP_ADRESSE_ENTITE[c])).join(', ') }));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      // ★ Annotation explicite : une colonne oubliée échoue à la compilation.
      const correctif: CorrectifEntite = correctifEntite(valeur);

      // ⛔ `.select('id')` N'EST PAS DÉCORATIF. Sans lui, supabase-js ne rend
      //    pas les lignes modifiées, et un UPDATE filtré par la RLS ressemble
      //    exactement à un succès.
      const { data, error: updateErr } = await supabase
        .from('shareholder_entities')
        .update(correctif)
        .eq('id', entity.id)
        .select('id');

      const verdict = verdictMiseAJour(data, updateErr);
      if (verdict !== 'ok') {
        // Pour le développeur, la cause exacte ; pour l'utilisateur, une phrase
        // du catalogue qui n'affirme aucune cause qu'elle ne connaît pas.
        console.error('[EditEntityModal] correction non enregistrée :', verdict, updateErr);
        setError(t('editEntityNotSaved'));
        setSaving(false);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await logActivity(
          supabase,
          companyId,
          user.id,
          'shareholder_entity_edited',
          `Entité actionnaire modifiée : ${correctif.legal_name}`,
          `Shareholder entity updated: ${correctif.legal_name}`,
          {
            entity_id: entity.id,
            // La dénomination AVANT, comme person_identity_updated le fait : sans
            // elle, une correction de nom rendrait l'entrée illisible — on ne
            // saurait plus de qui il s'agissait.
            previous_legal_name: entity.legal_name,
          },
        );
      }

      onSuccess();
    } catch (err) {
      // ⚠️ Une panne réseau N'ARRIVE PAS ICI : supabase-js (sans throwOnError) la
      //    rattrape et la rend en `{ error }` — c'est le verdict 'refus' ci-dessus.
      //    Ce bloc ne reçoit qu'une exception imprévue, dont on ignore la cause.
      console.error('[EditEntityModal] correction levée :', err);
      setError(t('editEntityNotSaved'));
      setSaving(false);
    }
  }, [valeur, entity, companyId, supabase, onSuccess, t]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl shadow-xl modal-surface sm:rounded-2xl">
        {/* En-tête */}
        <div className="sticky top-0 z-10 flex items-center justify-between modal-header modal-surface px-6 py-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--text-heading)]">
            <Pencil className="h-5 w-5 text-[var(--text-muted)]" />
            {/* Le type ENREGISTRE, celui du lien qui a ouvert cette modale : le
                titre nomme l'objet ouvert, pas une saisie en cours. */}
            {t(CLE_CORRIGER_ENTITE[entity.entity_type])}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-[var(--text-muted)] transition-colors hover:bg-[var(--hover-bg)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Corps */}
        <div className="space-y-5 px-6 py-5">
          {/* ⛔ L'AVERTISSEMENT NE PARLE QUE DE LA DÉNOMINATION, en deux phrases.
              Mesuré à son écriture : elle était le SEUL champ de cet écran qui se
              propageait — le NEQ n'est lu par aucun écran ni aucun document, le
              type et le descripteur par presque rien.
              ⚠️ CE N'EST PLUS VRAI DE L'ADRESSE. Mesuré le 2026-09-13 sur ZZ Top :
              le registre des actionnaires l'imprime sous le nom du détenteur, pour
              une société comme pour une personne (COLONNES_ACTIONNAIRES,
              lib/minute-book/register-columns.ts). Le texte de l'avertissement n'a
              pas changé : c'est une décision de texte, hors de ce lot. */}
          <p className="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2.5 text-xs text-[var(--text-muted)]">
            {t('editEntityNameNote')}
          </p>

          <div className="space-y-3">
            <EntityForm value={valeur} onChange={setValeur} error={messageAdresse} />
          </div>
        </div>

        {/* Pied */}
        <div className="sticky bottom-0 modal-header modal-surface px-6 py-4">
          {/* ⛔ LE MESSAGE D'ÉCHEC VIT DANS LE PIED COLLANT, AU-DESSUS DES ACTIONS
              — pas dans le corps qui défile. Il explique le BOUTON : rendu sous
              le formulaire, il pouvait sortir de l'écran pendant que le bouton
              qui l'avait déclenché y restait, et le refus devenait muet. Même
              correctif que l'étape d'inscription (d1746da), même raison. */}
          {error && (
            <p role="alert" className="mb-3 text-sm text-[var(--error-text)]">{error}</p>
          )}
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg px-4 py-2 text-sm font-medium text-[var(--text-body)] transition-colors hover:bg-[var(--hover-bg)]"
            >
              {t('cancel')}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || vides.length > 0}
              className="flex items-center gap-2 rounded-lg bg-[var(--amber-400)] px-5 py-2 text-sm font-semibold text-[var(--on-amber)] transition-opacity disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
