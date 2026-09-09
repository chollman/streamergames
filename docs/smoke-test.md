# Smoke test manual — backend

Este walkthrough valida end-to-end el backend contra MongoDB real (no memory-server), antes de invertir tiempo en construir el cliente. Cubre el flujo completo: registro → verificación → creación de sesión → guest joins → start → reserve/deal → aislamiento de vistas.

Los tests automáticos ya cubren cada paso en aislado (147 verdes en la suite). Este smoke agrega tres cosas que los tests no: (1) MongoDB real corriendo como servicio, (2) el server booteado con `npm run dev:server`, (3) requests reales contra la red local.

## Prerequisitos

1. **Node 20+** instalado.
2. **MongoDB** corriendo localmente en `mongodb://localhost:27017`. Si no lo tenés, la vía más rápida es Docker:
   ```bash
   docker run -d --name mongo-streamergames -p 27017:27017 mongo:7
   ```
3. **`server/.env`** creado (copiar desde `server/.env.example`):
   ```
   MONGODB_URI=mongodb://localhost:27017/streamergames
   JWT_SECRET=un-secreto-largo-cualquiera-solo-para-dev
   PORT=4000
   CORS_ORIGIN=http://localhost:3000
   ```
4. **`jq`** (opcional pero recomendado para formatear las respuestas JSON):
   - Windows con Git Bash: viene con Git for Windows moderno; si no, `winget install jqlang.jq`.
   - Alternativa sin jq: podés leer los JSON crudos, pero para copiar los ids es más cómodo con jq.

## Arrancar el server

En una terminal:

```bash
npm run dev:server
```

Esperado en la salida:

```
StreamerGames server listening on :4000
```

Dejalo corriendo. El resto del walkthrough va en otra terminal.

## 1. Health check

```bash
curl -s http://localhost:4000/api/health | jq
```

Esperado:

```json
{ "status": "ok", "service": "streamergames-server" }
```

## 2. Registrar streamer

```bash
curl -s -X POST http://localhost:4000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"claudio@example.com","password":"supersecret","displayName":"Claudio"}' | jq
```

Esperado:

```json
{
  "email": "claudio@example.com",
  "message": "Te enviamos un código de verificación",
  "devCode": "123456"
}
```

Anotá el `devCode`. En producción no se devuelve — solo llega al mail — pero en dev/test el server lo echoea para facilitar el flujo manual.

**En la terminal del server** también verás:
```
[email] verification code for claudio@example.com: 123456
```

## 3. Verificar email

Reemplazá `DEVCODE` con el código del paso anterior:

```bash
curl -s -X POST http://localhost:4000/api/auth/verify-email \
  -H "Content-Type: application/json" \
  -d '{"email":"claudio@example.com","code":"DEVCODE"}' | jq
```

Esperado:

```json
{
  "user": { "email": "claudio@example.com", "displayName": "Claudio", "emailVerified": true, ... },
  "token": "eyJhbGciOi...",
  "channel": { "slug": "claudio", "displayName": "Claudio", "enabledGames": ["the-crew"], ... }
}
```

**Anotá:**
- `token` → tu JWT de streamer (180 días).
- `channel.slug` → `claudio` (o `claudio-2` etc. si ya existía).

Para trabajar cómodo, exportá como variables de shell:

```bash
export STREAMER_TOKEN="eyJhbGciOi..."
export CHANNEL_SLUG="claudio"
```

## 4. Crear sesión

```bash
curl -s -X POST "http://localhost:4000/api/channels/$CHANNEL_SLUG/sessions" \
  -H "Authorization: Bearer $STREAMER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}' | jq
```

Esperado:

```json
{
  "session": {
    "_id": "652f...",
    "channel": "652f...",
    "gameId": "the-crew",
    "status": "lobby",
    "seats": [
      { "seatIndex": 0, "playerId": "streamer:652f...", "role": "streamer", "playerType": "physical", "nickname": "Claudio", ... }
    ],
    "version": 0,
    ...
  }
}
```

Anotá el `session._id`:

```bash
export SESSION_ID="652f..."
```

## 5. Guest 1 (Ana) se une

```bash
curl -s -X POST "http://localhost:4000/api/sessions/$SESSION_ID/join" \
  -H "Content-Type: application/json" \
  -d '{"nickname":"Ana"}' | jq
```

Esperado: session ahora con 2 seats; devuelve `seat` (con playerId de Ana) y `guestToken`.

```bash
export ANA_TOKEN="eyJhbGciOi..."
export ANA_PLAYER_ID="guest:abcdef..."
```

## 6. Guest 2 (Bea) se une

```bash
curl -s -X POST "http://localhost:4000/api/sessions/$SESSION_ID/join" \
  -H "Content-Type: application/json" \
  -d '{"nickname":"Bea"}' | jq

export BEA_TOKEN="eyJhbGciOi..."
export BEA_PLAYER_ID="guest:123456..."
```

## 7. Streamer inicia la partida

```bash
curl -s -X POST "http://localhost:4000/api/sessions/$SESSION_ID/start" \
  -H "Authorization: Bearer $STREAMER_TOKEN" | jq
```

Esperado: `session.status === "in_progress"`, `session.gameState.phase === "reserving"`, `session.gameState.players.length === 3`.

## 8. Streamer reserva su mano física

Con 3 jugadores el streamer (seat 0) recibe 14 cartas. Elegí cualesquiera 14 cartas válidas (formato `<suit>-<rank>`, donde `suit ∈ {pink,yellow,green,blue,rocket}` y `rank` en el rango correspondiente).

```bash
curl -s -X POST "http://localhost:4000/api/sessions/$SESSION_ID/actions" \
  -H "Authorization: Bearer $STREAMER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"reserve-hand","cardIds":["pink-1","pink-2","pink-3","pink-4","yellow-1","yellow-2","yellow-3","yellow-4","green-1","green-2","green-3","green-4","blue-1","blue-2"]}' | jq '.view'
```

Esperado: `view` del streamer con `reservedByStreamer` = las 14 cartas, y `players[0].hand` = mismas 14 cartas.

## 9. Deal (repartir a digitales)

```bash
curl -s -X POST "http://localhost:4000/api/sessions/$SESSION_ID/actions" \
  -H "Authorization: Bearer $STREAMER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"deal"}' | jq '.view'
```

Esperado: `view.phase === "trick"`, `commanderId` seteado (quien tenga `rocket-4`), `currentTurnId` = commander. Cada digital tiene 13 cartas, streamer tiene 14.

## 10. Verificación de aislamiento — la prueba crítica

Este es el chequeo por el que hicimos todo esto: la misma sesión, tres vistas distintas según quién pregunta.

**A. Como anónimo (spectator):**
```bash
curl -s "http://localhost:4000/api/sessions/$SESSION_ID" | jq '.view'
```

Debe cumplir:
- ❌ NO tiene `reservedByStreamer`.
- ❌ NO tiene `myHand`.
- ❌ Ningún `players[N]` tiene `hand`.
- ✅ Cada `players[N]` tiene `handSize`.
- ✅ Trick público visible.

**B. Como Ana (digital):**
```bash
curl -s "http://localhost:4000/api/sessions/$SESSION_ID" \
  -H "Authorization: Bearer $ANA_TOKEN" | jq '.view'
```

Debe cumplir:
- ✅ Tiene `myHand` con 13 cartas — LAS DE ANA.
- ❌ NO tiene `reservedByStreamer`.
- ❌ Ningún `players[N]` (incluida Bea) tiene `hand`.
- ✅ Cada `players[N]` tiene `handSize`.

**C. Como Bea (digital):**
```bash
curl -s "http://localhost:4000/api/sessions/$SESSION_ID" \
  -H "Authorization: Bearer $BEA_TOKEN" | jq '.view'
```

Debe cumplir análogamente:
- ✅ `myHand` con 13 cartas distintas de las de Ana (sin overlap).

**D. Como streamer:**
```bash
curl -s "http://localhost:4000/api/sessions/$SESSION_ID" \
  -H "Authorization: Bearer $STREAMER_TOKEN" | jq '.view'
```

Debe cumplir:
- ✅ `reservedByStreamer` con las 14 cartas.
- ✅ TODOS los `players[N]` tienen `hand` completa.

Si las cuatro respuestas cumplen sus contratos, la regla más crítica de la Constitution §6 (no leak de estado privado) está sostenida en el pipeline real, no solo en tests.

## 11. Jugar la primera carta (opcional)

Verificá quién juega primero:

```bash
curl -s "http://localhost:4000/api/sessions/$SESSION_ID" | jq '.view.currentTurnId'
```

Ese `playerId` es el comandante. Buscá cuál de las tres vistas privadas (streamer / Ana / Bea) contiene ese `playerId` y usá su token para jugar una carta de su mano.

Por ejemplo, si el comandante es el streamer:

```bash
curl -s -X POST "http://localhost:4000/api/sessions/$SESSION_ID/actions" \
  -H "Authorization: Bearer $STREAMER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"play-card","cardId":"blue-2"}' | jq
```

Esperado: 200 OK. La carta desaparece de su mano, `trick.ledSuit` se setea al suit jugado, `currentTurnId` avanza al siguiente jugador.

Si el jugador cuya mano estás mirando tiene el `rocket-4`, ese es el comandante. Si jugás con `blue-2` y no lo tenés en la mano, response va a ser 400 con `code: "invalid_action"`.

## 12. Cerrar

Cuando termines, parar el server con Ctrl+C. Los datos quedan en Mongo (colección `streamergames`). Para limpiar entre sesiones:

```bash
# Opción a: borrar toda la DB
mongosh streamergames --eval "db.dropDatabase()"

# Opción b: parar y borrar el container Docker
docker rm -f mongo-streamergames
```

## Resultado

Si los 10-12 pasos respondieron como esperábamos, el backend está listo para F1e (vistas del cliente). Cualquier discrepancia — response distinta, código de error inesperado, hand que no debería estar visible — es un bug que corregimos antes de tocar código de UI.
