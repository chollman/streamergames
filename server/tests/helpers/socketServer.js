const http = require("http");
const { Server } = require("socket.io");
const app = require("../../app");
const { registerSocketHandlers } = require("../../services/sockets");

// Boot the Express + Socket.IO stack on an ephemeral port for a test.
// Every call returns a fresh server so tests don't share rooms.
async function startTestServer() {
  const httpServer = http.createServer(app);
  const io = new Server(httpServer, {
    // In test the client connects over WS to localhost — CORS is moot.
    cors: { origin: "*" },
  });
  registerSocketHandlers(io);
  app.set("io", io);
  await new Promise((resolve) => httpServer.listen(0, resolve));
  const { port } = httpServer.address();

  const url = `http://localhost:${port}`;

  async function close() {
    await new Promise((resolve) => io.close(() => resolve()));
    await new Promise((resolve) => httpServer.close(() => resolve()));
  }

  return { httpServer, io, port, url, close };
}

// Wait for a socket event with a bounded timeout.
function once(socket, event, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeout);
    socket.once(event, (data) => {
      clearTimeout(t);
      resolve(data);
    });
  });
}

// Collect all events of a given name until an explicit stop.
function collect(socket, event) {
  const items = [];
  const handler = (data) => items.push(data);
  socket.on(event, handler);
  return {
    items,
    stop() {
      socket.off(event, handler);
    },
  };
}

module.exports = { startTestServer, once, collect };
