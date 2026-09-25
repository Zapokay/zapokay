'use client';

/**
 * TÉLÉCHARGER UN DOCUMENT — un seul bouton, Documents et Complétude (lot V4b, 2026-09-25).
 *
 * ★ LA LOGIQUE EST CELLE DE DocumentRow, DÉPLACÉE SANS CHANGEMENT : fetch de la route,
 * blob, <a download> temporaire, clic, révocation. Le nom du fichier est le TITRE du
 * document (repli « document »), comme Documents l'a toujours fait.
 * ⚪ Une case de 26 px, l'icône Download, title et aria-label « Télécharger ».
 * ★ V7c — rendu par IconButton, qui décide seul des cinq états : plus de prop className.
 * ⚪ `onBusyChange` laisse Documents garder sa coordination d'avant : Voir est désactivé
 * pendant un téléchargement.
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Download } from 'lucide-react';
import IconButton from '@/components/minute-book/IconButton';

interface DownloadButtonProps {
  documentId: string;
  /** Le titre du document ; vide → « document », comme avant. */
  fileName?: string | null;
  /** Désactivation décidée par l'appelant (Documents : Voir en cours). */
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}

export function DownloadButton({ documentId, fileName, disabled, onBusyChange }: DownloadButtonProps) {
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
    <IconButton
      label={tDocs('download')}
      icon={<Download className="w-4 h-4" strokeWidth={1.8} />}
      onClick={handleDownload}
      busy={busy}
      disabled={disabled}
    />
  );
}
