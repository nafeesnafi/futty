// Fallback transport for online play when a direct WebRTC connection can't be made (mobile data,
// carrier-grade NAT, strict routers). Messages go through free public MQTT brokers over secure
// websockets (port 443-style TLS, allowed on almost every network). No account or server needed.
//
// This is a minimal MQTT 3.1.1 client (CONNECT, SUBSCRIBE, PUBLISH QoS 0, PING) - just enough to
// pass small JSON messages between two players. A RelayConn mimics a PeerJS DataConnection
// (open / send / close / on('data'|'open'|'close'|'error')) so net.js can use either transparently.
var FC = window.FC = window.FC || {};

(() => {
  // Public brokers, tried in order by the guest; the host listens on all of them.
  const DEFAULT_BROKERS = [
    'wss://broker.emqx.io:8084/mqtt',
    'wss://broker.hivemq.com:8884/mqtt',
    'wss://test.mosquitto.org:8081/mqtt',
  ];
  const enc = new TextEncoder(), dec = new TextDecoder();

  function brokers() {
    const q = new URLSearchParams(location.search).get('mqtt');   // e.g. ?mqtt=ws://localhost:8888 for testing
    return q ? q.split(',') : DEFAULT_BROKERS;
  }

  // ---------- MQTT packet helpers ----------
  function varint(n) { const out = []; do { let b = n % 128; n = Math.floor(n / 128); if (n > 0) b |= 128; out.push(b); } while (n > 0); return out; }
  function str(s) { const b = enc.encode(s); return [b.length >> 8, b.length & 255, ...b]; }
  function packet(type, flags, body) { return new Uint8Array([(type << 4) | flags, ...varint(body.length), ...body]); }

  // Connect to one broker. Resolves with a client once CONNACK arrives, rejects on error/timeout.
  function connect(url, onMessage, timeoutMs = 6000) {
    return new Promise((resolve, reject) => {
      let ws;
      try { ws = new WebSocket(url, ['mqtt']); } catch (e) { reject(e); return; }
      ws.binaryType = 'arraybuffer';
      let buf = new Uint8Array(0), ready = false, closed = false, pingT = null, pid = 1;
      const id = 'fsg' + Math.random().toString(36).slice(2, 12);
      const timer = setTimeout(() => { if (!ready) { try { ws.close(); } catch (_) {} reject(new Error('timeout')); } }, timeoutMs);
      const client = {
        url, onClose: null,
        get open() { return ready && !closed && ws.readyState === 1; },
        sub(topic) { if (this.open) ws.send(packet(8, 2, [pid >> 8, pid++ & 255, ...str(topic), 0])); },
        pub(topic, obj) {
          if (!this.open) return false;
          const payload = enc.encode(JSON.stringify(obj));
          ws.send(packet(3, 0, [...str(topic), ...payload]));
          return true;
        },
        close() { if (closed) return; closed = true; clearInterval(pingT); try { ws.send(packet(14, 0, [])); ws.close(); } catch (_) {} },
      };
      ws.onopen = () => {
        // CONNECT: protocol "MQTT", level 4, clean session, keep-alive 30 s
        ws.send(packet(1, 0, [...str('MQTT'), 4, 2, 0, 30, ...str(id)]));
      };
      ws.onmessage = ev => {
        const chunk = new Uint8Array(ev.data), merged = new Uint8Array(buf.length + chunk.length);
        merged.set(buf); merged.set(chunk, buf.length); buf = merged;
        // parse every complete packet in the buffer
        for (;;) {
          if (buf.length < 2) break;
          let len = 0, mul = 1, i = 1, b;
          do { if (i >= buf.length) return; b = buf[i++]; len += (b & 127) * mul; mul *= 128; } while (b & 128);
          if (buf.length < i + len) break;
          const type = buf[0] >> 4, body = buf.subarray(i, i + len);
          if (type === 2) {   // CONNACK
            clearTimeout(timer);
            if (body[1] !== 0) { reject(new Error('refused')); try { ws.close(); } catch (_) {} return; }
            ready = true;
            pingT = setInterval(() => { try { ws.send(packet(12, 0, [])); } catch (_) {} }, 20000);
            resolve(client);
          } else if (type === 3) {   // PUBLISH (QoS 0)
            const tl = (body[0] << 8) | body[1];
            const topic = dec.decode(body.subarray(2, 2 + tl));
            try { onMessage(topic, JSON.parse(dec.decode(body.subarray(2 + tl)))); } catch (_) {}
          }
          buf = buf.slice(i + len);
        }
      };
      ws.onerror = () => { if (!ready) { clearTimeout(timer); reject(new Error('socket')); } };
      ws.onclose = () => { clearInterval(pingT); const was = ready && !closed; closed = true; if (!ready) { clearTimeout(timer); reject(new Error('closed')); } else if (was && client.onClose) client.onClose(); };
    });
  }

  // A PeerJS-like connection over a broker: we publish to `outTopic`; incoming data is pushed in by the owner.
  function RelayConn(client, outTopic, wrap) {
    const handlers = {};
    const conn = {
      relay: true, open: true, client,
      on(evt, fn) { (handlers[evt] = handlers[evt] || []).push(fn); },
      emit(evt, arg) { for (const f of handlers[evt] || []) f(arg); },
      send(msg) { if (conn.open && !client.pub(outTopic, wrap(msg))) { conn.open = false; conn.emit('close'); } },
      close() { if (!conn.open) return; conn.open = false; conn.emit('close'); },
    };
    client.onClose = () => { if (conn.open) { conn.open = false; conn.emit('close'); } };
    return conn;
  }

  const topics = code => {
    const base = 'futtsepia/fc2/' + code;
    return { host: base + '/h', guest: gid => base + '/g/' + gid };
  };

  FC.Relay = { brokers, connect, RelayConn, topics };
})();
