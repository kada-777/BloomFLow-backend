function notFound(req, res) {
  res.status(404).json({
    success: false,
    message: "Route not found",
  });
}

function errorHandler(error, req, res, next) {
  console.error(error);

  if (error.statusCode) {
    return res.status(error.statusCode).json({
      success: false,
      message: error.message,
      ...(error.errors ? { errors: error.errors } : {}),
    });
  }

  res.status(500).json({
    success: false,
    message: "Internal server error",
  });
}

module.exports = { notFound, errorHandler };
