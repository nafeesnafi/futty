# Futt Sepia Games 🎮

A small browser game platform with a sepia-toned dashboard. Open `index.html` in any modern browser.
There's nothing to install and no build step.

```
index.html               ← dashboard (game list + your records)
games/football/index.html  ← Futty Football
games/racing/index.html    ← Supercar Rush
games/parkour/index.html   ← Sky Runner (3D)
games/champions/index.html ← Futt Champions (3D, online)
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
