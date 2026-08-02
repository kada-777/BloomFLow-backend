function notFound(req, res) {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
}

function errorHandler(error, req, res, next) {
  console.error(error);

  res.status(500).json({
    success: false,
    message: "Internal server error",
  });
}

module.exports = { notFound, errorHandler };
