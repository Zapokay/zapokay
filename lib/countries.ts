/**
 * Les codes de pays ISO-3166-1 alpha-2, et rien d'autre.
 *
 * ⛔ AUCUN NOM DE PAYS N'EST ÉCRIT ICI, ET C'EST DÉLIBÉRÉ. Les libellés
 * viennent d'`Intl.DisplayNames`, natif au runtime — donc 252 pays × 2 locales
 * = 504 chaînes que personne n'a à traduire, à relire ni à maintenir. Aucune
 * dépendance n'est ajoutée : la capacité est déjà là, elle n'était pas employée.
 *
 * COMMENT CETTE LISTE A ÉTÉ OBTENUE, pour qui voudra la régénérer :
 * on énumère AA..ZZ contre `Intl.DisplayNames(['en'], { fallback: 'none' })`
 * — 280 régions connues d'ICU — puis on retire trois familles, nommées dans
 * EXCLUS ci-dessous. Reste 252, sans aucun doublon de nom (test mécanique :
 * deux codes qui rendent le même libellé sont un alias déprécié).
 *
 *   EXCLUS = groupements et pseudo-locales  EU EZ UN QO XA XB
 *            réservations exceptionnelles   AC CP DG EA IC TA
 *            codes dépréciés et alias       SU DD FX YU ZR AN BU CS TP YD
 *                                           HV DY UK NH RH VD
 *
 * ★ XK (Kosovo) EST CONSERVÉ bien qu'il ne soit pas assigné par l'ISO : c'est
 * une destination postale réelle, et une adresse qu'on ne peut pas écrire est
 * le défaut même que ce lot corrige.
 */
export const COUNTRY_CODES = [
  'AD', 'AE', 'AF', 'AG', 'AI', 'AL', 'AM', 'AO', 'AQ', 'AR', 'AS', 'AT',
  'AU', 'AW', 'AX', 'AZ', 'BA', 'BB', 'BD', 'BE', 'BF', 'BG', 'BH', 'BI',
  'BJ', 'BL', 'BM', 'BN', 'BO', 'BQ', 'BR', 'BS', 'BT', 'BV', 'BW', 'BY',
  'BZ', 'CA', 'CC', 'CD', 'CF', 'CG', 'CH', 'CI', 'CK', 'CL', 'CM', 'CN',
  'CO', 'CQ', 'CR', 'CU', 'CV', 'CW', 'CX', 'CY', 'CZ', 'DE', 'DJ', 'DK',
  'DM', 'DO', 'DZ', 'EC', 'EE', 'EG', 'EH', 'ER', 'ES', 'ET', 'FI', 'FJ',
  'FK', 'FM', 'FO', 'FR', 'GA', 'GB', 'GD', 'GE', 'GF', 'GG', 'GH', 'GI',
  'GL', 'GM', 'GN', 'GP', 'GQ', 'GR', 'GS', 'GT', 'GU', 'GW', 'GY', 'HK',
  'HM', 'HN', 'HR', 'HT', 'HU', 'ID', 'IE', 'IL', 'IM', 'IN', 'IO', 'IQ',
  'IR', 'IS', 'IT', 'JE', 'JM', 'JO', 'JP', 'KE', 'KG', 'KH', 'KI', 'KM',
  'KN', 'KP', 'KR', 'KW', 'KY', 'KZ', 'LA', 'LB', 'LC', 'LI', 'LK', 'LR',
  'LS', 'LT', 'LU', 'LV', 'LY', 'MA', 'MC', 'MD', 'ME', 'MF', 'MG', 'MH',
  'MK', 'ML', 'MM', 'MN', 'MO', 'MP', 'MQ', 'MR', 'MS', 'MT', 'MU', 'MV',
  'MW', 'MX', 'MY', 'MZ', 'NA', 'NC', 'NE', 'NF', 'NG', 'NI', 'NL', 'NO',
  'NP', 'NR', 'NU', 'NZ', 'OM', 'PA', 'PE', 'PF', 'PG', 'PH', 'PK', 'PL',
  'PM', 'PN', 'PR', 'PS', 'PT', 'PW', 'PY', 'QA', 'RE', 'RO', 'RS', 'RU',
  'RW', 'SA', 'SB', 'SC', 'SD', 'SE', 'SG', 'SH', 'SI', 'SJ', 'SK', 'SL',
  'SM', 'SN', 'SO', 'SR', 'SS', 'ST', 'SV', 'SX', 'SY', 'SZ', 'TC', 'TD',
  'TF', 'TG', 'TH', 'TJ', 'TK', 'TL', 'TM', 'TN', 'TO', 'TR', 'TT', 'TV',
  'TW', 'TZ', 'UA', 'UG', 'UM', 'US', 'UY', 'UZ', 'VA', 'VC', 'VE', 'VG',
  'VI', 'VN', 'VU', 'WF', 'WS', 'XK', 'YE', 'YT', 'ZA', 'ZM', 'ZW', 'ZZ',
] as const;

export type CountryCode = (typeof COUNTRY_CODES)[number];

/**
 * Les options du menu : le Canada en tête, puis l'ordre alphabétique DE LA
 * LOCALE.
 *
 * ⚠️ `localeCompare` N'EST PAS UN RAFFINEMENT ICI, C'EST LA CONDITION POUR QUE
 * LA LISTE SOIT UTILISABLE. Mesuré sur ces 252 noms : 26 commencent par une
 * lettre accentuée, et un `sort()` nu envoie « Île Bouvet » en position 233 —
 * après « Éthiopie », à la fin de la liste. Avec localeCompare elle est en 90,
 * après « Hongrie », là où un lecteur francophone la cherche.
 *
 * ★ UNE SEULE SOURCE POUR DEUX FORMULAIRES. La personne et l'entité
 * actionnaire lisent cette fonction ; deux tris écrits séparément auraient
 * divergé, comme les deux listes de provinces l'ont fait.
 */
export function countryOptions(
  locale: string,
): { code: string; label: string }[] {
  const noms = new Intl.DisplayNames([locale], { type: 'region' });
  const libelle = (code: string) => noms.of(code) ?? code;
  return [...COUNTRY_CODES]
    .map((code) => ({ code: code as string, label: libelle(code) }))
    .sort((a, b) =>
      a.code === 'CA' ? -1
      : b.code === 'CA' ? 1
      : a.label.localeCompare(b.label, locale),
    );
}
