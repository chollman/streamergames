# StreamerGames — Arquitectura

Este documento cubre **cómo se construye la aplicación**: modelo de dominio, real-time, motor de juegos, estructura del monorepo, testing, y deployment. Las reglas no negociables viven aparte en [`CONSTITUTION.md`](../CONSTITUTION.md).

## 1. Objetivo y alcance

StreamerGames es una app web compañera para streamers de juegos de mesa en Twitch. El streamer maneja componentes físicos en cámara (tablero, mazo, tokens) mientras que espectadores del chat se unen como jugadores digitales desde su celular o PC, viendo su información privada (mano, roles secretos) en la app y sus acciones sincronizadas al stream vía overlay de OBS.

**Alcance del MVP (F1-F2):**
- Un canal (el del propio streamer creador del proyecto).
- Un juego: The Crew.
- 1-4 jugadores digitales + el streamer como jugador físico.
- Sistema de asientos con cola.
- Overlay para OBS (browser source).
- Sin integración Twitch OAuth todavía (login guest con nickname para digitals; el streamer usa una password local).

**Fuera de alcance en el MVP:**
- Twitch Extension nativa (F6).
- Multi-streamer (F5).
- Motor de reglas generalizado más allá de The Crew (F3+ agrega segundo juego que fuerza la abstracción).
- Persistencia de campañas / rankings.

## 2. Modelo de dominio

### 2.1 Channel (tenant)

Un `Channel` representa un streamer. Al principio hay uno solo; el diseño ya lo trata como tenant para no rehacer arquitectura en F5.

```js
// server/models/Channel.js
const ChannelSchema = new Schema({
  slug: { type: String, required: true, unique: true, immutable: true }, // usado en URLs y rooms
  displayName: { type: String, required: true },
  ownerUserId: { type: ObjectId, ref: 'User', required: true },
  twitchChannelId: { type: String, index: true }, // vacío mientras Twitch OAuth no esté integrado
  enabledGames: [{ type: String }], // ['the-crew']
  skin: {                            // reskin per-canal (fase futura, ya modelado)
    accents: { primary: String, secondary: String, accent: String },
    logoLight: { url: String, publicId: String },
    logoDark: { url: String, publicId: String },
    brandName: String,
  },
  createdAt, updatedAt,
});
```

### 2.2 Session (partida)

Una `Session` es una instancia de partida en curso. Vive activa mientras se está jugando; se archiva al terminar.

```js
// server/models/Session.js
const SessionSchema = new Schema({
  channel: { type: ObjectId, ref: 'Channel', required: true, index: true },
  gameId: { type: String, required: true }, // 'the-crew'
  status: { type: String, enum: ['lobby', 'in_progress', 'finished', 'abandoned'], default: 'lobby', index: true },
  seats: [SeatSchema],           // 3-5 seats para The Crew
  gameState: Schema.Types.Mixed, // opaco al server core; solo el módulo del juego lo interpreta
  version: { type: Number, default: 0 }, // monotónico, incrementa con cada mutación
  startedAt: Date,
  finishedAt: Date,
  createdAt, updatedAt,
});
```

`gameState` es opaco para el core: cada módulo de juego define su propio shape. Ver §5.

### 2.3 Seat + Player

```js
const SeatSchema = new Schema({
  seatIndex: { type: Number, required: true }, // 0..N-1
  playerId: { type: String, required: true },  // uuid interno, distinto del userId de auth
  userId: { type: ObjectId, ref: 'User' },     // null para guests
  nickname: { type: String, required: true },  // visible en overlay y otras vistas
  role: { type: String, enum: ['streamer', 'digital', 'spectator'], required: true },
  playerType: { type: String, enum: ['physical', 'digital'], required: true },
  // physical: juega con componentes reales; sus acciones son logueadas
  // digital: juega íntegramente por la app
  status: { type: String, enum: ['seated', 'disconnected', 'kicked', 'left'], default: 'seated' },
  joinedAt: Date,
});
```

`role` (streamer / digital / spectator) es la vista que ve el usuario; `playerType` (physical / digital) es cómo interactúa mecánicamente con el juego. Un streamer siempre es `playerType: 'physical'` en el MVP, pero el modelo permite streamers digitales en el futuro.

### 2.4 SeatQueue

La cola de espectadores esperando entrar a la próxima partida.

```js
// server/models/SeatQueue.js
const SeatQueueEntrySchema = new Schema({
  channel: { type: ObjectId, ref: 'Channel', required: true, index: true },
  userId: { type: ObjectId, ref: 'User' },     // null para guests
  nickname: { type: String, required: true },
  guestToken: { type: String, index: true },   // identifica al invitado entre reconexiones
  requestedAt: { type: Date, default: Date.now },
  karma: { type: Number, default: 0 },         // baja cuando juega; sube con el tiempo de espera
  status: { type: String, enum: ['waiting', 'selected', 'kicked'], default: 'waiting' },
});
```

## 3. Auth flow

### 3.1 MVP (F1-F4)

- **Streamer:** registro clásico email + password (mismo modelo que turnocero, `POST /api/auth/register` con verificación por email). No pasa por Twitch todavía; se identifica con su cuenta local.
- **Digital player:** dos vías coexistiendo:
  - Guest con nickname: entra a la app en `/canal/<slug>` sin login, elige nickname, recibe un `guestToken` en `localStorage` (JWT de corta vida, 24h) que lo identifica entre reconexiones. Rápido, cero fricción, ideal para probar en stream.
  - Cuenta local: registro/login normal. Persiste karma, historial de partidas.
- **Spectator:** cualquier navegador que abra `/canal/<slug>/session/<id>/spectator`. Sin auth. Recibe solo estado público.

### 3.2 Twitch OAuth (F4)

Se agrega como provider adicional (mismo patrón que turnocero con Google/Facebook), no reemplaza al login local. El scope pedido a Twitch es el mínimo (`user:read:email`); el `access_token` de Twitch se descarta después del linking. Un guest que se autentica luego con Twitch conserva su karma y historial.

## 4. Real-time (Socket.IO)

### 4.1 Rooms

- `channel:<slug>` — todos los sockets asociados a un canal (streamer, digital players activos, spectators). Recibe eventos generales del canal (nueva partida abierta, streamer se conectó/desconectó).
- `session:<sessionId>` — todos los sockets participando de esa partida (streamer + digital players + spectators). Recibe **estado público** de la partida.
- `session:<sessionId>:player:<playerId>` — un socket, dedicado al jugador digital. Recibe su **estado privado** (mano, información específica).
- `channel:<slug>:streamer` — solo el socket del streamer. Recibe eventos operativos: "un digital se desconectó", "hay 3 personas nuevas en la cola", "digital X pidió pausar".

Un socket se agrega a rooms según su auth (streamer / digital / spectator) al hacer `session:join`. Las reglas de qué room le corresponden viven en `server/services/sessionAccess.js`, nunca en el router.

### 4.2 Eventos server-emitted

| Evento | Room | Payload |
|---|---|---|
| `session:state` | `session:<id>` | Estado público completo (para reconciliación inicial y resync). |
| `session:you-are` | `session:<id>:player:<pid>` | Vista privada completa del jugador (mano, tokens). |
| `session:action-accepted` | `session:<id>` | Acción validada aplicada. Incluye `stateDiff`. |
| `session:action-rejected` | socket originante | `{ reason, code }` — al actor de la intención rechazada. |
| `session:hand-update` | `session:<id>:player:<pid>` | Delta privado de la mano del jugador. |
| `session:turn` | `session:<id>` | Cambio de turno. |
| `session:trick-won` | `session:<id>` | Baza cerrada, ganador. |
| `session:communication` | `session:<id>` | Un jugador comunicó una carta (info pública). |
| `session:finished` | `session:<id>` | Partida terminada (declarada por el streamer). |
| `seat-queue:updated` | `channel:<slug>:streamer` | La cola cambió (nuevo waiting o karma actualizado). |
| `session:you-are-up` | `session:<id>:player:<pid>` | Es tu turno (permite UI focus). |
| `session:resync-request` | server-only | El cliente detectó gap de `version`; response es un `session:state` fresh. |

### 4.3 Contrato de emit

Todo emit relacionado a estado de sesión pasa por:

```js
// server/utils/emitSessionEvent.js
async function emitSessionEvent(io, sessionId, eventName, payload, { rooms }) {
  const session = await Session.findByIdAndUpdate(sessionId, { $inc: { version: 1 } }, { new: true });
  const envelope = { sessionId, version: session.version, timestamp: new Date().toISOString(), payload };
  for (const room of rooms) io.to(room).emit(eventName, envelope);
  return envelope;
}
```

El cliente **setea** `version` desde el payload en su `sessionSlice`, nunca incrementa localmente. Un gap de versiones dispara un `session:resync`.

## 5. Motor de juegos (game modules)

Cada juego es un módulo con interface fija. El registry vive en `server/services/games/registry.js`:

```js
// server/services/games/registry.js
import theCrew from './the-crew/index.js';
export const games = { 'the-crew': theCrew };
```

Cada módulo exporta un objeto con:

```js
// server/services/games/the-crew/index.js
export default {
  id: 'the-crew',
  minPlayers: 3,
  maxPlayers: 5,
  setup(config, players) { /* ... */ return initialState; },
  validateAction(state, playerId, action) { return { ok, error? }; },
  applyAction(state, action) { return newState; },
  viewFor(state, viewerId, role) { return publicState | privateState | spectatorState; },
  nextActor(state) { return playerId | null; },
  isFinished(state) { return false; }, // MVP: siempre false; el streamer declara fin
};
```

**Reglas clave del motor:**

- `state` es un objeto JS plano y serializable. Se persiste tal cual en `Session.gameState`.
- `viewFor` es el filtro de privacidad. Nunca se emite `state` crudo por socket; siempre `viewFor(state, viewerId, role)`.
- `applyAction` recibe solo acciones que ya pasaron `validateAction`. Si aplica lo que se le pasa, no revalida.
- El motor no conoce Mongo, Socket.IO, ni Express. Funciones puras salvo por `Math.random()` en shuffles.
- Los tests del módulo son unit tests puros, sin Mongo ni supertest.

### 5.1 Registro de acciones

Una acción es `{ type: string, playerId: string, ...args }`. Ejemplos para The Crew:

- `{ type: 'reserve-hand', playerId, cardIds: [...] }` — streamer marca su mano física antes del deal digital.
- `{ type: 'deal', playerId }` — streamer dispara el reparto (post-reserve).
- `{ type: 'play-card', playerId, cardId }` — jugador digital o streamer juega una carta.
- `{ type: 'communicate', playerId, cardId, position: 'highest' | 'only' | 'lowest' }` — jugador comunica.
- `{ type: 'confirm-trick', playerId }` — cierra la baza (auto o manual).
- `{ type: 'declare-end', playerId, result: 'won' | 'lost' }` — streamer declara fin de partida.

### 5.2 Cartas (data)

Cada juego trae su propio catálogo de cartas como data (no como assets). Para The Crew:

```js
// server/services/games/the-crew/cards.js
export const CARDS = [
  ...['pink', 'yellow', 'green', 'blue'].flatMap(suit =>
    [1,2,3,4,5,6,7,8,9].map(rank => ({ id: `${suit}-${rank}`, suit, rank }))
  ),
  ...[1,2,3,4].map(rank => ({ id: `rocket-${rank}`, suit: 'rocket', rank })),
];
```

## 6. Vistas y roles

### 6.1 Vista del streamer (`/canal/<slug>/session/<id>`)

Panel de operador. Muestra: mano privada (si tiene), estado del juego completo, cola de espera, botones de "buscar carta rápido" (busqueda fuzzy sobre el catálogo), botón "confirmar mi jugada", historial de bazas, log de eventos con `version` visible para debug. Es la única vista que puede tomar acciones administrativas: kickear un digital, pausar la partida, declarar fin.

### 6.2 Vista del jugador digital (`/canal/<slug>/session/<id>`, autenticado como digital)

Mobile-first. Muestra: su mano privada (grande, tocable), acciones disponibles según turno (jugar carta, comunicar, pasar), estado público (baza en curso, palo obligado, comandante), timer del turno, chat de sesión con los otros digitals + streamer (opcional, off por default en MVP).

### 6.3 Vista del spectator / OBS overlay (`/canal/<slug>/session/<id>/overlay`)

Forced-dark, dimensiones fijas 1920×1080, sin nav ni sidebar. Muestra: baza en curso (grande), manos-boca-abajo de cada jugador digital (para que se vea que están jugando), tokens de comunicación de cada jugador, comandante, indicador de turno, últimas bazas ganadas. Sin controles. Sirve como browser source de OBS. Un `?transparent=1` en la URL hace fondo transparente.

## 7. Sistema de asientos

La cola es persistente (Mongo). Cuando el streamer abre una partida de N asientos:

1. Selección: se toma el top-N por `karma` de `SeatQueue.status = 'waiting'` para el canal. Ties se resuelven por `requestedAt` (más antiguo primero).
2. Notificación: cada seleccionado recibe evento `seat:offered` en su socket privado; tiene 30 s para confirmar (`seat:accept`) o declinar.
3. Reasignación: si un seleccionado no confirma en 30s, se lo saltea (karma baja algo) y entra el siguiente.
4. Partida arranca cuando N asientos están confirmados.
5. Post-partida: los que jugaron reciben `karma -= 1` (o similar); los que quedaron en cola reciben `karma += 0.1`. El streamer puede hacer overrides (kick, primera-línea manual).

Fórmula de `karma`: linear por default, ajustable en la config del canal en F5.

## 8. Clasificación de estado (RTK vs TanStack Query)

### 8.1 Redux Toolkit (client state)

- `authSlice` — `{ token, user, viewAsUser }` (patrón turnocero).
- `themeSlice`, `languageSlice`, `preferencesSlice` — persisten a `localStorage`.
- `sessionSlice` — **estado en vivo de la sesión activa**: `sessionId`, `version`, `phase`, `publicState`, `privateState`, `optimisticActions` (acciones en flight). Alimentado por los listeners de Socket.IO (no por queries). Se resetea al salir de la sesión.
- `seatQueueSlice` — la cola desde la perspectiva del streamer.

### 8.2 TanStack Query (server state)

- `queries/sessions.js` — listado de sesiones históricas del canal, detalle inicial de una sesión al entrar (después el socket toma el mando).
- `queries/channels.js` — info del canal.
- `queries/games.js` — catálogo de juegos habilitados (data estática).
- `queries/auth.js` — `me`, `login`, `register`.

Query keys exportadas por dominio (`sessionKeys.all` / `.list()` / `.detail(id)`), como en turnocero.

## 9. Estructura del monorepo

```
streamergames/
├─ CONSTITUTION.md
├─ README.md
├─ package.json                    # scripts raíz (install:all, dev, test)
├─ docs/
│  ├─ architecture.md               # este archivo
│  └─ roadmap.md
├─ plans/                           # planes por feature (uno por PR grande)
├─ server/
│  ├─ app.js                        # Express app builder (sin DB, sin Socket.IO)
│  ├─ server.js                     # boot: connect DB, start Socket.IO, listen
│  ├─ config/                       # db.js, cors.js, env.js
│  ├─ middleware/                   # asyncHandler, errorHandler, protect, validateObjectId, requireSection
│  ├─ models/                       # Channel, Session, User, SeatQueue
│  ├─ routes/                       # thin HTTP plumbing
│  ├─ services/                     # business logic
│  │  ├─ games/
│  │  │  ├─ registry.js
│  │  │  └─ the-crew/               # módulo del juego (rules.js, cards.js, index.js)
│  │  ├─ sessionAccess.js           # qué rooms le corresponden a cada socket
│  │  └─ seatQueue.js               # lógica de la cola
│  ├─ utils/                        # httpError, asyncHandler, emitSessionEvent, tokenFreshness
│  ├─ i18n/                         # server-side i18n setup + resources
│  ├─ tests/
│  │  ├─ setup.js                   # mongodb-memory-server
│  │  ├─ helpers/                   # auth, factories
│  │  ├─ mocks/                     # cloudinary stub, email stub
│  │  ├─ unit/                      # utils, services (con foco en motor de juegos)
│  │  └─ integration/               # supertest sobre app.js
│  └─ package.json
└─ client/
   ├─ src/
   │  ├─ App.jsx
   │  ├─ main.jsx
   │  ├─ index.css                  # tokens de tema, breakpoints
   │  ├─ breakpoints.css
   │  ├─ api/endpoints.js
   │  ├─ components/
   │  │  ├─ layout/                 # Sidebar, Navbar, BottomNav, SplashScreen
   │  │  ├─ shared/                 # Avatar, BackButton, Modal, EmptyState, Card
   │  │  └─ game/                   # Hand, Trick, CommunicationBadge, TrickHistory
   │  ├─ context/                   # AuthContext (RTK-backed), SiteConfigContext
   │  ├─ hooks/                     # useDebouncedValue, useSocket, useSession
   │  ├─ i18n/                      # setup + resources/es|en/*.json + parity.test.js
   │  ├─ pages/
   │  │  ├─ auth/                   # Login, Register, VerifyEmail
   │  │  ├─ streamer/               # StreamerDashboard, SessionOperator, SeatQueueManager
   │  │  ├─ player/                 # PlayerHand, PlayerLobby
   │  │  └─ overlay/                # OverlaySession (forced-dark, 1920x1080)
   │  ├─ queries/                   # sessions.js, channels.js, games.js, auth.js
   │  ├─ store/
   │  │  ├─ store.js
   │  │  ├─ hooks.js
   │  │  └─ slices/                 # authSlice, sessionSlice, seatQueueSlice, themeSlice, languageSlice
   │  ├─ test/                      # setup, MSW server, wrappers
   │  └─ utils/                     # locale.js, socket helpers
   ├─ public/
   ├─ index.html
   ├─ vite.config.js
   └─ package.json
```

## 10. Rutas del cliente

Slugs en español (regla de Constitution §1). Rutas propuestas:

- `/` — landing público del canal (F5: multi-canal listing; F1: redirect a la sesión activa del único canal).
- `/canal/<slug>` — landing del canal, muestra "hay partida activa" o "próxima partida".
- `/canal/<slug>/entrar` — form de digital player: nickname + entrar a la cola.
- `/canal/<slug>/sesion/<id>` — vista dependiendo del rol (streamer / digital / spectator, decidida server-side).
- `/canal/<slug>/sesion/<id>/overlay` — vista OBS.
- `/canal/<slug>/gestion` — panel del streamer (crear sesión, gestionar cola, config).
- `/login`, `/register`, `/verificar-email` — auth local del streamer.

## 11. Testing

Igual que turnocero: **Vitest en ambos workspaces + supertest + mongodb-memory-server (server integration) + @testing-library/react + jsdom + MSW (client component tests)**.

**Foco especial**: el motor de juegos es lo más test-intensive del proyecto. Cada regla de The Crew tiene un unit test puro contra `validateAction`/`applyAction`. Los tests de socket.io flow (integración) verifican que `viewFor` filtra estado privado correctamente — este es el bug más crítico posible.

## 12. Deployment (fase futura, F4+)

Al principio se corre local (streamer arranca `npm run dev` antes del stream). Para F4:

- **Frontend**: Vercel (mismo pattern que turnocero).
- **Backend**: Railway o Fly.io — necesita WebSockets estables.
- **Mongo**: MongoDB Atlas free tier.
- **OBS overlay**: URL pública del deploy.

CORS y CSP se configuran para permitir el subdomain wildcard `*.streamergames.com` (F5, multi-tenant).

---

## Apéndice A — The Crew: reglas relevantes para el MVP

**Componentes:** 40 cartas de juego (números 1-9 en 4 palos de color: pink, yellow, green, blue; más los 4 cohetes trump, números 1-4). Tokens de comunicación físicos (uno por jugador) — en la app son un booleano `hasCommunicationToken` por jugador.

**Setup por misión:**
- Se reparten las 40 cartas equitativamente entre los jugadores. Con 3 jugadores: uno recibe 14, dos reciben 13 (el 14 se rota por misión). Con 4: 10 cada uno. Con 5: 8 cada uno.
- El jugador que tiene el `rocket-4` es el comandante de la misión.
- Las task cards y misiones son **fuera de alcance de la app** — el streamer las gestiona físicamente en cámara.

**Turno:**
- El comandante lidera la primera baza. El líder juega cualquier carta.
- Los demás juegan siguiendo el palo si tienen; si no, cualquiera (trump o descarte).
- Gana la baza el rocket más alto si hay al menos uno; si no, el número más alto del palo liderado.
- El ganador de la baza lidera la siguiente.

**Comunicación:**
- Cada jugador tiene 1 token de comunicación por misión.
- Puede usarlo antes de que sea su turno de jugar, para poner el token sobre una carta de su mano indicando si es "la más alta", "la única" o "la más baja" de su palo.
- Solo se puede comunicar una carta que cumpla la condición (nunca los cohetes / trump).
- La comunicación es pública: aparece en el overlay y en las vistas de los otros jugadores.
- Un jugador que ya usó su token no puede comunicar de nuevo hasta la próxima misión (siguiente sesión).

**Final de partida:**
- El streamer declara ganada o perdida la misión (fuera de alcance de la app).
- La app cierra la sesión y archiva `gameState`.

**Acciones de la app (mapeo a §5.1):**
- `reserve-hand` — solo streamer, en fase `lobby`. Marca las cartas que va a jugar físicamente.
- `deal` — solo streamer, cuando terminó de reservar. Reparte al resto.
- `play-card` — cualquier jugador en su turno. Valida must-follow-suit.
- `communicate` — cualquier jugador antes de que sea su turno, si aún no usó el token. Valida la condición declarada.
- `confirm-trick` — el server auto-cierra cuando todos jugaron; el streamer puede forzar cierre.
- `declare-end` — solo streamer, en cualquier momento post-setup. `result` es libre-form: la app no computa victoria.
