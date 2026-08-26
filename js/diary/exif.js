// Minimal EXIF reader: pulls GPS coordinates and the original capture time
// out of a JPEG before we re-encode it (canvas re-encoding drops EXIF).
// Returns {} for PNG/HEIC/screenshots or photos with the data stripped.

const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

export async function readExif(file) {
  try {
    // The EXIF block sits near the start; 256KB is plenty and keeps this cheap.
    const buf = await file.slice(0, 262144).arrayBuffer();
    const view = new DataView(buf);
    if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return {}; // not a JPEG

    const tiff = findExifStart(view);
    if (tiff < 0) return {};

    const little = view.getUint16(tiff) === 0x4949;
    if (view.getUint16(tiff + 2, little) !== 0x002a) return {};

    const ifd0 = tiff + view.getUint32(tiff + 4, little);
    const root = readIFD(view, tiff, ifd0, little);

    const out = {};

    const exifPtr = root.get(0x8769);
    if (exifPtr != null) {
      const sub = readIFD(view, tiff, tiff + exifPtr, little);
      const dt = sub.get(0x9003) || sub.get(0x9004); // DateTimeOriginal / DateTimeDigitized
      if (typeof dt === 'string') out.takenAt = exifDateToISO(dt);
    }

    const gpsPtr = root.get(0x8825);
    if (gpsPtr != null) {
      const gps = readIFD(view, tiff, tiff + gpsPtr, little);
      const lat = dms(gps.get(0x0002), gps.get(0x0001));
      const lng = dms(gps.get(0x0004), gps.get(0x0003));
      if (lat != null && lng != null) { out.lat = lat; out.lng = lng; }
    }

    return out;
  } catch {
    return {};
  }
}

function findExifStart(view) {
  let p = 2;
  while (p + 4 < view.byteLength) {
    if (view.getUint8(p) !== 0xff) return -1;
    const marker = view.getUint8(p + 1);
    const len = view.getUint16(p + 2);
    if (marker === 0xe1) {
      // "Exif\0\0" then the TIFF header
      if (view.getUint32(p + 4) === 0x45786966) return p + 10;
    }
    if (marker === 0xda) return -1; // start of scan - no EXIF
    p += 2 + len;
  }
  return -1;
}

function readIFD(view, tiff, offset, little) {
  const map = new Map();
  if (offset + 2 > view.byteLength) return map;
  const count = view.getUint16(offset, little);
  for (let i = 0; i < count; i++) {
    const e = offset + 2 + i * 12;
    if (e + 12 > view.byteLength) break;
    const tag = view.getUint16(e, little);
    const type = view.getUint16(e + 2, little);
    const num = view.getUint32(e + 4, little);
    const size = (TYPE_SIZE[type] || 0) * num;
    if (!size) continue;
    const at = size <= 4 ? e + 8 : tiff + view.getUint32(e + 8, little);
    if (at + size > view.byteLength) continue;
    map.set(tag, readValue(view, at, type, num, little));
  }
  return map;
}

function readValue(view, at, type, num, little) {
  if (type === 2) {
    let s = '';
    for (let i = 0; i < num; i++) {
      const c = view.getUint8(at + i);
      if (!c) break;
      s += String.fromCharCode(c);
    }
    return s;
  }
  const vals = [];
  for (let i = 0; i < num; i++) {
    switch (type) {
      case 1: case 7: vals.push(view.getUint8(at + i)); break;
      case 3: vals.push(view.getUint16(at + i * 2, little)); break;
      case 4: vals.push(view.getUint32(at + i * 4, little)); break;
      case 9: vals.push(view.getInt32(at + i * 4, little)); break;
      case 5: case 10: {
        const o = at + i * 8;
        const n = type === 5 ? view.getUint32(o, little) : view.getInt32(o, little);
        const d = type === 5 ? view.getUint32(o + 4, little) : view.getInt32(o + 4, little);
        vals.push(d ? n / d : 0);
        break;
      }
      default: return null;
    }
  }
  return num === 1 ? vals[0] : vals;
}

function dms(parts, ref) {
  if (!Array.isArray(parts) || parts.length < 3) return null;
  const [d, m, s] = parts;
  let deg = d + m / 60 + s / 3600;
  if (ref === 'S' || ref === 'W') deg = -deg;
  return Number.isFinite(deg) ? Number(deg.toFixed(6)) : null;
}

function exifDateToISO(s) {
  // EXIF format: "2026:08:18 19:42:03"
  const m = s.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi, se] = m;
  return new Date(`${y}-${mo}-${d}T${h}:${mi}:${se}`).toISOString();
}
