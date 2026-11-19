/**
 * Geo helpers: place search, reverse geocoding, device position, and pure
 * coordinate/label/maps-link utilities.
 *
 * Browser-safe — uses only `fetch` and `navigator` (guarded), no Node-only
 * imports and no peer dependencies. The pure helpers (`isValidGeoPoint`,
 * `buildPlaceShortName`, `buildMapsUrl`) also work server-side.
 *
 * Geocoding uses OpenStreetMap Nominatim directly from the browser. Pass
 * `endpoint` to route through a proxy instead without touching callers.
 * The map UI itself (Leaflet etc.) stays in each product.
 *
 * Generalized from sportik's `client/src/shared/lib/geo.ts` +
 * `shared/utils/geo.ts`, which were in turn ported from jalkhata's
 * location hooks.
 */

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export type GeoPoint = { lat: number; lng: number };

/** India centroid — a sensible default map center when nothing is pinned. */
export const DEFAULT_MAP_CENTER_INDIA: GeoPoint = { lat: 22.9734, lng: 78.6569 };

export function isValidGeoPoint(value: unknown): value is GeoPoint {
  if (!value || typeof value !== "object") return false;
  const { lat, lng } = value as Record<string, unknown>;
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/** Subset of Nominatim's `addressdetails=1` object that we read. */
export type NominatimAddress = {
  amenity?: string;
  leisure?: string;
  building?: string;
  road?: string;
  neighbourhood?: string;
  suburb?: string;
  village?: string;
  hamlet?: string;
  town?: string;
  city?: string;
  municipality?: string;
  county?: string;
  state_district?: string;
  state?: string;
  postcode?: string;
  country?: string;
};

/**
 * Compact, human-friendly label for a place — e.g. "Shivaji Park, Dadar,
 * Mumbai, Maharashtra" instead of Nominatim's full `display_name` with ward,
 * district, postcode and country. Falls back to `displayName` when no usable
 * parts exist.
 */
export function buildPlaceShortName(input: {
  name?: string | null;
  address?: NominatimAddress | null;
  displayName: string;
}): string {
  const a = input.address ?? {};
  const candidates = [
    input.name?.trim() || a.amenity || a.leisure || a.building || a.road,
    a.suburb || a.neighbourhood || a.village || a.hamlet,
    a.city || a.town || a.municipality || a.county || a.state_district,
    a.state,
  ];

  const parts: string[] = [];
  for (const raw of candidates) {
    const part = raw?.trim();
    if (!part) continue;
    if (parts.some((p) => p.toLowerCase() === part.toLowerCase())) continue;
    parts.push(part);
  }

  return parts.length > 0 ? parts.join(", ") : input.displayName.trim();
}

/**
 * Google Maps "search" URL — opens the Maps app on Android/iOS and the web
 * map elsewhere. Pass coordinates when known; an address string otherwise.
 */
export function buildMapsUrl(target: GeoPoint | string): string {
  const query =
    typeof target === "string"
      ? target.trim()
      : `${target.lat.toFixed(6)},${target.lng.toFixed(6)}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

// ---------------------------------------------------------------------------
// Geocoding (Nominatim)
// ---------------------------------------------------------------------------

export const NOMINATIM_ENDPOINT = "https://nominatim.openstreetmap.org";

export type PlaceResult = {
  point: GeoPoint;
  /** Full Nominatim label (long). */
  displayName: string;
  /** Compact label suitable for a venue/address field. */
  shortName: string;
};

type NominatimPlace = {
  lat: string;
  lon: string;
  display_name: string;
  name?: string;
  address?: NominatimAddress;
};

export type GeocodeOptions = {
  signal?: AbortSignal;
  /** `Accept-Language` for result labels. Defaults to "en". */
  language?: string;
  /** Nominatim-compatible base URL. Defaults to the public instance. */
  endpoint?: string;
};

export type SearchPlacesOptions = GeocodeOptions & {
  /** Max results. Defaults to 5. */
  limit?: number;
  /** ISO 3166-1 alpha-2 codes to restrict results to, e.g. ["in"]. */
  countryCodes?: string[];
};

function toPlaceResult(place: NominatimPlace): PlaceResult | null {
  const lat = Number.parseFloat(place.lat);
  const lng = Number.parseFloat(place.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    point: { lat, lng },
    displayName: place.display_name,
    shortName: buildPlaceShortName({
      name: place.name,
      address: place.address,
      displayName: place.display_name,
    }),
  };
}

/** Forward geocoding: free-text query → up to `limit` places. */
export async function searchPlaces(
  query: string,
  {
    signal,
    language = "en",
    endpoint = NOMINATIM_ENDPOINT,
    limit = 5,
    countryCodes,
  }: SearchPlacesOptions = {},
): Promise<PlaceResult[]> {
  const params = new URLSearchParams({
    q: query.trim(),
    format: "jsonv2",
    addressdetails: "1",
    limit: String(limit),
  });
  if (countryCodes?.length) params.set("countrycodes", countryCodes.join(","));

  const res = await fetch(`${endpoint}/search?${params.toString()}`, {
    signal,
    headers: { "Accept-Language": language },
  });
  if (!res.ok) throw new Error(`Place search failed (${res.status})`);
  const body = (await res.json()) as NominatimPlace[];
  return body
    .map(toPlaceResult)
    .filter((p): p is PlaceResult => p !== null);
}

/**
 * Reverse geocoding: coordinates → nearest place, or null when none.
 * The returned `point` is the one passed in (Nominatim snaps to the nearest
 * feature; callers usually want the exact pin kept).
 */
export async function reverseGeocode(
  point: GeoPoint,
  { signal, language = "en", endpoint = NOMINATIM_ENDPOINT }: GeocodeOptions = {},
): Promise<PlaceResult | null> {
  const params = new URLSearchParams({
    lat: String(point.lat),
    lon: String(point.lng),
    format: "jsonv2",
    addressdetails: "1",
  });
  const res = await fetch(`${endpoint}/reverse?${params.toString()}`, {
    signal,
    headers: { "Accept-Language": language },
  });
  if (!res.ok) throw new Error(`Reverse geocoding failed (${res.status})`);
  const body = (await res.json()) as NominatimPlace & { error?: string };
  if (body.error) return null;
  const place = toPlaceResult(body);
  return place ? { ...place, point } : null;
}

// ---------------------------------------------------------------------------
// Device position
// ---------------------------------------------------------------------------

export type GeoErrorCode = "unsupported" | "denied" | "unavailable" | "timeout";

export class GeoError extends Error {
  readonly code: GeoErrorCode;
  constructor(code: GeoErrorCode, message?: string) {
    super(message ?? code);
    this.name = "GeoError";
    this.code = code;
  }
}

/**
 * Device position via `navigator.geolocation`, rejecting with a typed
 * `GeoError`. On Capacitor Android this works through the WebView once
 * `ACCESS_COARSE_LOCATION`/`ACCESS_FINE_LOCATION` are in the manifest — no
 * geolocation plugin needed.
 */
export function getCurrentPosition({
  timeoutMs = 10_000,
  highAccuracy = true,
  maximumAgeMs = 60_000,
}: { timeoutMs?: number; highAccuracy?: boolean; maximumAgeMs?: number } = {}): Promise<GeoPoint> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new GeoError("unsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        const code: GeoErrorCode =
          err.code === err.PERMISSION_DENIED
            ? "denied"
            : err.code === err.TIMEOUT
              ? "timeout"
              : "unavailable";
        reject(new GeoError(code, err.message));
      },
      { enableHighAccuracy: highAccuracy, timeout: timeoutMs, maximumAge: maximumAgeMs },
    );
  });
}
