'use client';

/**
 * Édition d'IDENTITÉ d'une personne — la première voie de correction sur
 * `company_people`.
 *
 * ⚠️ CE QU'ELLE NE TOUCHE PAS. Aucun champ de MANDAT : ni fonction, ni dates,
 * ni motif de fin. Ceux-là ont déjà leur patron ailleurs — EditFormerDirector,
 * EditFormerOfficer, EditFormerShareholding — chacun sur sa table de mandat.
 * Cette modale ne connaît que l'identité, qui est partagée par les trois rôles.
 *
 * ★ L'UPDATE VIT ICI, PAS DANS PersonSelector. Le sélecteur reste un composant
 * pur : deux `.select`, zéro écriture, un contrat `value`/`onChange` stable sur
 * six montages. Lui donner un chemin de sauvegarde interne ferait dépendre son
 * comportement d'un mode caché. Le mapping camelCase → snake_case est donc
 * écrit ici à la main, exactement comme les cinq appelants existants le font
 * pour leur propre INSERT (AddDirectorModal:115-130 et ses quatre voisins).
 *
 * ⚠️ PREMIER UPDATE DE L'HISTOIRE DE CETTE TABLE. Mesuré la veille : sur
 * `company_people`, le produit ne faisait que des `.select` et des `.insert` —
 * zéro update, zéro upsert. Une personne créée était définitive. C'est attendu,
 * pas un signal d'alarme.
 */

import { useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useTranslations } from 'next-intl';
import { X, Pencil, Loader2 } from 'lucide-react';
import PersonSelector, { type PersonSelectorValue } from '@/components/people/PersonSelector';
import type { CompanyPerson } from '@/lib/supabase/people-types';
import { logActivity } from '@/lib/activity-log';

interface EditPersonModalProps {
  /** La ligne company_people à corriger, telle qu'elle est en base. */
  person: CompanyPerson;
  companyId: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditPersonModal({
  person,
  companyId,
  onClose,
  onSuccess,
}: EditPersonModalProps) {
  const t = useTranslations('people');
  const tCommon = useTranslations('common');
  const supabase = createClient();

  /**
   * ⚠️ CONSTRUITE AVANT LE MONTAGE, et c'est structurel : PersonSelector lit
   * cette valeur dans ses initialiseurs `useState`, qui ne sont évalués qu'au
   * PREMIER rendu. Une valeur qui arriverait après ne remplirait rien.
   *
   * Le mapping est le sens inverse de celui que font les cinq appelants
   * existants pour leur INSERT — snake_case de la base vers camelCase du
   * sélecteur. `?? ''` partout : une colonne NULL doit produire un champ VIDE,
   * jamais la chaîne « null ».
   */
  const [valeur, setValeur] = useState<PersonSelectorValue | null>({
    mode: 'new',
    fullName: person.full_name,
    email: person.email ?? '',
    phone: person.phone ?? '',
    addressLine1: person.address_line1 ?? '',
    addressLine2: person.address_line2 ?? '',
    addressCity: person.address_city ?? '',
    addressProvince: person.address_province ?? 'QC',
    addressPostalCode: person.address_postal_code ?? '',
    addressCountry: person.address_country ?? 'CA',
    // ⛔ REPRISE TELLE QUELLE, jamais réinterprétée. La sémantique de ce champ
    // — et son `?? true` du lecteur — est un autre lot, verrouillé.
    isCanadianResident: person.is_canadian_resident ?? true,
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = useCallback(async () => {
    // Le sélecteur ne remonte une valeur que si le nom est non vide ; on ne
    // s'en remet pas à lui pour autant — full_name est NOT NULL en base.
    if (!valeur || valeur.mode !== 'new' || !valeur.fullName.trim()) {
      setError(t('errorNameRequired'));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const { error: updateErr } = await supabase
        .from('company_people')
        .update({
          full_name: valeur.fullName.trim(),
          // ⚠️ Chaîne vide → NULL. Un champ vidé par l'utilisateur doit
          // redevenir un MANQUE en base, pas une chaîne vide qui affirmerait
          // « renseigné, et vide ».
          email: valeur.email.trim() || null,
          phone: valeur.phone.trim() || null,
          address_line1: valeur.addressLine1.trim() || null,
          address_line2: valeur.addressLine2.trim() || null,
          address_city: valeur.addressCity.trim() || null,
          address_province: valeur.addressProvince || null,
          address_postal_code: valeur.addressPostalCode.trim() || null,
          address_country: valeur.addressCountry,
          is_canadian_resident: valeur.isCanadianResident,
        })
        .eq('id', person.id);

      if (updateErr) throw new Error(updateErr.message);

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await logActivity(
          supabase,
          companyId,
          user.id,
          'person_identity_updated',
          `Identité modifiée : ${valeur.fullName.trim()}`,
          `Identity updated: ${valeur.fullName.trim()}`,
          {
            person_id: person.id,
            // Le nom AVANT, pour qu'une correction de nom reste lisible dans le
            // journal — sans lui, l'entrée ne dirait pas de qui il s'agissait.
            previous_full_name: person.full_name,
          },
        );
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : tCommon('saveFailed'));
      setSaving(false);
    }
  }, [valeur, person, companyId, supabase, onSuccess, t, tCommon]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl shadow-xl modal-surface sm:rounded-2xl">
        {/* En-tête */}
        <div className="sticky top-0 z-10 flex items-center justify-between modal-header modal-surface px-6 py-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-[var(--text-heading)]">
            <Pencil className="h-5 w-5 text-[var(--text-muted)]" />
            {t('editPerson')}
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
          {/* ⚠️ Une note, pas un avertissement : company_people est PARTAGÉE.
              La même ligne sert l'administrateur, le dirigeant et l'actionnaire ;
              une correction faite ici se voit depuis les trois surfaces. */}
          <p className="rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2.5 text-xs text-[var(--text-muted)]">
            {t('editPersonSharedNote')}
          </p>

          <PersonSelector
            companyId={companyId}
            value={valeur}
            onChange={setValeur}
            lockToNewMode
          />

          {error && (
            <p className="text-sm text-[var(--error-text)]">{error}</p>
          )}
        </div>

        {/* Pied */}
        <div className="sticky bottom-0 flex items-center justify-end gap-3 modal-header modal-surface px-6 py-4">
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
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-[var(--amber-400)] px-5 py-2 text-sm font-semibold text-[var(--on-amber)] transition-opacity disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {tCommon('save')}
          </button>
        </div>
      </div>
    </div>
  );
}
