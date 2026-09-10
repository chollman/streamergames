# CLAUDE.md

Guía para sesiones de Claude Code sobre este repo. Complemento de [`CONSTITUTION.md`](CONSTITUTION.md) — la constitución son las reglas no-negociables (qué debe siempre cumplirse); este archivo cubre cómo se construye la app y en qué estado está.

## Overview

**StreamerGames** — app web compañera para streamers de juegos de mesa en Twitch. Espectadores del chat se convierten en jugadores digitales; el streamer maneja los componentes físicos en cámara y opera desde la app. Multi-tenant desde el día 1: cada streamer es un `Channel`.

MVP: The Crew (cooperativo, trick-taking, 40 cartas) con streamer + 1-4 digitales.

Roadmap completo en [`docs/roadmap.md`](docs/roadmap.md); arquitectura en [`docs/architecture.md`](docs/architecture.md).

## Estado actual

- **F0** ✅ — scaffolding monorepo (server + client), CONSTITUTION, docs, README.
- **F1a** ✅ — módulo `the-crew` puro con 60+ unit tests. Reglas completas: reserve-hand, deal, play-card (must-follow-suit, lead-with-rocket), communicate (highest/lowest/only, one-per-game), confirm-trick, declare-end. `viewFor` filtra por rol (streamer/digital/spectator).
- **F1b** ✅ — modelos `User` + `Channel` + auth del streamer (register + verify-email + login + me). Auto-crea el canal en el register. Rate limits, JWT 180d, verificación 6-dígitos + 5-attempt cap.
- **F1c.1** ✅ — modelo `Session` (seats subdocs + gameState Mixed + version), servicio `sessions.js` con el pipeline `resolve caller → validateAction → applyAction → emitSessionEvent`, rutas REST (`POST /channels/:slug/sessions`, `POST /sessions/:id/join`, `POST /sessions/:id/start`, `POST /sessions/:id/actions`, `GET /sessions/:id`). Guest tokens via JWT bound a `(sessionId, playerId)`.
- **F1c.2** ✅ — Socket.IO cableado al mismo pipeline. `authenticateSocket` middleware (Bearer user o guest, o anon), `session:join` / `session:leave` handlers, forward de envelopes a rooms `session:<id>` (público) y `session:<id>:player:<pid>` (privado). Test crítico de aislamiento con `socket.io-client` real: verifica que un digital NO recibe eventos privados de otros.
- **F1e.1** ✅ — fundación del cliente: `axios` con interceptor de Bearer, `authSlice` + `sessionSlice` (con guard de version out-of-order), `queries/auth.js` + `queries/sessions.js`, hooks `useSocket` + `useSessionSubscription`, test infra con MSW.

**Total tests actuales**: server ~147, client ~35 (verdes en `npm test`).

**Próximo**:
- F1e.2 — páginas de auth (Login, Register, VerifyEmail).
- F1e.3 — página del streamer (crear sesión, cola, reservar mano, jugar).
- F1e.4 — página del jugador digital (nickname, mano, jugar, comunicar).
- F1e.5 — overlay OBS (forced-dark, 1920×1080).
- F1f — demo end-to-end.

## Estructura del monorepo

```
streamergames/
├── CONSTITUTION.md
├── CLAUDE.md                    # este archivo
├── README.md
├── package.json                 # scripts raíz (install:all, dev, test)
├── docs/
│   ├── architecture.md           # modelo de dominio, real-time, motor de juegos
│   ├── roadmap.md                # 6 fases (F0 → F6)
│   └── smoke-test.md             # walkthrough manual del backend
├── server/                      # Express + Mongoose + Socket.IO (CommonJS)
│   ├── app.js                   # builder sin DB/sockets (para tests con supertest)
│   ├── server.js                # boot: DB + Socket.IO + listen
│   ├── config/                  # env, db, cors
│   ├── middleware/              # asyncHandler, errorHandler, protect
│   ├── models/                  # User, Channel, Session
│   ├── routes/                  # health, auth, channels, sessions
│   ├── services/                # auth, channels, sessions, sockets, games/
│   │   └── games/
│   │       ├── registry.js
│   │       └── the-crew/         # cards.js, rules.js, index.js
│   ├── utils/                   # httpError, emitSessionEvent
│   ├── i18n/                    # es + en resources (common, errors)
│   └── tests/                   # unit + integration + helpers
└── client/                      # React 18 + Vite + PWA (ESM)
    ├── src/
    │   ├── App.jsx / main.jsx
    │   ├── api/                 # axios, endpoints, sessionStorage
    │   ├── components/          # (F1e.3+: shared, layout, game)
    │   ├── context/             # (F1e.2+: AuthContext)
    │   ├── hooks/               # useSocket, useSessionSubscription
    │   ├── i18n/                # es + en, parity test
    │   ├── pages/               # (F1e.2+)
    │   ├── queries/             # auth, sessions, queryClient
    │   ├── store/               # store + slices (auth, session, theme, language)
    │   ├── test/                # setup, MSW server, wrappers
    │   └── utils/               # locale.js
    ├── vite.config.js           # /api + /socket.io proxy a :4000
    └── eslint.config.js
```

## Comandos de desarrollo

```bash
# Primera vez
npm run install:all

# Ambos servers a la vez (concurrently + color-prefixed)
npm run dev

# Por separado
npm run dev:server                # :4000 (nodemon)
npm run dev:client                # :3000 (vite)

# Tests
npm test                           # ambos workspaces
npm test --prefix server           # solo backend (Vitest + mongodb-memory-server)
npm test --prefix client           # solo frontend (Vitest + jsdom + MSW)
```

## Convenciones a tener en cuenta

- **Auth flow**: `POST /register` → devuelve `devCode` en dev/test (production no). `POST /verify-email` con el código → devuelve `{ user, token, channel }`. `POST /login` bloquea con 403 `email_not_verified` si no verificaste. Todo con `authLimiter` (10/15min per IP, skipped en NODE_ENV=test).
- **Session pipeline**: toda mutación de estado de partida pasa por `submitAction` en `services/sessions.js`. Resuelve al caller (user o guest) → seat, valida vía módulo de juego, aplica, emite. `io=null` es aceptado (útil en tests REST).
- **Emit envelope**: `emitSessionEvent(io, sessionId, event, payload, { rooms })` es el ÚNICO punto de emit para eventos de sesión. Incrementa `Session.version` atómicamente en Mongo y stampeale `sessionId` + `version` + `timestamp` al envelope. Las envelope keys son defensivas (spread payload primero, envelope keys después) — un caller no puede forjar version.
- **Rooms**: público = `session:<id>`, privado por jugador = `session:<id>:player:<playerId>`. NUNCA emitir privado a un room público (Constitution §6). Filtro con `viewFor(state, viewerId, role)`.
- **Client-side split**: TanStack Query para server state (queries), Redux Toolkit para client state (slices). `sessionSlice` es la EXCEPCIÓN: vive en Redux porque está alimentado por Socket.IO, no por fetches.
- **Guest tokens**: JWT bound a `(sessionId, playerId)` con TTL 24h. Se guardan en localStorage keyed por sessionId. `submitAction` y `useSessionQuery` los usan sobre el user Bearer cuando existen (para que el server identifique el seat correcto).
- **i18n obligatorio**: toda string visible pasa por `t('ns:key')` en cliente y `req.t('ns:key')` en server, con clave presente en `es` y `en`. Correr `/i18n-audit` antes de shippear.

## Cosas que aprendimos en el camino

- **Vitest 2.x no puede ser require()'d desde CommonJS**. Server tiene `globals: true` en `vitest.config.js` — tests usan `describe/it/expect/beforeAll` como globals.
- **RTL cleanup no auto-registra sin globals: true**. Client tiene `afterEach(cleanup)` explícito en `src/test/setup.js`.
- **Mongoose 8 re-materializa subdocumentos vacíos** aunque hagas `$unset`. Para verificar en tests si un subdoc está realmente borrado en Mongo, usar `.lean()` (raw doc sin schema).
- **mongodb-memory-server** cachea el binario de mongod local. En primer arranque descarga (~200MB); en ambientes con network restrictiva puede fallar con 403 al fastdl.mongodb.org.
- **socket.io-client requiere transports: ["websocket"]** en tests con `startTestServer` para evitar el long-polling handshake más lento.
- **En Windows + Git Bash**, un warning `The CJS build of Vite's Node API is deprecated` en `npm test` es cosmético (Vitest lo emite).

## Claude memory setup (per machine)

La memoria persistente de Claude para este proyecto vive en `.claude/memory/` versionada con git — mismo pattern que turnocero.

En cada máquina, después del clone, correr **una vez** para linkear al lugar donde Claude Code lo busca. El slug del target se deriva del absolute path del repo con `/` reemplazado por `-` y sin `-` inicial. Verificar el slug exacto con:

```bash
ls ~/.claude/projects/                    # macOS/Linux
ls $env:USERPROFILE\.claude\projects\    # Windows
```

**macOS / Linux** (ajustar path del repo):

```bash
REPO="$HOME/Projects/ClaudioHollman/streamergames"
SLUG=$(echo "$REPO" | sed 's|^/||; s|/|-|g')
ln -s "$REPO/.claude/memory" "$HOME/.claude/projects/$SLUG/memory"
```

**Windows** (PowerShell — ajustar path):

```powershell
New-Item -ItemType SymbolicLink `
  -Path "C:\Users\hell_\.claude\projects\c--Users-hell_-Projects-ClaudioHollman-streamergames\memory" `
  -Target "C:\Users\hell_\Projects\ClaudioHollman\streamergames\.claude\memory"
```

Después de eso, Claude Code lee y escribe memoria directamente desde la carpeta del repo, y los notes viajan con git.

## Git conventions

- Commits en **inglés**, sin importar el idioma de la UI.
- Los planes por feature grande van en `plans/<feature>.md`.
- Nunca trabajar en `.claude/worktrees/` — usar branches en la copia principal.
