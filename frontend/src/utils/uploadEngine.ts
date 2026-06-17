/**
 * uploadEngine.ts — presigned-URL upload engine.
 *
 * Decides single-part vs multipart based on file size, then:
 *   - Puts bytes directly to MinIO via presigned URLs (never through Spring).
 *   - Tracks per-byte progress and invokes the onProgress callback.
 *   - Supports cancellation via AbortSignal.
 *   - Returns the confirmed AttachmentDto after signalling the backend.
 */

import {
  initiateUpload,
  confirmUpload,
  initiateMultipartUpload,
  completeMultipartUpload,
  type AttachmentDto,
  type CompletedPart,
} from '@api/attachments';

export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

/** Files larger than this use MinIO multipart (must match backend config). */
const MULTIPART_THRESHOLD = 100 * 1024 * 1024; // 100 MB

/** Hard ceiling — must match pia.attachments.max-bytes in application.yml. */
const MAX_FILE_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB

/** Max concurrent part uploads for multipart. */
const MULTIPART_CONCURRENCY = 3;

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * Upload `file` for the given entity, streaming progress via `onProgress`.
 *
 * Validates size (≤ 10 GB) and MIME type against `accept` before hitting the
 * network — gives instant feedback rather than waiting for a backend 4xx.
 *
 * @param accept  Comma-separated MIME types the field allows (same string as
 *                the `<input accept>` attribute).  Pass `'*'` to skip MIME check.
 * @param signal  Optional AbortSignal; abort the signal to cancel mid-upload.
 */
export async function uploadFile(
  entityType: string,
  entityId: string,
  file: File,
  onProgress: (p: UploadProgress) => void,
  accept = '*',
  signal?: AbortSignal,
): Promise<AttachmentDto> {
  // ── Client-side validation ────────────────────────────────────────────────

  if (file.size === 0) {
    throw new Error('Cannot upload an empty file.');
  }

  if (file.size > MAX_FILE_BYTES) {
    const gb = (file.size / 1024 ** 3).toFixed(2);
    throw new Error(`File is ${gb} GB — maximum allowed size is 10 GB.`);
  }

  if (accept !== '*' && accept !== '') {
    const allowed = accept.split(',').map((m) => m.trim().toLowerCase());
    const mime = (file.type || 'application/octet-stream').toLowerCase();
    const ok = allowed.some((pattern) => {
      if (pattern.endsWith('/*')) return mime.startsWith(pattern.slice(0, -1));
      return pattern === mime;
    });
    if (!ok) {
      throw new Error(`File type "${file.type || 'unknown'}" is not allowed for this field.`);
    }
  }

  signal?.throwIfAborted();

  // ── Route to single-part or multipart ────────────────────────────────────

  if (file.size > MULTIPART_THRESHOLD) {
    return uploadMultipart(entityType, entityId, file, onProgress, signal);
  }
  return uploadSinglePart(entityType, entityId, file, onProgress, signal);
}

// ── Single-part ───────────────────────────────────────────────────────────────

async function uploadSinglePart(
  entityType: string,
  entityId: string,
  file: File,
  onProgress: (p: UploadProgress) => void,
  signal?: AbortSignal,
): Promise<AttachmentDto> {
  const { attachmentId, presignedUrl } = await initiateUpload({
    entityType,
    entityId,
    filename: file.name,
    contentType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
  });

  signal?.throwIfAborted();

  await xhrPut(presignedUrl, file, file.type || 'application/octet-stream', signal, (loaded) => {
    onProgress({ loaded, total: file.size, percent: Math.round((loaded / file.size) * 100) });
  });

  return confirmUpload(attachmentId);
}

// ── Multipart ─────────────────────────────────────────────────────────────────

async function uploadMultipart(
  entityType: string,
  entityId: string,
  file: File,
  onProgress: (p: UploadProgress) => void,
  signal?: AbortSignal,
): Promise<AttachmentDto> {
  const { attachmentId, parts } = await initiateMultipartUpload({
    entityType,
    entityId,
    filename: file.name,
    contentType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
  });

  const partLoaded = new Array<number>(parts.length).fill(0);
  const total = file.size;

  const reportProgress = () => {
    const loaded = partLoaded.reduce((a, b) => a + b, 0);
    onProgress({ loaded, total, percent: Math.round((loaded / total) * 100) });
  };

  const partSize = Math.ceil(file.size / parts.length);
  const completedParts: CompletedPart[] = new Array(parts.length);

  for (let i = 0; i < parts.length; i += MULTIPART_CONCURRENCY) {
    signal?.throwIfAborted();
    const batch = parts.slice(i, i + MULTIPART_CONCURRENCY);
    await Promise.all(
      batch.map(async ({ partNumber, presignedUrl }) => {
        const idx = partNumber - 1;
        const start = idx * partSize;
        const end = Math.min(start + partSize, file.size);
        const chunk = file.slice(start, end);

        const etag = await xhrPut(
          presignedUrl,
          chunk,
          file.type || 'application/octet-stream',
          signal,
          (loaded) => {
            partLoaded[idx] = loaded;
            reportProgress();
          },
        );
        completedParts[idx] = { partNumber, etag };
      }),
    );
  }

  signal?.throwIfAborted();
  return completeMultipartUpload(attachmentId, completedParts);
}

// ── XHR PUT with progress + abort ────────────────────────────────────────────

/**
 * PUT `body` to `url` using XHR (fetch has no upload progress API).
 * Hooks into `signal` to abort the XHR when the caller cancels.
 * Returns the ETag header value on success (needed for multipart assembly).
 */
function xhrPut(
  url: string,
  body: Blob,
  contentType: string,
  signal: AbortSignal | undefined,
  onLoaded: (bytes: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new DOMException('Upload cancelled', 'AbortError'));
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onLoaded(e.loaded);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onLoaded(body.size);
        const etag = xhr.getResponseHeader('ETag') ?? '';
        resolve(etag.replace(/"/g, ''));
      } else {
        reject(new Error(`MinIO PUT failed: HTTP ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during file upload'));
    xhr.onabort = () =>
      reject(new DOMException('Upload cancelled', 'AbortError'));

    // Wire the AbortSignal to the XHR
    const onAbort = () => xhr.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    xhr.onloadend = () => signal?.removeEventListener('abort', onAbort);

    xhr.send(body);
  });
}
