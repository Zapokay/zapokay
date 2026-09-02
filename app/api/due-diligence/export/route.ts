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
import {
  getCoverTitle, getCoverSubtitle, getCoverFileName, getCoverDate,
  getIndexTitle, getIndexFileName, getIndexColumns,
  getRegistersFileName, getRegisterLabels,
} from '@/lib/i18n/export-labels';
import { MINUTE_BOOK_SECTIONS } from '@/lib/minute-book-section';
import { getSectionLabel } from '@/lib/i18n/section-labels';

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
      .select('id, document_type, title, file_name, file_url, minute_book_section')
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
      file_name: string;
      file_url: string;
      minute_book_section: string | null;
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
    const entrees: { section: string; titre: string; chemin: string }[] = [];

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

      // Suffixer doc.id pour garantir l'unicité dans la section : plusieurs
      // documents peuvent partager le même file_name (JSZip écrase silencieusement
      // les chemins en doublon).
      const rawName = doc.file_name.replace(/[^a-zA-Z0-9À-ÿ._-]/g, '_');
      const dotIdx = rawName.lastIndexOf('.');
      const base = dotIdx === -1 ? rawName : rawName.slice(0, dotIdx);
      const ext = dotIdx === -1 ? '' : rawName.slice(dotIdx);
      const safeName = `${base}_${doc.id.slice(0, 8)}${ext}`;

      const chemin = `${getSectionFolderName(section, docLanguage)}/${safeName}`;
      zip.file(chemin, fileBuffer);
      entrees.push({ section, titre: doc.title, chemin });
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
        const lignes = siennes.map((e) => ({ title: e.titre, fileName: e.chemin }));
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
              { title: getSectionLabel('registres', docLanguage), fileName: cheminRegistres },
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
            status: e.is_active ? '✓' : '✗',
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
            status: e.is_active ? '✓' : '✗',
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
            stated_capital: new Intl.NumberFormat(docLanguage === 'en' ? 'en-CA' : 'fr-CA', {
              style: 'currency', currency: e.currency || 'CAD',
            }).format(e.stated_capital ?? 0),
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

    const sanitizedCompanyName = companyName
      .replace(/[^a-zA-Z0-9À-ÿ\s-]/g, '')
      .replace(/\s+/g, '-')
      .substring(0, 40);

    const dateStr = now.toISOString().split('T')[0];
    const downloadFileName = `livre-minutes-${sanitizedCompanyName}-${dateStr}.zip`;

    return new NextResponse(zipBuffer as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${downloadFileName}"`,
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
