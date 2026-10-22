# Futt Sepia Games 🎮

A small browser game platform with a sepia-toned dashboard. Open `index.html` in any modern browser.
There's nothing to install and no build step.

```
index.html               ← dashboard (game list + your records)
games/football/index.html  ← Futty Football
games/racing/index.html    ← Supercar Rush
games/parkour/index.html   ← Sky Runner (3D)
games/champions/index.html ← Futt Champions (3D, online)
games/vanguard/index.html  ← Vanguard Web (3D first-person shooter)
games/shared/lib/          ← three.js and PeerJS (vendored, MIT)
```

Records (football W/D/L, best racing distance per car, best parkour times) are saved in the browser's localStorage
and shown on the dashboard.

## ⚽ Futty Football

You (blue) vs the CPU (red) in a 90-second match. Score in the **right** goal.

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move | Arrow keys / WASD | Drag on the pitch |
| Kick | Space (hold for more power) | KICK button |
| Pause | P | — |

Difficulty: Easy, Normal or Hard.

## 🏎️ Supercar Rush

An endless highway racer: weave through traffic as long as you can and pick up ⚡ cans for nitro.

| Car | Strength |
| --- | --- |
| Ferrari | Fastest acceleration |
| Porsche | Sharpest handling |
| Bugatti | Highest top speed |

| Action | Keyboard | Touch |
| --- | --- | --- |
| Steer | ←/→ or A/D | Hold left/right half of the screen |
| Accelerate / brake | ↑ / ↓ | Auto-accelerates while touching |
| Nitro | Shift or Space | Two fingers |
| Pause | P | — |

## 🏃 Sky Runner (3D parkour)

A third-person 3D platformer built with [three.js](https://threejs.org) (r160, vendored in
`games/shared/lib/` under its MIT license, so it works offline). Reach the golden flag in each of
three levels as fast as you can:

1. **Warm Up**: gaps, steps and a narrow beam
2. **Moving Parts**: moving platforms and bounce pads
3. **Sky Tower**: a spiral climb with crumbling platforms

Green platforms are checkpoints. Fall into the clouds and you respawn at the last one.

| Action | Keyboard / mouse | Touch |
| --- | --- | --- |
| Move | WASD / Arrows | Left stick |
| Sprint | Shift | Push the stick all the way |
| Jump | Space | JUMP button |
| Look | Mouse (click to lock, Esc to release) | Drag the right side |
| Back to checkpoint | R | — |
| Pause | P | — |

## 🏆 Futt Champions (3D football, vs bot or online)

11-a-side 3D football with a broadcast camera. Pick any of the 36 clubs from the 2025/26 Champions
League league phase (simplified kits, no crests) and play the bot (Easy / Normal / Hard) or a friend online.

| Action | Keyboard | Gamepad | Touch |
| --- | --- | --- | --- |
| Move / sprint | WASD or arrows / Shift | Left stick / RB or RT | Stick / SPRINT |
| Pass (tackle when defending) | J or Z | A | PASS |
| Through ball | L or C | Y | THRU |
| Shoot, hold for power (slide tackle when defending) | K or X | B | SHOOT |
| Switch player | Q or Space | LB | SWITCH |
| Pause / mute | P or Esc / M | Start | ❚❚ |

**Online play.** *Play Online → Create invite* gives a 6-character code and an invite link; your
friend enters the code (or opens the link) to join. The host's browser runs the match and the guest
receives 20 updates per second. The two browsers connect directly over WebRTC, using the free public
[PeerJS](https://peerjs.com) server to find each other (no game server needed). If a guest leaves,
the bot takes over their team.

Online play needs the game served from a normal web address (for example GitHub Pages). Opening the
file directly works for vs-bot only in some browsers, and sandboxed previews block WebRTC.

For local testing you can point the game at your own PeerServer:
`index.html?peerhost=localhost&peerport=9000&peerpath=/myapp&peersecure=0`.

## 🎯 Vanguard Web (3D first-person deathmatch)

A first-person shooter against bots on **Compound**, a three-lane map: a warehouse on the left flank
(close quarters), a container courtyard in the middle, and a long alley with a sniper balcony on the right
(reached by a ladder or stairs). Play free-for-all or team deathmatch with 5 to 7 bots; the first to 30 kills
wins (10-minute limit). Every sound is generated in the browser with the Web Audio API.

| Action | Keyboard / mouse |
| --- | --- |
| Move / sprint | WASD / Shift |
| Crouch (slide while sprinting) | C (toggle) or hold Ctrl |
| Jump · climb ladders | Space · W at a ladder |
| Fire / aim down sights | Left / right mouse button |
| Reload | R |
| Weapons (M4A1, MP5, AX-50 sniper) | 1 2 3 or mouse wheel |
| UAV (3-kill streak) / airstrike (5-kill streak) | 4 / 5 |
| Hold breath while scoped | Shift |
| Scoreboard · FPS counter · pause | Tab · F · Esc |

Health regenerates after 4 seconds without damage. Headshots deal double damage (triple with the sniper),
and bullets go through wooden crates and railings. Enemies show on the radar for a moment when they fire.
Bots patrol, react to gunfire, strafe in fights and retreat to cover when they are hurt. Difficulty
(Recruit / Regular / Veteran) changes their reaction time, accuracy and damage.
Code: `games/vanguard/js/` (map, physics, nav, player, bots, weapons, fx, hud, audio, game).
