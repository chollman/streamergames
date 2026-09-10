# Smoke test manual F1 — desde el navegador

Este walkthrough valida el MVP de The Crew end-to-end en la UI real: streamer + un digital player, jugando una baza.

Los tests automáticos (~155 server + ~82 client) ya cubren cada pieza en aislado. Este smoke agrega lo único que no tienen: el flow completo con Mongo real, socket real, y dos pestañas de navegador hablándose entre sí.

## Prerequisitos

- MongoDB corriendo en `mongodb://localhost:27017`. Si tenés Docker:
  ```bash
  docker run -d --name mongo-streamergames -p 27017:27017 mongo:7
  ```
- `server/.env` creado con `MONGODB_URI`, `JWT_SECRET`, `PORT=4000`, `CORS_ORIGIN=http://localhost:3000`.
- `client/.env` con `VITE_API_URL=http://localhost:4000` si hace falta.

## Arrancar todo

```bash
npm run dev
```

Levanta server (`:4000`) y client (`:3000`) en paralelo. Dejalo corriendo.

Vas a necesitar **dos pestañas** (idealmente una en incógnito para no compartir localStorage):

- Pestaña A → streamer
- Pestaña B → digital player

---

## Parte 1 — Streamer: registro y creación de sesión

**Pestaña A**: http://localhost:3000/

1. **Registrar**
   - `Registrarme` → email `claudio@test.com`, password `supersecret`, nombre `Claudio`.
   - ✅ Aparece pantalla de verificación.
   - En la terminal del server: `[email] verification code for claudio@test.com: 123456`. Copiar.

2. **Verificar**
   - Pegar código.
   - ✅ Entra al dashboard con "Hola, Claudio" y "Tu canal: claudio".

3. **Dashboard sin sesión activa**
   - ✅ Botón "Crear una nueva sesión" visible; NO aparece la tarjeta ámbar.

4. **Crear sesión**
   - Click.
   - ✅ Navega a `/sesion/<id>`, título "Panel de operador".
   - Click en botón de **copiar link de invitación**. Copia algo como `http://localhost:3000/entrar/<sessionId>`.

5. **Verificar guard**
   - Volver a `/`.
   - ✅ Ahora aparece la tarjeta ámbar "Sesión activa" con "Continuar" y "Cancelar y empezar una nueva".
   - Click "Continuar" → vuelve a la misma sesión.

---

## Parte 2 — Digital player: unirse

**Pestaña B** (incógnito), pegar el link de invitación.

1. ✅ Título "Unirte a la partida", input de nickname.
2. Nickname: `Ana` → "Entrar".
3. ✅ Navega a `/sesion/<id>`, "Esperando que arranque la partida" con Claudio + Ana.
4. **Verificar en pestaña A**: Ana debe aparecer en el panel de operador **sin recargar** (esto valida el socket).

---

## Parte 3 — Iniciar partida

**Pestaña A**.

1. Con 2 jugadores debería aparecer el botón de iniciar. Click.
2. ✅ Sesión pasa a `in_progress`, aparece panel de reserva.
3. **Reserva del streamer**: seleccionar 14 cartas específicas del picker (las que el streamer se queda físicamente).
4. ✅ El sistema reparte el resto entre digitales. Ana recibe su mano.

---

## Parte 4 — Jugar una baza

1. **Streamer juega primera carta** → aparece en el trick, Ana ve el update.
2. **Ana juega** (respetando must-follow-suit) → aparece en el trick, streamer ve el update.
3. ✅ Sistema resuelve ganador, historial de bazas incrementa.

---

## Parte 5 — Overlay

**Tercera pestaña**: http://localhost:3000/sesion/<sessionId>/overlay

1. ✅ Fondo oscuro (data-theme=dark forzado), jugadores + baza + contador.
2. ✅ Al jugar otra carta, se actualiza sin recargar.

---

## Parte 6 — Bulk-abandon

**Pestaña A**, ir a `/`.

1. Click "Cancelar y empezar una nueva".
2. ✅ Sesión anterior queda abandonada, crea una nueva.
3. ✅ NO aparece "channel already has an active session".

---

## Qué anotar

- Textos en inglés (todos los strings van por i18n; default español).
- Botones que no responden.
- Desincronización entre pestañas.
- Errores en consola (F12).
- Mensajes de error confusos.

Cuando termines, decime qué salió mal (si algo) y lo pulimos antes de F2.
