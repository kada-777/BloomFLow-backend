require("dotenv/config");

const express = require("express");
const cors = require("cors");
const routes = require("./routes");
const { notFound, errorHandler } = require("./middlewares/error.middleware");

const app = express();

app.use(
  cors({
    origin(origin, callback) {
      callback(null, origin === process.env.FRONTEND_URL);
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());

app.use(routes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
