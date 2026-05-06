import { permanentRedirect } from 'next/navigation'

export default function MinuteBookLegacyRedirect({
  params: { locale },
}: {
  params: { locale: string }
}) {
  permanentRedirect(`/${locale}/dashboard/minute-book/completeness`)
}
