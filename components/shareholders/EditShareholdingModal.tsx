'use client';

import { useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useTranslations } from 'next-intl';
import { X, Loader2 } from 'lucide-react';
import type { ShareholdingWithDetails, ShareClass } from '@/lib/supabase/people-types';
import { holderName } from '@/lib/minute-book/holder-name';
import { logActivity } from '@/lib/activity-log';
import { titresDeCorrectionDetention } from '@/lib/journal-correction-detention';

interface EditShareholdingModalProps {
  shareholding: ShareholdingWithDetails;
  shareClasses: ShareClass[];
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditShareholdingModal({
  shareholding,
  shareClasses,
  onClose,
  onSuccess,
}: EditShareholdingModalProps) {
  const t = useTranslations('shareholders');
  const locale = t('_locale') === 'fr' ? 'fr' : 'en';
  const supabase = createClient();

  const [shareClassId, setShareClassId] = useState(shareholding.share_class_id);
  const [quantity, setQuantity] = useState(String(shareholding.quantity));
  const [pricePerShare, setPricePerShare] = useState(
    shareholding.issue_price_per_share ? String(shareholding.issue_price_per_share) : ''
  );
  const [issueDate, setIssueDate] = useState(shareholding.issue_date);
  const [certificateNumber, setCertificateNumber] = useState(
    shareholding.certificate_number ?? ''
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = useCallback(async () => {
    const qty = parseInt(quantity, 10);
    if (!qty || qty <= 0) {
      setError(t('errorQuantity'));
      return;
    }
    if (!issueDate) {
      setError(t('errorIssueDate'));
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const { error: err } = await supabase
        .from('shareholdings')
        .update({
          share_class_id: shareClassId,
          quantity: qty,
          issue_date: issueDate,
          issue_price_per_share: pricePerShare.trim() ? parseFloat(pricePerShare) : null,
          certificate_number: certificateNumber.trim() || null,
        })
        .eq('id', shareholding.id);

      if (err) throw err;

      /**
       * ⛔ LA CORRECTION ENTRE AU REGISTRE — lot Z-B, 2026-09-21.
       *
       * C'était le SEUL chemin de correction du dépôt qui se taisait : on
       * pouvait changer la QUANTITÉ D'ACTIONS et la DATE D'ÉMISSION d'une
       * détention sans que rien ne le note. ⚠️ Or la date d'émission est un
       * contenu PRESCRIT — art. 33 par. 3° LSAQ, « la date et les détails de
       * l'émission ».
       *
       * ★ LE TEXTE VIENT DE `lib/journal-correction-detention.ts`, jamais
       * d'ici : une modale rend `null` hors navigateur, donc sa règle serait
       * invérifiable à la sonde. Même patron que `journal-charge.ts`.
       *
       * ⚪ LES NOMS DE CATÉGORIE SONT RÉSOLUS ICI parce que c'est ici qu'on a
       * la liste. Le module ne connaît pas la base et n'écrira jamais un UUID
       * au registre.
       */
      const nomCategorie = (id: string) =>
        shareClasses.find((sc) => sc.id === id)?.name ?? '';
      const titres = titresDeCorrectionDetention(
        holderName(shareholding.holders) ?? '',
        {
          issue_date: shareholding.issue_date,
          share_class: nomCategorie(shareholding.share_class_id),
          quantity: String(shareholding.quantity),
          issue_price_per_share:
            shareholding.issue_price_per_share != null
              ? String(shareholding.issue_price_per_share)
              : '',
          certificate_number: shareholding.certificate_number ?? '',
        },
        {
          issue_date: issueDate,
          share_class: nomCategorie(shareClassId),
          quantity: String(qty),
          issue_price_per_share: pricePerShare.trim(),
          certificate_number: certificateNumber.trim(),
        },
      );

      /* ⚠️ `titres` VAUT `null` QUAND RIEN N'A CHANGÉ, et c'est voulu : ouvrir
         la modale et enregistrer sans rien toucher ne doit pas inscrire une
         correction imaginaire au registre. */
      if (titres) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await logActivity(
            supabase,
            shareholding.company_id,
            user.id,
            /* ⭐ LA VALEUR EXISTE DÉJÀ DANS `activity_log_event_type_check`, ET
               N'AVAIT AUCUNE LIGNE : la contrainte avait été élargie pour un
               chemin qu'on n'a jamais câblé. ⛔ Donc AUCUNE migration — et pas
               de `shareholding_corrected` inventé à côté, qui aurait exigé
               d'élargir la contrainte une seconde fois pour le même fait.
               ⚪ Le CODE dit « edited », comme son voisin
               `shareholder_entity_edited` ; ce que l'utilisateur LIT dit
               « corrigée », et c'est le titre qui compte pour Z-B3. */
            'shareholding_edited',
            titres.titleFr,
            titres.titleEn,
            { shareholding_id: shareholding.id, champs_corriges: titres.champs },
          );
        }
      }

      onSuccess();
    } catch (err: any) {
      setError(err.message || 'An error occurred');
      setSaving(false);
    }
  }, [
    shareClassId,
    quantity,
    pricePerShare,
    issueDate,
    certificateNumber,
    supabase,
    onSuccess,
    t,
    shareClasses,
    shareholding,
  ]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl shadow-2xl sm:rounded-2xl modal-surface">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between modal-header modal-surface px-6 py-4">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            {locale === 'fr' ? 'Modifier les actions' : 'Edit shareholding'}
            <span className="ml-2 text-sm font-normal text-zinc-500">
              — {holderName(shareholding.holders) ?? '(unknown holder)'}
            </span>
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="space-y-5 px-6 py-5">
          {/* Share class */}
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {t('shareClass')} <span className="text-red-500">*</span>
            </label>
            <select
              value={shareClassId}
              onChange={(e) => setShareClassId(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
            >
              {shareClasses.map((sc) => (
                <option key={sc.id} value={sc.id}>
                  {sc.name}
                </option>
              ))}
            </select>
          </div>

          {/* Quantity + Price */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {t('numberOfShares')} <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="1"
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {t('pricePerShare')}
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">
                  $
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={pricePerShare}
                  onChange={(e) => setPricePerShare(e.target.value)}
                  placeholder="1.00"
                  className="w-full rounded-lg border border-zinc-200 bg-white py-2.5 pl-7 pr-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
                />
              </div>
            </div>
          </div>

          {/* Issue date + Certificate */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {t('issueDate')} <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {t('certificateNumber')}
              </label>
              <input
                type="text"
                value={certificateNumber}
                onChange={(e) => setCertificateNumber(e.target.value)}
                placeholder="001"
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
            </div>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 flex items-center justify-end gap-3 modal-footer modal-surface px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-amber-500 px-5 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('save')}
          </button>
        </div>
      </div>
    </div>
  );
}
