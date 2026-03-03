require("dotenv").config();
const express = require("express");
const axios = require("axios");

const app = express();
const PORT = Number(process.env.PORT || 3000);

const headers = {
  access_token: process.env.BSALE_TOKEN,
};

// ================================
// CONFIGURACIÓN
// ================================
const OFFICE_ID = 1; // 👈 SUCURSAL QUE USAREMOS

// ================================
// FUNCIÓN PARA TRAER TODO PAGINADO
// ================================
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

// ================================
// CACHE EN MEMORIA
// ================================
let catalogoCache = [];
let ultimaActualizacion = null;
let generando = false;

// ================================
// GENERAR CATÁLOGO
// ================================
async function generarCatalogo() {
  if (generando) return;

  try {
    generando = true;
    console.log("Generando catálogo en segundo plano...");

    const [products, variants, types, stocks] = await Promise.all([
      getAll("products"),
      getAll("variants"),
      getAll("product_types"),
      getAll("stocks"),
    ]);

    // Mapear tipos
    const typesMap = {};
    types.forEach(t => {
      typesMap[t.id] = t.name;
    });

    // Mapear productos
    const productsMap = {};
    products.forEach(p => {
      productsMap[p.id] = {
        id: p.id,
        name: p.name,
        product_type_id: p.product_type?.id,
      };
    });

    // Mapear stock SOLO de la oficina definida
    const stockMap = {};

    stocks.forEach(s => {
      if (Number(s.office.id) !== OFFICE_ID) return;

      const variantId = Number(s.variant.id);
      stockMap[variantId] =
        (stockMap[variantId] || 0) + Number(s.quantityAvailable);
    });

    // Construir catálogo final
    catalogoCache = variants
      .map(v => {
        const stock = stockMap[v.id] || 0;
        if (stock <= 0) return null;

        const product = productsMap[Number(v.product.id)];
        if (!product) return null;

        return {
          productId: product.id,
          name: product.name,
          variant: v.description || null, // 👈 detalle de presentación
          barcode: v.barCode || v.code,
          stock,
          category: typesMap[product.product_type_id] || "Sin categoría",
        };
      })
      .filter(Boolean);

    ultimaActualizacion = new Date();

    console.log(`Catálogo generado. Productos activos: ${catalogoCache.length}`);
  } catch (error) {
    console.error("Error generando catálogo:", error.message);
  } finally {
    generando = false;
  }
}

// ================================
// ENDPOINTS
// ================================
app.get("/", (req, res) => res.send("ok"));

app.get("/test", (req, res) =>
  res.json({ message: "API funcionando correctamente" })
);

app.get("/catalogo", (req, res) => {
  res.json({
    total: catalogoCache.length,
    ultimaActualizacion,
    generando,
    productos: catalogoCache,
  });
});

// ================================
// INICIAR SERVIDOR
// ================================
app.listen(PORT, "0.0.0.0", () => {
  console.log(`API corriendo en puerto ${PORT}`);

  // Generar catálogo al iniciar
  generarCatalogo();

  // Actualizar automáticamente cada 30 minutos
  setInterval(generarCatalogo, 30 * 60 * 1000);
});
