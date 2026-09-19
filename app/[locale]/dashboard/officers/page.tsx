import { getUserWithProfile } from '@/lib/auth';
import { redirect } from 'next/navigation';
import OfficersClient from './OfficersClient';

/**
 * ⛔ LA COQUILLE A QUITTÉ CETTE PAGE le 2026-09-19 : elle vit dans
 * `app/[locale]/dashboard/layout.tsx`, qui enveloppe les onze routes du
 * segment. Voir son en-tête pour la raison — un `loading.tsx` remplace la PAGE
 * et préserve le LAYOUT, donc la barre latérale devait passer du bon côté.
 *
 * ⚪ ET LA LECTURE DE `companies` A DISPARU AVEC ELLE, parce que cette page ne
 * s'en servait QUE pour la coquille — mesuré : deux mentions, les deux dans la
 * balise. Les pages qui l'utilisent pour LEUR contenu la gardent, via
 * `getActiveCompany()`, mémoïsée par requête.
 *
 * ⚠️ LA REDIRECTION RESTE, alors que le layout la porte aussi. Layout et page
 * rendent dans la même passe sans ordre garanti : s'en remettre au seul layout
 * supposerait qu'il s'exécute d'abord. `getUserWithProfile` étant dans le
 * `cache()` de React, ce doublon ne coûte aucun aller-retour.
 */
export default async function OfficersPage({ params: { locale } }: { params: { locale: string } }) {
  const { user, profile } = await getUserWithProfile();
  if (!user) redirect(`/${locale}/login`);
  if (!profile?.onboarding_completed) redirect(`/${locale}/onboarding`);

  return (
    <OfficersClient
      preferredLanguage={(profile?.preferred_language as 'fr' | 'en') ?? 'fr'}
    />
  );
}
