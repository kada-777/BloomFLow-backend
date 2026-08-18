function notFound(req, res) {
  res.status(404).json({
    success: false,
    code: "ROUTE_NOT_FOUND",
    message: "Route not found",
  });
}

function errorHandler(error, req, res, next) {
  console.error(error);

  if (error.statusCode) {
    return res.status(error.statusCode).json({
      success: false,
      code: error.code ?? (error.statusCode === 404 ? "RESOURCE_NOT_FOUND" : "REQUEST_ERROR"),
      message: error.message,
      ...(error.errors ? { errors: error.errors } : {}),
    });
  }

  res.status(500).json({
    success: false,
    code: "INTERNAL_SERVER_ERROR",
    message: "Internal server error",
  });
}

module.exports = { notFound, errorHandler };
