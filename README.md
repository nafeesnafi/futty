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
games/duel/index.html      ← Sepia Duel (2D fighting, online)
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
`games/shared/lib/` under its MIT license, so it works offline). Reach the golden flag in every
level as fast as you can:

1. **Warm Up**: gaps, steps and a narrow beam
2. **Moving Parts**: moving platforms and bounce pads
3. **Sky Tower**: a spiral climb with crumbling platforms
4. **Stepping Stones**: easy hops and gentle steps to get your legs going
5. **Lazy River**: slow drifting platforms. Wait for them to come to you
6. **Crumble Path**: brown platforms fall away shortly after you land. Keep moving
7. **Bounce House**: red pads launch you high. Steer while you fly
8. **Balance Beam**: long narrow beams. Walk, don't sprint, if you wobble
9. **Corner Turns**: the path snakes left and right. Swing the camera around each corner
10. **Lift Off**: blue platforms going up and down work like lifts. Ride them up
11. **Little Spiral**: a short climb around and around
12. **Mixed Bag**: a bit of everything you've learned so far
13. **Long Jumps**: wider gaps. Hold Shift (or push the stick all the way) to sprint before you jump
14. **Ferry Crossing**: platforms slide toward you and away. Jump when they are closest
15. **Gentle Descent**: down we go. Big drops are safe, just land on the platform
16. **Pogo**: chain bounce pads together. Each one sends you higher
17. **Tightrope**: even thinner beams, and some of them crumble
18. **Windmill**: pairs of platforms swing past each other. Time it right
19. **Twin Towers**: climb one tower, cross the bridge, climb the next
20. **Elevator Shaft**: lifts take you up between ledges. Mind the timing
21. **Zig Zag Canyon**: sharp angles left and right over a long drop
22. **Hopscotch**: small squares, quick rhythm. Short jumps, no sprinting needed
23. **Sky Highway**: a fast, straight run. Sprint the whole way for a great time
24. **Pendulum Run**: fast swinging platforms. Watch the rhythm before jumping
25. **The Gauntlet**: crumble, bounce, move, repeat. No time to rest
26. **Staircase to Heaven**: one long climb. Don't look back down
27. **Floating Islands**: big islands, big gaps. Sprint and leap between them
28. **Crumble Spiral**: a spiral where every other step gives way under you
29. **Conveyor**: platforms slide forward and back along the path. Ride them across the gaps
30. **Rooftops**: leap across rooftops of different heights
31. **Sunset Sprint**: narrow beams with long jumps in between. Fast and risky
32. **Bounce Maze**: pads go up, down and around the corner
33. **Storm Front**: a grey sky and restless platforms in every direction
34. **Mist Walk**: the fog rolls in. Small platforms, long beams, careful footing
35. **Grand Spiral**: a tall, tight spiral with small steps. Keep climbing
36. **Leap of Faith**: huge drops onto distant platforms. Commit to every jump
37. **Shuffle**: crossing movers, some fast and some slow. Pick your moment
38. **Needle Point**: tiny one-step pillars. Land softly, then go again
39. **Up and Over**: bounce up, run across, drop down. Repeat until the flag
40. **Twilight Run**: the sun is setting. A long course of everything mixed together
41. **Pillar Hop**: tall pillars at different heights. Every jump is up or down
42. **Rush Hour**: fast movers in both directions. Don't get left behind
43. **Crumbling Bridge**: a long bridge falling apart under your feet. Do not stop
44. **Moonrise**: night falls. Climb toward the moon on lifts and pads
45. **Star Steps**: small glowing steps in the dark sky
46. **Midnight Express**: a long fast course in the dark. Sprint on every gap
47. **Clockwork**: platforms moving on every axis at once. Learn the timing
48. **Sky Fortress**: climb the walls of a floating fortress, ledge by ledge
49. **Freefall**: bounce high, then drop a long way onto small targets
50. **Double Helix**: two tight spirals in opposite directions with crumbling steps
51. **Razor Edge**: paper-thin beams, long gaps and no room for mistakes
52. **Chaos Engine**: fast, small, moving, crumbling. Expert runners only
53. **Summit**: the final climb. Every trick you know, all the way to the top of the sky

Green platforms are checkpoints. Fall into the clouds and you respawn at the last one.

| Action | Keyboard / mouse | Touch |
| --- | --- | --- |
| Move | WASD / Arrows | Left stick |
| Sprint | Shift | Push the stick all the way |
| Jump | Space | JUMP button |
| Look | Mouse (click to lock, Esc to release) | Drag the right side |
| Back to checkpoint | R | — |
| Pause | P | — |

## 🏆 Futt Champions (3D football, vs bot, cup, shootout or online)

11-a-side 3D football with a broadcast camera. Pick any of the 36 clubs from the 2025/26 Champions
League league phase (simplified kits, no crests).

**Modes:** Play vs Bot (Easy / Normal / Hard) · **Champions Cup**, a 16-club knockout (Round of 16 to
Final, saved in the browser, other ties simulated from club ratings, draws go to penalties, trophy
celebration) · **Penalty Shootout**, five kicks each then sudden death, aiming your kicks and diving
as the keeper · **Online** with an invite code.

**On the pitch:** the ball has spin, so finesse shots curl and full-power strikes knuckle. Dribbling
uses touches (sprint touches are heavier and can be nicked). Players shield, jump for headers and hit
volleys. The game has offside, fouls, yellow and red cards, free kicks with a wall and penalties
(aim, curl and power for your own; dive in goal for theirs). Players have stamina, and there are
Defensive / Balanced / Attacking mentalities. Goal nets ripple, the camera zooms near goal, and goals
get a celebration orbit and a slow-motion replay.

| Action | Keyboard | Gamepad | Touch |
| --- | --- | --- | --- |
| Move / sprint | WASD or arrows / Shift (double-tap: knock-on) | Left stick / RB or RT | Stick / SPRINT |
| Pass (tackle when defending) | J or Z | A | PASS |
| Through ball | L or C | Y | THRU |
| Lob / cross | I or V | X | LOB |
| Shoot, hold for power, sideways to curl (slide tackle when defending) | K or X | B | SHOOT |
| Fake shot | Pass while charging Shoot | A while holding B | PASS while holding SHOOT |
| Switch player / hold: shield or call a team-mate to press | Q or Space | LB | SWITCH |
| Mentality (defensive / balanced / attacking) | 1 / 2 / 3 | D-pad | DEF/BAL/ATT button |
| Pause / mute | P or Esc / M | Start | ❚❚ |

Free kicks near goal and penalties: move the gold target, Switch cycles curl, hold Shoot for power.
Facing a penalty: hold left or right as the kick is taken to dive.

**Changing controls:** *Controls* (main menu or pause menu) lets you rebind every keyboard action
(main + spare key each) and every gamepad button, switch sprint between hold and tap-to-toggle, and
pick the touch button size and a left-handed layout (stick on the right). Settings are saved in the
browser; on-screen hints show your current keys.

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

**Campaign: Operation Ashes of Verdan** (content warning: military trauma, civilian casualties, moral distress).
A six-chapter story (about 30 minutes) about rules of engagement and what survivors carry. You play Staff
Sergeant Sean Miller, sent to hunt a "traitor" through a besieged city:

1. *Arrival*: Checkpoint Echo at dusk. A promise to Davis's mother, a boy at the wire, then the first attack.
2. *Rules of Engagement*: a pitch-black tenement in a thunderstorm (night vision on N, flashlight on L).
3. *The Boy Who Knew the Streets*: Mirko guides the squad through the old market's back alleys.
4. *Collateral Protocol*: a hospital square under sniper fire, with an offered mortar strike.
5. *Kaserna*: a village school at night, and the evidence of what happened there (E to examine).
6. *The Cost of Survival*: flooded tunnels under the dam, and a reckoning.

Each chapter ends in a timed decision: time slows, sound drops away under a heartbeat and tinnitus, and you have a
few seconds to press F, E (or Q) before the bar burns out. Doing nothing is also a choice. Choices feed a
Psyche & Guilt matrix (guilt, civilian casualties, squad trust, broken vows) that changes who is still alive,
what the squad says, how the world looks (colour drains away, hands shake when aiming at civilians, recoil gets
heavier, whispers of what happened bleed into the sound) and which of three endings you reach. Progress is
saved after each chapter. Code: `js/narrative.js` (decisions, subtitles), `js/trauma.js` (shell shock effects),
`js/campaign.js` (levels and story scripts).

**Online (1v1, 2v2, 4v4).** *Play Online → Create lobby* gives a 6-character code and an invite link.
Friends join with the code; everyone can switch teams, and the host picks the format and starts the match.
Empty slots are filled with bots, and a bot takes over if a player leaves. The host's browser runs the
match (bots, health, kills, respawns); each player moves their own soldier and reports their own hits, so
shooting feels instant. Kill goal: 15 (1v1), 20 (2v2), 30 (4v4). Like Futt Champions, it connects
browsers directly over WebRTC using the free PeerJS server, so it needs a normal web address, and the same
`?peerhost=…` parameters work for a self-hosted PeerServer.

**Voice chat.** In an online lobby, pick *Push to talk* (hold V, or the MIC button on phones), *Open mic*,
*Listen only* or *Off*. Everyone hears everyone in the lobby; in a match you only hear your own team. Each
pair of players talks over a direct WebRTC audio call, and the HUD shows who is talking. The browser asks
for microphone permission, and voice needs the game served over https.

**Custom controls.** On PC, *Controls* lets you rebind every action to any key or mouse button (saved in
the browser). On phones, *Touch layout* lets you drag every button where you want it, resize it and set
the button opacity.

**On phones and tablets** (play sideways): the left thumb is a floating move stick (push it to the
edge to sprint), drag the right side of the screen to look, and hold FIRE (drag it to aim while shooting).
There are buttons for AIM, JUMP, CROUCH (slide while sprinting), R (reload) and ⇄ (switch weapon), plus
STEADY while scoped and UAV / AIRSTRIKE when a streak is ready. Graphics default to Low on phones.

**Graphics.** The *Graphics* setting (Low / Medium / High) scales the renderer:
- **Post-processing (Medium and High):** filmic ACES tone mapping, ambient occlusion in the corners and under
  objects, bloom on muzzle flashes, tracers, sparks and lamps, a lens pass (vignette, slight chromatic aberration,
  film grain), and a soft blur at the screen edges while aiming down sights. High uses more AO samples and
  4x MSAA. Low draws straight to the screen with none of these passes.
- **Lighting and materials:** each level has a procedural sky used for reflections, exponential fog, and
  soft sun shadows. Surfaces have normal and roughness maps, so asphalt, concrete and corrugated metal catch
  the light. There are puddles, rubble, pallets, fences and trim on the walls.
- **Weapons:** metal reflects the sky, edges are bevelled, and the red-dot sight's reticle stays on target.
  Recoil is spring-driven, and the guns eject brass casings that bounce and tink on the floor.
- **Soldiers:** jointed legs with knees, a plate carrier with pouches and a radio, knee and elbow pads, and a
  helmet with night vision, headset, balaclava and goggles. Civilians in the campaign wear none of the gear.
- **Effects:** layered muzzle flashes with smoke, tapered tracer ribbons, metal sparks that bounce, concrete
  dust and debris chunks, and blood mist with splatter on nearby walls and floors. All effects are pooled,
  so firing creates no new objects.

Health regenerates after 4 seconds without damage. Headshots deal double damage (triple with the sniper),
and bullets go through wooden crates and railings. Enemies show on the radar for a moment when they fire.
Bots patrol, react to gunfire, strafe in fights and retreat to cover when they are hurt. Difficulty
(Recruit / Regular / Veteran) changes their reaction time, accuracy and damage.
Code: `games/vanguard/js/` (map, physics, nav, player, bots, weapons, fx, post, textures, hud, audio, game).

## 🥋 Sepia Duel (2D fighting, vs bot, 2 players or online)

A side-view one-on-one fighting game on a sunset dojo stage. Rook (rust gi) and Ash (slate gi) fight
best of three rounds (60 seconds each, first to two). Play the bot (Easy / Normal / Hard), a friend on the
same keyboard, or a friend online.

| Action | vs Bot / Online | 2P: Player 1 | 2P: Player 2 | Touch |
| --- | --- | --- | --- | --- |
| Move | A/D or ←/→ | A/D | ←/→ | ◀ ▶ |
| Jump / crouch | W/S or ↑/↓ | W/S | ↑/↓ | ▲ ▼ |
| Punch (crouching: low punch) | J or Z | F | , or Num1 | PUNCH |
| Kick (crouching: sweep, in the air: jump kick) | K or X | G | . or Num2 | KICK |
| Fireball (costs a third of the energy bar) | L or C | H | / or Num3 | ★ |
| Block | Hold away from your opponent | | | |
| Pause | P or Esc | | | |

Punches that connect chain into more punches or a kick. Sweeps knock down and must be blocked crouching;
jump kicks must be blocked standing. Crouching ducks under fireballs, and two fireballs cancel out. Landing
and taking hits fills your energy bar. Online play works like Futt Champions: *Play online → Create invite*
gives a 6-character code and a link, the host's browser runs the fight, and a bot takes over if your friend
leaves. Records (W/L vs the bot and online) are saved under `fsg.duel`.

## 🌐 Online play between different networks (relay setup)

Futt Champions, Vanguard Web and Sepia Duel connect players' browsers directly (WebRTC). That always works on
the same Wi-Fi, but between different networks it often doesn't: most mobile networks and many home routers
(carrier-grade NAT, strict firewalls) block direct connections. Then the game traffic has to go through a
**TURN relay server**. The free PeerJS relays the games used before are shared and often unreachable, which is
why online play could fail outside one Wi-Fi.

The site now has a small serverless function, `api/turn.js`, that gives each player short-lived relay
credentials (the secret key stays on the server). It needs a relay provider, set up once:

1. **Get a free TURN key from Cloudflare** (recommended; generous free tier). Sign in at
   [dash.cloudflare.com](https://dash.cloudflare.com), open **Realtime → TURN Server**, create a TURN key,
   and copy its **Turn Token ID** and **API Token**.
2. **Add them to Vercel.** In the Vercel project: **Settings → Environment Variables**, add
   `CLOUDFLARE_TURN_KEY_ID` and `CLOUDFLARE_TURN_API_TOKEN` (for Production, Preview and Development).
3. **Redeploy** (Deployments → ⋯ → Redeploy), so the function picks up the new variables.
4. **Check it.** Open `https://<your-site>/api/turn`: it should show `{"iceServers":[...]}`. A
   `"No TURN provider configured"` message means the variables aren't set on that deployment yet.

Other providers work too: Metered.ca (`METERED_TURN_DOMAIN`, `METERED_TURN_API_KEY`), or any TURN server
(`TURN_URLS` comma separated, `TURN_USERNAME`, `TURN_CREDENTIAL`). Without any of these the games still try
direct connections and the public PeerJS relays, as before. Players on the same network still connect
directly; the relay is only used when nothing else works.

Testing switches (add to a game's address): `?peerrelay=1` forces every connection through the relay, and
`?turn=turn:host:3478&turnuser=…&turnpass=…` uses a specific relay server. Invite links keep these settings.
Code: `games/shared/lib/ice.js` (browser side) and `api/turn.js` (server side).
