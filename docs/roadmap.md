# StreamerGames — Roadmap por fases

Fases pensadas para shippear valor incremental: cada una es demoable al aire. Los planes detallados de features grandes viven en `plans/<feature>.md`, uno por PR.

## F0 — Scaffolding y documentación

**Estado:** en curso.

- Monorepo iniciado (`client/`, `server/`, docs, Constitution).
- Git repo local, sin remote todavía (Claudio lo conecta a GitHub cuando quiera).
- Herramientas base: Vite + React 18, Express + Mongoose + Socket.IO, Vitest en ambos workspaces, ESLint compartido, i18n con `es`/`en`.
- Un test verde de cada lado (health check server + un render smoke test client).
- `emitSessionEvent` implementado con su unit test. Router placeholder + integración smoke test.
- README explica cómo levantar todo en local.

**Fin de fase:** `npm run install:all && npm run dev` levanta ambos servidores; `npm test` corre y pasa; el repo compila limpio.

## F1 — MVP The Crew: streamer + 1 digital player

**Objetivo:** poder jugar The Crew entre el streamer (jugador físico) y un solo jugador digital. Sin cola, sin overlay todavía; foco en el motor de juego y en la sincronización correcta.

Entregables:
- Auth local del streamer (registro + login + verificación email). Adaptar el flow de turnocero (mismo modelo `User`, misma emailLimiter).
- Guest access para el digital: nickname + `guestToken` en localStorage.
- Vista streamer con: mano privada, mazo restante (conteo), tabla de acción, historial de eventos.
- Vista digital con: mano privada, botón "jugar carta", botón "comunicar".
- Módulo `the-crew`: `setup`, `validateAction` (todas las acciones), `applyAction`, `viewFor`, `nextActor`. `isFinished` siempre devuelve false (el streamer declara fin).
- Socket flow completo: `session:join`, `session:state`, `session:action-accepted`, `session:hand-update`, `session:turn`, `session:trick-won`, `session:communication`, `session:finished`.
- Tests: unit tests puros del motor de juegos (todas las reglas), test de integración de un flow completo (setup → play trick → declare-end).

**Fin de fase:** el streamer y un digital juegan una partida completa de The Crew en local.

## F2 — Sistema de asientos + multiplayer real

**Objetivo:** 3-5 jugadores en simultáneo con cola de espera.

Entregables:
- Modelo `SeatQueue` + servicio `seatQueue` (agregar, seleccionar, kick, karma).
- Vista streamer con panel de cola: waiting list ordenada por karma, botones de override.
- Vista digital de espera: "estás en la cola, posición X". Notificación `seat:offered` cuando toca.
- Modelo `Session` con múltiples seats. `applyAction` maneja must-follow-suit en 3+ jugadores.
- Overlay OBS mínimo: baza en curso + jugadores presentes. Sin animaciones todavía.
- Reconciliación de version-gaps: `session:resync` + tests.
- Tests de socket-flow multi-cliente (integración con múltiples supertest sockets).

**Fin de fase:** una partida real con 3-5 jugadores + cola funcionando.

## F3 — Segundo juego (validación del motor genérico)

**Objetivo:** validar que la interface de módulo de juegos es realmente genérica agregando un juego con mecánica distinta.

Candidatos (elegir uno):
- **Coup** — bluffing + challenge, la validación server-side de bluff es interesante. Mecánica muy distinta a trick-taking.
- **Love Letter** — micro (16 cartas), turnos alternados, deducción. Muy simple, ideal para forzar la abstracción sin agregar complejidad de UI.
- **Hanabi** — cooperativo con información oculta invertida (ves las cartas de los otros pero no las tuyas). Requiere modelo de comunicación estructurada, extiende el patrón de The Crew.

**Fin de fase:** dos juegos coexisten en el registry. Cualquier feature nueva del core beneficia a ambos sin cambios en los módulos.

## F4 — Twitch OAuth + overlay pulido + streaming en vivo

**Objetivo:** hacer streams reales y públicos con la app.

Entregables:
- Twitch OAuth como provider adicional (login opcional). El scope pedido es mínimo (`user:read:email`). El linking preserva karma e historial del guest previo.
- Overlay OBS pulido: animaciones de baza, transición de turno, celebración de trick ganado.
- Deploy: frontend en Vercel, backend en Railway/Fly, Mongo Atlas. URL pública para overlay.
- Chat de sesión (in-app, opcional off por default): mensajes cortos entre jugadores digitales durante la partida.
- Analytics básicos por sesión: duración, número de bazas, jugadores participantes.

**Fin de fase:** Claudio hace un stream público real usando la app.

## F5 — Multi-tenant: otros streamers

**Objetivo:** la app ya no es de un streamer sino un producto.

Entregables:
- Onboarding de nuevos streamers: registro, `Channel` propio, slug, elección de skin (colores + logo).
- Panel admin global de StreamerGames: aprobar canales, ver métricas.
- CSS con `data-community` (o `data-channel`) selector para el reskin per-canal (pattern de turnocero Comunidades).
- Sanitización de skin tokens server-side.
- Landing página comercial explicando qué es y cómo unirse.
- Sistema de facturación / tiers (a definir).

**Fin de fase:** dos o tres streamers no-Claudio están usando la plataforma.

## F6 — Twitch Extension nativa

**Objetivo:** integración dentro del reproductor de Twitch. Los espectadores no salen a otra tab.

Entregables:
- Twitch Extension con panel debajo del video (registro + revisión de Twitch).
- Extension Backend Service (EBS) reusa las mismas APIs de StreamerGames vía autenticación de la Extension.
- La app web sigue funcionando como fallback y para el streamer.

**Fin de fase:** un espectador puede unirse a la partida sin abandonar el reproductor de Twitch.
