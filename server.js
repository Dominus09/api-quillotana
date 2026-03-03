require("dotenv").config();
const express = require("express");

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.get("/", (req, res) => res.status(200).send("ok"));
app.get("/test", (req, res) => res.json({ message: "API funcionando" }));

app.listen(PORT, "0.0.0.0", () => {
  console.log(`API corriendo en puerto ${PORT}`);
});
