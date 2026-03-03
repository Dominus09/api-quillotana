require("dotenv").config();
const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

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

app.get("/catalogo", async (req, res) => {
  try {
    const products = await getAll("products");
    const variants = await getAll("variants");
    const types = await getAll("product_types");

    const typesMap = {};
    types.forEach(t => {
      typesMap[t.id] = t.name;
    });

    const productsMap = {};
    products.forEach(p => {
      productsMap[p.id] = {
        id: p.id,
        name: p.name,
        product_type_id: p.product_type?.id,
      };
    });

    const resultado = variants
      .filter(v => v.stock > 0)
      .map(v => {
        const product = productsMap[v.productId];
        if (!product) return null;

        return {
          id: product.id,
          name: product.name,
          barcode: v.barcode,
          stock: v.stock,
          category: typesMap[product.product_type_id] || "Sin categoría"
        };
      })
      .filter(Boolean);

    res.json({
      total: resultado.length,
      productos: resultado
    });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error generando catálogo" });
  }
});

app.listen(PORT, () => {
  console.log(`API corriendo en puerto ${PORT}`);
});
