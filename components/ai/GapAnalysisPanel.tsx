'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';

interface GapYear {
  year: number;
  fiscalYear: string;
  missingDocuments: string[];
  status: 'missing' | 'partial' | 'complete';
}

interface GapAnalysisPanelProps {
  companyId: string;
  locale: 'fr' | 'en';
}

type PanelState = 'idle' | 'loading' | 'complete_clean' | 'complete_gaps' | 'error' | 'no_fiscal_years';

function SkeletonLine({ width = '100%' }: { width?: string }) {
  return (
    <div style={{
      height: '14px', borderRadius: '6px',
      background: 'var(--card-border)',
      width,
    }} />
  );
}

function YearRow({ gap, fr }: { gap: GapYear; fr: boolean }) {
  const icon = gap.status === 'complete' ? '✅' : gap.status === 'partial' ? '⚠️' : '❌';
  const color = gap.status === 'complete'
    ? 'var(--success-text)'
    : gap.status === 'partial'
    ? 'var(--warning-text)'
    : 'var(--error-text)';
  const label = gap.status === 'complete'
    ? (fr ? 'Complet' : 'Complete')
    : gap.missingDocuments.join(' · ');

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '6px 0' }}>
      <span style={{ fontSize: '14px', flexShrink: 0, marginTop: '1px' }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)', fontFamily: 'Sora, sans-serif' }}>
          {gap.year}
        </span>
        <span style={{ fontSize: '13px', color, marginLeft: '8px' }}>
          — {label}
        </span>
      </div>
    </div>
  );
}

export function GapAnalysisPanel({ companyId, locale }: GapAnalysisPanelProps) {
  const fr = locale === 'fr';
  const supabase = createClient();

  const [featureEnabled, setFeatureEnabled] = useState<boolean | null>(null);
  const [panelState, setPanelState] = useState<PanelState>('idle');
  const [gaps, setGaps] = useState<GapYear[]>([]);
  const [summary, setSummary] = useState('');

  useEffect(() => {
    supabase
      .from('feature_flags')
      .select('is_enabled')
      .eq('flag_key', 'ai_gap_analysis')
      .single()
      .then(({ data }) => setFeatureEnabled(data?.is_enabled ?? false));
  }, [supabase]);

  useEffect(() => {
    if (!featureEnabled) return;
    supabase
      .from('company_fiscal_years')
      .select('year')
      .eq('company_id', companyId)
      .eq('status', 'active')
      .limit(1)
      .then(({ data }) => {
        if (!data || data.length === 0) setPanelState('no_fiscal_years');
      });
  }, [featureEnabled, companyId, supabase]);

  if (featureEnabled === null) return null;
  if (!featureEnabled) return null;

  async function handleAnalyze() {
    setPanelState('loading');
    try {
      const res = await fetch('/api/ai/gap-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, locale }),
      });

      if (!res.ok) throw new Error('API error');

      const data = await res.json();
      setGaps(data.gaps ?? []);
      setSummary(data.summary ?? '');
      setPanelState(data.hasGaps ? 'complete_gaps' : 'complete_clean');
    } catch {
      setPanelState('error');
    }
  }

  return (
    <div style={{
      background: 'var(--card-bg)',
      border: '1px solid var(--card-border)',
      borderRadius: '12px',
      overflow: 'hidden',
    }}>
      <style>{`
        @keyframes pulse-text {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 20px',
        borderBottom: panelState === 'idle' ? 'none' : '1px solid var(--card-border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontFamily: 'Sora, sans-serif', fontSize: '14px', fontWeight: 700, color: 'var(--text-heading)' }}>
            ⚡ {fr ? 'Analyse de votre registre' : 'Records analysis'}
          </span>
          <span style={{
            fontSize: '11px', fontWeight: 600,
            color: 'var(--info-text)', background: 'var(--info-bg)',
            borderRadius: '999px', padding: '3px 8px',
          }}>
            {fr ? 'Propulsé par Claude' : 'Powered by Claude'}
          </span>
        </div>

        {(panelState === 'idle') && (
          <button
            onClick={handleAnalyze}
            style={{
              padding: '8px 16px', borderRadius: '8px',
              background: '#F5B91E', border: 'none',
              fontWeight: 600, fontSize: '13px',
              color: '#1C1A17', cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {fr ? 'Analyser mon registre' : 'Analyze my records'}
          </button>
        )}
      </div>

      {/* Loading state */}
      {panelState === 'loading' && (
        <div style={{ padding: '20px' }}>
          <p style={{
            fontSize: '13px', color: 'var(--text-muted)',
            marginBottom: '16px', textAlign: 'center',
            animation: 'pulse-text 1.5s ease-in-out infinite',
          }}>
            {fr ? 'Claude analyse votre registre…' : 'Claude is analyzing your records…'}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <SkeletonLine />
            <SkeletonLine width="80%" />
            <SkeletonLine width="90%" />
            <SkeletonLine width="60%" />
          </div>
        </div>
      )}

      {/* Complete — clean */}
      {panelState === 'complete_clean' && (
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>🎉</div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            background: 'var(--success-bg)', color: 'var(--success-text)',
            border: '1px solid var(--success-border)',
            borderRadius: '999px', padding: '6px 14px',
            fontSize: '14px', fontWeight: 600, marginBottom: '12px',
          }}>
            {fr ? 'Registre complet ✓' : 'Complete records ✓'}
          </div>
          {summary && (
            <div style={{
              background: 'var(--info-bg)', borderRadius: '8px', padding: '14px 16px',
              textAlign: 'left',
            }}>
              <p style={{ fontSize: '14px', color: 'var(--info-text)', fontStyle: 'italic', lineHeight: 1.6, margin: 0 }}>
                {summary}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Complete — with gaps */}
      {panelState === 'complete_gaps' && (
        <div style={{ padding: '20px' }}>
          {/* Timeline */}
          <div style={{
            borderLeft: '2px solid var(--card-border)',
            marginLeft: '8px',
            paddingLeft: '16px',
            marginBottom: '16px',
          }}>
            {gaps.map(gap => (
              <YearRow key={gap.year} gap={gap} fr={fr} />
            ))}
          </div>

          {/* Claude summary */}
          {summary && (
            <div style={{
              background: 'var(--info-bg)', borderRadius: '8px', padding: '14px 16px',
              marginBottom: '16px',
            }}>
              <p style={{ fontSize: '14px', color: 'var(--info-text)', fontStyle: 'italic', lineHeight: 1.6, margin: 0 }}>
                {summary}
              </p>
            </div>
          )}

          {/* CTA */}
          <Link
            href={`/${locale}/dashboard/minute-book`}
            style={{
              display: 'block', textAlign: 'center',
              padding: '10px 16px', borderRadius: '8px',
              background: 'var(--error-bg)', color: 'var(--error-text)',
              border: '1px solid var(--error-border)',
              fontSize: '14px', fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            {fr ? 'Voir les détails de conformité →' : 'View compliance details →'}
          </Link>
        </div>
      )}

      {/* No fiscal years state */}
      {panelState === 'no_fiscal_years' && (
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: '28px', marginBottom: '8px' }}>📅</div>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '12px', lineHeight: 1.5 }}>
            {fr
              ? "Configurez vos exercices financiers pour activer l'analyse de registre."
              : 'Configure your fiscal years to enable records analysis.'}
          </p>
          <Link
            href={`/${locale}/dashboard/settings`}
            style={{
              display: 'inline-block',
              padding: '8px 16px', borderRadius: '8px',
              background: '#F5B91E', border: 'none',
              fontSize: '13px', fontWeight: 600,
              color: '#1C1A17', textDecoration: 'none',
            }}
          >
            {fr ? 'Configurer mes exercices →' : 'Configure fiscal years →'}
          </Link>
        </div>
      )}

      {/* Error state */}
      {panelState === 'error' && (
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <p style={{ fontSize: '14px', color: 'var(--error-text)', margin: 0 }}>
            {fr ? 'Analyse temporairement indisponible.' : 'Analysis temporarily unavailable.'}
          </p>
          <button
            onClick={handleAnalyze}
            style={{
              marginTop: '12px', padding: '8px 16px', borderRadius: '8px',
              background: 'transparent', border: '1px solid var(--card-border)',
              fontSize: '13px', color: 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            {fr ? 'Réessayer' : 'Retry'}
          </button>
        </div>
      )}
    </div>
  );
}
