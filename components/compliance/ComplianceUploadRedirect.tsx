'use client'

import { useRouter } from 'next/navigation'

interface ComplianceUploadRedirectProps {
  locale: string
  label: string
}

export default function ComplianceUploadRedirect({
  locale,
  label,
}: ComplianceUploadRedirectProps) {
  const router = useRouter()

  return (
    <button
      onClick={() => router.push(`/${locale}/dashboard/documents`)}
      className="w-full sm:w-auto px-6 py-3 rounded-lg font-semibold text-sm transition-opacity hover:opacity-90"
      style={{
        backgroundColor: '#F5B91E',
        color: '#070E1C',
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {label}
    </button>
  )
}
