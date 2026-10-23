// Internet relay for online play when a direct WebRTC connection can't be made (different networks,
// mobile data / carrier-grade NAT, strict firewalls). Messages travel through free public MQTT brokers
// over secure WebSockets, which work from any network that can open web pages.
//
// FSRelay.listen(ns, code, onConnection) → host side; calls onConnection(conn) for each guest.
// FSRelay.dial(ns, code)                  → guest side; returns conn.
// conn mimics a PeerJS DataConnection: conn.on('open'|'data'|'close'|'error', fn), conn.send(obj),
// conn.close(), conn.open, plus conn.relay === true.
//
// Anyone who knows the invite code could read the game messages, so only game data goes through here.
// ?relay=wss://host:port/path (comma-separated) replaces the broker list, e.g. for a self-hosted broker.
(() => {
  const DEFAULT_BROKERS = ['wss://broker.emqx.io:8084/mqtt', 'wss://broker.hivemq.com:8884/mqtt', 'wss://test.mosquitto.org:8081/mqtt'];
  const q = new URLSearchParams(location.search);
  const BROKERS = q.get('relay') ? q.get('relay').split(',').filter(Boolean) : DEFAULT_BROKERS;
  const enc = new TextEncoder(), dec = new TextDecoder();
  const rid = n => { let s = ''; const a = 'abcdefghijkmnpqrstuvwxyz23456789'; for (let i = 0; i < n; i++) s += a[(Math.random() * a.length) | 0]; return s; };

  // ---------- a minimal MQTT 3.1.1 client (QoS 0) over WebSocket ----------
  function str(s) { const b = enc.encode(s); return [b.length >> 8, b.length & 255, ...b]; }
  function packet(type, body) {
    const len = []; let n = body.length;
    do { let d = n % 128; n = Math.floor(n / 128); if (n > 0) d |= 128; len.push(d); } while (n > 0);
    const out = new Uint8Array(1 + len.length + body.length);
    out[0] = type; out.set(len, 1); out.set(body, 1 + len.length);
    return out;
  }

  function mqtt(url, will, timeoutMs = 7000) {
    return new Promise((resolve, reject) => {
      let ws, done = false, buf = new Uint8Array(0), ping = null, pid = 1;
      const subs = new Map(), client = { url, closed: false, onclose: null };
      const finish = err => { if (done) return; done = true; clearTimeout(timer); if (err) { try { ws.close(); } catch (_) {} reject(err); } else resolve(client); };
      const timer = setTimeout(() => finish(new Error('timeout')), timeoutMs);
      try { ws = new WebSocket(url, 'mqtt'); } catch (e) { finish(e); return; }
      ws.binaryType = 'arraybuffer';
      ws.onopen = () => {
        const id = 'fsg-' + rid(12);
        let flags = 0x02, payload = [...str(id)];
        if (will) { flags |= 0x04; payload.push(...str(will.topic), ...str(will.message)); }
        ws.send(packet(0x10, [...str('MQTT'), 4, flags, 0, 30, ...payload]));
      };
      ws.onerror = () => finish(new Error('socket error'));
      ws.onclose = () => { clearInterval(ping); finish(new Error('closed')); if (!client.closed) { client.closed = true; client.onclose && client.onclose(); } };
      ws.onmessage = ev => {
        const chunk = new Uint8Array(ev.data), merged = new Uint8Array(buf.length + chunk.length);
        merged.set(buf); merged.set(chunk, buf.length); buf = merged;
        for (;;) {
          if (buf.length < 2) return;
          let len = 0, mul = 1, i = 1, b;
          do { if (i >= buf.length) return; b = buf[i++]; len += (b & 127) * mul; mul *= 128; } while (b & 128);
          if (buf.length < i + len) return;
          const type = buf[0] >> 4, body = buf.subarray(i, i + len);
          buf = buf.slice(i + len);
          if (type === 2) {                       // CONNACK
            if (body[1] !== 0) { finish(new Error('refused')); return; }
            ping = setInterval(() => { try { ws.send(new Uint8Array([0xc0, 0])); } catch (_) {} }, 20000);
            finish();
          } else if (type === 3) {                // PUBLISH (QoS 0)
            const tl = (body[0] << 8) | body[1];
            const topic = dec.decode(body.subarray(2, 2 + tl));
            const fn = subs.get(topic);
            if (fn) { try { fn(dec.decode(body.subarray(2 + tl))); } catch (e) { console.error(e); } }
          }
        }
      };
      client.sub = (topic, fn) => {
        subs.set(topic, fn);
        pid = (pid % 65535) + 1;
        ws.send(packet(0x82, [pid >> 8, pid & 255, ...str(topic), 0]));
      };
      client.pub = (topic, text) => {
        if (client.closed || ws.readyState !== 1) return;
        const t = str(topic), p = enc.encode(text), body = new Uint8Array(t.length + p.length);
        body.set(t); body.set(p, t.length);
        ws.send(packet(0x30, body));
      };
      client.close = () => {
        if (client.closed) return;
        client.closed = true; clearInterval(ping);
        try { ws.send(new Uint8Array([0xe0, 0])); ws.close(); } catch (_) {}
      };
    });
  }

  // ---------- connection objects ----------
  function makeConn(client, me, outTopic) {
    const handlers = {};
    const conn = {
      relay: true, open: false, peer: null,
      on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); return conn; },
      emit(ev, x) { for (const fn of handlers[ev] || []) { try { fn(x); } catch (e) { console.error(e); } } },
      send(data) { if (conn.open) client.pub(outTopic, JSON.stringify({ f: me, d: data })); },
      close() {
        if (conn.closedFlag) return;
        conn.closedFlag = true;
        if (conn.open) client.pub(outTopic, JSON.stringify({ f: me, c: 'bye' }));
        conn.open = false;
        if (conn.onCloseLocal) conn.onCloseLocal();
        setTimeout(() => conn.emit('close'), 0);
      },
      gone() { if (conn.closedFlag) return; conn.closedFlag = true; conn.open = false; if (conn.onCloseLocal) conn.onCloseLocal(); conn.emit('close'); },
    };
    return conn;
  }
  const parse = s => { try { const m = JSON.parse(s); return m && typeof m === 'object' && typeof m.f === 'string' ? m : null; } catch (_) { return null; } };

  // host: listen on every broker at once, so a guest can reach us through whichever one works for them.
  // Each guest's conn remembers its broker, so a broker dropping only ends the guests that used it.
  function listen(ns, code, onConnection) {
    const base = `fsg/${ns}/${code}`, hostId = 'host';
    const clients = [], conns = new Map();
    let closed = false, readyFired = false;
    const api = {
      ready: false, onready: null,
      close() {
        closed = true;
        for (const c of conns.values()) c.close();
        setTimeout(() => clients.forEach(c => c.close()), 200);
      },
    };
    for (const url of BROKERS) {
      mqtt(url, { topic: base + '/a', message: JSON.stringify({ f: hostId, c: 'bye' }) }).then(client => {
        if (closed) { client.close(); return; }
        clients.push(client);
        client.sub(base + '/h', text => {
          const m = parse(text); if (!m) return;
          let conn = conns.get(m.f);
          if (m.c === 'hello') {
            if (conn && !conn.closedFlag) { client.pub(`${base}/g/${m.f}`, JSON.stringify({ f: hostId, c: 'welcome' })); return; }
            conn = makeConn(client, hostId, `${base}/g/${m.f}`);
            conn.peer = m.f; conn.relayClient = client;
            conn.onCloseLocal = () => conns.delete(m.f);
            conns.set(m.f, conn);
            client.pub(`${base}/g/${m.f}`, JSON.stringify({ f: hostId, c: 'welcome' }));
            onConnection(conn);
            setTimeout(() => { if (!conn.closedFlag) { conn.open = true; conn.emit('open'); } }, 0);
          } else if (conn) {
            if (m.c === 'bye') conn.gone();
            else if ('d' in m && conn.open) conn.emit('data', m.d);
          }
        });
        client.onclose = () => {
          for (const c of [...conns.values()]) if (c.relayClient === client) c.gone();
        };
        if (!readyFired) { readyFired = true; api.ready = true; api.onready && api.onready(); }
      }, () => {});
    }
    return api;
  }

  // guest: try the brokers in order until one answers, then say hello until the host welcomes us
  function dial(ns, code, timeoutMs = 15000) {
    const base = `fsg/${ns}/${code}`, me = rid(10);
    let client = null, conn = null, stop = false;
    const handlers = {};
    // a placeholder that collects listeners until the real connection exists
    const proxy = {
      relay: true, open: false,
      on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); if (conn) conn.on(ev, fn); return proxy; },
      send(d) { if (conn) conn.send(d); },
      close() { stop = true; if (conn) conn.close(); setTimeout(() => client && client.close(), 200); },
    };
    const fail = msg => { if (stop) return; stop = true; if (client) client.close(); for (const fn of handlers.error || []) fn({ type: 'relay', message: msg }); };
    const deadline = setTimeout(() => fail('No answer from the host through the relay.'), timeoutMs);
    (async () => {
      for (const url of BROKERS) {
        if (stop) return;
        try { client = await mqtt(url, { topic: base + '/h', message: JSON.stringify({ f: me, c: 'bye' }) }); break; }
        catch (_) { client = null; }
      }
      if (stop) { if (client) client.close(); return; }
      if (!client) { clearTimeout(deadline); fail('Couldn\'t reach any relay server.'); return; }
      conn = makeConn(client, me, base + '/h');
      for (const ev in handlers) for (const fn of handlers[ev]) conn.on(ev, fn);
      Object.defineProperty(proxy, 'open', { get: () => conn.open });
      let hello = null;
      const onMsg = text => {
        const m = parse(text); if (!m || m.f !== 'host') return;
        if (m.c === 'welcome') {
          if (!conn.open && !conn.closedFlag && !stop) { clearTimeout(deadline); clearInterval(hello); conn.open = true; conn.emit('open'); }
        } else if (m.c === 'bye') { clearTimeout(deadline); conn.gone(); }
        else if ('d' in m && conn.open) conn.emit('data', m.d);
      };
      client.sub(`${base}/g/${me}`, onMsg);
      client.sub(base + '/a', onMsg);
      client.onclose = () => conn.gone();
      conn.onCloseLocal = () => { clearInterval(hello); setTimeout(() => client.close(), 200); };
      const sayHello = () => { if (!conn.open && !stop) client.pub(base + '/h', JSON.stringify({ f: me, c: 'hello' })); };
      setTimeout(sayHello, 150);
      hello = setInterval(sayHello, 1000);
    })();
    return proxy;
  }

  window.FSRelay = { listen, dial, brokers: BROKERS };
})();
