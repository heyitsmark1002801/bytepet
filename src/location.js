// Where are you? Used only while your pet is on vacation, to send a postcard
// from the place you actually went.
//
// 1. Your internet connection's approximate location (city + country), from a
//    free lookup service. No account, no GPS. A VPN will fool it.
// 2. Fallback: your Mac's time zone (macOS updates it automatically when you travel,
//    if "Set time zone automatically using your current location" is on).

const fs = require('fs');

// Several free services; we take the first that answers, whatever its field names.
const SERVICES = ['https://ipwho.is/', 'https://ipapi.co/json/', 'https://freeipapi.com/api/json'];

function normalize(j) {
  if (!j || j.success === false || j.error) return null;
  const pick = (...keys) => {
    for (const k of keys) if (j[k] != null && j[k] !== '') return j[k];
    return null;
  };
  const code = pick('country_code', 'countryCode', 'country_code_iso2');
  const country = pick('country', 'country_name', 'countryName');
  if (!code && !country) return null;
  const tz = j.timezone && typeof j.timezone === 'object' ? j.timezone.id : pick('timezone', 'timeZone');
  return {
    city: pick('city', 'cityName') || null,
    region: pick('region', 'regionName') || null,
    country: typeof country === 'string' ? country : null,
    countryCode: typeof code === 'string' ? code.toUpperCase().slice(0, 2) : null,
    timezone: typeof tz === 'string' ? tz : null,
    source: 'internet',
  };
}

async function lookupInternet(fetchFn = fetch) {
  for (const url of SERVICES) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);
      const r = await fetchFn(url, { signal: ctrl.signal, headers: { 'User-Agent': 'Bytepet' } });
      clearTimeout(timer);
      if (!r.ok) continue;
      const loc = normalize(await r.json());
      if (loc) return loc;
    } catch { /* offline or blocked: try the next one */ }
  }
  return null;
}

// The Mac's current time zone, read live (Node only reads it once at start-up)
function systemTimezone() {
  try {
    const link = fs.readlinkSync('/etc/localtime');
    const m = link.match(/zoneinfo\/(.+)$/);
    if (m) return m[1];
  } catch { /* not a Mac, or no link */ }
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return null; }
}

// Time zone → country, for the most common zones
const TZ_COUNTRY = {
  'America/Vancouver': 'CA', 'America/Toronto': 'CA', 'America/Edmonton': 'CA', 'America/Winnipeg': 'CA', 'America/Halifax': 'CA', 'America/St_Johns': 'CA', 'America/Regina': 'CA', 'America/Montreal': 'CA',
  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US', 'America/Los_Angeles': 'US', 'America/Phoenix': 'US', 'America/Anchorage': 'US', 'Pacific/Honolulu': 'US', 'America/Detroit': 'US',
  'America/Mexico_City': 'MX', 'America/Cancun': 'MX', 'America/Tijuana': 'MX', 'America/Havana': 'CU', 'America/Bogota': 'CO', 'America/Lima': 'PE',
  'America/Sao_Paulo': 'BR', 'America/Argentina/Buenos_Aires': 'AR', 'America/Santiago': 'CL', 'America/Costa_Rica': 'CR', 'America/Panama': 'PA', 'America/Puerto_Rico': 'PR', 'America/Jamaica': 'JM',
  'Europe/London': 'GB', 'Europe/Dublin': 'IE', 'Europe/Paris': 'FR', 'Europe/Berlin': 'DE', 'Europe/Madrid': 'ES', 'Europe/Rome': 'IT', 'Europe/Amsterdam': 'NL', 'Europe/Brussels': 'BE',
  'Europe/Zurich': 'CH', 'Europe/Vienna': 'AT', 'Europe/Prague': 'CZ', 'Europe/Warsaw': 'PL', 'Europe/Budapest': 'HU', 'Europe/Lisbon': 'PT', 'Europe/Athens': 'GR', 'Europe/Istanbul': 'TR',
  'Europe/Stockholm': 'SE', 'Europe/Oslo': 'NO', 'Europe/Copenhagen': 'DK', 'Europe/Helsinki': 'FI', 'Atlantic/Reykjavik': 'IS', 'Europe/Moscow': 'RU', 'Europe/Kyiv': 'UA', 'Europe/Kiev': 'UA',
  'Europe/Bucharest': 'RO', 'Europe/Sofia': 'BG', 'Europe/Belgrade': 'RS', 'Europe/Zagreb': 'HR', 'Europe/Monaco': 'MC', 'Europe/Malta': 'MT',
  'Asia/Jerusalem': 'IL', 'Asia/Tel_Aviv': 'IL', 'Asia/Dubai': 'AE', 'Asia/Riyadh': 'SA', 'Asia/Qatar': 'QA', 'Asia/Amman': 'JO', 'Asia/Beirut': 'LB', 'Asia/Tehran': 'IR',
  'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN', 'Asia/Kathmandu': 'NP', 'Asia/Colombo': 'LK', 'Asia/Karachi': 'PK', 'Asia/Dhaka': 'BD',
  'Asia/Tokyo': 'JP', 'Asia/Seoul': 'KR', 'Asia/Shanghai': 'CN', 'Asia/Hong_Kong': 'HK', 'Asia/Taipei': 'TW', 'Asia/Singapore': 'SG', 'Asia/Bangkok': 'TH', 'Asia/Ho_Chi_Minh': 'VN',
  'Asia/Manila': 'PH', 'Asia/Jakarta': 'ID', 'Asia/Makassar': 'ID', 'Asia/Kuala_Lumpur': 'MY',
  'Australia/Sydney': 'AU', 'Australia/Melbourne': 'AU', 'Australia/Brisbane': 'AU', 'Australia/Perth': 'AU', 'Australia/Adelaide': 'AU', 'Pacific/Auckland': 'NZ', 'Pacific/Fiji': 'FJ',
  'Africa/Cairo': 'EG', 'Africa/Johannesburg': 'ZA', 'Africa/Nairobi': 'KE', 'Africa/Casablanca': 'MA', 'Africa/Lagos': 'NG', 'Africa/Accra': 'GH', 'Africa/Tunis': 'TN', 'Indian/Maldives': 'MV', 'Indian/Mauritius': 'MU',
};

function fromTimezone(tz = systemTimezone()) {
  if (!tz) return null;
  const parts = tz.split('/');
  const city = parts[parts.length - 1].replace(/_/g, ' ');
  return { city, region: null, country: null, countryCode: TZ_COUNTRY[tz] || null, timezone: tz, source: 'timezone' };
}

async function whereAmI({ internet = true } = {}) {
  const tzLoc = fromTimezone();
  const net = internet ? await lookupInternet() : null;
  if (net) return { ...net, timezone: net.timezone || (tzLoc && tzLoc.timezone) };
  return tzLoc;
}

// Is this somewhere other than home?
function isAway(home, loc) {
  if (!loc) return false;
  if (!home) return true;
  if (home.countryCode && loc.countryCode) {
    if (home.countryCode !== loc.countryCode) return true;
    return !!(home.city && loc.city && home.city !== loc.city && home.region !== loc.region);
  }
  return !!(home.timezone && loc.timezone && home.timezone !== loc.timezone);
}

const placeKey = (loc) => `${loc.countryCode || loc.timezone || ''}|${loc.city || ''}`;

module.exports = { whereAmI, lookupInternet, normalize, fromTimezone, systemTimezone, isAway, placeKey, TZ_COUNTRY };
