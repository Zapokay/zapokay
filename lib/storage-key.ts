// Sprint 9H hotfix — Supabase Storage keys must be ASCII-safe. This sanitizer handles filenames and company name fragments.

/**
 * Convert a user-supplied filename or string into a Supabase Storage-safe key fragment.
 * - NFD-normalizes Unicode and strips combining marks (é → e, ñ → n)
 * - Replaces any remaining non-[A-Za-z0-9._-] with underscore
 * - Collapses consecutive underscores to single underscore
 * - Preserves file extension if present
 * - Truncates the base name (not the extension) to a max length
 * - Trims leading/trailing underscores and dots from the base name
 * - Returns a safe ASCII string suitable for use in Supabase Storage object keys
 *
 * Examples:
 *   "Règlement intérieur No1.pdf" → "Reglement_interieur_No1.pdf"
 *   "C'est déjà fait.pdf" → "C_est_deja_fait.pdf"
 *   "Les Entreprises Z Inc." → "Les_Entreprises_Z_Inc"
 */
export function toStorageSafeName(
  input: string,
  maxBaseLength = 80,
  options: { readable?: boolean } = {},
): string {
  // `readable` — UN paramètre sur la règle unique, pas une deuxième règle.
  // Il s'appelait `keepSpaces` : le nom a cessé d'être vrai quand le mode s'est
  // mis à faire plus que garder les espaces. Ce qu'il décrit maintenant, c'est
  // la DESTINATION du nom — être lu par un humain, ou servir de clé.
  //
  // ⛔ Le défaut `false` laisse les CLÉS DE STOCKAGE rigoureusement inchangées
  // (upload-document.ts, le téléchargement unitaire) : un fichier déjà rangé
  // doit rester trouvable. Ce mode garde sa LISTE BLANCHE stricte.
  //
  // Le mode lisible inverse la logique : il interdit au lieu d'autoriser, parce
  // qu'une liste blanche étroite massacrait la ponctuation ordinaire —
  // « Transfert d'actions » devenait « Transfert d_actions », et 51 des 85
  // documents actifs du parc portaient au moins un souligné de ce genre.
  const { readable = false } = options;
  const raw = (input ?? '').toString();

  // Split base + extension. Treat as "no extension" if no dot, a leading dot,
  // or nothing after the last dot.
  const lastDot = raw.lastIndexOf('.');
  let base: string;
  let ext: string;
  if (lastDot > 0 && lastDot < raw.length - 1) {
    base = raw.slice(0, lastDot);
    ext = raw.slice(lastDot); // includes the dot
  } else {
    base = raw;
    ext = '';
  }

  const sanitize = (s: string): string => {
    // Les ACCENTS partent dans les deux modes \u2014 d\u00e9cision du 2026-09-04, elle
    // n'est pas rouverte ici.
    const sansAccents = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (!readable) {
      return sansAccents.replace(/[^A-Za-z0-9._-]/g, '_').replace(/_+/g, '_');
    }
    return (
      sansAccents
        // 1. TRANSLITT\u00c9RER ce qui a un \u00e9quivalent ASCII \u00e9vident, avant de
        //    filtrer : sans cela l'apostrophe typographique et le tiret
        //    cadratin \u2014 les deux caract\u00e8res les plus fr\u00e9quents du parc apr\u00e8s
        //    les accents \u2014 deviendraient des soulign\u00e9s.
        .replace(/[\u2018\u2019\u201a\u201b]/g, "'")
        .replace(/[\u2013\u2014\u2012\u2212]/g, '-')
        .replace(/\u2026/g, '...')
        .replace(/\u00ba/g, 'o')
        .replace(/\u00aa/g, 'a')
        // Espaces Unicode \u2192 espace ordinaire. U+00A0 et U+202F ressemblent \u00e0
        // une espace sans en \u00eatre une ; U+202F est en outre absent d'Open Sans.
        .replace(/[\u00a0\u2007\u2009\u202f]/g, ' ')
        // Guillemets typographiques : SUPPRIM\u00c9S, pas convertis \u2014 leur
        // \u00e9quivalent ASCII est `"`, que la ligne suivante interdit.
        .replace(/[\u201c\u201d\u201e\u00ab\u00bb]/g, '')
        // 2. LA LISTE NOIRE.
        //    \u00b7 contr\u00f4les : jamais l\u00e9gitimes dans un nom, supprim\u00e9s sans trace.
        .replace(/[\u0000-\u001F\u007F]/g, '')
        //    \u00b7 `/` MESUR\u00c9 : JSZip l'INTERPR\u00c8TE. Un titre \u00ab 50/50 split \u00bb range
        //      le fichier dans un sous-dossier \u00ab \u2026 - 50 \u00bb que personne n'a voulu.
        //    \u00b7 `"` MESUR\u00c9 : il ferme la quoted-string du Content-Disposition et
        //      tronque le nom que le modal en extrait.
        //    \u00b7 `\ : * ? < > |` : r\u00e9serv\u00e9s par les syst\u00e8mes de fichiers Windows.
        //      \u26a0\ufe0f Non mesurable ici \u2014 aucun de nos outils ne les refuse \u2014 mais
        //      le risque est asym\u00e9trique : les bannir ne co\u00fbte qu'un soulign\u00e9.
        .replace(/[/\\:*?"<>|]/g, '_')
        // 3. LE FILET. Tout ce qui reste hors ASCII imprimable \u2014 cyrillique,
        //    CJK, emoji, symboles rares. Sans lui, la liste noire laisserait
        //    passer du non-ASCII et contredirait EN SILENCE la d\u00e9cision du
        //    09-04, dont tout l'objet \u00e9tait la compatibilit\u00e9.
        .replace(/[^\x20-\x7E]/g, '_')
        .replace(/_+/g, '_')
        .replace(/ {2,}/g, ' ')
    );
  };

  // Le rognage des bords couvre l'espace : en mode `keepSpaces` il survit au
  // nettoyage et se retrouverait sinon en t\u00eate ou en queue du nom.
  let safeBase = sanitize(base).replace(/^[._ ]+|[._ ]+$/g, '');
  const safeExt = sanitize(ext);

  if (safeBase.length > maxBaseLength) {
    safeBase = safeBase.slice(0, maxBaseLength).replace(/[_ ]+$/g, '');
  }

  const result = safeBase + safeExt;
  return result.length > 0 ? result : 'file';
}
