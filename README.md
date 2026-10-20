# Futt Sepia Games 🎮

A small browser game platform with a sepia-toned dashboard. Open `index.html` in any modern browser.
There's nothing to install and no build step.

```
index.html               ← dashboard (game list + your records)
games/football/index.html  ← Futty Football
games/racing/index.html    ← Supercar Rush
games/parkour/index.html   ← Sky Runner (3D)
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
`games/parkour/lib/` under its MIT license, so it works offline). Reach the golden flag in each of
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
