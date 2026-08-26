import { lang } from './i18n.js';

/**
 * Best fix we can get in a few seconds.
 *
 * A single getCurrentPosition is a poor way to ask "where am I exactly": the
 * first answer usually comes from wifi or cell towers and can be a kilometre
 * out, then the GPS catches up a second or two later. So this watches for a
 * short while and keeps the most accurate reading, stopping early once it is
 * good enough.
 *
 * @param {object} opts
 * @param {number} opts.seconds     how long to keep improving (default 6)
 * @param {number} opts.goodEnough  stop early at this accuracy in metres (default 10)
 * @param {(fix:object)=>void} opts.onFix  called with each better reading
 */
export function bestPosition({ seconds = 6, goodEnough = 10, onFix } = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('no geolocation'));

    let best = null;
    let watchId = null;
    let timer = null;

    const done = () => {
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
      clearTimeout(timer);
      if (best) resolve(best); else reject(new Error('no fix'));
    };

    watchId = navigator.geolocation.watchPosition(
      pos => {
        const fix = {
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
          accuracy: Math.round(pos.coords.accuracy),
        };
        if (!best || fix.accuracy < best.accuracy) {
          best = fix;
          onFix?.(fix);
        }
        if (best.accuracy <= goodEnough) done();
      },
      err => { if (!best) { clearTimeout(timer); reject(err); } },
      {
        enableHighAccuracy: true,
        timeout: seconds * 1000 + 4000,
        // Never accept a cached fix. A minute-old position can be a different
        // town, which is exactly what "my exact location" must not return.
        maximumAge: 0,
      },
    );

    timer = setTimeout(done, seconds * 1000);
  });
}

/** One-shot fix, for when speed matters more than precision. */
export function currentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('no geolocation'));
    navigator.geolocation.getCurrentPosition(
      pos => resolve({
        lat: Number(pos.coords.latitude.toFixed(6)),
        lng: Number(pos.coords.longitude.toFixed(6)),
        accuracy: Math.round(pos.coords.accuracy),
      }),
      reject,
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  });
}

/**
 * Coordinates -> readable place name.
 * BigDataCloud's client endpoint is free and needs no key or signup.
 * Falls back to plain coordinates if it is unreachable.
 */
export async function placeName(lat, lng) {
  const url = 'https://api.bigdatacloud.net/data/reverse-geocode-client'
    + `?latitude=${lat}&longitude=${lng}&localityLanguage=${lang === 'af' ? 'af' : 'en'}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const d = await res.json();
    const parts = [d.locality || d.city, d.principalSubdivision, d.countryName].filter(Boolean);
    const seen = new Set();
    const name = parts.filter(p => !seen.has(p) && seen.add(p)).join(', ');
    return name || coordText(lat, lng);
  } catch {
    return coordText(lat, lng);
  }
}

/** Six decimals is about 10cm - more than the GPS itself can justify. */
export function coordText(lat, lng) {
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

/** Degrees, minutes, seconds - what a map or a hand-held GPS shows. */
export function coordDMS(lat, lng) {
  const one = (v, pos, neg) => {
    const hemi = v >= 0 ? pos : neg;
    const abs = Math.abs(v);
    const d = Math.floor(abs);
    const mFull = (abs - d) * 60;
    const m = Math.floor(mFull);
    const s = ((mFull - m) * 60).toFixed(1);
    return `${d}°${String(m).padStart(2, '0')}'${s}"${hemi}`;
  };
  return `${one(lat, 'N', 'S')} ${one(lng, 'E', 'W')}`;
}

export function accuracyText(metres) {
  if (metres == null) return '';
  return metres >= 1000 ? `±${(metres / 1000).toFixed(1)}km` : `±${metres}m`;
}

export function mapsLink(lat, lng) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}
