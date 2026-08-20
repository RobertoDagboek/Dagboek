// Short video clips.
//
// No transcoding in the browser - that is far too slow on a phone. Clips go up
// as they are, with a hard size check first, plus a poster frame grabbed from
// the first moment so the grid still looks like a grid.

export const PART_BYTES = 45 * 1024 * 1024;       // safely under Supabase's 50MB cap
export const MAX_VIDEO_BYTES = 600 * 1024 * 1024; // sanity ceiling; storage is the real limit
export const POSTER_EDGE = 640;

/**
 * A video over the per-file cap is stored as several objects and joined back
 * together when you play it. The bytes are untouched, so the rejoined file is
 * identical - this is NOT cutting the video into two playable clips, which
 * would need re-encoding.
 */
export function partPaths(basePath, count) {
  return Array.from({ length: count }, (_, i) => (i === 0 ? basePath : `${basePath}.p${i}`));
}

export function partCount(size) {
  return Math.max(1, Math.ceil(size / PART_BYTES));
}

export function sliceParts(file) {
  const parts = [];
  for (let start = 0; start < file.size; start += PART_BYTES) {
    parts.push(file.slice(start, Math.min(start + PART_BYTES, file.size)));
  }
  return parts.length ? parts : [file];
}

/**
 * Download every part and glue them back into one blob.
 * @param {string[]} urls    signed URLs, in order
 * @param {string} type      the original MIME type
 * @param {(done:number,total:number)=>void} [onProgress]
 */
export async function joinParts(urls, type, onProgress) {
  const buffers = [];
  for (let i = 0; i < urls.length; i++) {
    const res = await fetch(urls[i]);
    if (!res.ok) throw new Error(`part ${i + 1}/${urls.length}: HTTP ${res.status}`);
    buffers.push(await res.arrayBuffer());
    onProgress?.(i + 1, urls.length);
  }
  return new Blob(buffers, { type: type || 'video/mp4' });
}

export function isVideo(file) {
  return file.type.startsWith('video/');
}

export function humanSize(bytes) {
  if (!bytes) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb < 1) return `${Math.round(bytes / 1024)} KB`;
  return `${mb.toFixed(mb < 10 ? 1 : 0)} MB`;
}

/**
 * Pull a still and the duration out of a video file, without uploading it.
 * Resolves with poster: null when the browser cannot decode the format
 * (iPhone .mov in some browsers) - the clip still uploads fine, just plain.
 * @returns {Promise<{poster: Blob|null, width: number, height: number, duration: number}>}
 */
export function readVideo(file) {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file);
    const v = document.createElement('video');
    let settled = false;

    const done = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      v.removeAttribute('src');
      resolve(result);
    };

    // Some containers never fire seeked; do not hang the upload on it.
    const timer = setTimeout(() => done({ poster: null, width: 0, height: 0, duration: 0 }), 8000);

    v.preload = 'metadata';
    v.muted = true;
    v.playsInline = true;

    v.onloadedmetadata = () => {
      // A frame just after the start - frame zero is often black.
      const at = Math.min(0.5, (v.duration || 1) / 4);
      v.currentTime = Number.isFinite(at) ? at : 0;
    };

    v.onseeked = () => {
      try {
        const scale = Math.min(1, POSTER_EDGE / Math.max(v.videoWidth, v.videoHeight));
        const w = Math.max(1, Math.round(v.videoWidth * scale));
        const h = Math.max(1, Math.round(v.videoHeight * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(v, 0, 0, w, h);
        canvas.toBlob(
          poster => done({
            poster,
            width: v.videoWidth,
            height: v.videoHeight,
            duration: Number.isFinite(v.duration) ? v.duration : 0,
          }),
          'image/jpeg',
          0.8,
        );
      } catch {
        done({ poster: null, width: v.videoWidth, height: v.videoHeight, duration: v.duration || 0 });
      }
    };

    v.onerror = () => done({ poster: null, width: 0, height: 0, duration: 0 });

    v.src = url;
  });
}

export function clockTime(seconds) {
  const s = Math.round(seconds || 0);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
