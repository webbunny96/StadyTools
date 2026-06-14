/**
 * Отримання IP/гео з кількох джерел (fallback).
 * Для статичних сайтів на GitHub Pages — без CORS-проблем ipapi.co.
 */
const GEO_STORAGE_KEY = 'cybersec_geo';

function normalizeGeo(raw) {
    if (!raw || !raw.ip) return null;
    return {
        ip: raw.ip,
        country_name: raw.country_name || '—',
        city: raw.city || '—',
        region: raw.region || '—',
        postal: raw.postal || '—',
        latitude: raw.latitude ?? null,
        longitude: raw.longitude ?? null,
        org: raw.org || '—',
        asn: raw.asn || '—',
        source: raw.source || '—',
    };
}

function fromIpwho(data) {
    if (!data || !data.success) return null;
    return normalizeGeo({
        ip: data.ip,
        country_name: data.country,
        city: data.city,
        region: data.region,
        postal: data.postal,
        latitude: data.latitude,
        longitude: data.longitude,
        org: data.connection?.org,
        asn: data.connection?.asn ? 'AS' + data.connection.asn : '—',
        source: 'ipwho.is',
    });
}

function fromFreeIpApi(data) {
    if (!data || !data.ipAddress) return null;
    return normalizeGeo({
        ip: data.ipAddress,
        country_name: data.countryName,
        city: data.cityName,
        region: data.regionName,
        postal: data.zipCode,
        latitude: data.latitude,
        longitude: data.longitude,
        org: '—',
        asn: '—',
        source: 'freeipapi.com',
    });
}

function fromCloudflareTrace(text) {
    const map = {};
    text.trim().split('\n').forEach(line => {
        const i = line.indexOf('=');
        if (i > 0) map[line.slice(0, i)] = line.slice(i + 1);
    });
    if (!map.ip) return null;
    return normalizeGeo({
        ip: map.ip,
        country_name: map.loc || '—',
        city: '—',
        region: map.colo ? 'CDN colo: ' + map.colo : '—',
        postal: '—',
        latitude: null,
        longitude: null,
        org: '—',
        asn: '—',
        source: 'cloudflare.com/cdn-cgi/trace',
    });
}

function fromIpify(data) {
    if (!data || !data.ip) return null;
    return normalizeGeo({
        ip: data.ip,
        country_name: '—',
        city: '—',
        region: '—',
        postal: '—',
        latitude: null,
        longitude: null,
        org: '—',
        asn: '—',
        source: 'ipify.org',
    });
}

function fromGeoJs(data) {
    if (!data || !data.ip) return null;
    return normalizeGeo({
        ip: data.ip,
        country_name: data.country,
        city: data.city || '—',
        region: data.region || '—',
        postal: '—',
        latitude: data.latitude,
        longitude: data.longitude,
        org: data.organization || data.organization_name || '—',
        asn: data.asn ? 'AS' + data.asn : '—',
        source: 'geojs.io',
    });
}

async function tryFetch(url, options) {
    const res = await fetch(url, { cache: 'no-store', ...options });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res;
}

async function fetchGeoData() {
    const providers = [
        async () => {
            const res = await tryFetch('https://ipwho.is/');
            return fromIpwho(await res.json());
        },
        async () => {
            const res = await tryFetch('https://get.geojs.io/v1/ip/geo.json');
            return fromGeoJs(await res.json());
        },
        async () => {
            const res = await tryFetch('https://freeipapi.com/api/json');
            return fromFreeIpApi(await res.json());
        },
        async () => {
            const res = await tryFetch('https://www.cloudflare.com/cdn-cgi/trace');
            return fromCloudflareTrace(await res.text());
        },
        async () => {
            const res = await tryFetch('https://api64.ipify.org?format=json');
            return fromIpify(await res.json());
        },
    ];

    for (const provider of providers) {
        try {
            const data = await provider();
            if (data) return data;
        } catch (e) {
            console.log('Geo fallback:', e.message);
        }
    }
    return null;
}

function saveGeoData(data) {
    if (data) {
        try {
            sessionStorage.setItem(GEO_STORAGE_KEY, JSON.stringify(data));
        } catch (_) {}
    }
}

function loadGeoData() {
    try {
        const raw = sessionStorage.getItem(GEO_STORAGE_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

async function getGeoData({ useCache = true } = {}) {
    if (useCache) {
        const cached = loadGeoData();
        if (cached?.ip) return cached;
    }
    const data = await fetchGeoData();
    if (data) saveGeoData(data);
    return data;
}
