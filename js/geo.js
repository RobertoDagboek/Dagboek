import { lang } from './i18n.js';

/** Current GPS position from the browser. Needs HTTPS (GitHub Pages is HTTPS). */
export function currentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('no geolocation'));
    navigator.geolocation.getCurrentPosition(
      pos => resolve({
        lat: Number(pos.coords.latitude.toFixed(6)),
        lng: Number(pos.coords.longitude.toFixed(6)),
        accuracy: Math.round(pos.coords.accuracy),
      }),
      err => reject(err),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    );
  });
}

/**
 * Coordinates -> readable place name.
 * BigDataCloud's client endpoint is free and needs no key or signup.
 * Falls back to plain coordinates if it is unreachable (e.g. offline).
 */
export async function placeName(lat, lng) {
  const url = 'https://api.bigdatacloud.net/data/reverse-geocode-client'
    + `?latitude=${lat}&longitude=${lng}&localityLanguage=${lang === 'af' ? 'af' : 'en'}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(String(res.status));
    const d = await res.json();
    const parts = [
      d.locality || d.city,
      d.principalSubdivision,
      d.countryName,
    ].filter(Boolean);
    const seen = new Set();
    const name = parts.filter(p => !seen.has(p) && seen.add(p)).join(', ');
    return name || coordText(lat, lng);
  } catch {
    return coordText(lat, lng);
  }
}

export function coordText(lat, lng) {
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

export function mapsLink(lat, lng) {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}
