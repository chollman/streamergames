const http = require("http");
const { Server } = require("socket.io");
const app = require("./app");
const { connectDB } = require("./config/db");
const { PORT, CORS_ORIGIN } = require("./config/env");
const { registerSocketHandlers } = require("./services/sockets");

async function boot() {
  await connectDB();

  const httpServer = http.createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: CORS_ORIGIN, credentials: true },
  });

  // Attach io to app so routes can access it via req.app.get("io") and
  // submit through the same emitSessionEvent envelope contract.
  app.set("io", io);

  // Handshake auth + session:join / session:leave handlers.
  // Constitution §6: registered synchronously before any await inside
  // connection.
  registerSocketHandlers(io);

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
