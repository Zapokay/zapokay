'use client';
import { useState, useEffect } from 'react';
import type { Signatory } from '@/lib/pdf-templates/signature-blocks';

interface PersonOption extends Signatory {
  selected: boolean;
}

interface SignatoriesModalProps {
  companyId: string;
  requirementKey: string;
  allRequired?: boolean;
  onConfirm: (signatories: Signatory[]) => void;
  onClose: () => void;
  locale?: string;
}

export function SignatoriesModal({
  companyId,
  requirementKey,
  allRequired = false,
  onConfirm,
  onClose,
  locale = 'fr',
}: SignatoriesModalProps) {
  const fr = locale === 'fr';
  const [people, setPeople] = useState<PersonOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSignatories() {
      try {
        const params = new URLSearchParams({ companyId, requirementKey });
        const res = await fetch(`/api/documents/signatories?${params}`);
        const data = await res.json();
        if (!res.ok || data.error) {
          setFetchError(data.error ?? (fr ? 'Erreur de chargement.' : 'Loading error.'));
          return;
        }
        setPeople(
          (data.signatories as Signatory[]).map((s) => ({ ...s, selected: true }))
        );
      } catch {
        setFetchError(fr ? 'Erreur réseau.' : 'Network error.');
      } finally {
        setLoading(false);
      }
    }
    fetchSignatories();
  }, [companyId, requirementKey, fr]);

  function toggle(id: string) {
    if (allRequired) return;
    setPeople((prev) =>
      prev.map((p) => (p.id === id ? { ...p, selected: !p.selected } : p))
    );
  }

  function handleConfirm() {
    const selected = people.filter((p) => p.selected);
    onConfirm(selected.map(({ id, name, role }) => ({ id, name, role })));
  }

  const selectedCount = people.filter((p) => p.selected).length;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 300,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(7,14,28,0.55)', backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--card-border)',
        borderRadius: '16px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.2)',
        width: '100%', maxWidth: '480px',
        margin: '0 16px',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid var(--card-border)',
        }}>
          <div>
            <h2 style={{
              fontFamily: 'Sora, sans-serif', fontSize: '15px', fontWeight: 700,
              color: 'var(--text-heading)', margin: '0 0 2px',
            }}>
              {fr ? 'Signataires' : 'Signatories'}
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', margin: 0 }}>
              {allRequired
                ? (fr ? 'Tous les signataires sont requis.' : 'All signatories are required.')
                : (fr ? 'Sélectionnez les signataires du document.' : 'Select document signatories.')}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              width: '28px', height: '28px', borderRadius: '50%',
              border: '1px solid var(--card-border)',
              background: 'transparent', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '16px', color: 'var(--text-muted)',
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '16px 20px', maxHeight: '320px', overflowY: 'auto' }}>
          {loading && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              padding: '32px 0', color: 'var(--text-muted)', fontSize: '14px',
            }}>
              <svg
                style={{ width: '20px', height: '20px', marginRight: '10px', animation: 'spin 0.8s linear infinite' }}
                fill="none" viewBox="0 0 24 24"
              >
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                <circle cx="12" cy="12" r="10" stroke="#E0D9CE" strokeWidth="4" />
                <path fill="#1E3D6B" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              {fr ? 'Chargement…' : 'Loading…'}
            </div>
          )}

          {fetchError && (
            <div style={{
              background: '#F5EEEE', border: '1px solid #C9A5A5',
              borderRadius: '8px', padding: '12px 14px',
              fontSize: '13px', color: '#6B1E1E',
            }}>
              {fetchError}
            </div>
          )}

          {!loading && !fetchError && people.length === 0 && (
            <p style={{ fontSize: '14px', color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0' }}>
              {fr ? 'Aucun signataire trouvé.' : 'No signatories found.'}
            </p>
          )}

          {!loading && !fetchError && people.map((person) => (
            <label
              key={person.id}
              style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '10px 12px', borderRadius: '8px', marginBottom: '6px',
                border: '1px solid var(--card-border)',
                cursor: allRequired ? 'default' : 'pointer',
                background: person.selected ? '#EEF1F7' : 'transparent',
                transition: 'background 120ms',
              }}
            >
              <input
                type="checkbox"
                checked={person.selected}
                disabled={allRequired}
                onChange={() => toggle(person.id)}
                style={{ width: '16px', height: '16px', accentColor: '#1E3D6B', cursor: allRequired ? 'default' : 'pointer' }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-heading)' }}>
                  {person.name}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {person.role}
                </div>
              </div>
            </label>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px',
          borderTop: '1px solid var(--card-border)',
        }}>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            {selectedCount} {fr ? 'sélectionné(s)' : 'selected'}
          </span>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={onClose}
              style={{
                padding: '8px 16px', borderRadius: '8px',
                border: '1px solid var(--card-border)',
                background: 'transparent', cursor: 'pointer',
                fontSize: '13px', fontWeight: 600,
                color: 'var(--text-muted)',
              }}
            >
              {fr ? 'Annuler' : 'Cancel'}
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading || selectedCount === 0}
              style={{
                padding: '8px 18px', borderRadius: '8px',
                border: 'none',
                background: loading || selectedCount === 0 ? '#E0D9CE' : '#F5B91E',
                cursor: loading || selectedCount === 0 ? 'not-allowed' : 'pointer',
                fontSize: '13px', fontWeight: 700,
                color: '#1C1A17',
                transition: 'background 150ms',
              }}
            >
              {fr ? 'Générer le document' : 'Generate document'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
