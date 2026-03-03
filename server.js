require("dotenv").config();
const express = require("express");
const axios = require("axios");
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT || 3000);

// 🔥 Servir imágenes desde /public
app.use("/images", express.static(path.join(__dirname, "public")));

// Test básico
app.get("/", (req, res) => {
  res.status(200).send("API Quillotana OK");
});

app.get("/test", (req, res) => {
  res.json({ message: "API funcionando correctamente" });
});

// ===============================
// 🔥 CONFIGURACIÓN BSALE
// ===============================
const BSALE_TOKEN = process.env.BSALE_TOKEN;
const OFFICE_ID = 1; // 👈 solo esta sucursal

const headers = {
  access_token: BSALE_TOKEN,
};

// ===============================
// 🔥 ENDPOINT CATALOGO
// ===============================
app.get("/catalogo", async (req, res) => {
  try {
    let offset = 0;
    const limit = 50;
    let totalVariantes = 0;

    while (true) {
      const stockResponse = await axios.get(
        `https://api.bsale.io/v1/stocks.json?officeid=${OFFICE_ID}&limit=${limit}&offset=${offset}`,
        { headers }
      );

      const stocks = stockResponse.data.items;

      if (!stocks || stocks.length === 0) break;

      stocks.forEach((stock) => {
        if (stock.quantityAvailable > 0) {
          totalVariantes++;
        }
      });

      offset += limit;
    }

    res.json({
      generando: false,
      officeId: OFFICE_ID,
      total_variantes_con_stock: totalVariantes,
      ultimaActualizacion: new Date().toISOString(),
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Error generando catálogo" });
  }
});

// ===============================

app.listen(PORT, "0.0.0.0", () => {
  console.log(`API corriendo en puerto ${PORT}`);
});
