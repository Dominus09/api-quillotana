const express = require("express")
const axios = require("axios")
const cors = require("cors")
const path = require("path")

const app = express()

app.use(cors())
app.use(express.json())

/* carpeta de imágenes */
app.use("/images", express.static(path.join(__dirname, "public")))

const BSALE_TOKEN = process.env.BSALE_TOKEN
const OFFICE_ID = 1

let cacheCatalogo = {
  generando: false,
  ultimaActualizacion: null,
  productos: []
}

/* ============================= */
/* GENERAR CATALOGO              */
/* ============================= */

async function generarCatalogo() {

  if (cacheCatalogo.generando) return

  cacheCatalogo.generando = true

  try {

    const limit = 50

    let stocks = []
    let offset = 0

    while (true) {

      const res = await axios.get(
        `https://api.bsale.io/v1/stocks.json?limit=${limit}&offset=${offset}`,
        {
          headers: { access_token: BSALE_TOKEN }
        }
      )

      if (!res.data.items.length) break

      stocks = stocks.concat(res.data.items)

      offset += limit
    }

    console.log("Stocks cargados:", stocks.length)


    offset = 0
    let variants = []

    while (true) {

      const res = await axios.get(
        `https://api.bsale.io/v1/variants.json?limit=${limit}&offset=${offset}`,
        {
          headers: { access_token: BSALE_TOKEN }
        }
      )

      if (!res.data.items.length) break

      variants = variants.concat(res.data.items)

      offset += limit
    }

    console.log("Variantes cargadas:", variants.length)


    offset = 0
    let products = []

    while (true) {

      const res = await axios.get(
        `https://api.bsale.io/v1/products.json?limit=${limit}&offset=${offset}`,
        {
          headers: { access_token: BSALE_TOKEN }
        }
      )

      if (!res.data.items.length) break

      products = products.concat(res.data.items)

      offset += limit
    }

    console.log("Productos cargados:", products.length)


    const mapVariants = {}
    variants.forEach(v => mapVariants[v.id] = v)

    const mapProducts = {}
    products.forEach(p => mapProducts[p.id] = p)

    const catalogo = []

    stocks.forEach(stock => {

      if (parseFloat(stock.quantityAvailable) <= 0) return
      if (parseInt(stock.office.id) !== OFFICE_ID) return

      const variant = mapVariants[stock.variant.id]
      if (!variant) return

      const product = mapProducts[variant.product.id]
      if (!product) return

      const barcode = variant.barCode || variant.code

      catalogo.push({
        productId: product.id,
        name: product.name,
        variant: variant.description,
        barcode: barcode,
        stock: stock.quantityAvailable,
        category: "",
        image: `https://api.quillotana.cl/images/${barcode}.webp`
      })

    })

    cacheCatalogo.productos = catalogo
    cacheCatalogo.ultimaActualizacion = new Date().toISOString()

    console.log("Catalogo generado:", catalogo.length)

  } catch (err) {

    console.log("Error catalogo:", err.message)

  }

  cacheCatalogo.generando = false
}

/* ============================= */
/* ENDPOINT CATALOGO             */
/* ============================= */

app.get("/catalogo", async (req, res) => {

  if (!cacheCatalogo.productos.length) {
    await generarCatalogo()
  }

  res.json({
    generando: cacheCatalogo.generando,
    total: cacheCatalogo.productos.length,
    ultimaActualizacion: cacheCatalogo.ultimaActualizacion,
    productos: cacheCatalogo.productos
  })

})

/* ============================= */
/* STATUS                        */
/* ============================= */

app.get("/status", (req, res) => {

  res.json({
    generando: cacheCatalogo.generando,
    total: cacheCatalogo.productos.length,
    ultimaActualizacion: cacheCatalogo.ultimaActualizacion
  })

})

/* ============================= */
/* SERVER                        */
/* ============================= */

const PORT = process.env.PORT || 3000

app.listen(PORT, async () => {

  console.log("Servidor iniciado en puerto", PORT)

  console.log("Generando catalogo inicial...")

  await generarCatalogo()

})
