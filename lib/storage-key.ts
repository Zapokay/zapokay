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
  options: { keepSpaces?: boolean } = {},
): string {
  // `keepSpaces` — UN paramètre sur la règle unique, pas une deuxième règle.
  // Le risque de compatibilité mesuré porte sur les ACCENTS, que le NFD retire
  // dans les deux modes ; l'espace, lui, passe partout. Il n'est conservé que
  // là où on le demande : les noms de l'archive, qui se lisent. Le défaut
  // `false` laisse les CLÉS DE STOCKAGE — upload-document.ts, le téléchargement
  // unitaire — rigoureusement inchangées : un fichier déjà rangé reste trouvable.
  const { keepSpaces = false } = options;
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
    const sansAccents = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return keepSpaces
      ? sansAccents.replace(/[^A-Za-z0-9._ -]/g, '_').replace(/_+/g, '_').replace(/ {2,}/g, ' ')
      : sansAccents.replace(/[^A-Za-z0-9._-]/g, '_').replace(/_+/g, '_');
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
