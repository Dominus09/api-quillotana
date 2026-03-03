require("dotenv").config();
const express = require("express");
const axios = require("axios");

const app = express();
const PORT = Number(process.env.PORT || 3000);

const headers = {
  access_token: process.env.BSALE_TOKEN,
};

async function getAll(endpoint) {
  let all = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const response = await axios.get(
      `https://api.bsale.io/v1/${endpoint}.json?limit=${limit}&offset=${offset}`,
      { headers }
    );

    const items = response.data.items;
    if (!items || items.length === 0) break;

    all = all.concat(items);
    offset += limit;
  }

  return all;
}

app.get("/", (req, res) => res.send("ok"));
app.get("/test", (req, res) => res.json({ message: "API funcionando" }));

app.get("/catalogo", async (req, res) => {
  try {
    const [products, variants, types, stocks] = await Promise.all([
      getAll("products"),
      getAll("variants"),
      getAll("product_types"),
      getAll("stocks"),
    ]);

    // Map product types
    const typesMap = {};
    types.forEach(t => {
      typesMap[t.id] = t.name;
    });

    // Map products
    const productsMap = {};
    products.forEach(p => {
      productsMap[p.id] = {
        id: p.id,
        name: p.name,
        product_type_id: p.product_type?.id,
      };
    });

    // Map stocks by variant
    const stockMap = {};
    stocks.forEach(s => {
      const variantId = Number(s.variant.id);
      stockMap[variantId] =
        (stockMap[variantId] || 0) + Number(s.quantityAvailable);
    });

    // Build catalog
    const resultado = variants
      .map(v => {
        const variantId = v.id;
        const stock = stockMap[variantId] || 0;
        if (stock <= 0) return null;

        const product = productsMap[Number(v.product.id)];
        if (!product) return null;

        return {
          id: product.id,
          name: product.name,
          barcode: v.barCode || v.code,
          stock,
          category: typesMap[product.product_type_id] || "Sin categoría",
        };
      })
      .filter(Boolean);

    res.json({
      total: resultado.length,
      productos: resultado,
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error generando catálogo" });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`API corriendo en puerto ${PORT}`);
});
