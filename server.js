require("dotenv").config();
const express = require("express");
const axios = require("axios");

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.get("/", (req, res) => res.status(200).send("ok"));
app.get("/test", (req, res) => res.json({ message: "API funcionando" }));

app.get("/debug-variant", async (req, res) => {
  try {
    const response = await axios.get(
      "https://api.bsale.io/v1/variants.json?limit=1&offset=0",
      {
        headers: {
          access_token: process.env.BSALE_TOKEN,
        },
      }
    );

    res.json(response.data.items[0]);
  } catch (error) {
    res.status(500).json({ error: "Error debug", detail: error.message });
  }
});

app.get("/debug-stock", async (req, res) => {
  try {
    const response = await axios.get(
      "https://api.bsale.io/v1/stocks.json?limit=1&offset=0",
      {
        headers: {
          access_token: process.env.BSALE_TOKEN,
        },
      }
    );

    res.json(response.data.items[0]);
  } catch (error) {
    res.status(500).json({ error: "Error stock debug", detail: error.message });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`API corriendo en puerto ${PORT}`);
});
