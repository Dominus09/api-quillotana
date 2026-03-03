require("dotenv").config();
const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/test", (req, res) => {
  res.json({ message: "API funcionando" });
});

app.get("/productos", async (req, res) => {
  try {
    const response = await axios.get(
      "https://api.bsale.io/v1/products.json?limit=50",
      {
        headers: {
          access_token: process.env.BSALE_TOKEN,
        },
      }
    );

    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: "Error consultando Bsale" });
  }
});

app.listen(PORT, () => {
  console.log(`API corriendo en puerto ${PORT}`);
});
