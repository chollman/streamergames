const http = require("http");
const { Server } = require("socket.io");
const app = require("./app");
const { connectDB } = require("./config/db");
const { PORT, CORS_ORIGIN } = require("./config/env");

async function boot() {
  await connectDB();

  const httpServer = http.createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: CORS_ORIGIN, credentials: true },
  });

  // Attach io to app so routes can access it via req.app.get("io").
  app.set("io", io);

  io.on("connection", (socket) => {
    // Constitution §6: register socket.on(...) handlers BEFORE any await.
    socket.on("session:join", (payload) => {
      const { sessionId, role, playerId } = payload || {};
      if (!sessionId) return;
      socket.join(`session:${sessionId}`);
      if (role === "digital" && playerId) {
        socket.join(`session:${sessionId}:player:${playerId}`);
      }
    });

    socket.on("session:leave", (payload) => {
      const { sessionId, playerId } = payload || {};
      if (!sessionId) return;
      socket.leave(`session:${sessionId}`);
      if (playerId) socket.leave(`session:${sessionId}:player:${playerId}`);
    });
  });

  httpServer.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`StreamerGames server listening on :${PORT}`);
  });
}

boot().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Failed to boot server:", err);
  process.exit(1);
});
