require("dotenv").config();
const express = require("express");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 3000;

async function getAllProducts() {
  let allProducts = [];
  let offset = 0;
  const limit = 100;

  while (true) {
    const response = await axios.get(
      `https://api.bsale.io/v1/products.json?limit=${limit}&offset=${offset}`,
      {
        headers: {
          access_token: process.env.BSALE_TOKEN,
        },
      }
    );

    const items = response.data.items;
    if (items.length === 0) break;

    allProducts = allProducts.concat(items);
    offset += limit;
  }

  return allProducts;
}

app.get("/productos-disponibles", async (req, res) => {
  try {
    const productos = await getAllProducts();

    const filtrados = productos.filter(p => p.stockControl === 1);

    res.json({
      total: filtrados.length,
      productos: filtrados
    });

  } catch (error) {
    res.status(500).json({ error: "Error consultando Bsale" });
  }
});

app.listen(PORT, () => {
  console.log(`API corriendo en puerto ${PORT}`);
});
