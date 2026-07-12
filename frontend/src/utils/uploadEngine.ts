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
import { API_BASE } from '@lib/apiBase';

/**
 * TEMPORARY WAF workaround (see HANDOVER.md): the VM's WAF blocks PUT, so a direct
 * PUT to MinIO's presigned URL never reaches it there. When this build flag is on,
 * uploads instead POST to our own backend (POST passes the WAF), which relays the
 * bytes to MinIO internally — see AttachmentService.uploadProxy/uploadProxyPart.
 * Off by default; revert is just rebuilding without the flag, no code change needed.
 */
const PROXY_UPLOAD_ENABLED = (import.meta.env.VITE_WAF_PROXY_UPLOAD as string) === 'true';

export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

/**
 * Files larger than this use MinIO multipart. A single presigned PUT to MinIO/S3
 * handles objects up to 5 GB, so we only fall back to the (reflection-based, more
 * fragile) multipart path for very large files — this keeps typical large uploads
 * like drone footage on the reliable single-part path.
 */
const MULTIPART_THRESHOLD = 4 * 1024 * 1024 * 1024; // 4 GB

/** Hard ceiling — must match pia.attachments.max-bytes in application.yml. */
const MAX_FILE_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB

/** Max concurrent part uploads for multipart. */
const MULTIPART_CONCURRENCY = 3;

/**
 * Content types the backend allow-list accepts but browsers often fail to
 * report from the file extension alone (they hand back "" / octet-stream).
 * Map the extension to the canonical MIME so `initiate` isn't rejected with a
 * 415 Unsupported Media Type. Must stay a subset of AllowedContentTypes on the
 * backend.
 */
const EXTENSION_CONTENT_TYPES: Record<string, string> = {
  '.kmz': 'application/vnd.google-earth.kmz',
  '.kml': 'application/vnd.google-earth.kml+xml',
  '.gpx': 'application/gpx+xml',
};

/**
 * Best-effort content type for `file`. Trusts the browser-reported MIME when
 * it's present and specific; otherwise falls back to the extension map, then to
 * a generic octet-stream.
 */
function resolveContentType(file: File): string {
  const reported = file.type?.trim().toLowerCase();
  if (reported && reported !== 'application/octet-stream') return file.type;

  const name = file.name.toLowerCase();
  const dot = name.lastIndexOf('.');
  if (dot !== -1) {
    const ext = name.slice(dot);
    if (EXTENSION_CONTENT_TYPES[ext]) return EXTENSION_CONTENT_TYPES[ext];
  }
  return 'application/octet-stream';
}

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
    const name = file.name.toLowerCase();
    const ok = allowed.some((pattern) => {
      // Extension pattern (e.g. ".kmz") — match against the filename. Browsers
      // often report an empty/octet-stream MIME for .kmz/.kml, so extension
      // matching is the only reliable check for those.
      if (pattern.startsWith('.')) return name.endsWith(pattern);
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
  const contentType = resolveContentType(file);
  const { attachmentId, presignedUrl } = await initiateUpload({
    entityType,
    entityId,
    filename: file.name,
    contentType,
    sizeBytes: file.size,
  });

  signal?.throwIfAborted();

  const onLoaded = (loaded: number) =>
    onProgress({ loaded, total: file.size, percent: Math.round((loaded / file.size) * 100) });

  if (PROXY_UPLOAD_ENABLED) {
    await xhrPost(`${API_BASE}/attachments/${attachmentId}/upload-proxy`, file, contentType, signal, onLoaded);
  } else {
    await xhrPut(presignedUrl, file, contentType, signal, onLoaded);
  }

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
  const contentType = resolveContentType(file);
  const { attachmentId, parts } = await initiateMultipartUpload({
    entityType,
    entityId,
    filename: file.name,
    contentType,
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

        const onLoaded = (loaded: number) => {
          partLoaded[idx] = loaded;
          reportProgress();
        };

        const etag = PROXY_UPLOAD_ENABLED
          ? await xhrPost(
              `${API_BASE}/attachments/${attachmentId}/upload-proxy-part?partNumber=${partNumber}`,
              chunk,
              contentType,
              signal,
              onLoaded,
            )
          : await xhrPut(presignedUrl, chunk, contentType, signal, onLoaded);
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

/**
 * POST `body` to our own backend (TEMPORARY WAF workaround — see PROXY_UPLOAD_ENABLED
 * above). Same shape as `xhrPut`, but sends the session cookie (`withCredentials`)
 * since this hits our API, not MinIO directly, and reads the ETag from a JSON body
 * (`{"etag": "..."}`) rather than a response header — MinIO's own response header
 * isn't ours to forward, so the backend re-emits it as JSON.
 */
function xhrPost(
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
    xhr.open('POST', url);
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.withCredentials = true;

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onLoaded(e.loaded);
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onLoaded(body.size);
        let etag = '';
        try {
          const parsed = xhr.responseText ? JSON.parse(xhr.responseText) : null;
          if (parsed?.etag) etag = parsed.etag;
        } catch {
          // No JSON body (e.g. the 204 from upload-proxy) — fine, that path doesn't need an etag.
        }
        resolve(etag);
      } else {
        reject(new Error(`Upload failed: HTTP ${xhr.status}`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during file upload'));
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));

    const onAbort = () => xhr.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    xhr.onloadend = () => signal?.removeEventListener('abort', onAbort);

    xhr.send(body);
  });
}
