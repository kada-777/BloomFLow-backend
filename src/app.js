const express = require("express");
const cors = require("cors");
const routes = require("./routes");
const prisma = require("./lib/prisma");
const { notFound, errorHandler } = require("./middlewares/error.middleware");

const app = express();

app.use(cors());
app.use(express.json());

app.use(routes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
