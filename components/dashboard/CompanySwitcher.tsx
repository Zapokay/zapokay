'use client';
import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Company } from '@/lib/types';

interface CompanySwitcherProps {
  company: Company | null;
  locale: string;
}

export function CompanySwitcher({ company, locale }: CompanySwitcherProps) {
  const fr = locale === 'fr';
  const router = useRouter();
  const supabase = createClient();

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalState, setModalState] = useState<'loading' | 'waitlist' | 'enabled'>('loading');
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const companyName = company?.legal_name_fr ?? (fr ? 'Mon entreprise' : 'My company');
  const truncatedName = companyName.length > 22 ? companyName.slice(0, 22) + '…' : companyName;
  const initials = companyName.trim().slice(0, 2).toUpperCase() || 'ZO';
  const neqDisplay = company?.neq ? `NEQ : ${company.neq}` : 'NEQ : —';

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function handleAddCompany() {
    setDropdownOpen(false);
    setModalOpen(true);
    setModalState('loading');
    setSubmitted(false);
    setEmail('');

    const { data } = await supabase
      .from('feature_flags')
      .select('is_enabled')
      .eq('flag_key', 'multi_company')
      .single();

    if (data?.is_enabled) {
      setModalState('enabled');
    } else {
      setModalState('waitlist');
    }
  }

  async function handleNotify() {
    if (!email) return;
    setSubmitting(true);
    // Store waitlist email — fire and forget
    await supabase.from('waitlist_emails').insert({ email, feature: 'multi_company' }).maybeSingle();
    setSubmitting(false);
    setSubmitted(true);
  }

  function handleEnabledAction() {
    setModalOpen(false);
    router.push(`/${locale}/onboarding`);
  }

  return (
    <>
      {/* Trigger */}
      <div
        ref={dropdownRef}
        className="relative"
        style={{ margin: '0 12px 8px', position: 'relative' }}
      >
        <button
          onClick={() => setDropdownOpen(prev => !prev)}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            background: 'var(--sb-co-bg)',
            border: '1px solid var(--sb-co-border)',
            borderRadius: '10px',
            padding: '10px 12px',
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          {/* Avatar */}
          <div style={{
            width: '40px', height: '40px', borderRadius: '8px',
            background: '#1E3D6B',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Sora, sans-serif', fontSize: '14px', fontWeight: 700,
            color: '#FFFFFF', flexShrink: 0, letterSpacing: '0.02em',
          }}>
            {initials}
          </div>

          {/* Name + NEQ */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: 'DM Sans, sans-serif', fontSize: '13px', fontWeight: 500,
              color: '#FFFFFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {truncatedName}
            </div>
            <div style={{
              fontFamily: 'DM Sans, sans-serif', fontSize: '11px', fontWeight: 400,
              color: '#9EB0C9', marginTop: '2px',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {neqDisplay}
            </div>
          </div>

          {/* Chevron */}
          <svg
            width="12" height="12" viewBox="0 0 12 12" fill="none"
            style={{ flexShrink: 0, opacity: 0.6, color: '#FFFFFF', transform: dropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}
          >
            <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {/* Dropdown */}
        {dropdownOpen && (
          <div style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            background: 'var(--card-bg)',
            border: '1px solid var(--card-border)',
            borderRadius: '10px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            zIndex: 100,
            overflow: 'hidden',
          }}>
            {/* Active company */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '10px 12px',
            }}>
              <div style={{
                width: '32px', height: '32px', borderRadius: '6px',
                background: '#1E3D6B',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'Sora, sans-serif', fontSize: '11px', fontWeight: 700,
                color: '#FFFFFF', flexShrink: 0,
              }}>
                {initials}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: '13px', fontWeight: 600,
                  color: 'var(--text-heading)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {truncatedName}
                </div>
              </div>
              {/* Active badge */}
              <span style={{
                fontSize: '10px', color: '#92400E',
                background: '#FDE68A', borderRadius: '999px',
                padding: '2px 6px', fontWeight: 600, flexShrink: 0,
              }}>
                ●
              </span>
            </div>

            <div style={{ height: '1px', background: 'var(--card-border)', margin: '0 12px' }} />

            {/* Add company button */}
            <button
              onClick={handleAddCompany}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: '8px',
                padding: '10px 12px',
                fontSize: '13px', fontWeight: 500,
                color: 'var(--text-body)',
                background: 'transparent', border: 'none', cursor: 'pointer',
                textAlign: 'left',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--page-bg)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <span style={{ fontSize: '16px', lineHeight: 1 }}>＋</span>
              {fr ? 'Ajouter une entreprise' : 'Add a company'}
            </button>
          </div>
        )}
      </div>

      {/* Modal — portal vers document.body pour bypasser le stacking context de la sidebar */}
      {modalOpen && typeof document !== 'undefined' && createPortal(
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(7,14,28,0.5)', backdropFilter: 'blur(4px)',
          }}
          onClick={() => setModalOpen(false)}
        >
          <div
            style={{
              background: 'var(--card-bg)',
              border: '1px solid var(--card-border)',
              borderRadius: '16px',
              boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
              padding: '28px 28px 24px',
              width: '100%', maxWidth: '400px',
              margin: '0 16px',
            }}
            onClick={e => e.stopPropagation()}
          >
            {modalState === 'loading' && (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{
                  width: '32px', height: '32px', borderRadius: '50%',
                  border: '3px solid var(--card-border)',
                  borderTop: '3px solid #F5B91E',
                  margin: '0 auto',
                  animation: 'spin 0.8s linear infinite',
                }} />
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </div>
            )}

            {modalState === 'waitlist' && (
              <>
                <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                  <div style={{ fontSize: '32px', marginBottom: '12px' }}>⚡</div>
                  <h2 style={{
                    fontFamily: 'Sora, sans-serif', fontSize: '18px', fontWeight: 700,
                    color: '#070E1C', margin: '0 0 8px',
                  }}>
                    {fr ? 'Bientôt disponible' : 'Coming soon'}
                  </h2>
                  <p style={{ fontSize: '14px', color: '#6B7280', lineHeight: 1.6, margin: 0 }}>
                    {fr
                      ? 'La gestion de plusieurs entreprises arrive prochainement. Laissez-nous votre courriel pour être notifié en priorité.'
                      : 'Managing multiple companies is coming soon. Leave your email to be notified first.'}
                  </p>
                </div>

                {!submitted ? (
                  <>
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder={fr ? 'votre@courriel.com' : 'your@email.com'}
                      style={{
                        width: '100%', padding: '10px 12px', borderRadius: '10px',
                        border: '1px solid var(--input-border)',
                        background: 'var(--input-bg)',
                        fontSize: '14px', color: 'var(--text-body)',
                        outline: 'none', boxSizing: 'border-box',
                        marginBottom: '12px',
                      }}
                    />
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => setModalOpen(false)}
                        style={{
                          flex: 1, padding: '10px', borderRadius: '10px',
                          border: '1px solid var(--card-border)',
                          background: 'transparent', fontSize: '14px',
                          color: 'var(--text-muted)', cursor: 'pointer',
                        }}
                      >
                        {fr ? 'Fermer' : 'Close'}
                      </button>
                      <button
                        onClick={handleNotify}
                        disabled={submitting || !email}
                        style={{
                          flex: 1, padding: '10px 16px', borderRadius: '10px',
                          background: '#F5B91E', border: 'none',
                          fontWeight: 600, fontSize: '14px',
                          color: '#070E1C', cursor: 'pointer',
                          opacity: submitting || !email ? 0.6 : 1,
                        }}
                      >
                        {fr ? 'Me notifier' : 'Notify me'}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <p style={{
                      textAlign: 'center', fontSize: '14px', color: '#2E5425',
                      background: '#F0FDF4', borderRadius: '8px', padding: '10px',
                      marginBottom: '12px',
                    }}>
                      {fr ? '✓ Vous serez notifié en priorité !' : '✓ You will be notified first!'}
                    </p>
                    <button
                      onClick={() => setModalOpen(false)}
                      style={{
                        width: '100%', padding: '10px', borderRadius: '10px',
                        border: '1px solid var(--card-border)',
                        background: 'transparent', fontSize: '14px',
                        color: 'var(--text-muted)', cursor: 'pointer',
                      }}
                    >
                      {fr ? 'Fermer' : 'Close'}
                    </button>
                  </>
                )}
              </>
            )}

            {modalState === 'enabled' && (
              <>
                <div style={{ textAlign: 'center', marginBottom: '20px' }}>
                  <div style={{ fontSize: '32px', marginBottom: '12px' }}>🏢</div>
                  <h2 style={{
                    fontFamily: 'Sora, sans-serif', fontSize: '18px', fontWeight: 700,
                    color: '#070E1C', margin: '0 0 8px',
                  }}>
                    {fr ? 'Ajouter une entreprise' : 'Add a company'}
                  </h2>
                  <p style={{ fontSize: '14px', color: '#6B7280' }}>
                    {fr
                      ? 'Configurez une nouvelle entreprise via l\'assistant d\'intégration.'
                      : 'Set up a new company via the onboarding wizard.'}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={() => setModalOpen(false)}
                    style={{
                      flex: 1, padding: '10px', borderRadius: '10px',
                      border: '1px solid var(--card-border)',
                      background: 'transparent', fontSize: '14px',
                      color: 'var(--text-muted)', cursor: 'pointer',
                    }}
                  >
                    {fr ? 'Annuler' : 'Cancel'}
                  </button>
                  <button
                    onClick={handleEnabledAction}
                    style={{
                      flex: 1, padding: '10px', borderRadius: '10px',
                      background: '#F5B91E', border: 'none',
                      fontWeight: 600, fontSize: '14px',
                      color: '#070E1C', cursor: 'pointer',
                    }}
                  >
                    {fr ? 'Commencer →' : 'Get started →'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
