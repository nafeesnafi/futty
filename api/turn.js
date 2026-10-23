// Vercel serverless function: GET /api/turn -> { iceServers: [...] }
// Hands browsers short-lived TURN relay credentials so online play works across the internet,
// not just on the same Wi-Fi. Secrets stay on the server; set ONE provider in the Vercel project's
// Environment Variables (Settings -> Environment Variables), then redeploy:
//
//   Cloudflare Realtime TURN (free tier):  CLOUDFLARE_TURN_KEY_ID, CLOUDFLARE_TURN_API_TOKEN
//   Metered.ca (free tier):                METERED_TURN_DOMAIN (e.g. yourapp.metered.live), METERED_TURN_API_KEY
//   Any other TURN server:                 TURN_URLS (comma separated), TURN_USERNAME, TURN_CREDENTIAL
//
// With nothing set it answers 503 and the games fall back to public STUN and the PeerJS relays.
const TTL = 86400; // seconds the relay credentials stay valid

function asList(x) { return Array.isArray(x) ? x : x ? [x] : []; }

// browsers time out on TURN over port 53, so drop those URLs
function clean(servers) {
  return asList(servers).map(s => {
    const urls = asList(s.urls || s.url).filter(u => typeof u === 'string' && !/:53(\?|$)/.test(u));
    return urls.length ? { urls, username: s.username, credential: s.credential } : null;
  }).filter(Boolean);
}

async function cloudflare(env) {
  const r = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(env.CLOUDFLARE_TURN_KEY_ID)}/credentials/generate-ice-servers`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.CLOUDFLARE_TURN_API_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ttl: TTL })
  });
  if (!r.ok) throw new Error('cloudflare ' + r.status);
  return (await r.json()).iceServers;
}

async function metered(env) {
  const domain = env.METERED_TURN_DOMAIN.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const r = await fetch(`https://${domain}/api/v1/turn/credentials?apiKey=${encodeURIComponent(env.METERED_TURN_API_KEY)}`);
  if (!r.ok) throw new Error('metered ' + r.status);
  return r.json();
}

function staticServer(env) {
  return [{ urls: env.TURN_URLS.split(',').map(u => u.trim()).filter(Boolean), username: env.TURN_USERNAME || '', credential: env.TURN_CREDENTIAL || '' }];
}

async function iceServers(env) {
  if (env.CLOUDFLARE_TURN_KEY_ID && env.CLOUDFLARE_TURN_API_TOKEN) return clean(await cloudflare(env));
  if (env.METERED_TURN_DOMAIN && env.METERED_TURN_API_KEY) return clean(await metered(env));
  if (env.TURN_URLS) return clean(staticServer(env));
  return null;
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');
  try {
    const list = await iceServers(process.env);
    if (!list || !list.length) { res.statusCode = 503; res.end(JSON.stringify({ iceServers: [], error: 'No TURN provider configured' })); return; }
    res.statusCode = 200; res.end(JSON.stringify({ iceServers: list }));
  } catch (e) {
    res.statusCode = 502; res.end(JSON.stringify({ iceServers: [], error: 'TURN provider request failed' }));
  }
};
module.exports.iceServers = iceServers;
