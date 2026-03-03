require("dotenv").config();
const express = require("express");
const axios = require("axios");

const app = express();
const PORT = Number(process.env.PORT || 3000);

const headers = { access_token: process.env.BSALE_TOKEN };

const OFFICE_ID = 1; // 👈 Cambiar si fuese necesario

// ================================
// Traer todo paginado (50 en 50)
// ================================
async function getAll(endpoint) {
  let all = [];
  let offset = 0;
  const limit = 50; // ✅ Paginación correcta

  while (true) {
    const r = await axios.get(
      `https://api.bsale.io/v1/${endpoint}.json?limit=${limit}&offset=${offset}`,
      { headers }
    );

    const items = r.data?.items || [];
    if (items.length === 0) break;

    all = all.concat(items);
    offset += limit;
  }

  return all;
}

// ================================
// Cache
// ================================
let catalogoCache = [];
let ultimaActualizacion = null;
let generando = false;
let resumenCache = null;

// ================================
// Generar catálogo POR BARCODE
// ================================
async function generarCatalogo() {
  if (generando) return;

  try {
    generando = true;
    console.log("Generando catálogo (paginación 50)...");

    const [products, variants, types, stocks] = await Promise.all([
      getAll("products"),
      getAll("variants"),
      getAll("product_types"),
      getAll("stocks"),
    ]);

    const typesMap = {};
    types.forEach(t => {
      typesMap[t.id] = t.name;
    });

    const productsMap = {};
    products.forEach(p => {
      productsMap[p.id] = {
        id: p.id,
        name: p.name,
        typeId: p.product_type?.id
          ? Number(p.product_type.id)
          : null,
      };
    });

    const stockByVariant = {};

    stocks.forEach(s => {
      if (Number(s.office?.id) !== OFFICE_ID) return;

      const variantId = Number(s.variant?.id);
      if (!variantId) return;

      if (!stockByVariant[variantId]) {
        stockByVariant[variantId] = {
          available: 0,
          total: 0,
          reserved: 0,
        };
      }

      stockByVariant[variantId].available += Number(s.quantityAvailable || 0);
      stockByVariant[variantId].total += Number(s.quantity || 0);
      stockByVariant[variantId].reserved += Number(s.quantityReserved || 0);
    });

    const catalogo = [];

    variants.forEach(v => {
      const variantId = Number(v.id);
      const stock = stockByVariant[variantId];

      const available = stock?.available || 0;
      if (available <= 0) return;

      const productId = Number(v.product?.id);
      const p = productsMap[productId];
      if (!p) return;

      catalogo.push({
        productId: p.id,
        product: p.name,
        variantId: variantId,
        variant: v.description || null,
        barcode: v.barCode || v.code || null,
        type: p.typeId
          ? typesMap[p.typeId] || "Sin categoría"
          : "Sin categoría",
        disponible: available,
        total: stock?.total || 0,
        reservado: stock?.reserved || 0,
      });
    });

    catalogoCache = catalogo;
    ultimaActualizacion = new Date();

    resumenCache = {
      officeId: OFFICE_ID,
      total_variantes_con_stock: catalogo.length,
      ultimaActualizacion,
    };

    console.log(`Catálogo listo: ${catalogo.length} variantes con stock.`);
  } catch (e) {
    console.error("Error generando catálogo:", e.message);
  } finally {
    generando = false;
  }
}

// ================================
// Endpoints
// ================================
app.get("/", (req, res) => res.send("ok"));

app.get("/catalogo", (req, res) => {
  res.json({
    total: catalogoCache.length,
    ultimaActualizacion,
    generando,
    productos: catalogoCache,
  });
});

app.get("/resumen", (req, res) => {
  res.json({
    generando,
    ...(resumenCache || {}),
  });
});

// ================================
// Start
// ================================
app.listen(PORT, "0.0.0.0", () => {
  console.log(`API corriendo en puerto ${PORT}`);
  generarCatalogo();
  setInterval(generarCatalogo, 30 * 60 * 1000);
});
