'use client';
import { useState, useRef, useEffect } from 'react';
import type { CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
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
  const t = useTranslations('common');

  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalState, setModalState] = useState<'loading' | 'waitlist' | 'enabled'>('loading');
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notifyError, setNotifyError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const companyName = company?.legal_name_fr ?? (fr ? 'Mon entreprise' : 'My company');
  // ⚠️ PLUS DE COUPE EN JAVASCRIPT. Le nom passe ENTIER au rendu ; l'ellipse CSS,
  // présente aux deux endroits qui l'affichent, coupe seule et coupe là où la place
  // manque vraiment. La coupe retirée tranchait à 22 caractères — un nombre deviné,
  // indépendant de la largeur réelle (117 px), qui rognait donc parfois sur de la place
  // disponible. Deux troncatures en série, dont la première ignorait la seconde.
  const initials = companyName.trim().slice(0, 2).toUpperCase() || 'ZO';

  // ⚠️ `=== 'CBCA'` ET JAMAIS `!== 'LSA'`, et un régime INCONNU n'en est pas un. Sans le
  // troisième cas, une société sans type déclaré afficherait « Provincial — Québec »,
  // c'est-à-dire une juridiction inventée sous le nom d'une vraie société.
  const regime: 'CBCA' | 'LSA' | null =
    company?.incorporation_type === 'CBCA' ? 'CBCA'
    : company?.incorporation_type === 'LSA' ? 'LSA'
    : null;

  // ⚠️ LE NOMBRE DE LIGNES DÉPEND DU RÉGIME, ce n'est pas un gabarit à deux lignes qu'on
  // viderait à moitié : une société provinciale n'a PAS de numéro de société fédéral, et
  // lui montrer une ligne vide affirmerait qu'il lui en manque un.
  //
  // ★ L'ORDRE SUIT LE RANG JURIDIQUE, PAS L'HABITUDE. Le numéro de société est
  // CONSTITUTIF — il fait exister la personne morale ; le NEQ n'est que
  // l'immatriculation qui permet d'opérer au Québec. La société existe d'abord, puis
  // s'enregistre. D'où : numéro de société PUIS NEQ.
  //
  // « NEQ » n'est pas une clé i18n : l'acronyme est identique en français et en anglais,
  // et le lot n'ouvre qu'une seule clé neuve. Exception assumée à la convention §1.
  const identifiants: { label: string; valeur: string | null }[] = [
    ...(regime === 'CBCA'
      ? [{ label: t('corporationNumberShort'), valeur: company?.corporation_number ?? null }]
      : []),
    { label: 'NEQ', valeur: company?.neq ?? null },
  ];

  const identLabelStyle: CSSProperties = {
    fontFamily: 'DM Sans, sans-serif', fontSize: '10px', fontWeight: 400,
    color: 'var(--sb-co-label)', letterSpacing: '0.03em', lineHeight: 1.3,
  };

  // ⚠️⚠️ AUCUNE TRONCATURE SUR UNE VALEUR D'IDENTIFIANT. JAMAIS.
  // La version filmée portait ici `overflow:hidden` + `textOverflow:ellipsis` +
  // `whiteSpace:nowrap`, et l'écran affichait « 99999… » à la place de 9999999-9. La
  // règle venait de l'ANCIENNE ligne NEQ que ce lot remplace : elle y était légitime
  // parce qu'elle bornait une chaîne déjà composée, et elle a été transportée sans être
  // rejugée. Un NOM tronqué reste identifiable ; un NUMÉRO tronqué ne l'est plus — c'est
  // précisément l'information que ce bloc existe pour donner.
  // Donc : pas d'ellipsis, pas de nowrap, pas de minWidth. Une valeur plus longue
  // ENROULE, et `overflowWrap: 'anywhere'` garantit qu'elle enroule même sans espace.
  const identValueStyle: CSSProperties = {
    fontFamily: 'DM Mono, ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '11.5px', fontWeight: 400, lineHeight: 1.35,
    overflowWrap: 'anywhere',
  };

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
    setNotifyError(null);
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
    setNotifyError(null);
    try {
      const { error } = await supabase
        .from('waitlist_emails')
        .insert({ email, feature: 'multi_company' })
        .maybeSingle();
      // ⚠️ Confirm only what happened. This used to say "you're on the list"
      // whether or not the row was ever written.
      if (error) {
        console.error('[CompanySwitcher] waitlist insert failed:', error);
        setNotifyError(t('saveFailed'));
        return;
      }
      setSubmitted(true);
    } catch (err) {
      // supabase-js RETURNS { error } on Postgres and THROWS on a network
      // failure. Same message, ours — never a raw err.message.
      console.error('[CompanySwitcher] waitlist insert threw:', err);
      setNotifyError(t('saveFailed'));
    } finally {
      setSubmitting(false);
    }
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
            background: 'var(--sb-co-icon-bg)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'Sora, sans-serif', fontSize: '14px', fontWeight: 700,
            color: 'var(--sb-co-icon-text)', flexShrink: 0, letterSpacing: '0.02em',
          }}>
            {initials}
          </div>

          {/* Nom · juridiction · identifiants */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* a) le nom — inchangé, il garde son ellipsis */}
            <div style={{
              fontFamily: 'DM Sans, sans-serif', fontSize: '13px', fontWeight: 500,
              color: 'var(--sb-co-name)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {companyName}
            </div>

            {/* b) la juridiction
                ⚠️ whoever adds a province must revisit EVERY entry
                « Provincial — Québec » n'est vrai que parce que ZapOkay ne sert que le
                Québec AUJOURD'HUI. La feuille de route est pancanadienne : le jour où une
                autre province entre, CHAQUE endroit qui nomme une juridiction est à
                revisiter, et un seul grep sur cette phrase doit tous les réunir.

                ⚠️ ELLE S'ENROULE, ELLE NE SE TRONQUE JAMAIS. Aucun ellipsis ici, à la
                différence du nom juste au-dessus : un nom coupé reste reconnaissable,
                une juridiction coupée devient une autre juridiction. */}
            {regime && (
              <div style={{
                marginTop: '3px',
                display: 'flex', flexDirection: 'column', gap: '1px',
              }}>
                {/* ⚠️ L'ACRONYME EST SUR SA PROPRE LIGNE, POUR LES DEUX RÉGIMES, TOUJOURS.
                    Le point médian a disparu avec la mise en ligne : « Fédéral · LCSA »
                    tenait, « Provincial — Québec · LSAQ » fait 26 caractères contre 14,
                    et rien ne garantissait qu'il tienne. Une composition qui dépend de la
                    longueur du texte se casse sur la donnée qu'on n'a pas encore vue.
                    Deux lignes fixes ne se cassent pas.
                    ⚠️ L'écart entre elles est de 1px, contre 8px avant le filet : les deux
                    lignes forment UN bloc, le filet sépare deux blocs. */}
                <span style={{
                  fontFamily: 'DM Sans, sans-serif', fontSize: '11px', fontWeight: 400,
                  color: 'var(--text-body)', lineHeight: 1.35, overflowWrap: 'anywhere',
                }}>
                  {t(`regimes.${regime}.jurisdiction`)}
                </span>
                <span style={{
                  fontFamily: 'DM Mono, ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: '10.5px', fontWeight: 400, letterSpacing: '0.02em',
                  color: 'var(--sb-co-label)', lineHeight: 1.3,
                }}>
                  {t(`regimes.${regime}.acronym`)}
                </span>
              </div>
            )}

            {/* c) les identifiants, sous un filet */}
            <div style={{
              marginTop: '8px', paddingTop: '7px',
              borderTop: '1px solid var(--sb-co-border)',
              display: 'flex', flexDirection: 'column', gap: '8px',
            }}>
              {/* ⚠️ L'ÉCART ENTRE LES PAIRES EST PORTEUR : 8px entre deux identifiants,
                  1px entre un libellé et sa valeur. Sans cette différence, quatre lignes
                  d'égale distance se lisent comme quatre choses, pas comme deux. */}
              {identifiants.map(({ label, valeur }) => (
                <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: '1px' }}>
                  <span style={identLabelStyle}>{label}</span>
                  <span style={{
                    ...identValueStyle,
                    color: valeur ? 'var(--text-body)' : 'var(--sb-co-label)',
                  }}>
                    {valeur || '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Chevron */}
          <svg
            width="12" height="12" viewBox="0 0 12 12" fill="none"
            style={{ flexShrink: 0, opacity: 0.6, color: 'var(--sb-co-label)', transform: dropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 150ms' }}
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
                background: 'var(--sb-co-icon-bg)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'Sora, sans-serif', fontSize: '11px', fontWeight: 700,
                color: 'var(--sb-co-icon-text)', flexShrink: 0,
              }}>
                {initials}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: '13px', fontWeight: 600,
                  color: 'var(--text-heading)',
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {companyName}
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
                    color: '#1C1A17', margin: '0 0 8px',
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
                    {notifyError && (
                      <p style={{ fontSize: '12px', color: '#ef4444', marginBottom: '12px' }}>
                        {notifyError}
                      </p>
                    )}
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
                          color: '#1C1A17', cursor: 'pointer',
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
                    color: '#1C1A17', margin: '0 0 8px',
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
                      color: '#1C1A17', cursor: 'pointer',
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
