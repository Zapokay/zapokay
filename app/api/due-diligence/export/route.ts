export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { createClient } from '@/lib/supabase/server';
import JSZip from 'jszip';
import { filePathFromFileUrl } from '@/lib/storage-path';
import { pickCompanyLegalName } from '@/lib/company-name';
import { sectionOfDocument } from '@/lib/minute-book-section';
import { getSectionFolderName } from '@/lib/i18n/section-labels';
import { applyBinderDocumentOrder } from '@/lib/minute-book/document-order';
import {
  readDirectorRegister, readOfficerRegister, readShareholderRegister, readStatedCapitalRegister,
} from '@/lib/minute-book/registers';
import { normalizePdfSpaces } from '@/lib/pdf/pdf-safe-text';
import { toStorageSafeName } from '@/lib/storage-key';
import {
  getCoverTitle, getCoverSubtitle, getCoverFileName, getCoverDate,
  getIndexTitle, getIndexFileName, getIndexColumns,
  getRegistersFileName, getRegisterLabels, getRegistersAsAtLabel, getArchiveBaseName,
} from '@/lib/i18n/export-labels';
import { MINUTE_BOOK_SECTIONS } from '@/lib/minute-book-section';
import { getSectionLabel } from '@/lib/i18n/section-labels';

/* ------------------------------------------------------------------ */
/*  Longueurs du nom d'entrée                                          */
/* ------------------------------------------------------------------ */

/**
 * Le TITRE, et lui seul, est borné : la dénomination identifie, l'année situe,
 * le discriminant garantit l'unicité — les tronquer perdrait la fonction pour
 * de la cosmétique.
 *
 * ⚠️ 60 EST UNE BORNE DE SÛRETÉ, PAS UNE COUPE. Mesuré sur le parc : le titre
 * le plus long fait 53 caractères, le 90e centile 47, AUCUN ne dépasse 60.
 * Elle ne tronque donc rien aujourd'hui et attend la saisie qui débordera.
 *
 * ⛔ AUCUNE LIMITE TECHNIQUE NE LA JUSTIFIE, et il faut le dire : JSZip accepte
 * un nom de 5006 caractères avec un aller-retour fidèle (mesuré), et les limites
 * des systèmes de destination ne sont pas observables depuis ici. C'est un choix
 * de lisibilité, assumé comme tel.
 */
const TITRE_MAX_CARACTERES = 60;

/**
 * Plafond de la partie LISIBLE — dénomination, titre, année. Le discriminant
 * n'en fait pas partie : il est apposé après, hors de portée de la troncature.
 *
 * ⛔ CE PLAFOND PEUT MORDRE SANS RIEN CASSER, et c'est tout son intérêt. La
 * version précédente comptait sur un plafond assez haut pour ne jamais se
 * déclencher — raisonnement fondé sur la dénomination la plus longue MESURÉE
 * (33 caractères), alors que legal_name_fr est TEXT sans longueur maximale.
 * Un échantillon tenait lieu de garantie. Ce qu'il tronque désormais, c'est du
 * texte lisible ; l'unicité, elle, ne dépend plus d'aucun plafond.
 *
 * 120 laisse passer tout le parc — la partie lisible la plus longue y fait 73
 * caractères — et borne le nom complet à ~135 dans le pire cas.
 */
const PARTIE_LISIBLE_MAX = 120;

/* ------------------------------------------------------------------ */
/*  Section mapping                                                    */
/* ------------------------------------------------------------------ */

// ⚠️ CETTE ROUTE NE CLASSE PLUS, ELLE DEMANDE. Elle portait sa propre table de
// cinq dossiers, indexée par `document_type` — donc une SECONDE classification,
// qui ne pouvait que diverger de l'écran au premier changement. Le rangement
// appelle désormais `sectionOfDocument`, la même fonction que la route du Livre,
// et le nom de dossier vient du rang dans la liste ordonnée. Même fonction,
// même repli, même ordre : c'est ce qui fait un miroir plutôt qu'une ressemblance.

/* ------------------------------------------------------------------ */
/*  Cover page (HTML → PDF via generatePDF)                            */
/* ------------------------------------------------------------------ */

// ⚠️ LA PAGE DE GARDE PORTE L'IDENTITÉ DU LIVRE ET SON COMPTE, RIEN DE PLUS.
// Elle affichait « Complétude : N% », un pourcentage qui ne pouvait valoir que
// zéro — son dénominateur venait d'une requête filtrant `company_id` sur un
// catalogue GLOBAL, qui n'a pas cette colonne, et dont personne ne lisait
// l'erreur. La mesure n'est pas réparée : elle est retirée. Un livre n'a pas de
// dénominateur, il a un compte.
// `sectionCounts` était calculé, transmis, et JETÉ par cette branche. Il
// reviendra au commit D, sur la page index, là où il sera lu.
interface CoverPageData {
  companyName: string;
  neq: string;
  documentCount: number;
  locale: 'fr' | 'en';
}

async function generateCoverPage(data: CoverPageData): Promise<Buffer> {
  const { generateCoverPagePDF } = await import('@/lib/pdf/generatePDF');

  return generateCoverPagePDF({
    companyName: data.companyName,
    neq: data.neq,
    title: getCoverTitle(data.locale),
    subtitle: getCoverSubtitle(data.documentCount, data.locale),
    preparedDate: getCoverDate(new Date(), data.locale),
    language: data.locale,
  });
}

/* ------------------------------------------------------------------ */
/*  GET handler                                                        */
/* ------------------------------------------------------------------ */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');

    if (!companyId) {
      return NextResponse.json(
        { error: 'companyId est requis.' },
        { status: 400 }
      );
    }

    /* ---------- Auth + ownership (closes the trusted-param hole) ----------
       This route reads with the SERVICE ROLE, which bypasses RLS entirely,
       and it returns EVERY stored file for the company as a ZIP — the
       widest-blast-radius read in the app. companyId ARRIVES IN THE QUERY
       STRING and must never be trusted: it is validated here against the
       session user's own companies, via the SESSION client (RLS-scoped)
       plus an explicit user_id match. Placed before the service client is
       built, so no company row is read, no signed URL is minted and no
       file is fetched for a caller without entitlement.
       401 = no identity. 403 = identity without entitlement. */

    const sessionClient = createClient();
    const {
      data: { user },
    } = await sessionClient.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });
    }

    const { data: ownedCompany, error: ownErr } = await sessionClient
      .from('companies')
      .select('id')
      .eq('id', companyId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (ownErr) {
      return NextResponse.json(
        { error: "Échec de la vérification d'appartenance." },
        { status: 500 }
      );
    }
    if (!ownedCompany) {
      return NextResponse.json({ error: 'Accès refusé.' }, { status: 403 });
    }

    const scopeParam = searchParams.get('scope') ?? 'all';
    if (scopeParam !== 'all' && scopeParam !== 'finalized') {
      return NextResponse.json(
        { error: 'Invalid scope. Allowed values: all, finalized.' },
        { status: 400 }
      );
    }
    const scope = scopeParam as 'all' | 'finalized';

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Configuration Supabase manquante.' },
        { status: 500 }
      );
    }

    const supabase = createServiceClient();

    /* ---------- Charger l'entreprise ---------- */

    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('id, legal_name_fr, legal_name_en, neq, incorporation_type')
      .eq('id', companyId)
      .single();

    if (companyError || !company) {
      return NextResponse.json(
        { error: 'Entreprise introuvable.' },
        { status: 404 }
      );
    }

    /* ---------- Langue du document ----------
     * Cet export prenait le francais en dur et n'avait aucune notion de langue.
     * users.preferred_language, jamais la locale d'URL (CLAUDE.md 3).
     * Forme reprise de bulk-generate/route.ts:178-183. */
    const { data: profile } = await supabase
      .from('users')
      .select('preferred_language')
      .eq('id', user.id)
      .single();
    const docLanguage: 'fr' | 'en' = profile?.preferred_language === 'en' ? 'en' : 'fr';

    const companyName = pickCompanyLegalName(company, docLanguage);
    if (!companyName) {
      return NextResponse.json(
        { error: 'Entreprise sans denomination.' },
        { status: 422 }
      );
    }

    /* ---------- Lire les registres — AVANT toute dépense ---------- */

    // ⚠️ ON ÉCHOUE SUR CE QUI COÛTE PEU. Quatre lectures de base précèdent la
    // requête des documents et, surtout, leurs téléchargements : si un registre
    // ne se lit pas, l'export refuse ici, avant d'avoir tiré un seul octet du
    // stockage. La règle est celle du 61c7ed8 — on ne livre pas un livre dont
    // une pièce manque en silence — appliquée aux registres.
    // ★ Les quatre lecteurs LÈVENT sur une erreur de base depuis ce lot : un
    // registre illisible n'est plus un registre vide.
    const lectures = await Promise.allSettled([
      readDirectorRegister(supabase, companyId),
      readOfficerRegister(supabase, companyId),
      readShareholderRegister(supabase, companyId),
      readStatedCapitalRegister(supabase, companyId, company.incorporation_type),
    ]);
    const registresRates = lectures.filter((r) => r.status === 'rejected');
    if (registresRates.length > 0) {
      for (const r of registresRates) {
        console.error(`[due-diligence/export] register read failed for company ${companyId}:`,
          (r as PromiseRejectedResult).reason);
      }
      return NextResponse.json(
        { error: 'registers_unavailable', missingCount: registresRates.length },
        { status: 502 },
      );
    }
    const [regAdmin, regDirig, regAct, regCapital] = lectures.map(
      (r) => (r as PromiseFulfilledResult<unknown>).value,
    ) as [
      Awaited<ReturnType<typeof readDirectorRegister>>,
      Awaited<ReturnType<typeof readOfficerRegister>>,
      Awaited<ReturnType<typeof readShareholderRegister>>,
      Awaited<ReturnType<typeof readStatedCapitalRegister>>,
    ];

    /* ---------- Charger les documents actifs ---------- */

    let documentsQuery = supabase
      .from('documents')
      .select('id, document_type, title, file_name, file_url, minute_book_section, document_year')
      .eq('company_id', companyId)
      .eq('status', 'active');

    if (scope === 'finalized') {
      documentsQuery = documentsQuery.eq('is_finalized', true);
    }

    // ⚠️ LE MÊME ORDRE QUE LE LIVRE, et il n'est écrit qu'une fois.
    const { data: documents, error: docsError } =
      await applyBinderDocumentOrder(documentsQuery);

    if (docsError) {
      console.error('Documents fetch error:', docsError);
      return NextResponse.json(
        { error: 'Impossible de charger les documents.' },
        { status: 500 }
      );
    }

    // ⚠️ ANNOTÉ, ET C'EST CE QUI REND LA GARDE RÉELLE. Sans ce type, `documents`
    // arrive en `any[]` du select non typé, et `doc.document_type` passait partout
    // — un `getSectionFolderName(doc.document_type, …)` compilait sans broncher.
    // Les six colonnes sont exactement celles que la requête demande.
    interface ExportDocument {
      id: string;
      document_type: string;
      title: string;
      /** ⚠️ NULLABLE EN BASE, et le type l'affirmait non-null : c'est ce
       *  mensonge qui laissait `.replace()` compiler alors que 5 documents
       *  actifs ont file_name à NULL. */
      file_name: string | null;
      file_url: string;
      minute_book_section: string | null;
      /** Nulle pour 25 documents sur 113 — le segment d'année est alors omis. */
      document_year: number | null;
    }
    const allDocuments: ExportDocument[] = documents ?? [];

    /* ---------- Organiser par section ---------- */

    // ⚠️ LES PIÈCES INTROUVABLES SONT COMPTÉES, PLUS SAUTÉES. Trois `continue`
    // vivaient dans cette boucle : chemin irrésolu, URL signée ratée,
    // téléchargement raté. Chacun retirait une pièce de l'archive SANS RIEN
    // DIRE — un livre incomplet remis à un avocat est un dommage irréversible,
    // un export à relancer est un ennui. On refuse maintenant, et on nomme le
    // nombre. Les identifiants partent au journal serveur : l'utilisateur ne
    // peut pas réparer un fichier cassé, nous si, et personne ne savait qu'il
    // en existait.
    const unavailable: string[] = [];

    // ⚠️ CE QUE LA BOUCLE ÉCRIT, ELLE LE RETIENT — l'index sera bâti là-dessus,
    // jamais sur une seconde application de la règle de nommage. Une seule
    // écriture, deux lecteurs : le zip et l'index ne peuvent pas se contredire.
    // ★ Rempli APRÈS les trois `continue`, donc une pièce refusée n'y entre
    // jamais — l'index ne décrit que ce qui est réellement dans l'archive.
    // `nom` est le nom SEUL, sans dossier : l'index le rend tel quel, et le
    // chemin complet reste disponible pour qui en aurait besoin. Deux champs
    // issus d'une seule écriture — pas deux constructions qui pourraient
    // diverger.
    const entrees: { section: string; titre: string; chemin: string; nom: string }[] = [];

    const zip = new JSZip();

    for (const doc of allDocuments) {
      const section = sectionOfDocument(doc);

      // Normaliser file_url (legacy: full public URL ou clé relative) → clé relative.
      const storagePath = filePathFromFileUrl(doc.file_url);
      if (!storagePath) {
        console.error(`[due-diligence/export] cannot resolve storage path for doc ${doc.id}`);
        unavailable.push(doc.id);
        continue;
      }

      // Télécharger le fichier depuis Supabase Storage
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from('documents')
        .createSignedUrl(storagePath, 60); // 60 secondes

      if (signedUrlError || !signedUrlData?.signedUrl) {
        console.error(`[due-diligence/export] signed URL failed for doc ${doc.id} (${storagePath}):`, signedUrlError);
        unavailable.push(doc.id);
        continue;
      }

      const fileResponse = await fetch(signedUrlData.signedUrl);
      if (!fileResponse.ok) {
        console.error(`[due-diligence/export] download failed for doc ${doc.id} (${doc.file_name}): ${fileResponse.status}`);
        unavailable.push(doc.id);
        continue;
      }

      const fileBuffer = await fileResponse.arrayBuffer();

      // ⚠️ LE NOM D'IMPORT NE PARAÎT PLUS. Il ne disait rien : 29 documents
      // actifs sur 85 portaient un UUID pur comme file_name, et le code y
      // ajoutait 8 caractères d'UUID de plus — deux identifiants opaques et
      // zéro mot lisible. La colonne reste en base ; elle cesse d'être affichée.
      //
      // ★ L'EXTENSION est le seul morceau qui vienne encore du fichier. Elle se
      // lit sur file_name, PUIS sur storagePath — déjà normalisé plus haut, donc
      // fiable même quand file_name est NULL (5 documents actifs le sont, et
      // .replace() y levait un TypeError sur le chemin scope=all).
      // Si NI l'un NI l'autre ne porte d'extension, on n'en invente pas : un
      // « .pdf » supposé serait faux pour les .txt générés du parc.
      const extDe = (s: string | null): string => {
        const m = (s ?? '').match(/\.[A-Za-z0-9]+$/);
        return m ? m[0] : '';
      };
      const ext = extDe(doc.file_name) || extDe(storagePath);

      // {dénomination}-{titre}-{année}-{discriminant}.{ext}
      // · dénomination : déjà résolue selon docLanguage par pickCompanyLegalName.
      // · titre : documents.title, DANS SA LANGUE DE SAISIE — la colonne n'est
      //   pas bilingue et TITLE-I18N-1 n'est pas implémentée ; on ne traduit
      //   jamais ce que l'utilisateur a nommé.
      // · année : document_year. Le segment est OMIS quand elle est nulle (25
      //   documents sur 113) — un nom n'affirme que ce qu'on sait, et l'année
      //   courante serait une affirmation fausse. ⛔ Pas fiscal_year : NULL partout.
      // · discriminant : les 8 premiers caractères de documents.id. STABLE d'un
      //   export à l'autre parce que l'id ne change jamais ; un numéro d'ordre
      //   se déplacerait au premier document ajouté. Il reste indispensable :
      //   JSZip écrase en silence, et l'année seule laisse 11 documents en
      //   collision sur le parc (6 pour le pire groupe).
      // ⚠️ LE DISCRIMINANT EST APPOSÉ APRÈS L'ASSAINISSEMENT, ET C'EST
      // STRUCTUREL. toStorageSafeName tronque la FIN de la base quand elle
      // dépasse son plafond — or le discriminant y vivait. Une dénomination
      // assez longue le mangeait, et deux documents produisaient alors le MÊME
      // chemin : JSZip en écrasait un sans bruit. Mesuré sur une dénomination
      // de 210 caractères — que rien n'interdit, la colonne étant TEXT sans
      // longueur maximale — deux documents devenaient un seul fichier.
      // Hors de la chaîne assainie, le discriminant est hors d'atteinte : ce
      // n'est plus un plafond bien choisi qui protège, c'est la construction.
      const titreCourt = doc.title.slice(0, TITRE_MAX_CARACTERES);
      const segAnnee = doc.document_year != null ? ` - ${doc.document_year}` : '';
      const lisible = toStorageSafeName(
        `${companyName} - ${titreCourt}${segAnnee}`,
        PARTIE_LISIBLE_MAX,
        { keepSpaces: true },
      ).replace(/[._ -]+$/, '');
      const safeName = `${lisible || 'document'} - ${doc.id.slice(0, 8)}${ext}`;

      const chemin = `${getSectionFolderName(section, docLanguage)}/${safeName}`;
      zip.file(chemin, fileBuffer);
      entrees.push({ section, titre: doc.title, chemin, nom: safeName });
    }

    // ⛔ LE REFUS SORT ICI, AVANT LE MOINDRE OCTET D'ARCHIVE. La page de garde
    // n'est pas rendue, `generateAsync` n'est pas appelé, rien n'est expédié :
    // le zip n'existe encore qu'en mémoire, à moitié rempli, et il y reste.
    if (unavailable.length > 0) {
      console.error(
        `[due-diligence/export] ABORTED for company ${companyId} — ${unavailable.length} document(s) unavailable:`,
        unavailable.join(', '),
      );
      return NextResponse.json(
        { error: 'documents_unavailable', missingCount: unavailable.length },
        { status: 502 },
      );
    }

    /* ---------- Page de garde ---------- */

    const now = new Date();

    const coverPageBuffer = await generateCoverPage({
      companyName,
      neq: company.neq,
      documentCount: allDocuments.length,
      locale: docLanguage,
    });

    zip.file(getCoverFileName(docLanguage), coverPageBuffer);

    /* ---------- Page index ---------- */

    // ⚠️ LES NEUF SECTIONS, VIDES COMPRISES. Une section sans document n'a pas
    // de dossier dans l'archive — seul l'index peut dire qu'elle existe et
    // qu'elle est vide. C'est là que le miroir se complète.
    // Le chemin du PDF des registres ne dépend que de la locale : il est calculé
    // ICI pour que l'index puisse le NOMMER, et il n'est calculé qu'une fois —
    // l'archive et l'index citent la même chaîne, pas deux constructions.
    const cheminRegistres = `${getSectionFolderName('registres', docLanguage)}/${getRegistersFileName(docLanguage)}`;

    const { generateBinderIndexPDF } = await import('@/lib/pdf/generatePDF');
    const indexBuffer = await generateBinderIndexPDF({
      companyName,
      neq: company.neq,
      documentTitle: getIndexTitle(docLanguage),
      documentSubtitle: getCoverSubtitle(allDocuments.length, docLanguage),
      columns: getIndexColumns(docLanguage),
      sections: MINUTE_BOOK_SECTIONS.map((cle, rang) => {
        const siennes = entrees.filter((e) => e.section === cle);
        // ⚠️ LE NOM SEUL, PAS LE CHEMIN. La colonne répétait le préfixe de
        // section sur toutes les lignes d'un même tableau — un préfixe déjà
        // écrit deux fois : en titre juste au-dessus, et dans l'en-tête de page
        // pour la société. Il ne portait aucune information et poussait chaque
        // ligne sur deux.
        const lignes = siennes.map((e) => ({ title: e.titre, fileName: e.nom }));
        if (cle === 'registres') {
          // ⚠️ L'ÉTAGÈRE 7 DIT CE QUE L'ÉCRAN DIT. Son compte vient de
          // minuteBook.binder.registerCount, la clé même que BinderSection
          // emploie depuis b595546 — « 4 registres », pas « 1 document ». Les
          // registres ne sont pas des documents, et le compte total n'en tient
          // pas compte non plus.
          return {
            heading: `${rang + 1} - ${getSectionLabel(cle, docLanguage)}`,
            count: getRegisterLabels(docLanguage).registerCount(4),
            entries: [
              ...lignes,
              { title: getSectionLabel('registres', docLanguage), fileName: getRegistersFileName(docLanguage) },
            ],
          };
        }
        return {
          heading: `${rang + 1} - ${getSectionLabel(cle, docLanguage)}`,
          count: getCoverSubtitle(siennes.length, docLanguage),
          entries: lignes,
        };
      }),
      footerDocName: getIndexTitle(docLanguage),
      language: docLanguage,
    });

    zip.file(getIndexFileName(docLanguage), indexBuffer);

    /* ---------- Les registres, en UN document ---------- */

    // ⚠️ IL N'ENTRE PAS DANS LE COMPTE DES DOCUMENTS. L'écran ne compte pas les
    // registres parmi les documents ; s'il y entrait, la page de garde et
    // l'index diraient un de plus que l'écran, et le miroir se casserait sur le
    // chiffre même qui le résume.
    const L = getRegisterLabels(docLanguage);
    const fmtDate = (d: string | null) => d ?? '—';
    const { generateBinderRegistersPDF } = await import('@/lib/pdf/generatePDF');
    const registresBuffer = await generateBinderRegistersPDF({
      companyName,
      neq: company.neq,
      documentTitle: getSectionLabel('registres', docLanguage),
      // `now` — le MÊME instant que le nom du fichier ZIP, pas un second
      // `new Date()` qui pourrait basculer de jour entre les deux lectures.
      effectiveDate: {
        label: getRegistersAsAtLabel(docLanguage),
        value: getCoverDate(now, docLanguage),
      },
      registers: [
        {
          title: docLanguage === 'en' ? regAdmin.register_title_en : regAdmin.register_title_fr,
          columns: [
            { key: 'full_name', label: L.name }, { key: 'resident', label: L.residence },
            { key: 'appointment_date', label: L.start }, { key: 'end_date', label: L.end },
            { key: 'status', label: L.active },
          ],
          rows: regAdmin.entries.map((e) => ({
            full_name: e.full_name,
            resident: e.is_canadian_resident ? L.yes : L.no,
            appointment_date: e.appointment_date,
            end_date: fmtDate(e.end_date),
            status: e.is_active ? L.activeYes : L.activeNo,
          })),
          emptyMessage: L.empty,
        },
        {
          title: docLanguage === 'en' ? regDirig.register_title_en : regDirig.register_title_fr,
          columns: [
            { key: 'full_name', label: L.name }, { key: 'title', label: L.title },
            { key: 'appointment_date', label: L.start }, { key: 'end_date', label: L.end },
            { key: 'status', label: L.active },
          ],
          rows: regDirig.entries.map((e) => ({
            full_name: e.full_name, title: e.title,
            appointment_date: e.appointment_date, end_date: fmtDate(e.end_date),
            status: e.is_active ? L.activeYes : L.activeNo,
          })),
          emptyMessage: L.empty,
        },
        {
          title: docLanguage === 'en' ? regAct.register_title_en : regAct.register_title_fr,
          columns: [
            { key: 'full_name', label: L.name }, { key: 'share_class', label: L.shareClass },
            { key: 'quantity', label: L.quantity }, { key: 'certificate_number', label: L.certificate },
            { key: 'issue_date', label: L.issueDate },
          ],
          rows: regAct.entries.map((e) => ({
            full_name: e.full_name, share_class: e.share_class,
            quantity: String(e.quantity), certificate_number: e.certificate_number ?? '—',
            issue_date: e.issue_date,
          })),
          emptyMessage: L.empty,
        },
        {
          title: docLanguage === 'en' ? regCapital.register_title_en : regCapital.register_title_fr,
          columns: [
            { key: 'class_name', label: L.shareClass },
            { key: 'stated_capital', label: L.statedCapital },
          ],
          rows: regCapital.entries.map((e) => ({
            class_name: e.class_name,
            // normalizePdfSpaces : U+202F (ICU récentes, fr) est ABSENT d'Open
            // Sans, la seule police du conteneur — le séparateur disparaîtrait.
            stated_capital: normalizePdfSpaces(
              new Intl.NumberFormat(docLanguage === 'en' ? 'en-CA' : 'fr-CA', {
                style: 'currency', currency: e.currency || 'CAD',
              }).format(e.stated_capital ?? 0)
            ),
          })),
          emptyMessage: L.empty,
          citation: docLanguage === 'en' ? regCapital.citation_en : regCapital.citation_fr,
          footnote: (() => {
            const manquantes = regCapital.entries.reduce((n, e) => n + (e.issuances_missing_price || 0), 0);
            return manquantes > 0 ? L.missingConsideration(manquantes) : undefined;
          })(),
        },
      ],
      footerDocName: getSectionLabel('registres', docLanguage),
      language: docLanguage,
    });

    zip.file(cheminRegistres, registresBuffer);

    /* ---------- Générer le ZIP ---------- */

    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    /* ---------- Réponse ---------- */

    // toStorageSafeName, la règle UNIQUE du dépôt : NFD, diacritiques retirés,
    // tout le reste hors [A-Za-z0-9._-] devient « _ ». L'ancienne règle locale
    // gardait les accents (classe À-ÿ) et posait donc U+00E9 dans un en-tête
    // HTTP, qui est ASCII seulement — « Café du Coin inc. » le déclenchait.
    const sanitizedCompanyName = toStorageSafeName(companyName, 40, { keepSpaces: true });

    const dateStr = now.toISOString().split('T')[0];
    // ⚠️ L'ESPACE EST LÉGAL DANS `filename="…"` : la RFC 6266 y attend une
    // quoted-string, où 0x20 est permis. Mesuré plutôt que supposé — un serveur
    // local pose cet en-tête, un fetch le relit intact, et l'extraction du modal
    // en tire le nom complet, espaces compris.
    const downloadFileName =
      `${getArchiveBaseName(docLanguage)} - ${sanitizedCompanyName} - ${dateStr}.zip`;

    // Patron RFC 5987, repris de app/api/documents/[id]/download/route.ts — pas
    // un second. `filename` porte l'ASCII ; `filename*` reste NON QUOTÉ, comme
    // la RFC l'exige, et sert le chemin sans JS (URL ouverte directement).
    // Le nom étant déjà ASCII pur, les deux valeurs coïncident aujourd'hui.
    const encodedFileName = encodeURIComponent(downloadFileName);

    return new NextResponse(zipBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition':
          `attachment; filename="${downloadFileName}"; filename*=UTF-8''${encodedFileName}`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('due-diligence/export error:', error);
    return NextResponse.json(
      { error: 'Erreur interne du serveur.' },
      { status: 500 }
    );
  }
}
