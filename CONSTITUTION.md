# StreamerGames — Constitución del Proyecto

Este archivo contiene las reglas no negociables del proyecto. `docs/architecture.md` explica **cómo se construye la app**; este archivo dicta **qué debe siempre cumplirse**, sin importar qué feature esté tocando. Cuando una regla acá entra en conflicto con la comodidad ("solo por esta vez"), la regla gana — planteálo con el usuario en lugar de saltearla en silencio.

La base viene del `CONSTITUTION.md` del repositorio hermano [`turnocero`](https://github.com/chollman/turnocero) — reglas calcadas donde aplican, extendidas con lo específico de motor de juegos y experiencia multijugador en vivo (§8, §9).

## 1. Proceso

- **Tests con cada cambio**, client y server, en el mismo commit — componente nuevo, ruta, hook, utilidad o método. Bug fixes llevan test de regresión que falla antes del fix y pasa después. Sin excepciones para "cosas chicas".
- **Todo feature top-level se plumeria a través de `SiteConfig`**: `SECTION_KEYS`, middleware `requireSection`, `<SectionGate>`, toggle en `/panel-admin`.
- Commits en **inglés**, sin importar el idioma de la UI.
- Los planes van en `plans/` del repo, no en `~/.claude/plans/`.
- Nunca trabajar en `.claude/worktrees/` — usar branches en la copia principal.

## 2. Internacionalización

- **Toda string visible por el usuario pasa por claves i18n presentes en `es` y `en`** — un literal hardcodeado en cualquiera de los dos es un bug, no un tema de estilo. Cliente: `react-i18next` (`t('ns:section.key')`). Server: `i18next` + `i18next-http-middleware` (`req.t('errors:key')`).
- Español (`es-AR`) es el fallback. La preferencia del usuario se persiste en Redux/localStorage y se envía como `Accept-Language`.
- Nunca hardcodear `"es-AR"` ni un `Intl` directo — usar `client/src/utils/locale.js`.
- Los slugs de ruta se mantienen en español; solo el texto visible se traduce.
- Correr `/i18n-audit` antes de shippear un feature con strings nuevas.

## 3. Tema y responsive

- **Todo feature debe funcionar en dark y light** usando los tokens CSS de `client/src/index.css` — nunca un color hardcodeado.
- **Usar breakpoints canónicos**, nunca un px crudo, para transiciones de layout: `--desktop` / `--below-desktop` (960 px), `--tablet` (880 px), `--phone` (600 px), `--compact` (480 px). El overlay de OBS (vista spectator para browser source) es la excepción — forced-dark siempre, se sirve en dimensiones fijas.
- Gaps entre widgets/paneles/cards usan `--gap-widgets`.
- Sin librerías de íconos (`lucide-react`, `react-icons`, `@heroicons`, etc.) — inline SVG o emoji.

## 4. Componentes compartidos — reusar, no reinventar

- `<Avatar user={...} size="..." />` para todo avatar de usuario.
- `<BackButton />` para todo control "volver".
- `<Modal />` (portal-based, focus-trapped) para todo overlay full-screen — nunca un `position: fixed` inline.
- `<EmptyState />` para toda vista vacía.
- `<Card />` con las variantes shared (`playing`, `communicated`, `back`) para toda visualización de carta — nunca un `<div className="card">` hand-rolled con estilo aparte.
- Errores de `PUT`/`POST`/`DELETE` surfaceados vía `addToast({ type: 'error' })`.
- Inputs que alimentan fetches usan `useDebouncedValue` (300 ms default).

## 5. Arquitectura de servidor

- La lógica de negocio vive en `server/services/`; los routers son plumbing HTTP fino.
- Rutas usan `asyncHandler(fn)` + `throw httpError(status, msg)` + middleware central de errores. Toda respuesta de error es `{ message: '<string>' }`. Los códigos de error de auth incluyen `code` estable (`email_not_verified`, `banned`, `channel_offline`, etc.); frontend branchea por `code`, no por mensaje.
- `client/src/api/endpoints.js` (`API.x.Y`) es única fuente de verdad para paths HTTP — sin strings de path inline en componentes.
- Todo router con `:id` registra `router.param('id', validateObjectId)` al tope.
- `PUT` endpoints modifican solo campos **presentes** en `req.body` (nunca `field = body.field || undefined` — borra campos que el caller no mandó).
- Endpoints authenticados costosos: rate-limit **per-user**, no per-IP.
- `server/app.js` construye el Express app (routes + middleware) sin Mongo ni Socket.IO; `server/server.js` importa `app`, conecta DB, monta Socket.IO y hace listen. Los tests de integración usan supertest sobre `app` directamente, sin puerto.

## 6. Real-time (Socket.IO) y estado de sesión

- **Todo emit de Socket.IO relacionado a estado de partida pasa por `server/utils/emitSessionEvent.js`** (`emitSessionEvent(io, sessionId, event, payload)`), que inyecta `sessionId`, `version` (monotónico por sesión), `timestamp`. El cliente **setea** `version` desde el payload — nunca incrementa localmente. `version` se resetea cuando el cliente aplica el `session:state` inicial.
- Registrar todo `socket.on(...)` dentro de `io.on('connection')` **antes** de cualquier `await`. Handlers registrados después de una lookup async se pierden eventos disparados durante `connect`.
- **Estado privado nunca se emite por un canal público.** El room `session:<id>` recibe estado público de la partida; cada jugador digital tiene un room privado `session:<id>:player:<playerId>` donde recibe su vista privada (mano, roles secretos). Filtrar en el server, no en el cliente. Esta es la regla más crítica del proyecto: si un jugador digital ve la mano de otro, se rompe el juego para siempre.
- El cliente reconcilia por `version`: eventos fuera de orden se descartan; un gap dispara `session:resync` que trae el estado completo.

## 7. Corrección de datos

- Conteos derivados de un array (jugadores presentes, cartas restantes, bazas ganadas) se computan con `useMemo`, nunca como estado paralelo.
- Si el server además emite un socket event de vuelta al actor de una acción, el socket es la única fuente de verdad para el conteo resultante — no aplicar además un incremento optimista.
- Toda agregación Mongo que elige "el último" ordena por `{ createdAt: -1, _id: -1 }` — desempate por `_id` evita bugs en bursts.
- Fetches en `useEffect` con `axios.get` usan `AbortController` + `signal: ac.signal`, chequeando `axios.isCancel(err)` en el catch.

## 8. Estado de cliente (Redux Toolkit + TanStack Query)

- **Clasificar antes de guardar.** Client/UI state — que nunca se fetchea de una API: tema, idioma, panel abierto, form en progreso, toggle de vista — va en un slice de Redux Toolkit. Server state — cualquier cosa detrás de un `GET/POST/PUT/PATCH/DELETE` a `/api/*` que puede quedar stale — va en un hook TanStack Query.
- **Nada de RTK Query.** TanStack Query es la única librería de data-fetching/caching del proyecto.
- El estado en vivo de la sesión de juego (mano privada, tablero público, comunicaciones) NO va en TanStack Query porque no es un fetch periódico — vive en un store dedicado (`sessionSlice` de Redux) alimentado por los eventos de Socket.IO. Los fetches iniciales de la sesión y las listas de sesiones históricas sí van por TanStack Query.
- `configureStore`'s `devTools` seteado explícitamente vía `import.meta.env.DEV` (Vite no expone `process.env.NODE_ENV` como Redux Toolkit espera por default).

## 9. Motor de juegos y jugadores

- **El backend es la única fuente de verdad del estado de partida.** El cliente nunca computa una acción "por su cuenta": manda intención (`action`), el server valida y aplica, luego emite el nuevo estado por Socket.IO.
- **Toda acción de jugador se valida server-side** antes de mutar estado. La validación vive en el módulo del juego correspondiente (`server/services/games/<game>/rules.js`), no en el router.
- **Los jugadores tienen tipo, no solo rol**: `physical` (juega con componentes reales; sus acciones se **loguean** en la app, no se ejecutan sin componentes reales), `digital` (jugador remoto que juega íntegramente por la app), `spectator` (solo estado público, no puede tomar acciones). El motor de juegos genera una vista distinta por tipo — `viewFor(state, playerId, role)` devuelve solo la porción legítima del estado para ese destinatario.
- **Los módulos de juego son plug-ins declarativos** con interface fija: `setup(config, players) → state`, `validateAction(state, playerId, action) → { ok, error? }`, `applyAction(state, action) → state`, `viewFor(state, viewerId, role) → viewState`, `nextActor(state) → playerId | null`, `isFinished(state) → boolean`. Un juego nuevo se registra agregando su carpeta bajo `server/services/games/<game>/` y su entry en `server/services/games/registry.js`.
- La representación de una carta es `{ id, suit, rank }` con `id` estable (formato `<suit>-<rank>`, ej. `pink-6`, `rocket-4`). Las cartas nunca se identifican por posición en el mazo — solo por `id`.

## 10. Seguridad

- **Twitch OAuth**: el `access_token` del provider se usa solo server-side (lookup del usuario y verificación del scope) y se descarta. Al cliente solo sale el JWT propio de StreamerGames. Nunca renderizar ni loggear el `access_token` de Twitch.
- Sanitizar todo skin de canal (branding personalizable, colores custom): color tokens en allowlist (hex/rgb), nunca CSS crudo.
- Nunca exponer el estado privado de otro jugador — ni siquiera en logs de debug — a ningún canal que no sea el del propio jugador. Ver §6.
- La cola de asientos (queue de digital players esperando entrar a la partida) puede ser abusada — implementar cooldowns, límite por IP + por usuario Twitch, y kick manual por el streamer. Un jugador expulsado no puede reingresar en la misma sesión.

---

Cuando emerja una convención nueva por feedback del usuario, agregarla acá (corta, imperativa, un bullet). El rationale extendido va en un archivo en `.claude/memory/feedback_*.md`, como en turnocero.
