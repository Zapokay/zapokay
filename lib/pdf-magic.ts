// lib/pdf-magic.ts
/**
 * PDF content-sniffing — single source of truth for the "%PDF" magic-number
 * gate shared by lib/upload-document.ts (defense-in-depth, any client) and
 * app/api/documents/upload/route.ts (authoritative server-side enforcement).
 *
 * A valid PDF begins with the 4 bytes 0x25 0x50 0x44 0x46 ('%PDF'). This is a
 * content check, independent of filename extension or the declared MIME header
 * (both of which are spoofable).
 */

/** The 4 leading bytes of every PDF: '%PDF'. */
export const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46] as const;

/**
 * True iff `head` begins with the PDF magic number. Accepts either a Uint8Array
 * or a raw ArrayBuffer (caller may pass file.slice(0,4).arrayBuffer() directly).
 * Only the first 4 bytes are inspected; a longer buffer is fine.
 */
export function isPdfBytes(head: Uint8Array | ArrayBuffer): boolean {
  const bytes = head instanceof Uint8Array ? head : new Uint8Array(head);
  return (
    bytes[0] === PDF_MAGIC[0] &&
    bytes[1] === PDF_MAGIC[1] &&
    bytes[2] === PDF_MAGIC[2] &&
    bytes[3] === PDF_MAGIC[3]
  );
}
