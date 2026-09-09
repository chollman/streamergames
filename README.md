# StreamerGames

Aplicación web para streamers de juegos de mesa en Twitch. Permite que espectadores del chat se conviertan en jugadores de la partida, jugando desde su celular o PC mientras el streamer maneja los componentes físicos en cámara.

## Estado del proyecto

**Fase 0** — scaffolding y documentación. Sin código funcional aún; ver `docs/roadmap.md` para el plan por fases.

## Estructura del monorepo

- `client/` — React 18 + Vite (PWA)
- `server/` — Express + Mongoose + Socket.IO
- `docs/` — arquitectura y roadmap
- `CONSTITUTION.md` — reglas no negociables

## Empezar

```bash
npm run install:all    # Instala deps de server y client
npm run dev            # Levanta ambos servidores (backend :4000, frontend :3000)
```

## Convenciones

Se comparten con [`turnocero`](https://github.com/chollman/turnocero) — mismo stack, mismos patrones. Ver `CONSTITUTION.md` para la lista completa. Puntos clave:

- Tests con cada cambio (client y server, mismo commit).
- i18n obligatorio: todas las strings visibles pasan por claves `es` y `en`.
- Redux Toolkit para client state, TanStack Query para server state. Sin RTK Query.
- El backend es única fuente de verdad para el estado de partida. Toda acción se valida server-side.
- Estado privado nunca se emite por canal público — cada jugador digital tiene un room propio.

## Primer juego soportado

**The Crew** (cooperativo, trick-taking, 40 cartas). Ver `docs/roadmap.md` para el plan de fases.
