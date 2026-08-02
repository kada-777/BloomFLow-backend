const app = require("./app");
const { port } = require("./config/env");

app.listen(port, () => {
  console.log(`Server berjalan di http://localhost:${port}`);
});
