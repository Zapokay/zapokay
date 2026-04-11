'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getLegalDefinition } from '@/lib/legal-definitions';

interface LegalTooltipProps {
  definitionKey: string;
  lang?: 'fr' | 'en';
  children?: React.ReactNode;
}

export function LegalTooltip({
  definitionKey,
  lang = 'fr',
  children,
}: LegalTooltipProps) {
  const [open, setOpen] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const [position, setPosition] = useState<'bottom-right' | 'bottom-left'>(
    'bottom-right'
  );
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const def = getLegalDefinition(definitionKey);

  useEffect(() => {
    setIsTouchDevice(window.matchMedia('(hover: none)').matches);
  }, []);

  // Close on outside click (mobile)
  useEffect(() => {
    if (!open || !isTouchDevice) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (
        tooltipRef.current &&
        !tooltipRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open, isTouchDevice]);

  // Close other tooltips on mobile via custom event
  useEffect(() => {
    if (!open) return;
    const handler = (e: Event) => {
      if ((e as CustomEvent).detail !== definitionKey) {
        setOpen(false);
      }
    };
    window.addEventListener('legal-tooltip-open', handler);
    return () => window.removeEventListener('legal-tooltip-open', handler);
  }, [open, definitionKey]);

  const computePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const spaceRight = window.innerWidth - rect.right;
    setPosition(spaceRight < 300 ? 'bottom-left' : 'bottom-right');
  }, []);

  const handleOpen = useCallback(() => {
    computePosition();
    window.dispatchEvent(
      new CustomEvent('legal-tooltip-open', { detail: definitionKey })
    );
    setOpen(true);
  }, [computePosition, definitionKey]);

  const handleMouseEnter = useCallback(() => {
    if (isTouchDevice) return;
    hoverTimeoutRef.current = setTimeout(handleOpen, 200);
  }, [isTouchDevice, handleOpen]);

  const handleMouseLeave = useCallback(() => {
    if (isTouchDevice) return;
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    setOpen(false);
  }, [isTouchDevice]);

  const handleClick = useCallback(() => {
    if (!isTouchDevice) return;
    if (open) {
      setOpen(false);
    } else {
      handleOpen();
    }
  }, [isTouchDevice, open, handleOpen]);

  if (!def) return null;

  const term = lang === 'fr' ? def.term_fr : def.term_en;
  const definition = lang === 'fr' ? def.definition_fr : def.definition_en;

  return (
    <span
      ref={triggerRef}
      className="legal-tooltip-wrapper"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
      style={{ position: 'relative', display: 'inline' }}
    >
      {children ?? (
        <span style={{ borderBottom: '1px dashed var(--color-navy-200)', cursor: 'help' }}>
          {term}
        </span>
      )}
      <span
        aria-label={`${lang === 'fr' ? 'Définition de' : 'Definition of'} ${term}`}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (open) setOpen(false);
            else handleOpen();
          }
        }}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 16,
          height: 16,
          borderRadius: '50%',
          backgroundColor: 'var(--color-navy-50)',
          color: 'var(--color-navy-400)',
          fontSize: 10,
          fontWeight: 700,
          cursor: 'pointer',
          verticalAlign: 'middle',
          marginLeft: 4,
          lineHeight: 1,
          userSelect: 'none',
          flexShrink: 0,
        }}
      >
        ?
      </span>

      {open && (
        <div
          ref={tooltipRef}
          role="tooltip"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            ...(position === 'bottom-right' ? { left: 0 } : { right: 0 }),
            width: 280,
            maxWidth: 280,
            backgroundColor: 'var(--color-nt-0, #fff)',
            border: '1px solid var(--color-nt-200, #e5e7eb)',
            borderRadius: 10,
            boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
            zIndex: 9999,
            animation: 'legalTooltipFadeIn 150ms ease',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              borderBottom: '1px solid var(--color-nt-200, #e5e7eb)',
            }}
          >
            <span
              style={{
                fontFamily: 'Sora, sans-serif',
                fontWeight: 600,
                fontSize: 13,
                color: 'var(--color-navy-900)',
              }}
            >
              {term}
            </span>
            {isTouchDevice && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                }}
                aria-label={lang === 'fr' ? 'Fermer' : 'Close'}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: 16,
                  color: 'var(--color-navy-400)',
                  padding: 0,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            )}
          </div>
          <div
            style={{
              padding: '12px 14px',
              fontFamily: '"DM Sans", sans-serif',
              fontSize: 13,
              lineHeight: 1.6,
              color: 'var(--color-navy-900)',
            }}
          >
            {definition}
          </div>
        </div>
      )}

      <style>{`
        @keyframes legalTooltipFadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </span>
  );
}
