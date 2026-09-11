# Smoke test manual F2 — cola + multiplayer

Extensión del smoke F1: valida el flow de la SeatQueue con tres digitales
usando la ruta `/canal/<slug>`, invitación por parte del streamer, aceptación,
y una partida completa a 4 jugadores (streamer + 3 digitales). También toca
el resync por version-gap.

Los tests automáticos (server + client ~230+90 verdes) cubren cada pieza en
aislado. Este smoke agrega los eventos reales por socket, dos + pestañas
hablándose entre sí, y la UX de la cola.

## Prerequisitos

Mismos que F1:
- MongoDB en `mongodb://localhost:27017` (Docker: `docker run -d --name mongo-streamergames -p 27017:27017 mongo:7`).
- `server/.env` con `MONGODB_URI`, `JWT_SECRET`, `PORT=4000`, `CORS_ORIGIN=http://localhost:3000`.
- `npm run dev` en la raíz.

Vas a necesitar **cuatro pestañas** (o dos navegadores + dos incógnitos —
lo que sea que no comparta localStorage entre pestañas de digitales):

- Pestaña A → streamer (tu cuenta claudio@test.com de F1 si sigue viva).
- Pestaña B → digital 1 (Ana).
- Pestaña C → digital 2 (Bea).
- Pestaña D → digital 3 (Cato) — opcional para probar el hacer cola.

---

## Parte 1 — Streamer se loguea + crea sesión

**Pestaña A**: http://localhost:3000/

1. Loguearte (o registrarte si es una DB fresca — ver F1).
2. Dashboard muestra "Hola, Claudio" y "Tu canal: claudio".
3. Si hay sesión activa de F1: click "Cancelar y empezar una nueva".
4. Sino: click "Crear una nueva sesión".
5. ✅ Aparece el operator panel con el seat 0 (streamer) y el **QueuePanel abajo**, vacío ("No hay nadie en la cola todavía.").

Dejá la pestaña abierta acá.

---

## Parte 2 — Digitales entran a la cola

**Pestaña B** (incógnito): http://localhost:3000/canal/claudio

1. ✅ Título "Canal de claudio", form de nickname.
2. Nickname: `Ana` → "Entrar a la cola".
3. ✅ Tarjeta con "Estás como Ana", "Estás en la posición 1", "Te avisamos apenas te toque."
4. **Verificá en Pestaña A**: el QueuePanel debería mostrar "Ana · karma 0.0 · esperando" **sin recargar** (esto valida el socket `seat-queue:updated`).

**Pestaña C** (incógnito): http://localhost:3000/canal/claudio

1. Nickname: `Bea` → "Entrar a la cola".
2. ✅ "Estás en la posición 2".
3. **Verificá en Pestaña A**: aparece Bea abajo de Ana, sin recargar.

**Pestaña D** (incógnito): http://localhost:3000/canal/claudio

1. Nickname: `Cato` → "Entrar a la cola".
2. ✅ "Estás en la posición 3".
3. **Verificá en Pestaña A**: Cato aparece en tercer lugar.

---

## Parte 3 — Streamer invita a los tres

**Pestaña A**.

1. Click "Invitar" en la fila de Ana.
2. ✅ La fila de Ana pasa a fondo ámbar y estado "invitado".
3. **Verificá en Pestaña B**: la tarjeta de Ana instantáneamente muestra "¡El streamer te invitó! Confirmá para sentarte." con botón "Aceptar asiento". Esto valida el socket `seat:offered` (sin polling).
4. Repetí para Bea (Pestaña C) y Cato (Pestaña D).
5. ✅ Todos ven la invitación al toque.

**Regla de negocio**: The Crew soporta hasta 5 jugadores. Con streamer + 3 digitales estamos en 4 — está OK.

---

## Parte 4 — Digitales aceptan

**Pestaña B** (Ana): click "Aceptar asiento".

1. ✅ Navega a `/sesion/<id>`, muestra "Esperando que arranque la partida" con los seats: Claudio (streamer) + Ana (digital).
2. **Verificá en Pestaña A**: Ana aparece en la lista de seats del operator panel, y su fila en el QueuePanel pasa a "sentado" (opacity 0.55).

**Pestaña C** (Bea): "Aceptar asiento" → ✅ mismo, Bea se une.

**Pestaña D** (Cato): "Aceptar asiento" → ✅ mismo, Cato se une.

**Verificá en Pestaña A**: el botón "Iniciar partida" debería estar habilitado (>= 3 jugadores, tenemos 4).

---

## Parte 5 — Iniciar y jugar una mano

**Pestaña A**: click "Iniciar partida".

1. ✅ Panel de reserva aparece con el picker de 40 cartas + 4 rockets.
2. Elegí 14 cartas específicas de tu mano física.
3. Click confirmar reserva.
4. ✅ El sistema reparte el resto entre los digitales. Cada uno debería recibir ~9 cartas (26 / 3).
5. Verificá en Pestañas B, C, D que cada uno vea su mano privada. **Ninguno debería ver las cartas de los otros** — esto valida la separación de rooms + viewFor.

Jugá una baza:
1. Streamer juega primera carta (elige del picker).
2. ✅ Aparece en el trick, se propaga a las 4 pestañas.
3. Cada digital, cuando le toca, juega respetando must-follow-suit.
4. ✅ La baza se completa, aparece el botón "cerrar baza" en el operator panel.
5. Click "cerrar baza" → ✅ historial de bazas se incrementa.

---

## Parte 6 — Bonus: expulsar y salir

**Pestaña A**: mientras la partida está corriendo o en lobby, probar:
1. Con Cato en la cola (antes de aceptar), click "Expulsar".
2. ✅ Cato en Pestaña D pierde su tarjeta y vuelve al form de nickname.

O al revés: en Pestaña D, click "Salir de la cola" antes de aceptar.
1. ✅ Vuelve al form. En Pestaña A el QueuePanel lo pierde de la lista.

---

## Parte 7 — Bonus: version-gap resync

Difícil de reproducir con las manos. Rápidos test:
1. **Cerrar y reabrir Pestaña B mientras la partida corre**: al reconectar,
   la app pide bootstrap y debería mostrar el estado correcto sin refresh
   manual. (Esto no dispara el resync-request; usa el session:state del join.)
2. **Interrumpir la red brevemente**: DevTools → Network → "Offline" por
   3 segundos, después "Online". El socket reconecta y hace session:join.
   Deberían llegar los eventos que perdió como parte del session:state.

Si algo se ve raro después de una reconexión, chequeá la consola por
`session:resync-request` (deberías ver el emit) y `session:state` de
respuesta con `resync: true`.

---

## Qué anotar

- Textos en inglés (todos los strings van por i18n; default español).
- QueuePanel no se actualiza al toque cuando alguien entra / es invitado
  → problema del socket de cola (F2c.3).
- Alguna pestaña muestra vista de espectador cuando no debería
  → problema del session:you-are al streamer (F1) o del resync (F2d).
- Puede aceptar dos veces la misma invitación (idempotencia rota).
- Error 409 al crear sesión con la cola aún abierta con seats sentados.

Cuando termines, contame qué salió mal (si algo) y lo pulimos antes de F3.
