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
 * comportement d'un mode caché. Le mapping camelCase → snake_case de la
 * CORRECTION est donc écrit ici à la main ; celui des INSERT vit dans
 * lib/person-payload.ts (`chargePersonne`), qui ne connaît pas l'UPDATE.
 *
 * ⚠️ PREMIER UPDATE DE L'HISTOIRE DE CETTE TABLE. Mesuré la veille : sur
 * `company_people`, le produit ne faisait que des `.select` et des `.insert` —
 * zéro update, zéro upsert. Une personne créée était définitive. C'est attendu,
 * pas un signal d'alarme.
 *
 * ⚖️ L'EXIGENCE — DÉCISIONS DE DOM, 2026-09-13 : une correction ne peut pas VIDER
 * ce qu'un rôle ACTIF exige, et elle n'est pas tenue de REMPLIR ce qui était déjà
 * vide. La modale LIT les rôles de la personne et en DÉRIVE la portée, avec les
 * deux pièces de la liste des trous (lib/data-gaps.ts) :
 *   · un rôle actif ou plus → l'union de leurs champs porte l'astérisque, et le
 *     bouton refuse une saisie qui VIDE l'un d'eux, comparée à la fiche
 *     enregistrée (`champsVidesParLaCorrection`) ;
 *   · aucun rôle actif → HORS_ROLE_AUCUNE_EXIGENCE, comme avant ;
 *   · rôles pas encore lus, ou lecture échouée → rien ne s'enregistre.
 * ★ UNE FICHE DÉJÀ INCOMPLÈTE S'ENREGISTRE : un champ vide qui reste vide n'est pas
 * un refus. Même règle, même fonction, que la correction d'une entité
 * (EditEntityModal).
 */

import { useState, useCallback, useEffect } from 'react';
import { Modale } from '@/components/ui/Modale';
import { createClient } from '@/lib/supabase/client';
import { useTranslations } from 'next-intl';
import { X, Pencil, Loader2 } from 'lucide-react';
import PersonSelector, { type PersonSelectorValue } from '@/components/people/PersonSelector';
import type { CompanyPerson } from '@/lib/supabase/people-types';
import {
  SELECT_ROLES_PERSONNE,
  champsRequisDeLaPortee,
  champsVidesParLaCorrection,
  porteeDeLaPersonne,
  type ChampPersonne,
  type PersonneAvecRoles,
  type PorteeExigence,
} from '@/lib/data-gaps';
import { logActivity } from '@/lib/activity-log';

interface EditPersonModalProps {
  /** La ligne company_people à corriger, telle qu'elle est en base. */
  person: CompanyPerson;
  companyId: string;
  /**
   * La residence canadienne s'applique-t-elle a cette societe ? DECIDE en
   * amont par residencyApplies(), jamais recalcule ici : cette modale
   * TRANSPORTE, elle ne compare pas.
   */
  residencyApplies: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

/**
 * CE QU'UNE CORRECTION EXIGE, TEL QU'IL EST CONNU À L'INSTANT.
 *   · 'lecture' — les rôles de la personne ne sont pas encore lus ;
 *   · 'echec'   — la lecture a échoué ;
 *   · une portée — l'union de ses rôles ACTIFS, ou HORS_ROLE_AUCUNE_EXIGENCE.
 *
 * ⛔ « JE NE SAIS PAS » N'EST PAS « AUCUN RÔLE ». Tant que l'exigence n'est pas
 * une portée, le formulaire n'est pas monté et rien ne s'enregistre : lire un
 * échec comme HORS_ROLE laisserait vider la ville d'un administrateur actif au
 * premier hoquet du réseau — le défaut même que cette lecture ferme.
 */
export type ExigenceDeCorrection = 'lecture' | 'echec' | PorteeExigence;

/**
 * LA LECTURE — les rôles de la personne, puis le formulaire.
 *
 * ★ « NE RECALCULE PAS : DÉRIVE ». La requête est `SELECT_ROLES_PERSONNE` et la
 * portée `porteeDeLaPersonne(…, 'actif')` : les pièces mêmes de la liste des
 * trous. Cette modale ne réécrit ni la requête ni le sens d'« actif ».
 */
export default function EditPersonModal(props: EditPersonModalProps) {
  const personId = props.person.id;
  const [exigence, setExigence] = useState<ExigenceDeCorrection>('lecture');

  useEffect(() => {
    let abandon = false;
    async function lireRoles() {
      try {
        const { data, error } = await createClient()
          .from('company_people')
          .select(SELECT_ROLES_PERSONNE)
          .eq('id', personId)
          .single();
        if (abandon) return;
        if (error || !data) {
          console.error('[EditPersonModal] rôles illisibles :', error);
          setExigence('echec');
          return;
        }
        setExigence(porteeDeLaPersonne(data as unknown as PersonneAvecRoles, 'actif'));
      } catch (err) {
        if (abandon) return;
        console.error('[EditPersonModal] lecture des rôles levée :', err);
        setExigence('echec');
      }
    }
    lireRoles();
    return () => {
      abandon = true;
    };
  }, [personId]);

  return <CorrectionIdentite {...props} exigence={exigence} />;
}

/**
 * LE FORMULAIRE ET L'ENREGISTREMENT, pour une exigence DONNÉE.
 *
 * ★ SÉPARÉ DE LA LECTURE POUR SE MONTER SANS RÉSEAU : check:adresses le rend avec
 * une portée écrite en dur, dans les deux sens. L'application ne le monte que par
 * EditPersonModal.
 */
export function CorrectionIdentite({
  person,
  companyId,
  residencyApplies,
  onClose,
  onSuccess,
  exigence,
}: EditPersonModalProps & { exigence: ExigenceDeCorrection }) {
  const t = useTranslations('people');
  const tCommon = useTranslations('common');
  const supabase = createClient();

  /**
   * ⚠️ CONSTRUITE AVANT LE MONTAGE, et c'est structurel : PersonSelector lit
   * cette valeur dans ses initialiseurs `useState`, qui ne sont évalués qu'au
   * PREMIER rendu. Une valeur qui arriverait après ne remplirait rien.
   *
   * Le mapping est le sens inverse de celui de l'INSERT (`chargePersonne`,
   * lib/person-payload.ts) — snake_case de la base vers camelCase du
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
    // Ni la province ni le pays ne se fabriquent : `''` porte l'absence, et
    // PersonSelector la convertit en NULL au moment d'émettre.
    addressProvince: person.address_province ?? '',
    addressPostalCode: person.address_postal_code ?? '',
    addressCountry: person.address_country ?? '',
    // ⛔ REPRISE TELLE QUELLE, jamais réinterprétée — y compris le `null`, qui
    //    est une VALEUR (« jamais déclaré ») et non une absence de valeur.
    // ⛔ PLUS DE `?? true`. Il transformait une absence de declaration en
    //    « Oui » des l'ouverture de la modale — donc un simple enregistrement,
    //    sans que personne ne touche au champ, ecrivait une affirmation que
    //    personne n'avait faite. Le menu sait afficher `null`.
    isCanadianResident: person.is_canadian_resident,
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * ★ CE QUE LA SAISIE VIDE, PARMI CE QU'UN RÔLE ACTIF EXIGE — comparé à la fiche
   * ENREGISTRÉE (`person`), jamais à la déclaration seule. La portée dit quels champs
   * comptent, la fiche dit s'ils portaient une valeur ; la saisie est lue sur ses six
   * champs d'adresse, sous leurs noms de colonne.
   * ⚠️ TROIS MESSAGES POUR LES DEUX CHAMPS QUE LA DÉCLARATION EXIGE AUJOURD'HUI —
   * les mêmes que les modales de rôle.
   */
  const portee = exigence === 'lecture' || exigence === 'echec' ? null : exigence;
  const vides: ChampPersonne[] =
    portee !== null && valeur?.mode === 'new'
      ? champsVidesParLaCorrection(champsRequisDeLaPortee(portee), person, {
          address_line1: valeur.addressLine1,
          address_line2: valeur.addressLine2,
          address_city: valeur.addressCity,
          address_province: valeur.addressProvince,
          address_postal_code: valeur.addressPostalCode,
          address_country: valeur.addressCountry,
        })
      : [];
  const messageDomicile =
    vides.length === 0 ? undefined
    : vides.length === 2 ? t('errorCityAndCountry')
    : vides[0] === 'address_city' ? t('errorCity')
    : t('errorCountry');

  const handleSave = useCallback(async () => {
    // Le sélecteur ne remonte une valeur que si le nom est non vide ; on ne
    // s'en remet pas à lui pour autant — full_name est NOT NULL en base.
    if (!valeur || valeur.mode !== 'new' || !valeur.fullName.trim()) {
      setError(t('errorNameRequired'));
      return;
    }
    // Ceintures : le bouton refuse déjà ces deux cas. Gardées pour le jour où une
    // touche Entrée contournerait le bouton, comme dans les modales de rôle.
    if (portee === null) {
      if (exigence === 'echec') setError(t('editPersonRolesUnreadable'));
      return;
    }
    if (messageDomicile) {
      setError(messageDomicile);
      return;
    }

    setSaving(true);
    setError(null);
    try {
      /**
       * ③ LA RESIDENCE SORT DE LA CHARGE UTILE, ELLE N'EST PAS ECRASEE.
       *
       * Quand elle ne s'applique pas, ce champ n'est PAS envoye — ni `null`,
       * ni `false`. Une personne peut porter une residence DECLAREE alors que
       * la societe n'est pas federale : une prorogation dans l'autre sens,
       * rare mais reelle. On ne detruit pas une declaration parce que le
       * regime COURANT s'en desinteresse ; elle redeviendrait pertinente au
       * retour. Meme logique que le verrou, qui est derive et non stocke.
       *
       * ⚠️ ET C'EST L'INVERSE DE LA CREATION, DELIBEREMENT. A l'insertion on
       * ecrit `null` explicitement (PersonSelector), parce qu'omettre y
       * laisserait le DEFAULT TRUE fabriquer un « Oui ». Ici il n'y a pas de
       * defaut a craindre : omettre PRESERVE, et c'est ce qu'on veut.
       */
      const correctifIdentite: Record<string, unknown> = {
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
      };
      if (residencyApplies) {
        correctifIdentite.is_canadian_resident = valeur.isCanadianResident;
      }

      const { error: updateErr } = await supabase
        .from('company_people')
        .update(correctifIdentite)
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
  }, [valeur, person, companyId, supabase, onSuccess, t, tCommon, residencyApplies, portee, exigence, messageDomicile]);

  return (
    <Modale
      onClose={onClose}
      occupe={saving}
      classePanneau="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl shadow-xl modal-surface sm:rounded-2xl"
    >
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

          {/* ⛔ LE FORMULAIRE N'EST MONTÉ QU'UNE FOIS L'EXIGENCE CONNUE. Monté pendant la
              lecture, il afficherait des astérisques faux puis les corrigerait. */}
          {exigence === 'lecture' ? (
            <p className="text-sm text-[var(--text-muted)]">{t('loading')}</p>
          ) : exigence === 'echec' ? (
            <p role="alert" className="text-sm text-[var(--error-text)]">{t('editPersonRolesUnreadable')}</p>
          ) : (
            <PersonSelector
              exigences={exigence}
              residencyApplies={residencyApplies}
              companyId={companyId}
              value={valeur}
              onChange={setValeur}
              error={messageDomicile}
              lockToNewMode
            />
          )}

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
            disabled={saving || portee === null || vides.length > 0}
            className="flex items-center gap-2 rounded-lg bg-[var(--amber-400)] px-5 py-2 text-sm font-semibold text-[var(--on-amber)] transition-opacity disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {tCommon('save')}
          </button>
        </div>
      </Modale>
  );
}
