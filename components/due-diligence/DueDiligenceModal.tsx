'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface MissingDocument {
  key: string;
  title_fr: string;
  section: string;
  canGenerate: boolean;
}

interface DueDiligenceStatus {
  completionScore: number;
  totalRequired: number;
  totalComplete: number;
  missingDocuments: MissingDocument[];
}

interface DueDiligenceModalProps {
  companyId: string;
  isOpen: boolean;
  onClose: () => void;
  onScrollToRequirement?: (key: string) => void;
}

/* ------------------------------------------------------------------ */
/*  Score Gauge SVG                                                    */
/* ------------------------------------------------------------------ */

function ScoreGauge({ score }: { score: number }) {
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  const gaugeColor =
    score >= 80
      ? '#22C55E'
      : score >= 50
        ? 'var(--amber-400)'
        : 'var(--amber-400)';

  return (
    <div className="dd-gauge">
      <svg width="132" height="132" viewBox="0 0 132 132">
        {/* Track */}
        <circle
          cx="66"
          cy="66"
          r={radius}
          fill="none"
          stroke="var(--card-border)"
          strokeWidth="10"
        />
        {/* Progress */}
        <circle
          cx="66"
          cy="66"
          r={radius}
          fill="none"
          stroke={gaugeColor}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 66 66)"
          style={{
            transition: 'stroke-dashoffset 0.8s ease-out',
          }}
        />
      </svg>
      <span className="dd-gauge__label">{score}%</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Spinner                                                            */
/* ------------------------------------------------------------------ */

function Spinner() {
  return (
    <svg
      className="dd-spinner"
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
    >
      <circle
        cx="9"
        cy="9"
        r="7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray="32"
        strokeDashoffset="8"
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 9 9"
          to="360 9 9"
          dur="0.7s"
          repeatCount="indefinite"
        />
      </circle>
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Modal                                                              */
/* ------------------------------------------------------------------ */

const MAX_VISIBLE_ITEMS = 6;

export default function DueDiligenceModal({
  companyId,
  isOpen,
  onClose,
  onScrollToRequirement,
}: DueDiligenceModalProps) {
  const router = useRouter();
  const [status, setStatus] = useState<DueDiligenceStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  /* ---------- Charger le statut ---------- */

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/due-diligence/status?companyId=${encodeURIComponent(companyId)}`
      );
      if (!res.ok) throw new Error('Erreur réseau');
      const data: DueDiligenceStatus = await res.json();
      setStatus(data);
    } catch {
      setError('Impossible de charger le statut de complétion.');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (isOpen) {
      fetchStatus();
      setShowAll(false);
    }
  }, [isOpen, fetchStatus]);

  /* ---------- Fermer sur Escape ---------- */

  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  /* ---------- Fermer en cliquant l'overlay ---------- */

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) onClose();
  }

  /* ---------- Exporter ---------- */

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch(
        `/api/due-diligence/export?companyId=${encodeURIComponent(companyId)}`
      );
      if (!res.ok) throw new Error('Export échoué');

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download =
        res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ??
        'livre-minutes.zip';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      onClose();
    } catch {
      setError("Erreur lors de l'export. Veuillez réessayer.");
    } finally {
      setExporting(false);
    }
  }

  /* ---------- Naviguer vers un document manquant ---------- */

  function handleGoToRequirement(key: string) {
    onClose();
    if (onScrollToRequirement) {
      onScrollToRequirement(key);
    } else {
      router.push(`/dashboard/minute-book#${key}`);
    }
  }

  /* ---------- Render ---------- */

  if (!isOpen) return null;

  const visibleMissing = showAll
    ? status?.missingDocuments ?? []
    : (status?.missingDocuments ?? []).slice(0, MAX_VISIBLE_ITEMS);

  const remainingCount = Math.max(
    0,
    (status?.missingDocuments?.length ?? 0) - MAX_VISIBLE_ITEMS
  );

  const modal = (
    <div
      ref={overlayRef}
      className="dd-overlay"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label="Vérification avant export"
    >
      <div className="dd-modal">
        {/* Header */}
        <div className="dd-modal__header">
          <h2 className="dd-modal__title">Vérification avant export</h2>
          <button
            className="dd-modal__close"
            onClick={onClose}
            aria-label="Fermer"
            type="button"
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="dd-modal__body">
          {loading ? (
            <div className="dd-modal__loading">
              <Spinner />
              <p>Analyse en cours…</p>
            </div>
          ) : error && !status ? (
            <div className="dd-modal__error">
              <p>{error}</p>
              <button onClick={fetchStatus} className="dd-btn dd-btn--ghost" type="button">
                Réessayer
              </button>
            </div>
          ) : status ? (
            <>
              {/* Score */}
              <div className="dd-score">
                <ScoreGauge score={status.completionScore} />
                <p className="dd-score__text">
                  <strong>{status.completionScore}% complet</strong>
                  <span className="dd-score__detail">
                    {status.totalComplete} / {status.totalRequired} documents
                  </span>
                </p>
              </div>

              {/* Warning */}
              {status.completionScore < 100 && (
                <div className="dd-warning">
                  <span className="dd-warning__icon" aria-hidden="true">
                    ⚠️
                  </span>
                  <p className="dd-warning__text">
                    Un livre de minutes incomplet ne sera pas accepté lors
                    d&apos;une acquisition, d&apos;une demande de financement ou
                    d&apos;une vérification diligente professionnelle.
                  </p>
                </div>
              )}

              {/* Missing documents */}
              {status.missingDocuments.length > 0 && (
                <div className="dd-missing">
                  <h3 className="dd-missing__title">
                    Documents manquants ({status.missingDocuments.length})
                  </h3>
                  <ul className="dd-missing__list">
                    {visibleMissing.map((doc) => (
                      <li key={doc.key} className="dd-missing__item">
                        <span className="dd-missing__name">{doc.title_fr}</span>
                        <button
                          className="dd-missing__goto"
                          onClick={() => handleGoToRequirement(doc.key)}
                          aria-label={`Aller à ${doc.title_fr}`}
                          type="button"
                        >
                          →
                        </button>
                      </li>
                    ))}
                  </ul>
                  {!showAll && remainingCount > 0 && (
                    <button
                      className="dd-missing__toggle"
                      onClick={() => setShowAll(true)}
                      type="button"
                    >
                      + {remainingCount} autres → Voir tout
                    </button>
                  )}
                </div>
              )}

              {/* Error feedback */}
              {error && (
                <p className="dd-modal__inline-error">{error}</p>
              )}

              {/* Actions */}
              <div className="dd-actions">
                <button
                  className="dd-btn dd-btn--amber"
                  onClick={() => {
                    onClose();
                    router.push('/dashboard/minute-book');
                  }}
                  type="button"
                >
                  Compléter mon livre →
                </button>
                <button
                  className="dd-btn dd-btn--ghost"
                  onClick={handleExport}
                  disabled={exporting}
                  type="button"
                >
                  {exporting ? (
                    <>
                      <Spinner /> Export en cours…
                    </>
                  ) : (
                    `Exporter quand même (${status.completionScore}%)`
                  )}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* Scoped styles */}
      <style>{`
        .dd-overlay {
          position: fixed;
          inset: 0;
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.5);
          padding: 16px;
          animation: dd-fadeIn 0.15s ease-out;
        }

        @keyframes dd-fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .dd-modal {
          background: var(--card-bg);
          border-radius: 16px;
          padding: 28px;
          width: 100%;
          max-width: 520px;
          max-height: 85vh;
          overflow-y: auto;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
          animation: dd-slideUp 0.2s ease-out;
          color: var(--text-body);
        }

        @keyframes dd-slideUp {
          from { transform: translateY(12px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }

        .dd-modal__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 24px;
        }

        .dd-modal__title {
          font-family: var(--font-sora, 'Sora', sans-serif);
          font-size: 1.125rem;
          font-weight: 600;
          margin: 0;
          color: var(--text-heading);
        }

        .dd-modal__close {
          background: none;
          border: none;
          font-size: 1.5rem;
          line-height: 1;
          cursor: pointer;
          color: var(--text-muted);
          padding: 4px;
          border-radius: 6px;
          transition: color 0.15s, background 0.15s;
        }

        .dd-modal__close:hover {
          color: var(--text-heading);
          background: var(--hover);
        }

        .dd-modal__body {
          display: flex;
          flex-direction: column;
          gap: 20px;
        }

        .dd-modal__loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 12px;
          padding: 32px 0;
          color: var(--text-muted);
        }

        .dd-modal__error {
          text-align: center;
          padding: 24px 0;
          color: var(--error-text);
        }

        .dd-modal__inline-error {
          color: var(--error-text);
          font-size: 0.875rem;
          margin: 0;
        }

        /* Score */
        .dd-score {
          display: flex;
          align-items: center;
          gap: 20px;
        }

        .dd-gauge {
          position: relative;
          flex-shrink: 0;
        }

        .dd-gauge__label {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--font-sora, 'Sora', sans-serif);
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--text-heading);
        }

        .dd-score__text {
          display: flex;
          flex-direction: column;
          gap: 2px;
          margin: 0;
          font-family: var(--font-dm-sans, 'DM Sans', sans-serif);
        }

        .dd-score__text strong {
          font-size: 1rem;
          color: var(--text-heading);
        }

        .dd-score__detail {
          font-size: 0.875rem;
          color: var(--text-muted);
        }

        /* Warning */
        .dd-warning {
          display: flex;
          gap: 10px;
          padding: 14px 16px;
          border-radius: 10px;
          background: var(--warning-bg);
          border: 1px solid var(--warning-border);
        }

        .dd-warning__icon {
          flex-shrink: 0;
          font-size: 1rem;
          line-height: 1.5;
        }

        .dd-warning__text {
          margin: 0;
          font-size: 0.8125rem;
          line-height: 1.5;
          color: var(--warning-text);
        }

        /* Missing documents */
        .dd-missing__title {
          font-family: var(--font-dm-sans, 'DM Sans', sans-serif);
          font-size: 0.8125rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--text-muted);
          margin: 0 0 10px;
        }

        .dd-missing__list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          max-height: 240px;
          overflow-y: auto;
        }

        .dd-missing__item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 12px;
          border-radius: 8px;
          transition: background 0.12s;
        }

        .dd-missing__item:hover {
          background: var(--hover);
        }

        .dd-missing__name {
          font-size: 0.875rem;
          color: var(--text-body);
        }

        .dd-missing__goto {
          background: none;
          border: none;
          cursor: pointer;
          font-size: 1rem;
          color: var(--text-muted);
          padding: 2px 6px;
          border-radius: 4px;
          transition: color 0.15s, background 0.15s;
        }

        .dd-missing__goto:hover {
          color: var(--amber-400);
          background: var(--hover);
        }

        .dd-missing__toggle {
          background: none;
          border: none;
          cursor: pointer;
          font-size: 0.8125rem;
          color: var(--amber-400);
          padding: 8px 12px;
          margin-top: 4px;
          font-weight: 500;
          transition: opacity 0.15s;
        }

        .dd-missing__toggle:hover {
          opacity: 0.8;
        }

        /* Actions */
        .dd-actions {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-top: 4px;
        }

        .dd-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 12px 20px;
          border-radius: 10px;
          font-family: var(--font-dm-sans, 'DM Sans', sans-serif);
          font-size: 0.9375rem;
          font-weight: 600;
          cursor: pointer;
          border: none;
          transition: opacity 0.15s, transform 0.1s;
        }

        .dd-btn:hover:not(:disabled) {
          opacity: 0.9;
        }

        .dd-btn:active:not(:disabled) {
          transform: scale(0.98);
        }

        .dd-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .dd-btn--amber {
          background: var(--amber-400);
          color: var(--cta-text);
        }

        .dd-btn--ghost {
          background: transparent;
          color: var(--text-muted);
          font-weight: 500;
          font-size: 0.875rem;
        }

        .dd-btn--ghost:hover:not(:disabled) {
          color: var(--text-heading);
          opacity: 1;
        }

        /* Spinner */
        .dd-spinner {
          animation: dd-spin 0.7s linear infinite;
        }

        @keyframes dd-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );

  return createPortal(modal, document.body);
}
