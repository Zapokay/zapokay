'use client'

import { useEffect, useState } from 'react'
import BinderSection from './BinderSection'
import RegisterCard from './RegisterCard'

interface Section {
  key: string
  title_fr: string
  documents: any[]
  count: number
}

export default function BinderView() {
  const [sections, setSections] = useState<Section[]>([])
  const [directors, setDirectors] = useState<any>(null)
  const [officers, setOfficers] = useState<any>(null)
  const [shareholders, setShareholders] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchAll() {
      try {
        const [binderRes, dirRes, offRes, shRes] = await Promise.all([
          fetch('/api/minute-book/binder'),
          fetch('/api/registers/directors'),
          fetch('/api/registers/officers'),
          fetch('/api/registers/shareholders'),
        ])
        const binderData = await binderRes.json()
        setSections(binderData.sections || [])
        setDirectors(await dirRes.json())
        setOfficers(await offRes.json())
        setShareholders(await shRes.json())
      } catch (err) {
        console.error('Failed to load binder data', err)
      } finally {
        setLoading(false)
      }
    }
    fetchAll()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {sections.map((section, i) =>
        section.key === 'registres' ? (
          <BinderSection
            key={section.key}
            index={i}
            title={section.title_fr}
            documents={[]}
          >
            {directors && (
              <RegisterCard
                title={directors.register_title_fr}
                columns={[
                  { key: 'full_name', label: 'Nom' },
                  { key: 'resident', label: 'Résidence' },
                  { key: 'appointment_date', label: 'Début' },
                  { key: 'end_date_display', label: 'Fin' },
                  { key: 'status', label: 'Actif' },
                ]}
                rows={(directors.entries || []).map((e: any) => ({
                  ...e,
                  resident: e.is_canadian_resident ? 'Oui' : 'Non',
                  end_date_display: e.end_date || '—',
                  status: e.is_active ? (
                    <span className="text-green-600">✓</span>
                  ) : (
                    <span className="text-neutral-400">✗</span>
                  ),
                }))}
              />
            )}

            {officers && (
              <RegisterCard
                title={officers.register_title_fr}
                columns={[
                  { key: 'full_name', label: 'Nom' },
                  { key: 'title', label: 'Titre' },
                  { key: 'appointment_date', label: 'Début' },
                  { key: 'status', label: 'Actif' },
                ]}
                rows={(officers.entries || []).map((e: any) => ({
                  ...e,
                  status: e.is_active ? (
                    <span className="text-green-600">✓</span>
                  ) : (
                    <span className="text-neutral-400">✗</span>
                  ),
                }))}
              />
            )}

            {shareholders && (
              <RegisterCard
                title={shareholders.register_title_fr}
                columns={[
                  { key: 'full_name', label: 'Nom' },
                  { key: 'share_class', label: 'Catégorie' },
                  { key: 'quantity', label: 'Qté' },
                  { key: 'certificate_number', label: 'Cert.' },
                  { key: 'issue_date', label: 'Émission' },
                ]}
                rows={(shareholders.entries || []).map((e: any) => ({
                  ...e,
                  certificate_number: e.certificate_number || '—',
                }))}
              />
            )}
          </BinderSection>
        ) : (
          <BinderSection
            key={section.key}
            index={i}
            title={section.title_fr}
            documents={section.documents}
          />
        )
      )}
    </div>
  )
}
