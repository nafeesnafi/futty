// ICE servers for online play (shared by every game that uses PeerJS).
// Players on the same Wi-Fi can connect directly, but across the internet most home and mobile networks
// (carrier-grade NAT, strict firewalls) need a TURN relay. The site's /api/turn function hands out
// short-lived relay credentials; if it isn't configured or can't be reached, this falls back to public
// STUN plus the PeerJS community relays, which only work for some networks.
(function () {
  const STUN = { urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] };
  const FALLBACK = [STUN,
    { urls: 'turn:eu-0.turn.peerjs.com:3478', username: 'peerjs', credential: 'peerjsp' },
    { urls: 'turn:us-0.turn.peerjs.com:3478', username: 'peerjs', credential: 'peerjsp' }];
  const MAX_AGE = 60 * 60 * 1000; // relay credentials last a day; refresh well before that
  const WAIT = 7000; // longest a Create/Join click waits for credentials
  let servers = null, fetchedAt = 0, pending = null;

  // test/debug overrides: ?peerice=none (host candidates only), ?turn=turn:host:port&turnuser=..&turnpass=..
  function override() {
    const q = new URLSearchParams(location.search);
    if (q.get('peerice') === 'none') return [];
    if (q.get('turn')) return [{ urls: q.get('turn').split(','), username: q.get('turnuser') || '', credential: q.get('turnpass') || '' }];
    return null;
  }

  function load() {
    if (location.protocol === 'file:' || !window.fetch) return Promise.resolve(null);
    const ctl = window.AbortController ? new AbortController() : null;
    const timer = setTimeout(() => ctl && ctl.abort(), 20000);
    return fetch('/api/turn', { cache: 'no-store', signal: ctl && ctl.signal })
      .then(r => (r.ok ? r.json() : null))
      .then(j => (j && Array.isArray(j.iceServers) && j.iceServers.length ? [STUN].concat(j.iceServers) : null))
      .catch(() => null)
      .finally(() => clearTimeout(timer));
  }

  const ICE = window.FSGIce = {
    relay: false, // true once real relay credentials came from /api/turn
    // resolves to the iceServers list; quick after the first call (prefetched on page load)
    get() {
      const o = override();
      if (o) return Promise.resolve(o);
      if (servers && Date.now() - fetchedAt < MAX_AGE) return Promise.resolve(servers);
      if (!pending) {
        pending = load().then(list => {
          ICE.relay = !!list; servers = list || FALLBACK; fetchedAt = list ? Date.now() : 0; pending = null;
          return servers;
        });
      }
      // don't keep a player waiting on a slow network: after a few seconds go with what we have
      // (the request keeps going and its answer is used next time)
      const p = pending;
      return Promise.race([p, new Promise(r => setTimeout(() => r(servers || FALLBACK), WAIT))]);
    },
    // PeerJS `config` for new Peer(id, { config })
    // ?peerrelay=1 forces every connection through the relay (to test that relaying works)
    config(list) {
      const c = { iceServers: list, sdpSemantics: 'unified-plan' };
      if (new URLSearchParams(location.search).get('peerrelay') === '1') c.iceTransportPolicy = 'relay';
      return c;
    }
  };
  ICE.get();
})();
