// Turns a Thai address (house no., moo, tambon, amphoe, province) into map coordinates
// using OpenStreetMap Nominatim. Tries the most precise query first and falls back to
// tambon → amphoe → province, so the pin still lands in the right area when the
// house number is not mapped. Respects Nominatim's 1 request/second policy.

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const cache = new Map();
let lastRequestAt = 0;

const PREFIXES = {
  subdistrict: /^(ต\.|ตำบล|แขวง)\s*/,
  district: /^(อ\.|อำเภอ|เขต|กิ่งอำเภอ)\s*/,
  province: /^(จ\.|จังหวัด)\s*/,
  moo: /^(ม\.|หมู่ที่|หมู่)\s*/,
  houseNo: /^(บ้านเลขที่|เลขที่)\s*/
};

export const ADDRESS_FIELDS = [
  ['houseNo', 'address_house_no', 'บ้านเลขที่', 20],
  ['moo', 'address_moo', 'หมู่', 10],
  ['subdistrict', 'address_subdistrict', 'ตำบล / แขวง', 80],
  ['district', 'address_district', 'อำเภอ / เขต', 80],
  ['province', 'address_province', 'จังหวัด', 80]
];

export function cleanAddressPart(kind, value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return PREFIXES[kind] ? text.replace(PREFIXES[kind], '').trim() : text;
}

export function normalizeAddress(raw = {}) {
  const out = {};
  for (const [kind] of ADDRESS_FIELDS) out[kind] = cleanAddressPart(kind, raw[kind]);
  if (/^(กทม\.?|กรุงเทพ(ฯ|มหานคร)?)$/.test(out.province)) out.province = 'กรุงเทพมหานคร';
  return out;
}

export function formatThaiAddress(raw = {}) {
  const a = normalizeAddress(raw);
  const bkk = a.province === 'กรุงเทพมหานคร';
  return [
    a.houseNo && `เลขที่ ${a.houseNo}`,
    a.moo && `หมู่ ${a.moo}`,
    a.subdistrict && `${bkk ? 'แขวง' : 'ตำบล'}${a.subdistrict}`,
    a.district && `${bkk ? 'เขต' : 'อำเภอ'}${a.district}`,
    a.province && (bkk ? a.province : `จังหวัด${a.province}`)
  ].filter(Boolean).join(' ');
}

export function hasLocatableAddress(raw = {}) {
  const a = normalizeAddress(raw);
  return Boolean(a.province && (a.district || a.subdistrict));
}

function buildQueries(raw) {
  const a = normalizeAddress(raw);
  const bkk = a.province === 'กรุงเทพมหานคร';
  const T = a.subdistrict ? `${bkk ? 'แขวง' : 'ตำบล'}${a.subdistrict}` : '';
  const A = a.district ? `${bkk ? 'เขต' : 'อำเภอ'}${a.district}` : '';
  const P = a.province ? (bkk ? a.province : `จังหวัด${a.province}`) : '';
  const list = [
    ['house', [a.houseNo, a.moo && `หมู่ ${a.moo}`, T, A, P]],
    ['subdistrict', [T, A, P]],
    ['subdistrict', [a.subdistrict, a.district, a.province]],
    ['district', [A, P]],
    ['district', [a.district, a.province]],
    ['province', [P]]
  ];
  const seen = new Set();
  return list
    .map(([level, parts]) => ({ level, q: parts.filter(Boolean).join(' ') }))
    .filter(({ q, level }) => q && (level !== 'house' || a.houseNo || a.moo) && !seen.has(q) && seen.add(q));
}

async function politeFetch(url, signal) {
  const wait = Math.max(0, lastRequestAt + 1100 - Date.now());
  if (wait) await new Promise(resolve => setTimeout(resolve, wait));
  lastRequestAt = Date.now();
  const response = await fetch(url, { signal, headers: { 'Accept-Language': 'th' } });
  if (!response.ok) throw new Error(`geocode ${response.status}`);
  return response.json();
}

const ZOOM = { house: 17, subdistrict: 14, district: 12, province: 10 };

// Returns { lat, lng, level, zoom, label } or null when nothing matched.
export async function geocodeThaiAddress(raw, { signal } = {}) {
  for (const { level, q } of buildQueries(raw)) {
    if (signal?.aborted) return null;
    let results = cache.get(q);
    if (!results) {
      const params = new URLSearchParams({ format: 'jsonv2', countrycodes: 'th', limit: '1', 'accept-language': 'th', q });
      results = await politeFetch(`${ENDPOINT}?${params.toString()}`, signal);
      cache.set(q, results);
    }
    const hit = Array.isArray(results) ? results[0] : null;
    if (hit) {
      return { lat: Number(hit.lat), lng: Number(hit.lon), level, zoom: ZOOM[level], label: hit.display_name };
    }
  }
  return null;
}

// ---- Single free-text address ----------------------------------------------
// Pulls tambon / amphoe / province / moo / house no. out of one Thai address string,
// e.g. "99/1 หมู่ 4 ต.คลองหนึ่ง อ.คลองหลวง จ.ปทุมธานี 12120".
export function parseThaiAddress(text) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  const grab = re => (s.match(re)?.[1] || '').trim();
  const stop = '(?=\\s|$|,)';
  const out = {
    houseNo: grab(/(?:บ้านเลขที่|เลขที่)\s*(\d+(?:\/\d+)?)/) || grab(/^(\d+(?:\/\d+)?)(?=\s|$)/),
    moo: grab(/(?:หมู่ที่|หมู่|ม\.)\s*(\d+)/),
    subdistrict: grab(new RegExp(`(?:ตำบล|ต\\.|แขวง)\\s*([^\\s,]+?)${stop}`)),
    district: grab(new RegExp(`(?:อำเภอ|อ\\.|เขต)\\s*([^\\s,]+?)${stop}`)),
    province: grab(new RegExp(`(?:จังหวัด|จ\\.)\\s*([^\\s,]+?)${stop}`))
  };
  if (!out.province && /(กรุงเทพ|กทม)/.test(s)) out.province = 'กรุงเทพมหานคร';
  return normalizeAddress(out);
}

// Geocode a free-text address: structured attempt first (when the text names amphoe/province),
// then the raw text, then the text with its leading words removed one by one.
export async function geocodeFreeTextAddress(text, { signal } = {}) {
  const raw = String(text || '').replace(/\s+/g, ' ').trim();
  if (raw.length < 4) return null;
  const parsed = parseThaiAddress(raw);
  if (hasLocatableAddress(parsed)) {
    const hit = await geocodeThaiAddress(parsed, { signal });
    if (hit) return hit;
  }
  const words = raw.replace(/\b\d{5}\b/g, '').split(' ').filter(Boolean);
  for (let start = 0; start < words.length; start++) {
    if (signal?.aborted) return null;
    const q = words.slice(start).join(' ');
    if (q.length < 3) break;
    let results = cache.get(q);
    if (!results) {
      const params = new URLSearchParams({ format: 'jsonv2', countrycodes: 'th', limit: '1', 'accept-language': 'th', q });
      results = await politeFetch(`${ENDPOINT}?${params.toString()}`, signal);
      cache.set(q, results);
    }
    const hit = Array.isArray(results) ? results[0] : null;
    if (hit) {
      const level = start === 0 ? 'house' : start < words.length / 2 ? 'subdistrict' : 'district';
      return { lat: Number(hit.lat), lng: Number(hit.lon), level, zoom: ZOOM[level], label: hit.display_name };
    }
    if (start >= 4) break; // keep within Nominatim's fair-use limits
  }
  return null;
}
