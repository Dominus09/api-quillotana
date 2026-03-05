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
const API_KEY = "Quillotana123"

/* ============================= */
/* CACHE                         */
/* ============================= */

let cacheCatalogo = {
  generando: false,
  ultimaActualizacion: null,
  productos: []
}

function horaChile() {
  return new Date().toLocaleString("es-CL", {
    timeZone: "America/Santiago"
  })
}

/* cargar cache si existe */

if (fs.existsSync(CACHE_FILE)) {

  console.log("Cargando catálogo desde cache")

  try {

    const data = fs.readFileSync(CACHE_FILE)
    cacheCatalogo = JSON.parse(data)

    console.log("Catalogo cargado desde cache")

  } catch (err) {

    console.log("Error leyendo cache")

  }

}

/* ============================= */
/* GENERAR CATALOGO              */
/* ============================= */

async function generarCatalogo() {

  if (cacheCatalogo.generando) return

  cacheCatalogo.generando = true

  console.log("Generando catálogo optimizado...")

  try {

    const limit = 50

    /* ============================= */
    /* STOCKS (paralelo)             */
    /* ============================= */

    let stocks = []
    let offset = 0
    let total = 1

    while (offset < total) {

      const requests = []

      for (let i = 0; i < 5; i++) {

        requests.push(
          axios.get(
            `https://api.bsale.io/v1/stocks.json?limit=${limit}&offset=${offset}`,
            { headers: { access_token: BSALE_TOKEN } }
          )
        )

        offset += limit
      }

      const responses = await Promise.all(requests)

      responses.forEach(r => {

        stocks = stocks.concat(r.data.items)

        if (r.data.total) total = r.data.total

      })

    }

    console.log("Stocks:", stocks.length)

    /* ============================= */
    /* VARIANTS (paralelo)           */
    /* ============================= */

    let variants = []
    offset = 0
    total = 1

    while (offset < total) {

      const requests = []

      for (let i = 0; i < 5; i++) {

        requests.push(
          axios.get(
            `https://api.bsale.io/v1/variants.json?limit=${limit}&offset=${offset}`,
            { headers: { access_token: BSALE_TOKEN } }
          )
        )

        offset += limit
      }

      const responses = await Promise.all(requests)

      responses.forEach(r => {

        variants = variants.concat(r.data.items)

        if (r.data.total) total = r.data.total

      })

    }

    console.log("Variants:", variants.length)

    /* ============================= */
    /* PRODUCT TYPES                 */
    /* ============================= */

    const resTypes = await axios.get(
      "https://api.bsale.io/v1/product_types.json",
      { headers: { access_token: BSALE_TOKEN } }
    )

    const tipos = {}
    resTypes.data.items.forEach(t => {
      tipos[t.id] = t.name
    })

    /* ============================= */
    /* MAPA VARIANTS                 */
    /* ============================= */

    const mapVariants = {}
    variants.forEach(v => mapVariants[v.id] = v)

    /* ============================= */
    /* GENERAR CATALOGO              */
    /* ============================= */

    const catalogo = []

    stocks.forEach(stock => {

      if (parseFloat(stock.quantityAvailable) <= 0) return
      if (parseInt(stock.office.id) !== OFFICE_ID) return

      const variant = mapVariants[stock.variant.id]
      if (!variant) return

      const barcode = variant.barCode || variant.code

      const categoria = tipos[variant.productTypeId] || "Otros"

      const imagePath = `/app/public/${barcode}.webp`

      const imageUrl = fs.existsSync(imagePath)
        ? `https://api.quillotana.cl/images/${barcode}.webp`
        : `https://api.quillotana.cl/images/placeholder2.webp`

      catalogo.push({
        productId: variant.productId,
        name: variant.name,
        variant: variant.description,
        barcode: barcode,
        stock: stock.quantityAvailable,
        category: categoria,
        image: imageUrl
      })

    })

    cacheCatalogo.productos = catalogo
    cacheCatalogo.ultimaActualizacion = horaChile()

    fs.writeFileSync(CACHE_FILE, JSON.stringify(cacheCatalogo))

    console.log("Catalogo generado:", catalogo.length)

  } catch (err) {

    console.log("Error catálogo:", err.message)

  }

  cacheCatalogo.generando = false
}

/* ============================= */
/* ACTUALIZAR IMAGENES MANUAL    */
/* ============================= */

app.get("/update-images", (req, res) => {

  if (req.query.key !== API_KEY)
    return res.status(403).json({ error: "Unauthorized" })

  exec(
    "wget -r -np -nH --cut-dirs=3 -A .webp https://raw.githubusercontent.com/Dominus09/api-quillotana/main/public/ -P /app/public/",
    (err) => {

      if (err) {
        console.log("Error descargando imágenes")
        return res.json({ status: "error" })
      }

      res.json({ status: "imagenes actualizadas" })
    }
  )

})

/* ============================= */
/* UPDATE CATALOGO               */
/* ============================= */

app.get("/update-catalogo", async (req, res) => {

  if (req.query.key !== API_KEY)
    return res.status(403).json({ error: "Unauthorized" })

  generarCatalogo()

  res.json({
    status: "actualizando catalogo"
  })

})

/* ============================= */
/* CATALOGO                      */
/* ============================= */

app.get("/catalogo", (req, res) => {

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
/* ACTUALIZACION AUTOMATICA      */
/* ============================= */

setInterval(() => {

  console.log("Actualización automática del catálogo")

  generarCatalogo()

}, 1800000)

/* ============================= */
/* SERVER                        */
/* ============================= */

const PORT = process.env.PORT || 3000

app.listen(PORT, async () => {

  console.log("Servidor iniciado en puerto", PORT)

  if (!cacheCatalogo.productos.length) {

    console.log("Generando catalogo inicial")

    await generarCatalogo()

  }

})
