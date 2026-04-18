/**
 * Normalize a value stored in `documents.file_url` into a relative Supabase Storage
 * object key (the thing `.download()`, `.createSignedUrl()`, `.remove()` all expect).
 *
 * Historically the codebase wrote two shapes to `file_url`:
 *   1. Full public URL  — e.g. "https://…/storage/v1/object/public/documents/{path}"
 *   2. Relative key     — e.g. "{companyId}/{filename}"
 *
 * This helper accepts either and returns the relative key, or `null` if the input
 * is unrecognized.
 *
 * Idempotent: calling `filePathFromFileUrl(filePathFromFileUrl(x))` returns the
 * same value as one call.
 */
export function filePathFromFileUrl(
  fileUrl: string | null | undefined,
  bucket: string = 'documents'
): string | null {
  if (!fileUrl) return null;

  const publicBucketMarker = `/object/public/${bucket}/`;
  const signBucketMarker = `/object/sign/${bucket}/`;

  // 1. Public URL for the exact bucket.
  const pubIdx = fileUrl.indexOf(publicBucketMarker);
  if (pubIdx !== -1) {
    return stripSignedToken(fileUrl.slice(pubIdx + publicBucketMarker.length));
  }

  // 2. Signed URL for the exact bucket.
  const sigIdx = fileUrl.indexOf(signBucketMarker);
  if (sigIdx !== -1) {
    return stripSignedToken(fileUrl.slice(sigIdx + signBucketMarker.length));
  }

  // 3. Public/signed URL with an unexpected bucket — slice after the bucket segment.
  //    Matches "/object/public/{anything}/" or "/object/sign/{anything}/".
  const genericPublic = fileUrl.match(/\/object\/public\/[^/]+\//);
  if (genericPublic) {
    return stripSignedToken(
      fileUrl.slice(genericPublic.index! + genericPublic[0].length)
    );
  }
  const genericSigned = fileUrl.match(/\/object\/sign\/[^/]+\//);
  if (genericSigned) {
    return stripSignedToken(
      fileUrl.slice(genericSigned.index! + genericSigned[0].length)
    );
  }

  // 4. Idempotent relative-path case: no scheme, no leading /storage/ segment.
  if (!fileUrl.includes('://') && !fileUrl.startsWith('/storage/')) {
    return fileUrl;
  }

  return null;
}

function stripSignedToken(path: string): string {
  const q = path.indexOf('?');
  return q === -1 ? path : path.slice(0, q);
}
