# Blueprint Sketch

Herramienta para esbozar planos, amueblarlos en 3D y compartirlos con un enlace. Las notas del proyecto están en español; el código, los nombres y los commits van en inglés.

## Casa de ejemplo

`Layout.house()` es una plantilla de ejemplo (pestaña **Planos**, "Casa de ejemplo"): un dormitorio de 4×4 m, un pasillo de 1,2×4 m y un baño de 2,8×4 m, con muros de 2,4 m y sus puertas y ventana. Sirve para probar el editor y como muestra de cámaras fijas (`tag: 'house'`).

Sistema de coordenadas, en metros y vista desde arriba: `x` de izquierda a derecha, `z` del fondo hacia la entrada, `y` es la altura.

## Archivos

- `src/layout.js`, `src/engine.js`, `src/icons.js`, `src/plan-store.js` — módulos compartidos del editor, sin build: se cargan con `<script>`.
- `src/editor-3d.html` — editor 3D con three.js r128 por CDN (UMD, globales `THREE` y `THREE.OrbitControls`). La interfaz es una cuadrícula como la de un editor profesional: barra superior con los modos (Navegar, Construir, Esculpir) bien visibles y deshacer/rehacer; barra izquierda con las herramientas (al elegir una, pasa solo a Construir); barra inferior con nivel, vista y ayuda; panel derecho con las pestañas (el botón *Panel* lo oculta); el menú *Perspectiva* de la barra inferior lista las vistas (ocho aéreas por punto cardinal, `iso:<punto>`, y una dentro de cada habitación, `room:<id>`; la casa de ejemplo añade las suyas); sobre el visor, el pad de cámara (mantener pulsado mueve o gira, usa las mismas teclas que el teclado) y la barra de selección con los grupos *Mover* y *Girar*. La escena tiene estructura de plano: cuadrícula de 0,5 m (líneas principales cada 1 m), contorno de muros y cotas, visibles en la vista de planta. Pestañas:
  - **Estilo:** 5 presets, metal y madera.
  - **Muebles:** biblioteca arrastrable con snap de 5 cm, girar, subir y bajar, duplicar y eliminar.
  - **Paredes:** acabado por cara (pintura, microcemento, ladrillo, enchape 60×120 o metro, listones).
  - **Pisos:** 6 porcelanatos, por piso (el nombre del piso también se edita ahí).
  - **Vanos:** lista de puertas y ventanas; el vano seleccionado se ajusta con sliders (ancho, alto, antepecho, posición en el muro).
  - **Planos:** varios diseños guardados con nombre y miniatura.

## Historial, medidas, exportación y cantidades

- **Deshacer y rehacer** (`src/history.js`): cada `save()` registra una foto del plan (hasta 100). Un arrastre o una edición es un paso. Restaurar vuelve a guardar, sin registrar. Los planos compartidos reinician el historial cuando llegan cambios de otras personas.
- **Medidas escritas:** cada kind puede definir `fields(rec)`; la barra de selección los muestra como campos numéricos. `clampIt(it, true)` conserva el valor tecleado sin ajustarlo a la rejilla. Cambiar el tamaño de un piso arrastra los muros de sus bordes (`Layout.resizeFloor`).
- **Exportación:** `Drawing.build(state, LIB)` produce primitivas en metros (capas WALLS, OPENINGS, FURNITURE, ROOMS, DIMENSIONS); `Export.pdf` y `Export.dxf` las escriben a mano, sin librerías. El PDF elige hoja y escala estándar; el DXF va en milímetros con el eje y invertido.
- **Cantidades** (`src/quantities.js`): áreas por habitación, superficie de muro neta de vanos, acabados por cara, pisos, vanos por tamaño y muebles por tipo. Los precios van en `state.prices` (claves como `wall`, `finish:pintura`, `floor:<clave>`, `door:0.9x2.1`, `item:<tipo>`, `contingency`) y la moneda en `state.currency`; el servidor los valida.
- Las pruebas (`npm test`) cubren todo esto además de la API.

## Modelos 3D importados

- `src/models.js`: solo `.glb` autocontenido (≤ 15 MB, ≤ 600.000 vértices). `Models.fit` convierte a metros (mayor de 350 → mm, mayor de 8 → cm), centra en x/z y apoya en y = 0; el frente del modelo mira a +z como en el resto de piezas. Los archivos viven en IndexedDB (`bs-models-v1`); el plano guarda solo `state.models[id] = {name, w, d, h}` y los muebles usan `t = id` (`m_` + hex).
- `syncCustomLib()` añade esos modelos a `LIB` con `custom: true`; hay que llamarla cada vez que `state` se reemplaza. Mientras carga, o si falta, una caja hace de sustituto (azul = cargando, naranja con alambre = no disponible).
- El escalado de una pieza es `sx`, `sy`, `sz`; `sy` solo existe para modelos importados.
- Seguridad: el cargador bloquea todo lo que no sea `data:` o `blob:` (`setURLModifier`), así un modelo no puede provocar peticiones externas. El servidor repite la comprobación (`checkGlb`): cabecera, longitud declarada, trozo JSON y ninguna referencia externa.
- En planos compartidos: `PUT/GET /api/plans/:id/models/:mid` (binario, ≤ 4 MB por el límite de 4,5 MB de las funciones, 40 archivos y 40 MB por plano). Se guarda primero el archivo y luego se registra en `plan.modelFiles`, así un modelo registrado siempre tiene archivo. Los editores suben lo que falta antes de guardar; los demás descargan lo que no tienen y lo guardan marcado con `source` para que no aparezca en su biblioteca. Se sirven `private, immutable` y `nosniff`.

## Planos compartidos

Un plano se puede subir a la nube desde la pestaña **Planos** (botón *Compartir*). Cada plano compartido tiene su propia ruta, `/p/<id>`, y el acceso se da con **enlaces por rol** en vez de cuentas:
- Un enlace es `/p/<id>#k=<token>`. El token va en el fragmento, así que no llega a los registros del servidor; el navegador lo guarda y limpia la dirección. Si un navegador tiene varios tokens del mismo plano, usa el de mayor rol.
- Roles: **propietario** (edita, crea y revoca enlaces, elimina), **editor** (edita) y **lector** (solo navega; el editor queda bloqueado con `engine.setLocked`).
- El servidor solo guarda el hash SHA-256 de cada token. Un token se muestra una vez, al crear el enlace.
- Guardado automático con control de versiones: si alguien más guardó antes, el editor ofrece cargar la versión nueva o conservar la propia. Los demás clientes consultan cambios cada 8 s.
- El estado que llega al servidor se reconstruye con una lista blanca (`api/_lib/validate.js`): ids, tipos, números y colores acotados; lo desconocido se descarta. Nunca renderizar texto de un plano compartido sin `esc()`.

Piezas: `src/sharing.js` (cliente y sesión), `api/` (funciones de Vercel) y `test/api.test.mjs` (`npm test`).

Almacenamiento: un almacén **Vercel Blob privado** (`blueprint-sketch-plans`); la variable `BLOB_READ_WRITE_TOKEN` la pone `vercel blob create-store`. Cada plano es un solo JSON `plans/<id>.json` que incluye sus enlaces (solo el hash de cada token), así una escritura condicional por etag (`ifMatch`) mantiene estado y enlaces consistentes. Las lecturas van con `useCache: false`. `api/_lib/storage.js` es el adaptador; las pruebas y el servidor local usan `test/memory-storage.mjs`, con el mismo contrato (etags, escritura condicional y solo-crear).

Cuota gratuita de Blob: 2.000 escrituras y 10.000 lecturas al mes (al pasarse se bloquea 30 días, no cobra). Por eso el cliente guarda como máximo cada 4 s, consulta cambios cada 45 s y al volver a la pestaña, y envía lo pendiente al ocultarla (`keepalive`). No bajar esos tiempos sin revisar la cuota. Cada petición autenticada cuesta una lectura; crear un plano o un enlace, una lectura y una escritura más para el límite por IP.

## Modos del editor

El editor **arranca en un plano vacío** (reutiliza el último plano sin tocar; si no hay, crea "Plano nuevo"). La casa de ejemplo está en la pestaña **Planos**, como plantilla.

| Modo | Atajo | Qué hace |
|---|---|---|
| Navegar | `1` | Solo cámara. Nada se selecciona ni se mueve. |
| Construir | `2` | Selecciona y arrastra muebles, muros y vanos. Herramientas: Seleccionar, Muro, Habitación, Puerta, Ventana. `Esc` sale de la herramienta. |
| Esculpir | `3` | Selecciona y estira con manijas naranjas: extremos de muro, bordes de vano, lados de piso y de mueble. El cuerpo no se arrastra. |

### Giro de piezas
Un mueble mira hacia `r` cuartos de vuelta más un ajuste libre `a` en grados (`itemAngle(it)`); `extents()` usa la caja rotada. Se gira con:
- El punto azul delante de la pieza: arrastrarlo la orienta hacia el puntero, en pasos de 15° (Alt para libre).
- `Alt` o `Shift` + rueda o scroll del trackpad (15° por paso). En Safari también el giro con dos dedos.
- `Shift` + ←/→ gira 15°; `Shift` + ↑/↓ gira 90°; `R` gira 90°; botones ↺ ↻ de la barra.
Mientras una pieza tiene ajuste libre, sus manijas de esculpido se ocultan.

### Navegar con el teclado
Las teclas mueven la cámara mientras se mantienen pulsadas (`Shift` acelera): `W/S` o ↑/↓ avanzan y retroceden, `A/D` desplazan, `Q/E` o ←/→ giran alrededor del punto de vista, `+`/`−` acercan y alejan. Las flechas solo navegan si no hay una pieza seleccionada en modo Construir (si la hay, la mueven). `Shift`+arrastrar desplaza con el mouse.

Los pisos no se mueven arrastrándolos (así se puede girar la cámara sobre ellos); se mueven con las flechas o se estiran con manijas.

## Niveles y escaleras

- `src/levels.js`: el nivel abierto vive en `state.layout` y `state.items` (todo el código de edición sigue igual); los demás están aparcados en `state.levels[i] = {id, name, layout, items}`. La entrada del nivel abierto solo lleva `id` y `name`. `state.level` es el índice abierto. `Levels.switchTo` intercambia; `Levels.ensure` normaliza planos viejos; `Levels.list/at` dan todos los niveles resueltos.
- Cada nivel mide `H = 2,4` m más `SLAB = 0,2` m de losa (`Levels.PITCH`). El nivel abierto siempre se dibuja en y = 0 y los demás se desplazan (`Levels.offset`), así la cámara, el engine y los planos de arrastre no cambian.
- Los niveles de abajo se dibujan siempre como contexto (`buildOthers`, sin selección ni luces; se reconstruyen solo si cambia su firma). Los de arriba solo con *Ver arriba*. En la vista de planta, `addGhost` marca los muros del nivel de abajo.
- Una escalera (`layout.stairs`: `{id,x,z,w,d,r}`, sube por +z local, `r` cuartos de vuelta) pertenece al nivel donde empieza y sube un `PITCH`. Abre el piso, la losa y el cielo del nivel de arriba (`Layout.subtractRects` con `Levels.arriving`). Quitar un nivel borra las escaleras que llegaban a él.
- Cambiar de nivel solo guarda en local (`persistView`); no registra historial ni toca la cuota de planos compartidos. `applyRemoteData` conserva el nivel que se está viendo.
- `Drawing.build(state, lib, level)` dibuja un nivel (capa `STAIRS`); las cantidades suman todos los niveles.

## Modelo de plano (`src/layout.js`)

Muros, vanos y pisos son datos en `state.layout`, en vez de geometría fija:
- `walls`: `{id, x1, z1, x2, z2, t, faces:{lo, hi}}`. Siempre ortogonales y normalizados (`x1 ≤ x2`, `z1 ≤ z2`). `lo` es la cara hacia −z (muro a lo largo de x) o −x (muro a lo largo de z); `hi`, la opuesta. El id de cara es la clave del acabado en `state.walls`; si falta, vale `state.wallBase`.
- `openings`: `{id, wall, pos, w, h, sill, kind: 'door'|'window'}`. `pos` se mide desde el inicio del muro. Un vano pertenece a un muro y no puede salirse de él ni cruzarse con otro.
- `floors`: `{id, x, z, w, d, f, name, zone}` (centro y tamaño). `zone` enlaza la biblioteca con el piso donde aparece un mueble nuevo.
- `lights`: lámparas colgantes fijas. `tag: 'house'` solo habilita las cámaras de la casa original.
- Las esquinas y las T se resuelven en `Layout.endInfo`: prolonga el muro en esquinas y recorta los acabados donde otro muro los tapa.
- Los planos guardados antes de este modelo traen `win` y `floor`; `normalizeState` los convierte a `layout`.

## Engine de entidades (`src/engine.js`)

Todo lo que se puede tocar en la escena es una entidad de un *kind* registrado con `engine.define(kind, def)`. La selección, el arrastre, las flechas del teclado, las manijas y la barra de acciones funcionan igual para todos.
- Un objeto 3D se vuelve seleccionable con `engine.tag(obj, kind, id)`. El raycast sube por los padres hasta encontrar la etiqueta. Un vano lleva una caja invisible para poder agarrarse por el hueco.
- `def` implementa: `get(id)`, `object(id)`, `label`, `describe`, `grab`, `drag`, `live`, `rebuild`, `keys`, `actions`, `act`. Opcionales: `plane` (por defecto el piso `y = 0`), `draggable: false`, `pivot`/`rotator`/`rotateTo`/`rotateBy` (giro libre), `priority` (gana entre golpes cercanos; el vano sobre su muro), `handles(rec)` y `dragHandle(rec, i, punto)` para esculpir.
- `act` devuelve `{rebuild?, select?}`; el engine reconstruye, emite `commit` (el editor guarda) y refresca la selección.
- Herramientas de dibujo: objetos `{hover, down, move, up, end}` que se activan con `engine.setTool(t)` en modo Construir. Al terminar llaman `engine.changed()`.
- Kinds actuales: `item`, `wall`, `opening`, `floor` y `stair`.

## Arquitectura del editor 3D

- `state` es la única fuente de verdad: `{style, metal, wood, walls, wallBase, defaults, layout, items, n}`. `walls` guarda los acabados por cara; `n` es el contador de ids.
  - Cada plano guardado es un `state` con nombre dentro de `PlanStore` (`src/plan-store.js`), en `localStorage` con la clave `blueprint-sketch-plans-v1`. Las claves anteriores (`plano-cuarto-bano-v2` y `-v1`) se migran solas y no se borran.
  - La pestaña **Planos** permite guardar copias, abrir, renombrar, duplicar, eliminar y exportar o importar archivos `.json`.
  - "Copiar diseño" copia el JSON del plano activo al portapapeles.
- `buildStruct()` reconstruye pisos, techos, muros con sus acabados, marcos, ventanas, cielo, lámparas, contornos y cotas desde `state.layout`. Se llama cuando cambia cualquier parte de la estructura o el estilo.
- `buildItems()` reconstruye los muebles desde `state.items`.
- `LIB` define el catálogo con `w` (ancho, eje x local), `d` (fondo, eje z local) y `elev` opcional para piezas colgadas.
  - El respaldo del mueble va en `-z` local.
  - `rotation.y = r·π/2`: `r = 0` contra la pared del fondo, `1` izquierda, `2` entrada, `3` derecha.
- Cada cara pintable se arma con `run()` como paneles delgados (0.012) con vanos. `WALLS` solo conserva los nombres de las caras de la casa original; las demás se nombran "Muro N · lado norte/sur/este/oeste".
- `clampIt()` mantiene los muebles dentro de los pisos (descontando el grosor de los muros de borde) y los imanta a las caras de los muros.
- Las texturas son procedurales (canvas) y no hay assets externos. Los colores se convierten de sRGB a lineal con `lin()`. Mantener esto: si no, todo se ve más claro.
- El render es a demanda: solo dibuja cuando `need = true`.

## Convenciones

- Medidas en metros. En la UI se muestran con coma decimal (`f2()`).
- No introducir build tooling sin pedirlo: los HTML son autocontenidos y se abren directo o con un servidor estático. El único `package.json` es para las funciones de `api/`; el editor sigue sin build y compartir solo funciona en el sitio publicado.
- El usuario prefiere modelos parametrizados y autoajustables sobre salidas estáticas, y respuestas directas que no reabran decisiones ya tomadas.
