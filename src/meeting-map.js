// Pickup / return pins and a route from the user's current position to the meeting point.
// Maps: OpenStreetMap tiles (same as the rest of the site).
// Routing: public OSRM servers run by FOSSGIS (routing.openstreetmap.de). If routing fails,
// the map falls back to a straight line and the "open in Google Maps" link still works.
import L from 'leaflet';

const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>';
const ROUTERS = {
  foot: 'https://routing.openstreetmap.de/routed-foot/route/v1/driving/',
  car: 'https://routing.openstreetmap.de/routed-car/route/v1/driving/'
};
export const DEFAULT_CENTER = [13.7563, 100.5018];

function pinIcon(kind) {
  const label = kind === 'return' ? 'คืน' : kind === 'me' ? 'ฉัน' : 'รับ';
  return L.divIcon({
    className: 'meeting-pin-wrap',
    html: `<span class="meeting-pin meeting-pin-${kind}"><b>${label}</b></span>`,
    iconSize: [44, 44],
    iconAnchor: [22, 40]
  });
}

function baseMap(element, center, zoom = 16) {
  const map = L.map(element, { scrollWheelZoom: true }).setView(center, zoom);
  L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION }).addTo(map);
  requestAnimationFrame(() => map.invalidateSize());
  setTimeout(() => map.invalidateSize(), 250);
  return map;
}

export function isPoint(point) {
  return Boolean(point) && Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng));
}

export function toPoint(lat, lng) {
  if (lat == null || lng == null) return null;
  const point = { lat: Number(lat), lng: Number(lng) };
  return isPoint(point) ? point : null;
}

export function googleMapsDirectionsUrl(destination, origin = null, mode = 'foot') {
  const params = new URLSearchParams({ api: '1', destination: `${destination.lat},${destination.lng}`, travelmode: mode === 'car' ? 'driving' : 'walking' });
  if (isPoint(origin)) params.set('origin', `${origin.lat},${origin.lng}`);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function distanceMeters(a, b) {
  const rad = deg => deg * Math.PI / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

export function formatDistance(meters) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} กม.` : `${Math.round(meters)} ม.`;
}

export function formatDuration(seconds) {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} นาที`;
  return `${Math.floor(minutes / 60)} ชม. ${minutes % 60} นาที`;
}

export function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('เบราว์เซอร์นี้ไม่รองรับการระบุตำแหน่ง'));
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      error => reject(new Error(error.code === 1
        ? 'ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง กรุณาอนุญาตตำแหน่งในเบราว์เซอร์'
        : 'ระบุตำแหน่งปัจจุบันไม่สำเร็จ ลองใหม่อีกครั้ง')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    );
  });
}

export async function fetchRoute(origin, destination, mode = 'foot') {
  const base = ROUTERS[mode] || ROUTERS.foot;
  const url = `${base}${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson&alternatives=false&steps=false`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`routing ${response.status}`);
    const data = await response.json();
    const route = data?.routes?.[0];
    if (!route?.geometry?.coordinates?.length) throw new Error('no route');
    return {
      coordinates: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
      distance: route.distance,
      duration: route.duration
    };
  } finally {
    clearTimeout(timer);
  }
}

// Map where the user pins the pickup point and (optionally) a different return point.
// Returns { getPoints, setActive, destroy }.
export function createMeetingPointPicker(element, { center, pickup = null, returnPoint = null, onChange = () => {} } = {}) {
  const start = isPoint(pickup) ? [pickup.lat, pickup.lng] : (isPoint(center) ? [center.lat, center.lng] : DEFAULT_CENTER);
  const map = baseMap(element, start, isPoint(pickup) || isPoint(center) ? 16 : 12);
  let active = 'pickup';
  const markers = { pickup: null, return: null };
  const points = { pickup: isPoint(pickup) ? pickup : null, return: isPoint(returnPoint) ? returnPoint : null };
  const place = (kind, latlng) => {
    const point = { lat: Number(latlng.lat.toFixed(6)), lng: Number(latlng.lng.toFixed(6)) };
    points[kind] = point;
    if (!markers[kind]) {
      markers[kind] = L.marker([point.lat, point.lng], { draggable: true, icon: pinIcon(kind) }).addTo(map);
      markers[kind].on('dragend', event => place(kind, event.target.getLatLng()));
    } else markers[kind].setLatLng([point.lat, point.lng]);
    onChange({ ...points });
  };
  if (points.pickup) place('pickup', points.pickup);
  if (points.return) place('return', points.return);
  map.on('click', event => place(active, event.latlng));
  return {
    map,
    getPoints: () => ({ pickup: points.pickup, return: points.return }),
    setActive: kind => { active = kind === 'return' ? 'return' : 'pickup'; },
    clear: kind => {
      markers[kind]?.remove();
      markers[kind] = null;
      points[kind] = null;
      onChange({ ...points });
    },
    async useMyLocation(kind = active) {
      const me = await getCurrentPosition();
      map.setView([me.lat, me.lng], 17);
      place(kind, me);
      return me;
    },
    destroy: () => map.remove()
  };
}

// Map that shows the destination and draws a route from the user's position.
export function createRouteMap(element, destination, kind = 'pickup') {
  const map = baseMap(element, [destination.lat, destination.lng], 16);
  L.marker([destination.lat, destination.lng], { icon: pinIcon(kind) }).addTo(map);
  let meMarker = null;
  let line = null;
  return {
    map,
    async showRoute(origin, mode = 'foot') {
      if (!meMarker) meMarker = L.marker([origin.lat, origin.lng], { icon: pinIcon('me') }).addTo(map);
      else meMarker.setLatLng([origin.lat, origin.lng]);
      line?.remove();
      let result;
      try {
        const route = await fetchRoute(origin, destination, mode);
        line = L.polyline(route.coordinates, { color: '#12a594', weight: 6, opacity: 0.85 }).addTo(map);
        result = { routed: true, distance: route.distance, duration: route.duration };
      } catch (error) {
        console.warn('คำนวณเส้นทางไม่สำเร็จ ใช้เส้นตรงแทน', error);
        line = L.polyline([[origin.lat, origin.lng], [destination.lat, destination.lng]], { color: '#12a594', weight: 4, dashArray: '8 8' }).addTo(map);
        result = { routed: false, distance: distanceMeters(origin, destination), duration: null };
      }
      map.fitBounds(line.getBounds(), { padding: [40, 40], maxZoom: 17 });
      return result;
    },
    destroy: () => map.remove()
  };
}
