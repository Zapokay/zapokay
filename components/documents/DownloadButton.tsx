'use client';

/**
 * TÉLÉCHARGER UN DOCUMENT — un seul bouton, Documents et Complétude (lot V4b, 2026-09-25).
 *
 * ★ LA LOGIQUE EST CELLE DE DocumentRow, DÉPLACÉE SANS CHANGEMENT : fetch de la route,
 * blob, <a download> temporaire, clic, révocation. Le nom du fichier est le TITRE du
 * document (repli « document »), comme Documents l'a toujours fait.
 * ⚪ Une case de 26 px, l'icône Download, title et aria-label « Télécharger ».
 * ⚪ `onBusyChange` laisse Documents garder sa coordination d'avant : Voir est désactivé
 * pendant un téléchargement.
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Download } from 'lucide-react';

const spinnerIcon = (
  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

interface DownloadButtonProps {
  documentId: string;
  /** Le titre du document ; vide → « document », comme avant. */
  fileName?: string | null;
  className: string;
  /** Désactivation décidée par l'appelant (Documents : Voir en cours). */
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}

export function DownloadButton({ documentId, fileName, className, disabled, onBusyChange }: DownloadButtonProps) {
  const tDocs = useTranslations('documents');
  const [busy, setBusy] = useState(false);

  async function handleDownload() {
    setBusy(true);
    onBusyChange?.(true);
    try {
      const response = await fetch(`/api/documents/${documentId}/download`);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName || 'document';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
  }

  return (
    <button
      onClick={handleDownload}
      disabled={busy || disabled}
      className={className}
      title={tDocs('download')}
      aria-label={tDocs('download')}
    >
      {busy ? spinnerIcon : <Download className="w-4 h-4" strokeWidth={1.8} />}
    </button>
  );
}
