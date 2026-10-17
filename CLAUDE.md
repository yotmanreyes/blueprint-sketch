# Blueprint Sketch

Herramienta para esbozar planos, amueblarlos en 3D y compartirlos con un enlace. Las notas del proyecto están en español; el código, los nombres y los commits van en inglés.

## Casa de ejemplo

`Layout.house()` es una plantilla de ejemplo (pestaña **Planos**, "Casa de ejemplo"): un dormitorio de 4×4 m, un pasillo de 1,2×4 m y un baño de 2,8×4 m, con muros de 2,4 m y sus puertas y ventana. Sirve para probar el editor y como muestra de cámaras fijas (`tag: 'house'`).

Sistema de coordenadas, en metros y vista desde arriba: `x` de izquierda a derecha, `z` del fondo hacia la entrada, `y` es la altura.

## Archivos

- `src/plano-2d.html` — plano en planta en SVG, a escala, con controles:
  - Ancho y largo del pasillo, posición de las puertas, altura del muro y cama.
  - Calcula áreas, metros lineales y m² del muro nuevo, superboard y enchape.
- `src/editor-3d.html` — editor 3D con three.js r128 por CDN (UMD, globales `THREE` y `THREE.OrbitControls`). Pestañas:
  - **Estilo:** 5 presets, metal y madera.
  - **Muebles:** biblioteca arrastrable con snap de 5 cm, girar, subir y bajar, duplicar y eliminar.
  - **Paredes:** acabado por cara (pintura, microcemento, ladrillo, enchape 60×120 o metro, listones).
  - **Pisos:** 6 porcelanatos, por zona.
  - **Ventana:** posición, ancho, alto y antepecho.

## Arquitectura del editor 3D

- `state` es la única fuente de verdad: `{style, metal, wood, walls, floor, win, items, n}`.
  - Se guarda en `localStorage` con la clave `plano-cuarto-bano-v1`.
  - "Copiar diseño" exporta el JSON.
- `buildStruct()` reconstruye piso, techo, muros, acabados, marcos, ventana y lámparas fijas. Se llama cuando cambia la ventana, una pared, el piso o el estilo.
- `buildItems()` reconstruye los muebles desde `state.items`.
- `LIB` define el catálogo con `w` (ancho, eje x local), `d` (fondo, eje z local) y `elev` opcional para piezas colgadas.
  - El respaldo del mueble va en `-z` local.
  - `rotation.y = r·π/2`: `r = 0` contra la pared del fondo, `1` izquierda, `2` entrada, `3` derecha.
- `WALLS` lista las caras pintables. Cada cara se arma con `run()` como paneles delgados (0.012) con vanos.
- Las texturas son procedurales (canvas) y no hay assets externos. Los colores se convierten de sRGB a lineal con `lin()`. Mantener esto: si no, todo se ve más claro.
- El render es a demanda: solo dibuja cuando `need = true`.

## Convenciones

- Medidas en metros. En la UI se muestran con coma decimal (`f2()`).
- No introducir build tooling sin pedirlo: los HTML son autocontenidos y se abren directo o con un servidor estático.
- El usuario prefiere modelos parametrizados y autoajustables sobre salidas estáticas, y respuestas directas que no reabran decisiones ya tomadas.
