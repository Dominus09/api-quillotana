require("dotenv").config();
const express = require("express");
const axios = require("axios");
const path = require("path");
const cors = require('cors')

const app = express();
app.use(cors())
const PORT = Number(process.env.PORT || 3000);

// =============================
// 🔥 SERVIR IMÁGENES
// =============================
app.use("/images", express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.send("API Quillotana OK");
});

app.get("/test", (req, res) => {
  res.json({ status: "API funcionando" });
});

// =============================
// 🔥 CONFIG BSALE
// =============================
const BSALE_TOKEN = process.env.BSALE_TOKEN;
const OFFICE_ID = 1;

const headers = {
  access_token: BSALE_TOKEN,
};

// =============================
// 🔥 ENDPOINT CATALOGO
// =============================
app.get("/catalogo", async (req, res) => {
  try {
    let offset = 0;
    const limit = 50;

    const productos = [];
    const variantesProcesadas = new Set();

    while (true) {
      const stockResponse = await axios.get(
        `https://api.bsale.io/v1/stocks.json?officeid=${OFFICE_ID}&limit=${limit}&offset=${offset}`,
        { headers }
      );

      const stocks = stockResponse.data.items;
      if (!stocks || stocks.length === 0) break;

      for (const stock of stocks) {
        if (stock.quantityAvailable <= 0) continue;

        const variantId = stock.variant.id;

        if (variantesProcesadas.has(variantId)) continue;
        variantesProcesadas.add(variantId);

        // 🔹 VARIANTE
        const variantResponse = await axios.get(
          `https://api.bsale.io/v1/variants/${variantId}.json`,
          { headers }
        );

        const variant = variantResponse.data;

        // 🔹 PRODUCTO
        const productResponse = await axios.get(
          `https://api.bsale.io/v1/products/${variant.product.id}.json`,
          { headers }
        );

        const product = productResponse.data;

        // 🔹 TIPO PRODUCTO
        const productTypeResponse = await axios.get(
          `https://api.bsale.io/v1/product_types/${product.product_type.id}.json`,
          { headers }
        );

        const productType = productTypeResponse.data;

        const barcode = variant.barCode || variant.code || null;

        productos.push({
          productId: product.id,
          name: product.name,
          variant: variant.description || null,
          barcode: barcode,
          stock: stock.quantityAvailable,
          category: productType.name,
          image: barcode
            ? `https://api.quillotana.cl/images/${barcode}.webp`
            : null,
        });
      }

      offset += limit;
    }

    res.json({
      total: productos.length,
      officeId: OFFICE_ID,
      ultimaActualizacion: new Date().toISOString(),
      productos,
    });

  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Error generando catálogo" });
  }
});

// =============================

app.listen(PORT, "0.0.0.0", () => {
  console.log(`API corriendo en puerto ${PORT}`);
});
