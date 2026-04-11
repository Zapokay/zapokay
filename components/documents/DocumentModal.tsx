'use client';
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { VaultDocument } from './DocumentRow';

interface SummaryKeyPoint {
  title: string;
  explanation: string;
}

interface DocumentSummary {
  title: string;
  purpose: string;
  keyPoints: SummaryKeyPoint[];
  importantDates: string[];
  disclaimer: string;
}

interface DocumentModalProps {
  doc: VaultDocument;
  locale: string;
  aiSummariesEnabled: boolean;
  onClose: () => void;
}

function SkeletonLine({ width = '100%' }: { width?: string }) {
  return (
    <div style={{
      height: '14px', borderRadius: '6px',
      background: 'linear-gradient(90deg, #E5E7EB 25%, #F3F4F6 50%, #E5E7EB 75%)',
      backgroundSize: '200% 100%',
      animation: 'shimmer 1.5s infinite',
      width,
    }} />
  );
}

type SummaryState = 'idle' | 'loading' | 'loaded' | 'error' | 'unavailable';

export function DocumentModal({ doc, locale, aiSummariesEnabled, onClose }: DocumentModalProps) {
  const fr = locale === 'fr';
  const supabase = createClient();

  const [activeTab, setActiveTab] = useState<'summary' | 'document'>(
    aiSummariesEnabled ? 'summary' : 'document'
  );
  const [summaryState, setSummaryState] = useState<SummaryState>('idle');
  const [summary, setSummary] = useState<DocumentSummary | null>(null);
  const [expandedPoints, setExpandedPoints] = useState<Set<number>>(new Set());
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const BUCKET_MARKER = '/object/public/documents/';

  const loadSignedUrl = useCallback(async () => {
    if (!doc.file_url || pdfUrl) return;
    setPdfLoading(true);
    try {
      const idx = doc.file_url.indexOf(BUCKET_MARKER);
      if (idx === -1) return;
      const storagePath = doc.file_url.slice(idx + BUCKET_MARKER.length);
      const { data } = await supabase.storage.from('documents').createSignedUrl(storagePath, 300);
      if (data?.signedUrl) setPdfUrl(data.signedUrl);
    } finally {
      setPdfLoading(false);
    }
  }, [doc.file_url, pdfUrl, supabase]);

  // Check cached summary on mount if AI enabled
  useEffect(() => {
    if (!aiSummariesEnabled) return;
    const cacheKey = fr ? 'ai_summary_fr' : 'ai_summary_en';
    const docAsRecord = doc as unknown as Record<string, unknown>;
    const cached = docAsRecord[cacheKey] as DocumentSummary | null;
    if (cached) {
      setSummary(cached);
      setSummaryState('loaded');
    }
  }, [aiSummariesEnabled, doc, fr]);

  useEffect(() => {
    if (activeTab === 'document') {
      loadSignedUrl();
    }
  }, [activeTab, loadSignedUrl]);

  async function handleGenerateSummary() {
    setSummaryState('loading');
    try {
      const res = await fetch('/api/ai/document-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: doc.id, locale }),
      });
      const data = await res.json();

      if (!res.ok || data.error === 'summary_unavailable') {
        setSummaryState('unavailable');
        return;
      }
      if (data.error) {
        setSummaryState('error');
        return;
      }

      setSummary(data.summary);
      setSummaryState('loaded');
    } catch {
      setSummaryState('error');
    }
  }

  function togglePoint(idx: number) {
    setExpandedPoints(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  const tabStyle = (active: boolean) => ({
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
    border: 'none',
    background: 'transparent',
    borderBottom: active ? '2px solid #1E3D6B' : '2px solid transparent',
    color: active ? '#1E3D6B' : 'var(--text-muted)',
    transition: 'all 150ms',
  });

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(7,14,28,0.5)', backdropFilter: 'blur(4px)',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <style>{`
        @keyframes shimmer {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
      `}</style>

      <div style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--card-border)',
        borderRadius: '16px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.2)',
        width: '100%', maxWidth: '680px',
        maxHeight: '90vh',
        margin: '0 16px',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Modal header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid var(--card-border)',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{
              fontFamily: 'Sora, sans-serif', fontSize: '15px', fontWeight: 700,
              color: 'var(--text-heading)', margin: 0,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {doc.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              marginLeft: '12px', flexShrink: 0,
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

        {/* Tabs — only if AI summaries enabled */}
        {aiSummariesEnabled && (
          <div style={{
            display: 'flex',
            borderBottom: '1px solid var(--card-border)',
            padding: '0 20px',
          }}>
            <button style={tabStyle(activeTab === 'summary')} onClick={() => setActiveTab('summary')}>
              {fr ? 'Résumé' : 'Summary'}
            </button>
            <button style={tabStyle(activeTab === 'document')} onClick={() => setActiveTab('document')}>
              {fr ? 'Document complet' : 'Full document'}
            </button>
          </div>
        )}

        {/* Tab content */}
        <div style={{ flex: 1, overflow: 'auto' }}>

          {/* ── Summary tab ── */}
          {(activeTab === 'summary' || !aiSummariesEnabled) && aiSummariesEnabled && (
            <div style={{ padding: '20px' }}>

              {summaryState === 'idle' && (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div style={{ fontSize: '28px', marginBottom: '12px' }}>📄</div>
                  <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                    {fr
                      ? 'Générez un résumé intelligent de ce document.'
                      : 'Generate an intelligent summary of this document.'}
                  </p>
                  <button
                    onClick={handleGenerateSummary}
                    style={{
                      padding: '10px 20px', borderRadius: '10px',
                      background: '#F5B91E', border: 'none',
                      fontWeight: 600, fontSize: '14px',
                      color: '#1C1A17', cursor: 'pointer',
                    }}
                  >
                    {fr ? 'Générer le résumé' : 'Generate summary'}
                  </button>
                </div>
              )}

              {summaryState === 'loading' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <SkeletonLine />
                  <SkeletonLine width="85%" />
                  <SkeletonLine width="70%" />
                  <div style={{ marginTop: '8px' }}>
                    <SkeletonLine width="40%" />
                  </div>
                  <SkeletonLine />
                  <SkeletonLine width="90%" />
                </div>
              )}

              {summaryState === 'unavailable' && (
                <div style={{
                  background: 'var(--warning-bg)', border: '1px solid var(--warning-border)',
                  borderRadius: '8px', padding: '14px 16px', textAlign: 'center',
                }}>
                  <p style={{ fontSize: '14px', color: 'var(--warning-text)', margin: '0 0 12px' }}>
                    {fr
                      ? 'Le résumé n\'est pas disponible pour ce document. Vérifiez que le fichier est un PDF lisible et réessayez.'
                      : 'Summary not available for this document. Make sure the file is a readable PDF and try again.'}
                  </p>
                  <button
                    onClick={handleGenerateSummary}
                    style={{
                      padding: '8px 16px', borderRadius: '8px',
                      border: '1px solid var(--warning-border)',
                      background: 'transparent', fontSize: '13px',
                      color: 'var(--warning-text)', cursor: 'pointer',
                    }}
                  >
                    {fr ? 'Réessayer' : 'Retry'}
                  </button>
                </div>
              )}

              {summaryState === 'error' && (
                <div style={{
                  background: '#F5EEEE', border: '1px solid #C9A5A5',
                  borderRadius: '8px', padding: '14px 16px', textAlign: 'center',
                }}>
                  <p style={{ fontSize: '14px', color: '#6B1E1E', margin: '0 0 12px' }}>
                    {fr ? 'Erreur lors de la génération.' : 'Error generating summary.'}
                  </p>
                  <button
                    onClick={handleGenerateSummary}
                    style={{
                      padding: '8px 16px', borderRadius: '8px',
                      border: '1px solid #C9A5A5',
                      background: 'transparent', fontSize: '13px',
                      color: '#6B1E1E', cursor: 'pointer',
                    }}
                  >
                    {fr ? 'Réessayer' : 'Retry'}
                  </button>
                </div>
              )}

              {summaryState === 'loaded' && summary && (
                <div>
                  {/* Claude badge */}
                  <div style={{ marginBottom: '16px' }}>
                    <span style={{
                      fontSize: '11px', fontWeight: 600,
                      color: '#1E3D6B', background: '#EEF1F7',
                      borderRadius: '999px', padding: '3px 10px',
                    }}>
                      ⚡ {fr ? 'Généré par Claude' : 'Generated by Claude'}
                    </span>
                  </div>

                  {/* Purpose */}
                  <div style={{ marginBottom: '20px' }}>
                    <h3 style={{
                      fontFamily: 'Sora, sans-serif', fontSize: '12px', fontWeight: 700,
                      color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em',
                      margin: '0 0 6px',
                    }}>
                      {fr ? 'À propos' : 'About'}
                    </h3>
                    <p style={{ fontSize: '15px', color: 'var(--text-body)', lineHeight: 1.6, margin: 0 }}>
                      {summary.purpose}
                    </p>
                  </div>

                  {/* Key points accordion */}
                  {summary.keyPoints.length > 0 && (
                    <div style={{ marginBottom: '20px' }}>
                      <h3 style={{
                        fontFamily: 'Sora, sans-serif', fontSize: '12px', fontWeight: 700,
                        color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em',
                        margin: '0 0 10px',
                      }}>
                        {fr ? 'Points clés' : 'Key points'}
                      </h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {summary.keyPoints.map((point, idx) => (
                          <div
                            key={idx}
                            style={{
                              border: '1px solid var(--card-border)',
                              borderRadius: '8px', overflow: 'hidden',
                            }}
                          >
                            <button
                              onClick={() => togglePoint(idx)}
                              style={{
                                width: '100%', display: 'flex', alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '10px 14px',
                                background: expandedPoints.has(idx) ? '#EEF1F7' : 'transparent',
                                border: 'none', cursor: 'pointer', textAlign: 'left',
                              }}
                            >
                              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-heading)' }}>
                                {point.title}
                              </span>
                              <svg
                                width="12" height="12" viewBox="0 0 12 12" fill="none"
                                style={{
                                  flexShrink: 0, marginLeft: '8px',
                                  transform: expandedPoints.has(idx) ? 'rotate(180deg)' : 'none',
                                  transition: 'transform 150ms',
                                  color: 'var(--text-muted)',
                                }}
                              >
                                <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            </button>
                            {expandedPoints.has(idx) && (
                              <div style={{ padding: '8px 14px 12px', borderTop: '1px solid var(--card-border)' }}>
                                <p style={{ fontSize: '13px', color: 'var(--text-body)', lineHeight: 1.6, margin: 0 }}>
                                  {point.explanation}
                                </p>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Important dates */}
                  {summary.importantDates.length > 0 && (
                    <div style={{ marginBottom: '20px' }}>
                      <h3 style={{
                        fontFamily: 'Sora, sans-serif', fontSize: '12px', fontWeight: 700,
                        color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em',
                        margin: '0 0 8px',
                      }}>
                        {fr ? 'Dates importantes' : 'Important dates'}
                      </h3>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {summary.importantDates.map((date, idx) => (
                          <span
                            key={idx}
                            style={{
                              background: 'var(--warning-bg)', color: 'var(--warning-text)',
                              border: '1px solid var(--warning-border)',
                              borderRadius: '6px', padding: '4px 10px',
                              fontSize: '12px', fontWeight: 500,
                            }}
                          >
                            {date}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Disclaimer */}
                  <p style={{
                    fontSize: '11px', color: '#A09589',
                    fontStyle: 'italic', lineHeight: 1.5, margin: 0,
                    borderTop: '1px solid var(--card-border)', paddingTop: '14px',
                  }}>
                    {summary.disclaimer}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ── Document tab ── */}
          {activeTab === 'document' && (
            <div style={{ height: '60vh', display: 'flex', flexDirection: 'column' }}>
              {pdfLoading && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg style={{ width: '24px', height: '24px', animation: 'spin 0.8s linear infinite' }} fill="none" viewBox="0 0 24 24">
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                    <circle cx="12" cy="12" r="10" stroke="#E0D9CE" strokeWidth="4" />
                    <path fill="#1E3D6B" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </div>
              )}
              {!pdfLoading && pdfUrl && (
                <iframe
                  src={pdfUrl}
                  style={{ flex: 1, border: 'none', width: '100%' }}
                  title={doc.title}
                />
              )}
              {!pdfLoading && !pdfUrl && (
                <div style={{
                  flex: 1, display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  color: 'var(--text-muted)',
                }}>
                  <p style={{ fontSize: '14px', marginBottom: '12px' }}>
                    {fr ? 'Aperçu non disponible.' : 'Preview not available.'}
                  </p>
                  {doc.file_url && (
                    <a
                      href={doc.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        padding: '8px 16px', borderRadius: '8px',
                        background: '#F5B91E', border: 'none',
                        fontWeight: 600, fontSize: '13px',
                        color: '#1C1A17', cursor: 'pointer',
                        textDecoration: 'none',
                      }}
                    >
                      {fr ? 'Ouvrir dans un nouvel onglet' : 'Open in new tab'}
                    </a>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
