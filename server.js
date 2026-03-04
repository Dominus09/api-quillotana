const express = require("express");
const axios = require("axios");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());

/* carpeta de imágenes */
app.use("/images", express.static(path.join(__dirname, "public")));

const BSALE_TOKEN = process.env.BSALE_TOKEN;
const OFFICE_ID = 1;

let cacheCatalogo = {
    generando: false,
    ultimaActualizacion: null,
    productos: []
};

/* ============================= */
/* GENERAR CATALOGO              */
/* ============================= */

async function generarCatalogo() {

    if (cacheCatalogo.generando) return;

    cacheCatalogo.generando = true;

    try {

        let offset = 0;
        const limit = 50;

        let variantes = [];

        while (true) {

            const res = await axios.get(
                `https://api.bsale.io/v1/stocks.json?limit=${limit}&offset=${offset}`,
                {
                    headers: {
                        "access_token": BSALE_TOKEN
                    }
                }
            );

            const items = res.data.items;

            if (!items.length) break;

            variantes = variantes.concat(items);

            offset += limit;
        }

        const productos = [];

        for (const stock of variantes) {

            if (parseFloat(stock.quantityAvailable) <= 0) continue;
            if (parseInt(stock.office.id) !== OFFICE_ID) continue;

            const variantId = stock.variant.id;

            const variantRes = await axios.get(
                `https://api.bsale.io/v1/variants/${variantId}.json`,
                {
                    headers: {
                        "access_token": BSALE_TOKEN
                    }
                }
            );

            const variant = variantRes.data;

            const productRes = await axios.get(
                `https://api.bsale.io/v1/products/${variant.product.id}.json`,
                {
                    headers: {
                        "access_token": BSALE_TOKEN
                    }
                }
            );

            const product = productRes.data;

            let tipo = "";

            if (product.product_type) {
                const typeRes = await axios.get(
                    `https://api.bsale.io/v1/product_types/${product.product_type.id}.json`,
                    {
                        headers: {
                            "access_token": BSALE_TOKEN
                        }
                    }
                );

                tipo = typeRes.data.name;
            }

            const barcode = variant.barCode || variant.code;

            productos.push({
                productId: product.id,
                name: product.name,
                variant: variant.description,
                barcode: barcode,
                stock: stock.quantityAvailable,
                category: tipo,
                image: `https://api.quillotana.cl/images/${barcode}.webp`
            });
        }

        cacheCatalogo.productos = productos;
        cacheCatalogo.ultimaActualizacion = new Date().toISOString();

        console.log("Catalogo generado:", productos.length);

    } catch (error) {

        console.error("Error generando catalogo", error.message);

    }

    cacheCatalogo.generando = false;
}

/* ============================= */
/* ENDPOINT CATALOGO             */
/* ============================= */

app.get("/catalogo", async (req, res) => {

    if (!cacheCatalogo.productos.length) {
        await generarCatalogo();
    }

    res.json({
        generando: cacheCatalogo.generando,
        total: cacheCatalogo.productos.length,
        ultimaActualizacion: cacheCatalogo.ultimaActualizacion,
        productos: cacheCatalogo.productos
    });

});

/* ============================= */
/* ENDPOINT STATUS               */
/* ============================= */

app.get("/status", (req, res) => {

    res.json({
        generando: cacheCatalogo.generando,
        total: cacheCatalogo.productos.length,
        ultimaActualizacion: cacheCatalogo.ultimaActualizacion
    });

});

/* ============================= */
/* SERVER                        */
/* ============================= */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log("Servidor iniciado en puerto", PORT);
});
