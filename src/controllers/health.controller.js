function getHome(req, res) {
  res.json({
    success: true,
    message: "BloomFlow API is running",
  });
}

module.exports = { getHome };
