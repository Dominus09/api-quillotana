const express = require("express")
const axios = require("axios")
const cors = require("cors")
const path = require("path")
const fs = require("fs")
const { exec } = require("child_process")

const app = express()

app.use(cors())
app.use(express.json())

/* carpeta de imágenes */
app.use("/images", express.static(path.join(__dirname, "public")))

const BSALE_TOKEN = process.env.BSALE_TOKEN
const OFFICE_ID = 1
const CACHE_FILE = "/data/catalogo.json"

let cacheCatalogo = {
  generando: false,
  ultimaActualizacion: null,
  productos: []
}

/* ============================= */
/* CARGAR CACHE SI EXISTE        */
/* ============================= */

if (fs.existsSync(CACHE_FILE)) {

  console.log("Cargando catálogo desde cache")

  const data = fs.readFileSync(CACHE_FILE)

  cacheCatalogo = JSON.parse(data)

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

      let imagen = "https://api.quillotana.cl/images/placeholder2.webp"

      if (barcode) {
        imagen = `https://api.quillotana.cl/images/${barcode}.webp`
      }

      catalogo.push({
        productId: product.id,
        name: product.name,
        variant: variant.description,
        barcode: barcode,
        stock: stock.quantityAvailable,
        category: "",
        image: imagen
      })

    })

    cacheCatalogo.productos = catalogo
    cacheCatalogo.ultimaActualizacion = new Date().toISOString()

    fs.writeFileSync(
      CACHE_FILE,
      JSON.stringify(cacheCatalogo, null, 2)
    )

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
/* ACTUALIZAR IMAGENES GITHUB    */
/* ============================= */

app.get("/update-images", (req, res) => {

  if (req.query.key !== "Quillotana123") {
    return res.status(403).send("No autorizado")
  }

  exec("git pull", { cwd: "/app" }, (error, stdout, stderr) => {

    if (error) {

      console.log("Error actualizando imágenes:", error)

      return res.status(500).json({
        ok: false,
        error: error.message
      })
    }

    console.log("Imágenes actualizadas desde GitHub")

    res.json({
      ok: true,
      output: stdout
    })

  })

})

/* ============================= */
/* SERVER                        */
/* ============================= */

const PORT = process.env.PORT || 3000

app.listen(PORT, async () => {

  console.log("Servidor iniciado en puerto", PORT)

  if (!cacheCatalogo.productos.length) {

    console.log("Generando catalogo inicial...")

    await generarCatalogo()

  } else {

    console.log("Catalogo cargado desde cache")

  }

})

/* ============================= */
/* ACTUALIZAR CATALOGO AUTOMATICO */
/* ============================= */

setInterval(async () => {

  console.log("Actualizando catálogo automático...")

  await generarCatalogo()

}, 30 * 60 * 1000)
