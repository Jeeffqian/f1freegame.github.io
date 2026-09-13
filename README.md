# F1 Free Game

A small browser-based Formula-style driving game built with Three.js. Drive the rigged car around the Taas circuit using a close third-person chase camera.

## Run locally

The project has no build step or package installation. It uses JavaScript modules and loads the circuit model at runtime, so it must be opened through HTTP rather than directly as a `file://` URL.

From the project directory, start a local server with Python:

```powershell
git clone https://github.com/Jeeffqian/f1freegame.github.io.git
cd f1freegame.github.io
py -m http.server 8000
```

If the `py` launcher is unavailable, use:

```powershell
python -m http.server 8000
```

Then open [http://localhost:8000](http://localhost:8000) in a modern browser. Keep the terminal open while playing and press `Ctrl+C` to stop the server.

Three.js is imported from jsDelivr, so an internet connection is required when the page loads.

## Controls

| Action | Keys |
| --- | --- |
| Accelerate | `W` or `Up Arrow` |
| Brake | `S` or `Down Arrow` |
| Steer left | `A` or `Left Arrow` |
| Steer right | `D` or `Right Arrow` |

## Project files

- `index.html` contains the page structure and Three.js import map.
- `style.css` defines the full-screen game and HUD styling.
- `game.js` loads the scene, controls the car rig, and updates the chase camera.
- `taas-circuit.glb` contains the circuit and rigged car model.
