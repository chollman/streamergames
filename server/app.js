const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const i18n = require("./i18n");
const { corsOptions } = require("./config/cors");
const errorHandler = require("./middleware/errorHandler");

const app = express();

app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: "1mb" }));

// i18n: parses Accept-Language and attaches req.t / req.language to every
// route. Fallback is "es" (Constitution §2).
app.use(i18n.handler);

// Routes
app.use("/api", require("./routes"));

// Error middleware — must be last.
app.use(errorHandler);

module.exports = app;
