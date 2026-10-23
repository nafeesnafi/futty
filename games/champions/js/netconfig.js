// Optional: extra TURN servers for online play. The game already uses free public STUN/TURN servers and
// falls back to a message relay, so this is only needed if you want your own TURN service. For example,
// a free Metered.ca account gives you credentials like these:
//
//   FC.NET_EXTRA_ICE = [
//     { urls: 'turn:global.relay.metered.ca:443?transport=tcp', username: 'YOUR_USERNAME', credential: 'YOUR_CREDENTIAL' },
//   ];
var FC = window.FC = window.FC || {};
FC.NET_EXTRA_ICE = FC.NET_EXTRA_ICE || [];
