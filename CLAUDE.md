# Blueprint Sketch

Herramienta para esbozar planos, amueblarlos en 3D y compartirlos con un enlace. Las notas del proyecto están en español; el código, los nombres y los commits van en inglés.

## Casa de ejemplo

`Layout.house()` es una plantilla de ejemplo (pestaña **Planos**, "Casa de ejemplo"): un dormitorio de 4×4 m, un pasillo de 1,2×4 m y un baño de 2,8×4 m, con muros de 2,4 m y sus puertas y ventana. Sirve para probar el editor y como muestra de cámaras fijas (`tag: 'house'`).

Sistema de coordenadas, en metros y vista desde arriba: `x` de izquierda a derecha, `z` del fondo hacia la entrada, `y` es la altura.

## Archivos

- `src/layout.js`, `src/engine.js`, `src/icons.js`, `src/plan-store.js` — módulos compartidos del editor, sin build: se cargan con `<script>`.
- `src/editor-3d.html` — editor 3D con three.js r180 por CDN (módulos ES con import map). `three-bridge.js` los importa y deja `THREE` (con `OrbitControls` y `GLTFLoader`) como global; el script principal del editor está en `<script type="text/plain" id="app">` y `boot.js` lo ejecuta como script clásico cuando `THREE` existe (si no, avisa en la pantalla de carga). Se mantiene `ColorManagement.enabled=false` y la conversión manual `lin()`; las luces se multiplican por `LIGHT_SCALE` (π) para igualar la intensidad de antes. La interfaz es una cuadrícula como la de un editor profesional: barra superior con los modos (Navegar, Construir, Esculpir) bien visibles y deshacer/rehacer; barra izquierda con las herramientas (al elegir una, pasa solo a Construir); barra inferior con nivel, vista y ayuda; panel derecho cuyas pestañas van en una columna vertical de iconos a su borde (así el contenido empieza arriba; el botón *Panel* lo oculta); el menú *Perspectiva* de la barra inferior lista las vistas (ocho aéreas por punto cardinal, `iso:<punto>`, y una dentro de cada habitación, `room:<id>`; la casa de ejemplo añade las suyas); sobre el visor, el pad de cámara (mantener pulsado mueve o gira, usa las mismas teclas que el teclado) y la barra de selección con los grupos *Mover* y *Girar*. La escena tiene estructura de plano: cuadrícula de 0,5 m (líneas principales cada 1 m), contorno de muros y cotas, visibles en la vista de planta. Pestañas:
  - **Estilo:** 5 presets, metal y madera.
  - **Muebles:** biblioteca arrastrable con snap de 5 cm, girar, subir y bajar, duplicar y eliminar.
  - **Paredes:** acabado por cara (pintura, microcemento, ladrillo, enchape 60×120 o metro, listones).
  - **Pisos:** 6 porcelanatos, por piso (el nombre del piso también se edita ahí).
  - **Vanos:** lista de puertas y ventanas; el vano seleccionado se ajusta con sliders (ancho, alto, antepecho, posición en el muro).
  - **Planos:** varios diseños guardados con nombre y miniatura.
  - **Versiones:** historial del plano abierto (ver *Versiones*).

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

## Versiones

- `src/versions.js` (`Versions.create(storage)`): cada plano tiene versiones guardadas (`named`, hasta 30, con nombre) y puntos automáticos (`auto`, los 12 más recientes), en `localStorage` bajo `blueprint-sketch-versions-v1`, por clave de plano (id local, o `r:<id>` en un plano compartido). Cada versión es una foto completa del plano. Si el almacenamiento se llena se descartan primero los automáticos.
- Cada versión lleva su `hash` (SHA-256 del plano, calculado a mano en `Versions.sha256`) y `at` (cuándo se capturó); la lista muestra fecha con segundos y `#` más los 8 primeros del hash. Dos puntos iguales se detectan por hash.
- La barra superior muestra la versión actual (`#hash` y hora de la última modificación) en un chip; su menú guarda una versión, abre el historial, comparte, exporta (.json, PDF, DXF) y alterna la pantalla completa. Cada punto o versión nueva muestra un aviso (`#snack`) con su etiqueta, hash y hora, y el chip parpadea.
- Puntos automáticos: `checkpointIfDue` guarda el plano **tal como estaba antes** de la edición, como máximo uno cada 10 min; además antes de cada mensaje del asistente, antes de restaurar y antes de cargar cambios de otras personas. Un punto idéntico al más reciente no se repite.
- `Versions.diff(a, b)` cuenta altas, bajas y cambios por tipo de elemento (emparejados por id y nivel) y si cambiaron acabados o ajustes; la lista muestra *Al restaurar: …* respecto al plano actual.
- Restaurar guarda antes el estado actual y registra un paso de deshacer. *Copia* abre la versión como plano nuevo. El archivo exportado lleva `versions`; al importar solo se aceptan fotos válidas. Las versiones de un plano compartido son de cada navegador, no se suben al servidor (no gastan cuota de Blob).

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
- Los niveles de abajo se dibujan siempre como contexto (`buildOthers`, sin selección ni luces; se reconstruyen solo si cambia su firma). Los de arriba se ven en toda vista menos la de planta (`upperShown`: automático hasta que alguien pulsa *Ver arriba*, que fija sí o no). En la vista de planta, `addGhost` marca los muros del nivel de abajo.
- Una escalera (`layout.stairs`: `{id,x,z,w,d,r}`, sube por +z local, `r` cuartos de vuelta) pertenece al nivel donde empieza y sube un `PITCH`. Abre el piso, la losa y el cielo del nivel de arriba (`Layout.subtractRects` con `Levels.arriving`). Quitar un nivel borra las escaleras que llegaban a él.
- Cambiar de nivel solo guarda en local (`persistView`); no registra historial ni toca la cuota de planos compartidos. `applyRemoteData` conserva el nivel que se está viendo.
- `Drawing.build(state, lib, level)` dibuja un nivel (capa `STAIRS`); las cantidades suman todos los niveles.

## Plantillas

- `src/templates.js`: `Templates.CATALOG` (clave, nombre, categoría, descripción) y `Templates.create(key, {blank, example, lib})`, que dibuja el plano con las mismas llamadas que haría una persona (`wall`, `floor`, `door`, `window`, `stair`, `item`, `level`). `against(pieza, lado, muro, a lo largo)` apoya una pieza contra la cara interior de un muro; `mirrored(x, …)` dibuja el mismo bloque reflejado (apartamentos gemelos). `previewSvg` dibuja la miniatura de la galería.
- Los pisos de una plantilla no se solapan (si no, parpadean) y las piezas no se pisan; `test/templates.test.mjs` lo comprueba y valida cada plano con el validador del servidor. Las medidas de `LIB` se leen del editor.
- El modal (`#templates`) se abre al empezar un plano nuevo sin tocar (una vez por plano, guardado en `localStorage`), con *Plantillas* de la barra superior, *Nuevo plano…* de la pestaña Planos y *Ver plantillas* del plano vacío. Sobre un plano sin tocar reemplaza su contenido; si no, crea otro plano.
- Pisos de exterior (`open: true`: césped, adoquín, arena, agua, pavimento) no llevan cielo.

## Tamaños estándar

- `STD` (en el editor, junto a `LIB`) lista por tipo de pieza los tamaños habituales `[nombre, ancho, fondo]` y los rangos `w`/`d` dentro de los que se puede escribir o arrastrar. `STD_OF` agrupa tipos (las tres camas, los tres clósets). Las piezas que no están (sanitario, silla, auto, farola, caminadora…) no se redimensionan; los modelos importados siguen libres hasta 10 m. `uniform` escala también la altura (árboles, plantas, fuente).
- El menú *Tamaño* de la barra de selección aplica `applySize`; los campos y las manijas se acotan con `sizeRange`. Un tamaño fuera de la lista se muestra como *Personalizado*. El servidor acepta escalas entre 0,02 y 50.
- `test/sizes.test.mjs` comprueba que cada tamaño cabe en su rango y que el tamaño con que se dibuja cada pieza está en su lista.

## Aspecto boceto

- Tercer aspecto de la barra inferior (`sketch`, junto a *Plano* y *Fotorrealista*, mismo `setLook` y misma preferencia en `localStorage`): fondo y muros blancos, luz pareja y contornos negros. `edgeMat` pasa a negro opaco para los muros y `addInk` dibuja las aristas de cada pieza (solo mallas opacas, sin esferas ni vidrio). Cambiar de aspecto reconstruye muebles y niveles de fondo (`buildItems`, `buildOthers(true)`). No usa cielo ni niebla.
- Acabados pensados para ese aspecto: pisos *Roble oscuro* y *Concreto pulido*, pared *Concreto visto* (`t: 'concreto'`, admite color) y **cielo por piso**: `floor.c` = `madera` (listones) o `concreto`; sin `c` el cielo es liso (`Catalog.CEILINGS`, `ceilMat`). Lo valida el servidor y lo cambia el agente con `set_floor_ceiling`. La pieza `persona` es una silueta de pie para dar escala.

## Idiomas

- `src/i18n.js` (`I18n`): el español es el idioma fuente y el texto escrito en el código es la clave de búsqueda; `src/lang-en.js` (`I18n.add('en', {...})`) lo traduce. Lo que falta en un diccionario se queda en español. Las claves pueden llevar `{nombre}`; los marcadores `n`, `max` y `kb` solo aceptan números, el resto acepta cualquier texto. Entre varios patrones gana el que tiene más texto fijo, y un texto con « · » se traduce por trozos.
- El texto visible se traduce en el DOM (nodos de texto y los atributos `title`, `placeholder`, `aria-label`, `alt`) al cargar y con un `MutationObserver`, así que el código de render no cambia. `I18n.t()`/`translate()` solo hacen falta donde el texto no llega al DOM: rótulos del lienzo (`labelMesh`), PDF/DXF, CSV, título de la ventana del asistente y las instrucciones al modelo (`I18n.languageName`).
- El idioma sale de `?lang=`, de `localStorage` (`bs-lang`) o del navegador (español si es español; si no, inglés). Cambiarlo desde el menú de la versión recarga la página. `I18n.decimal` y `I18n.locale` dan el separador decimal, las fechas y la moneda; en español no se hace nada.
- Los nombres que el usuario escribe y coinciden con una cadena conocida (por ejemplo un plano llamado «Cocina») se muestran traducidos, pero no se cambian en el plano.
- Una pieza, acabado, estilo, plantilla o nombre de habitación nuevos necesitan su entrada en `lang-en.js`: `test/i18n.test.mjs` lo comprueba. Para añadir un idioma: `lang-xx.js`, su entrada en `I18n.NAMES` y su `<script>` en `editor-3d.html` y `assistant.html`. Las colisiones de palabras iguales con sentidos distintos se resuelven cambiando el texto de origen (por eso la pieza se llama «Planta decorativa»).

## Móvil

- `<meta name="viewport">` con `viewport-fit=cover`. Hasta 900 px el panel y las herramientas pasan a filas; hasta 640 px (teléfono) el visor ocupa toda la pantalla: las herramientas flotan como una fila sobre el visor, el panel arranca cerrado y se abre como hoja inferior (botón ☰, 48 vh), el pad de cámara se muestra con *Cámara* de la barra inferior, el menú de versión ocupa el ancho y la barra de selección esconde los campos numéricos tras *Medidas*.
- Las reglas de teléfono van **al final** de la hoja de estilos (`@media (max-width:640px)`): si se mueven antes, pierden contra las reglas base de mismo peso. Los campos de texto usan 16 px para que iOS no haga zoom.
- Se prueba en un iframe de 390 px (la ventana del navegador no baja de ese ancho).

## Aspecto fotorrealista

- Relieve (`reliefOf`, `relieve`, tabla `RELIEF`): de cada textura de color se deriva un mapa de alturas (brillo, o saturación en el ladrillo), con umbrales `lo`/`hi` por material, y de él un mapa de normales y, si hay `rs`, uno de rugosidad (juntas más rugosas que la superficie). Se aplica en acabados de pared, pisos y cielos; `texFrom` reutiliza un solo lienzo y textura base por lienzo, y solo cambia la repetición. Un material nuevo con textura necesita su entrada en `RELIEF` (o ninguna si es liso).
- La barra inferior alterna *Plano* y *Fotorrealista* (`setLook`, preferencia en `localStorage`, no va en el plano). `applyLook` cambia, sin tocar los datos: fondo y entorno (un cielo generado con `PMREMGenerator`, uno brillante para el fondo y otro a la mitad para iluminar), niebla, luz del sol (cálida, 4096 px, más alta en `aimSun`), exposición, `near`/`far` de la cámara, el color de `M.struct` (yeso en vez de gris de plano), un suelo grande, y oculta rejilla, cotas y aristas.
- Oclusión ambiental: en este aspecto y en pantallas grandes (`useAO`, no `lowPower`) `drawFrame()` renderiza con un `EffectComposer` (MSAA 4×, `GTAOPass`, `OutputPass` que aplica el tone mapping); en los demás casos el render es directo. Todo dibujo pasa por `drawFrame()`, también *Guardar imagen* y las miniaturas. El vidrio (`M.glass`, físico) usa transmisión solo aquí.
- `lowPower` (≤900 px o puntero táctil) baja el pixel ratio a 1,5 y la sombra a 2048 px.

## Agentes de IA

- `src/agent-tools.js` (`Agent`) es lo único que un agente puede hacer con un plan: ~30 herramientas (leer, construir, editar, niveles, capas, plantillas, `check_plan`, cantidades) que pasan por `Layout`, `Levels`, `Templates`, `Catalog` y `Quantities`, igual que el editor. `Agent.call(env, nombre, args)` devuelve `{ok, result | error}` y puede reemplazar `env.state` (plantillas). Las herramientas destructivas piden `confirm`. `Agent.SCOPE` limita al asistente del editor al proyecto (se añade en `aiSystem`, no en el servidor MCP; es una instrucción al modelo, no un filtro duro). `Agent.GUIDE` explica cómo se construye aquí (ejes, giros, cuadrícula de 5 cm, pisos que no se solapan) y es el texto de instrucciones de ambos clientes. Una herramienta nueva se escribe aquí, con su prueba en `test/agent.test.mjs`, y la reciben el asistente y el servidor MCP.
- `mcp/server.mjs`: servidor MCP por stdio, escrito a mano (JSON-RPC por líneas, sin dependencias). Guarda el plan en `BLUEPRINT_PLAN` tras cada cambio, valida con `cleanState` del servidor y deshace el cambio si lo rechaza, guarda un historial de 30 pasos (`undo_last_change`), y sabe compartir (`share_plan`, `push_plan`, `pull_plan`). `BLUEPRINT_READONLY=1` solo deja mirar. `mcp/modules.mjs` carga los módulos del navegador en Node.
- `src/ai-client.js` (`AiClient`): un bucle de herramientas para OpenAI, Anthropic, Gemini y endpoints compatibles con OpenAI. Con `onText` pide la respuesta por streaming (SSE; cada adaptador tiene `stream.start/feed/finish`) y si el servidor responde sin `text/event-stream` usa la ruta normal. La conversación se guarda en una forma neutra y se convierte al formato de cada proveedor en cada petición; las llamadas van directo del navegador al proveedor con la clave de la persona. Los tests usan `fetch` simulado.
- Conversación (`src/assistant-ui.js`, `src/markdown.js`, `src/assistant.css`): las respuestas se muestran con formato (`Markdown.render` escapa todo primero y solo emite etiquetas de una lista corta; enlaces solo http/https). Los pasos de herramientas se agrupan con nombres en español (`LABELS`; cada herramienta nueva de `agent-tools.js` necesita su etiqueta, lo comprueba `test/assistant-ui.test.mjs`) y, mientras el modelo trabaja, un bloque de progreso muestra la fase, el paso (`onStatus` de `AiClient.run`, aparte de `onEvent`) y el tiempo transcurrido. Cada turno termina con una línea *Listo · pasos · tiempo* con *Deshacer lo que hizo*; un error ofrece *Reintentar*.
- Ventana aparte (`assistant.html`): se abre desde *Abrir en otra ventana* con `window.open` y habla con el editor por `postMessage` del mismo origen (`app: 'bs-ai'`; el editor solo atiende a ventanas cuyo `opener` es él). El editor sigue siendo quien llama al modelo: la ventana solo recibe el estado (`aiView()`) y envía `send`, `stop`, `new` y `act`; **la clave nunca sale del editor**. Si el editor se recarga, la ventana lo recupera sola con su `hello` periódico.
- La pestaña *Asistente* (`renderAsistente`, `aiSend`): bloquea el editor mientras el modelo trabaja, aplica cada herramienta con `applyAgentChange` y guarda **una sola vez** al final del mensaje (un paso de deshacer). La clave se guarda en `localStorage` solo si se marca *Recordar*; nunca va al servidor ni a los planos compartidos. No cambiar a pasar la clave por ninguna función de `api/`.

## Capas

- `layout.layers = [{id, name, color, visible, locked}]`, por nivel (viajan con el nivel al cambiar). Hay seis capas base (`l_walls`, `l_openings`, `l_floors`, `l_stairs`, `l_items`, `l_dims`) que `Layout.ensureLayers` garantiza; las propias usan ids `c<n>`.
- Un elemento (muro, vano, piso, escalera, mueble) pertenece a la capa base de su tipo salvo que lleve `layer: <id>`. `Layout.layerOf/isVisible/isLocked` resuelven la capa; si el id no existe, cae a la base.
- Oculta: no se construye en 3D (`buildLevelInto`, `buildItems`) ni se dibuja al exportar. Bloqueada: se ve pero `isPickable` la saca de las raíces del raycast del engine. `l_dims` controla cotas y rótulos de habitación.
- `Drawing.build` pasa las capas propias a capas CAD con su nombre (`layerName`) y el color AutoCAD más cercano (`aci`); `Export` las escribe en PDF y DXF. Las cantidades cuentan todo, también lo oculto.

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

- La versión se muestra en la pantalla de carga y en la barra superior (`class="ver"` en `editor-3d.html`): al subir la versión hay que cambiarla también ahí, además de `package.json`; `test/sizes.test.mjs` lo comprueba.
- Medidas en metros. En la UI se muestran con coma decimal (`f2()`).
- No introducir build tooling sin pedirlo: los HTML son autocontenidos y se abren directo o con un servidor estático. El único `package.json` es para las funciones de `api/`; el editor sigue sin build y compartir solo funciona en el sitio publicado.
- El usuario prefiere modelos parametrizados y autoajustables sobre salidas estáticas, y respuestas directas que no reabran decisiones ya tomadas.
