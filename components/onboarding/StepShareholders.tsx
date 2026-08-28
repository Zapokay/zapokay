'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { OnboardingStepLayout } from './OnboardingStepLayout';
import type { OnboardingDirector } from './StepDirectors';

// =============================================================================
// Types
// =============================================================================

export interface OnboardingShareholder {
  fullName: string;
  numberOfShares: number;
  /** String, not number: the input must hold partial/empty entry while typing,
   *  as IssueSharesModal does. Validated before any write in OnboardingFlow. */
  pricePerShare: string;
  issueDate: string;
}

interface StepShareholdersProps {
  locale: string;
  directors: OnboardingDirector[];
  incorporationDate?: string;
  initialShareholders?: OnboardingShareholder[];
  /** Resolves true when every shareholding was written, false when the write
   *  failed. Step 5 stays put on false so the user can fix and retry. */
  onContinue: (shareholders: OnboardingShareholder[]) => Promise<boolean>;
  onSkip: () => void;
}

// =============================================================================
// Shared styles
// =============================================================================

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px',
  border: '1px solid var(--input-border)',
  borderRadius: '10px',
  background: 'var(--input-bg)',
  fontSize: '14px', color: 'var(--text-heading)',
  outline: 'none', boxSizing: 'border-box',
};

const fieldLabelStyle: React.CSSProperties = {
  display: 'block', fontSize: '12px', fontWeight: 500,
  color: 'var(--text-secondary)', marginBottom: '5px',
};

// =============================================================================
// Component
// =============================================================================

export default function StepShareholders({
  locale,
  directors,
  incorporationDate = '',
  initialShareholders,
  onContinue,
  onSkip,
}: StepShareholdersProps) {

  const fr = locale === 'fr';
  const t = useTranslations('shareholders');
  const tCommon = useTranslations('common');
  const defaultDate = incorporationDate || new Date().toISOString().split('T')[0];

  // Smart pre-fill: if only 1 director, pre-fill shareholder with same name + 100 shares
  const defaultShareholders: OnboardingShareholder[] =
    initialShareholders && initialShareholders.length > 0
      ? initialShareholders
      : directors.length === 1
        ? [
            {
              fullName: directors[0].fullName,
              numberOfShares: 100,
              pricePerShare: '1',
              issueDate: defaultDate,
            },
          ]
        : directors.length > 0
          ? directors.map((d) => ({
              fullName: d.fullName,
              numberOfShares: 100,
              pricePerShare: '1',
              issueDate: defaultDate,
            }))
          : [
              {
                fullName: '',
                numberOfShares: 100,
                pricePerShare: '1',
                issueDate: defaultDate,
              },
            ];

  const [shareholders, setShareholders] =
    useState<OnboardingShareholder[]>(defaultShareholders);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // ---- Handlers -------------------------------------------------------------
  function updateShareholder(
    index: number,
    field: keyof OnboardingShareholder,
    value: any
  ) {
    setShareholders((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s))
    );
  }

  function addShareholder() {
    setShareholders((prev) => [
      ...prev,
      { fullName: '', numberOfShares: 100, pricePerShare: '1', issueDate: defaultDate },
    ]);
  }

  function removeShareholder(index: number) {
    setShareholders((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleContinue() {
    // Reentrancy belt. MEASURED 2026-08-28: it cannot fire today —
    // the only invoker is the layout's continue button, which is
    // disabled={saving || continueDisabled} and reads the SAME render's `saving`.
    // Kept for the day a <form onSubmit> or an Enter handler is added:
    // Enter bypasses a disabled button, and shareholdings carries no UNIQUE,
    // so a re-entry duplicates a shareholder.
    if (saving) return;
    setError(null);
    const valid = shareholders.filter((s) => s.fullName.trim());
    const rows = valid.length > 0 ? valid : shareholders;

    // Validate EVERY price before a single row is written. The A-SC guard in
    // create_shareholding_with_holders rejects a direct issuance carrying no
    // issue_price_per_share, and a mid-loop rejection would leave the earlier
    // shareholders written with no way to retry cleanly. Same check, same keys
    // as IssueSharesModal. The skipped-row condition mirrors the write loop's.
    for (const s of rows) {
      if (!s.fullName.trim() || s.numberOfShares <= 0) continue;
      const priceNum = parseFloat(s.pricePerShare);
      if (!s.pricePerShare.trim() || !Number.isFinite(priceNum) || priceNum < 0) {
        setError(t('errorPrice'));
        return;
      }
    }

    setSaving(true);
    let ok = false;
    // supabase-js RETURNS { error } on Postgres and THROWS on a network failure.
    // Without the catch, saving stays true and the button freezes with no message.
    try {
      ok = await onContinue(rows);
      if (!ok) {
        setError(tCommon('saveFailed'));
      }
    } catch (err) {
      console.error('[onboarding] step 5 onContinue threw:', err);
      setError(tCommon('saveFailed'));
    } finally {
      // Release ONLY on failure. On success the step unmounts this component,
      // and releasing would open a one-render window where the button is
      // clickable at the OLD step — insert-only, no UNIQUE, so a click there
      // duplicates. Today setStep(6) and this line batch into one render
      // (MEASURED 2026-08-28: no await between setStep and return true in
      // OnboardingFlow) — this guard does not DEPEND on that staying true.
      if (!ok) setSaving(false);
    }
  }

  const pieChartIcon = (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.21 15.89A10 10 0 1 1 8 2.83" />
      <path d="M22 12A10 10 0 0 0 12 2v10z" />
    </svg>
  );

  // ---- Render ---------------------------------------------------------------
  return (
    <OnboardingStepLayout
      stepLabel={fr ? 'ÉTAPE 5 — ACTIONNAIRES' : 'STEP 5 — SHAREHOLDERS'}
      icon={pieChartIcon}
      title={fr ? (
        <>Qui détient des actions<br />de votre entreprise ?</>
      ) : (
        <>Who holds shares<br />in your company?</>
      )}
      tooltip={fr ? "Qu'est-ce qu'un actionnaire ?" : 'What is a shareholder?'}
      tooltipContent={fr
        ? "Les actionnaires possèdent l'entreprise. Si vous êtes le seul propriétaire, ajoutez-vous avec le nombre d'actions émises."
        : 'Shareholders own the company. If you are the sole owner, add yourself with the number of shares issued.'}
      locale={locale}
      onSkip={onSkip}
      onContinue={handleContinue}
      saving={saving}
      extraAboveCard={
        <div style={{
          width: '100%', maxWidth: '560px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          marginBottom: '12px',
        }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            borderRadius: '20px', background: 'var(--page-bg)',
            border: '1px solid var(--card-border)',
            padding: '5px 12px', fontSize: '12px', fontWeight: 500,
            color: 'var(--text-secondary)',
          }}>
            <span style={{ color: '#22c55e' }}>✓</span>
            {fr ? "Classe d'actions par défaut : Actions ordinaires" : 'Default share class: Common Shares'}
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {shareholders.map((shareholder, index) => (
          <div
            key={index}
            style={{
              borderRadius: '10px',
              border: '1px solid var(--card-border)',
              background: 'var(--page-bg)',
              padding: '14px',
            }}
          >
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <p style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
                {fr ? `Actionnaire ${index + 1}` : `Shareholder ${index + 1}`}
              </p>
              {shareholders.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeShareholder(index)}
                  style={{
                    padding: '4px', borderRadius: '6px',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-muted)',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
                  </svg>
                </button>
              )}
            </div>

            {/* Name */}
            <div style={{ marginBottom: '12px' }}>
              <label style={fieldLabelStyle}>
                {fr ? 'Nom' : 'Name'} <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                value={shareholder.fullName}
                onChange={(e) => updateShareholder(index, 'fullName', e.target.value)}
                placeholder="Jean-Philippe Roussy"
                style={inputStyle}
              />
            </div>

            {/* Shares + Date row */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
              <div>
                <label style={fieldLabelStyle}>
                  {fr ? "Nombre d'actions" : 'Number of shares'}
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={shareholder.numberOfShares}
                  onChange={(e) =>
                    updateShareholder(
                      index,
                      'numberOfShares',
                      parseInt(e.target.value, 10) || 0
                    )
                  }
                  placeholder="100"
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={fieldLabelStyle}>
                  {t('pricePerShare')}
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{
                    position: 'absolute', left: '12px', top: '50%',
                    transform: 'translateY(-50%)',
                    fontSize: '14px', color: 'var(--text-secondary)',
                  }}>
                    $
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={shareholder.pricePerShare}
                    onChange={(e) =>
                      updateShareholder(index, 'pricePerShare', e.target.value)
                    }
                    placeholder="1.00"
                    style={{ ...inputStyle, paddingLeft: '26px' }}
                  />
                </div>
                <p style={{
                  marginTop: '4px', fontSize: '11px',
                  color: 'var(--text-secondary)',
                }}>
                  {t('pricePerShareHint')}
                </p>
              </div>
              <div>
                <label style={fieldLabelStyle}>
                  {fr ? "Date d'émission" : 'Issue date'}
                </label>
                <input
                  type="date"
                  value={shareholder.issueDate}
                  onChange={(e) => updateShareholder(index, 'issueDate', e.target.value)}
                  style={inputStyle}
                />
              </div>
            </div>
          </div>
        ))}

        {/* Add shareholder button */}
        <button
          type="button"
          onClick={addShareholder}
          style={{
            width: '100%', padding: '14px',
            border: '1.5px dashed var(--card-border)',
            borderRadius: '12px',
            background: 'transparent',
            cursor: 'pointer',
            fontSize: '14px', fontWeight: 500,
            color: 'var(--text-secondary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            marginTop: '4px',
          }}
        >
          <span style={{ color: '#F5B91E', fontSize: '18px', lineHeight: 1 }}>+</span>
          {fr ? 'Ajouter un actionnaire' : 'Add a shareholder'}
        </button>

        {error && (
          <p style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px' }}>
            {error}
          </p>
        )}
      </div>
    </OnboardingStepLayout>
  );
}
