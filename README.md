# Blueprint Sketch

Sketch a floor plan, furnish it in 3D, and share it with a link.

Blueprint Sketch is a small, dependency-light toolkit for **prototyping remodeling and interior layouts quickly**. Draw rooms, drop in doors, windows and furniture, look around in 3D, and send the plan to someone else with exactly the permissions you choose. There is no build step: the editor is plain HTML and JavaScript.

**Try it:** https://blueprint-sketch.vercel.app

## What you can do

- **Draw like a blueprint.** Start from an empty grid and add walls, rooms, doors and windows. Dimensions, wall outlines and room labels are drawn for you.
- **Three modes so nothing moves by accident.**
  - *Navigate* only moves the camera.
  - *Build* selects, moves and draws.
  - *Sculpt* stretches walls, openings, floors and furniture with handles.
- **Furnish and style.** A library of furniture and accessories, five style presets, wall finishes per side (paint, microcement, brick, tile, wood slats) and floor finishes per room.
- **Type exact measurements.** Select anything and edit its numbers in the bar below: wall length and thickness, door and window size and position, room width and depth (the walls follow), furniture position, rotation and size.
- **Undo and redo** every change with `Ctrl/Cmd+Z` and `Ctrl/Cmd+Shift+Z`.
- **Turn things freely.** Rotate a piece with its handle, `Alt`/`Shift` + scroll, a trackpad twist (Safari) or `Shift` + arrow keys.
- **Export a drawing to scale.** PDF (vector, with title block) and DXF (millimetres, with layers) on A4, A3 or A2, at an automatic or chosen scale.
- **Quantities and budget.** Areas per room, net wall surface per finish, floors, doors, windows and furniture, with unit prices, contingency and a CSV for spreadsheets.
- **Keep several plans.** Plans are saved in your browser with a name and thumbnail; duplicate, rename, export to `.json` and import them back.
- **Share each plan on its own route.** A shared plan opens at `/p/<id>`. Links carry a role:

  | Role | Can do |
  |---|---|
  | Reader | Look around. Nothing else. |
  | Editor | Change the plan, with live updates and conflict warnings. |
  | Owner | Everything, plus create and revoke links and delete the plan. |

  Links can be named and revoked at any time. The access token lives in the URL fragment (`#k=…`), so it never reaches server logs, and the server only stores its hash.

> The interface is currently in Spanish. Strings are plain text in `src/editor-3d.html`, so translating is a find-and-replace away; proper i18n is on the roadmap.

## Controls

| Action | Mouse / trackpad | Keyboard |
|---|---|---|
| Orbit | Drag on empty space | `Q` / `E` or `←` / `→` (nothing selected) |
| Pan | `Shift` + drag, or right-drag | `W` `A` `S` `D` |
| Zoom | Scroll or pinch | `+` / `−` |
| Switch mode | Mode buttons | `1` Navigate, `2` Build, `3` Sculpt |
| Move a piece | Drag it | Arrow keys (one grid step) |
| Rotate a piece | Blue handle, `Alt`/`Shift` + scroll | `Shift` + `←` `→` (15°), `Shift` + `↑` `↓` (90°), `R` |
| Undo / redo | Buttons in the header | `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z` or `Ctrl+Y` |
| Leave a tool / deselect | | `Esc` |
| Delete | | `Delete` |

Hold `Shift` while using the navigation keys to move faster. Everything snaps to a 5 cm grid.

## Run it locally

```bash
git clone https://github.com/yotmanreyes/blueprint-sketch.git
cd blueprint-sketch
npx serve src            # or: python3 -m http.server -d src 8000
```

Open `editor-3d.html`. You can also open the file directly, but you need an internet connection because three.js is loaded from a CDN.

Everything works locally **except sharing**, which needs the API below.

## How it is organised

```
src/
  editor-3d.html   the editor: scene, panels and wiring
  engine.js        selectable objects, modes, tools, handles, rotation
  layout.js        the plan model: walls, openings, floors, corner joins
  history.js       undo and redo as snapshots
  drawing.js       a plan as 2D drawing primitives (walls, door swings, dimensions)
  export.js        PDF and DXF writers, sheet and scale selection
  quantities.js    bill of quantities and budget
  plan-store.js    saved plans in the browser, import and export
  sharing.js       share links, autosave, live updates, conflicts
  icons.js         line icons for the furniture library
api/               Vercel functions for shared plans (Vercel Blob)
test/              unit tests and API tests against an in-memory store
```

### The engine in a nutshell

Everything you can touch is an *entity* of a registered *kind*. Selection, dragging, keyboard nudging, handles and the action bar are shared, so a new kind only describes what is specific to it:

```js
engine.define('lamp', {
  get: id => state.lamps.find(l => l.id === id),     // the record behind an object
  object: id => findGroup('lamp', id),                // its 3D object
  label: () => 'Lamp',
  describe: l => `x ${l.x} · z ${l.z} m`,
  grab: (l, p) => ({ x: l.x - p.x, z: l.z - p.z }),   // remember where it was grabbed
  drag: (l, p, o) => { l.x = p.x + o.x; l.z = p.z + o.z; },
  live: l => moveObject(l),                           // cheap update while dragging
  rebuild: buildLamps,                                // full rebuild after an action
  keys: { Delete: 'del' },
  actions: () => [{ a: 'del', t: 'Delete' }],
  act: (l, a) => { if (a === 'del') { removeLamp(l); return { rebuild: true }; } }
});
// make a 3D object selectable:
engine.tag(group, 'lamp', lamp.id);
```

Optional hooks add sculpt handles (`handles`, `dragHandle`), free rotation (`pivot`, `rotator`, `rotateTo`, `rotateBy`) and pick priority. Drawing tools are small objects with `hover`, `down`, `move`, `up` and `end` passed to `engine.setTool`.

### The plan model

A plan is plain JSON, so it is easy to inspect, diff and generate:

```js
state.layout = {
  walls:    [{ id, x1, z1, x2, z2, t, faces: { lo, hi } }],   // axis-aligned, metres
  openings: [{ id, wall, pos, w, h, sill, kind }],            // 'door' | 'window'
  floors:   [{ id, x, z, w, d, f, name }]
};
```

Corners and T-junctions are resolved automatically, openings belong to a wall and cannot leave it, and finishes are stored per wall face.

## Sharing and deployment

Sharing is the only part that needs a server. It runs as Vercel functions in `api/`, storing each plan as one JSON file in a **private Vercel Blob store**.

1. Deploy the repository to Vercel (a static site plus the `api/` functions; no build command).
2. Create the store and connect it to the project: `vercel blob create-store <name> --access private`. This sets `BLOB_READ_WRITE_TOKEN`.
3. Connect the GitHub repository so every push to `main` deploys.

How it uses storage:

- A plan is a single document that also holds its links (as hashes), so one conditional write (`ifMatch` on the etag) keeps state and links consistent. Two people saving at once cannot both win.
- Reads skip the cache, so they always see the latest write.
- Blob's free tier allows 2,000 writes and 10,000 reads a month. The client therefore batches saves (one every 4 seconds at most), checks for other people's changes every 45 seconds and when the tab returns, and flushes pending edits when the page is hidden.

What an uploaded plan may contain is whitelisted and bounded server-side (`api/_lib/validate.js`), plan creation is rate limited per IP, and link tokens are random and stored only as hashes.

## Tests

```bash
npm install
npm test
```

The suite covers:

- the plan model (corner joins, openings that must stay in their wall, resizing a room with its walls),
- undo and redo,
- the drawing, the PDF structure (cross-reference table and content length) and the DXF (group pairs, millimetres, layers),
- the quantities against hand-calculated figures,
- the shared plans API against an in-memory store with the same contract as Blob (etags, conditional and create-only writes): permissions per role, simultaneous saves, rejection of malformed or hostile plans, version conflicts, revoked and cross-plan links, and rate limits.

GitHub Actions runs it on every push and pull request.

## What it is, and what it is not

Blueprint Sketch is for **schematic design**: quick layouts, conversations with clients and contractors, teaching and prototyping. It is not a BIM or CAD replacement. It has no structural or MEP calculation, no stairs or roofs, no multi-storey buildings, no model import and no photorealistic rendering, and its drawings are not construction documents.

## Roadmap

- Import 3D models (glTF) to furnish with real products.
- Several levels, stairs, and curved or diagonal walls.
- Real internationalisation.

## Contributing

Issues and pull requests are welcome. Keep the editor build-free (plain scripts, no bundler), follow [Conventional Commits](https://www.conventionalcommits.org/), and run `npm test` before opening a pull request.
