# Session handoff — 2026-09-10

Entregar desde una sesión de Cowork al primer Claude Code sobre este repo.

## Contexto

El proyecto arrancó desde cero en una única sesión de Cowork (Sept 9-10, 2026). Se construyó todo el backend + fundación del cliente, siempre con la Constitution como guía y con tests verdes en cada commit. El usuario es Claudio, el mismo dueño del repo hermano turnocero — StreamerGames adopta las mismas convenciones (ver `CLAUDE.md`).

## Dónde estamos

Todo lo hecho está en `master`. Al momento del handoff:

- Commit HEAD: `c8fe8bf feat(client): F1e.1 foundation — axios, auth+session slices, queries, sockets`
- Remote: `https://github.com/chollman/streamergames.git` — creado por el usuario; **el push desde Cowork no funcionó** por auth (no hay credential helper en la VM WSL). Debería pushear localmente con `git push -u origin master` desde Windows Git Bash antes de arrancar Claude Code, para tener respaldo remoto.

Ver [`../../CLAUDE.md`](../../CLAUDE.md) → "Estado actual" para el detalle de cada fase completada.

## Decisiones tomadas por el usuario (durante la sesión)

- **Nombre**: StreamerGames.
- **Stack**: espejar turnocero (React 18 + Vite + Express + Mongoose + Socket.IO, CJS server / ESM client).
- **Guest access primero, Twitch OAuth después**: el MVP usa nickname + guest JWT; Twitch OAuth es F4.
- **The Crew como primer juego**, cartas confirmed (pink, yellow, green, blue + rocket).
- **Misiones/task cards fuera de la app** — el streamer las gestiona físicamente en cámara. La app solo maneja mecánica de reparto, baza y comunicación.
- **Communication tokens SÍ en la app** (no físicos) — el server valida la condición (highest/lowest/only) y el overlay los muestra en tiempo real.
- **Multi-tenant desde el día 1**: `Channel` como tenant. Un canal por streamer en el MVP; multi-streamer en F5.
- **`sessionSlice` en Redux, no en TanStack Query** — porque es estado en vivo alimentado por Socket.IO, no un fetch periódico.
- **Cola con karma** para F2 (queue de digital players). Ya modelado en docs pero no implementado — en F1 el streamer invita a los digitales directamente vía `POST /sessions/:id/join`.
- **Smoke test manual del backend**: se saltó (opción 2). Los 147 tests de integración cubren el pipeline end-to-end contra Mongo real (memory-server) + Socket.IO real + supertest sobre `app.js`. Doc de smoke queda como referencia en `docs/smoke-test.md` si se quiere validar en un ambiente prod-like.
- **Handoff a Claude Code** al final de F1e.1 — la iteración con round-trip por chat empezó a costar más que valor entrega. Claude Code local es más rápido para lo que viene (páginas React con hooks + tests).

## Trampas que evitar (aprendidas en esta sesión)

- Vitest 2.x + CommonJS: server necesita `globals: true` en `vitest.config.js`. NO importar de `"vitest"` en test files — usar los globals.
- `@testing-library/react` cleanup: sin `globals: true` no auto-registra, hay que agregar `afterEach(cleanup)` en el setup manualmente. Ya está en `client/src/test/setup.js`.
- Mongoose 8 subdocs: hacer `user.verification = undefined; save()` NO borra el subdoc si el subschema tiene defaults. Usar `findByIdAndUpdate({ $unset: { verification: 1 } })` — y para tests de verificación de wipe, usar `.lean()` para leer raw doc (el hydrate re-materializa un shell vacío que confunde asserts).
- `emitSessionEvent` con `io=null`: soportado y usado en tests REST-only. Igual incrementa `Session.version` y devuelve envelope; simplemente no emite.
- Envelope keys defensivas: en `emitSessionEvent`, el spread de payload va PRIMERO y las envelope keys (sessionId/version/timestamp) van DESPUÉS, para que un caller malintencionado no pueda forjarlas. Hay un test explícito de anti-spoof.
- Guest token vs user Bearer: la fixture crítica en `queries/sessions.test.js` es que `submitAction` usa el guest token cuando hay uno guardado para ese sessionId (para que el server identifique el seat correcto). Si eso se rompe, un streamer con guest token guardado para su propia sesión mandaría actions como "guest" en vez de "streamer" y todo se cae.

## Lo que viene (F1e.2 y siguientes)

Todo con la fundación de F1e.1 ya lista para consumir. En orden sugerido:

1. **F1e.2 — Páginas de auth** (`Login`, `Register`, `VerifyEmail`). Rutas con slugs en español: `/login`, `/registro`, `/verificar-email`. React Router 6 + queries ya escritas. Incluir tests con MSW.
2. **F1e.3 — Página del streamer** (`/canal/:slug/gestion`). Crear sesión, ver seats, kickear, reservar mano con búsqueda fuzzy de cartas, jugar cartas, ver log de eventos. Es el panel más denso.
3. **F1e.4 — Página del jugador digital** (`/canal/:slug/sesion/:id`). Nickname para entrar (si no tiene guest token), ver mano, jugar carta seleccionable con validación server-side, comunicar (con UI de "highest/lowest/only").
4. **F1e.5 — Overlay OBS** (`/canal/:slug/sesion/:id/overlay`). Forced-dark, 1920×1080 fijo, sin nav. Muestra baza, comandante, tokens de comunicación públicos, historial de bazas ganadas. Sin controles. Query param `?transparent=1` hace fondo transparente para browser source de OBS.
5. **F1f — Demo end-to-end** en vivo: streamer + 2 digitales jugando una partida completa de The Crew.

## Componentes compartidos a crear antes de las páginas (F1e.2 arranca acá)

- `<Modal />` — portal + focus trap, mirror del de turnocero.
- `<Avatar />` — hash-color por seed, versión inicial simple (turnocero tiene una más completa).
- `<EmptyState />` — para lobbys vacíos, listas sin datos.
- `<BackButton />` — botón "volver" reusable.
- `<Card />` — visualización de carta de juego. Variantes: `back` (dorso), `playing` (arriba de la mesa), `communicated` (con token de comunicación superpuesto). Colores por suit desde `--card-pink/yellow/green/blue/rocket` en `index.css`.

## Setup para arrancar Claude Code

1. Del lado del usuario:
   ```bash
   cd C:\Users\hell_\Projects\ClaudioHollman\streamergames
   git push -u origin master
   claude
   ```
2. Claude Code va a leer `CLAUDE.md` primero y este `.claude/memory/session-handoff-2026-09-10.md` cuando decida cargarlo.
3. El link simbólico de memoria (`~/.claude/projects/...`) hay que crearlo una sola vez — instrucciones en `CLAUDE.md` → "Claude memory setup (per machine)".

## Referencias rápidas

- Constitución: [`../../CONSTITUTION.md`](../../CONSTITUTION.md)
- Arquitectura (dominio + real-time + testing): [`../../docs/architecture.md`](../../docs/architecture.md)
- Roadmap: [`../../docs/roadmap.md`](../../docs/roadmap.md)
- Smoke test: [`../../docs/smoke-test.md`](../../docs/smoke-test.md)
- Turnocero (repo hermano, misma filosofía): https://github.com/chollman/turnocero
