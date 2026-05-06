import { permanentRedirect } from 'next/navigation';

export default function DocumentsLegacyRedirect({
  params: { locale },
}: {
  params: { locale: string };
}) {
  permanentRedirect(`/${locale}/dashboard/minute-book/documents`);
}
