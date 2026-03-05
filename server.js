const express = require("express")
const axios = require("axios")
const cors = require("cors")
const path = require("path")
const fs = require("fs")
const { exec } = require("child_process")

const app = express()
app.use(cors())
app.use(express.json())
app.use("/images", express.static(path.join(__dirname, "public")))

const BSALE_TOKEN = process.env.BSALE_TOKEN
const OFFICE_ID = 1
const CACHE_FILE = "/data/catalogo.json"
const API_KEY = "Quillotana123"

const LIMIT = 50
const REQUEST_TIMEOUT = 15000
const MAX_TIME = 5 * 60 * 1000 // 5 minutos

let generando = false
let productos = []
let ultimaActualizacion = null

function horaChile() {
  return new Date().toLocaleString("es-CL", { timeZone: "America/Santiago" })
}

function axiosSafe(url) {
  return axios.get(url, {
    headers: { access_token: BSALE_TOKEN },
    timeout: REQUEST_TIMEOUT,
  })
}

function getId(obj, pathA, pathB) {
  // pathA y pathB son funciones que intentan sacar el id en dos formatos distintos
  try {
    const a = pathA(obj)
    if (a !== undefined && a !== null) return String(a)
  } catch {}
  try {
    const b = pathB(obj)
    if (b !== undefined && b !== null) return String(b)
  } catch {}
  return null
}

function loadCache() {
  if (!fs.existsSync(CACHE_FILE)) return
  try {
    const data = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"))
    productos = Array.isArray(data.productos) ? data.productos : []
    ultimaActualizacion = data.ultimaActualizacion || null
    console.log("Cache cargado:", productos.length)
  } catch (e) {
    console.log("Error leyendo cache:", e.message)
  }
}

function saveCache() {
  fs.writeFileSync(
    CACHE_FILE,
    JSON.stringify({ productos, ultimaActualizacion }, null, 0)
  )
}

/* ========================= */
/* PAGINACION GENERAL         */
/* ========================= */

async function fetchAllPaged(baseUrl) {
  let all = []
  let offset = 0
  let total = 1

  while (offset < total) {
    const res = await axiosSafe(`${baseUrl}?limit=${LIMIT}&offset=${offset}`)
    const items = res.data?.items || []
    all = all.concat(items)

    // Bsale normalmente trae total
    total = Number(res.data?.total ?? (offset + items.length))
    offset += LIMIT

    // si por alguna razón total no viene, cortamos cuando no hay items
    if (!items.length) break
  }

  return all
}

/* ========================= */
/* GENERAR CATALOGO           */
/* ========================= */

async function generarCatalogo() {
  if (generando) {
    console.log("Catálogo ya se está generando")
    return
  }

  generando = true
  const inicio = Date.now()

  console.log("Generando catálogo...")

  try {
    if (!BSALE_TOKEN) throw new Error("Falta BSALE_TOKEN en variables de entorno")

    // Corte duro por tiempo (5 min)
    const checkTime = () => {
      if (Date.now() - inicio > MAX_TIME) {
        throw new Error("Tiempo máximo excedido (5 minutos)")
      }
    }

    checkTime()
    const stocks = await fetchAllPaged("https://api.bsale.io/v1/stocks.json")
    console.log("Stocks:", stocks.length)

    checkTime()
    const variants = await fetchAllPaged("https://api.bsale.io/v1/variants.json")
    console.log("Variants:", variants.length)

    checkTime()
    const products = await fetchAllPaged("https://api.bsale.io/v1/products.json")
    console.log("Products:", products.length)

    checkTime()
    const productTypes = await fetchAllPaged("https://api.bsale.io/v1/product_types.json")
    console.log("ProductTypes:", productTypes.length)

    // Mapas
    const mapVariants = {}
    for (const v of variants) mapVariants[String(v.id)] = v

    const mapProducts = {}
    for (const p of products) mapProducts[String(p.id)] = p

    const mapProductTypes = {}
    for (const t of productTypes) mapProductTypes[String(t.id)] = t

    // Armar catálogo
    const catalogo = []

    for (const stock of stocks) {
      checkTime()

      const qty = parseFloat(stock.quantityAvailable ?? stock.quantity ?? "0")
      if (!(qty > 0)) continue

      const officeId = getId(
        stock,
        s => s.office?.id,
        s => s.officeId
      )
      if (String(officeId) !== String(OFFICE_ID)) continue

      const variantId = getId(
        stock,
        s => s.variant?.id,
        s => s.variantId
      )
      if (!variantId) continue

      const variant = mapVariants[String(variantId)]
      if (!variant) continue

      const productId = getId(
        variant,
        v => v.product?.id,
        v => v.productId
      )
      if (!productId) continue

      const product = mapProducts[String(productId)]
      if (!product) continue

      const barcode = variant.barCode || variant.code
      if (!barcode) continue

      const typeId = product.productTypeId != null ? String(product.productTypeId) : null
      const categoria = (typeId && mapProductTypes[typeId]?.name) ? mapProductTypes[typeId].name : "Otros"

      const imagePath = `/app/public/${barcode}.webp`
      const imageUrl = fs.existsSync(imagePath)
        ? `https://api.quillotana.cl/images/${barcode}.webp`
        : `https://api.quillotana.cl/images/placeholder2.webp`

      catalogo.push({
        productId: String(product.id),
        name: product.name,
        variant: variant.description || "",
        barcode: String(barcode),
        stock: qty,
        category: categoria,
        image: imageUrl
      })
    }

    productos = catalogo
    ultimaActualizacion = horaChile()
    saveCache()

    console.log("Catalogo generado:", productos.length)
  } catch (err) {
    console.log("Error catálogo:", err.message)
    // OJO: aunque falle, igual liberamos generando en finally
  } finally {
    generando = false
  }
}

/* ========================= */
/* ENDPOINTS                  */
/* ========================= */

app.get("/status", (req, res) => {
  res.json({
    generando,
    total: productos.length,
    ultimaActualizacion
  })
})

app.get("/catalogo", (req, res) => {
  res.json({
    generando,
    total: productos.length,
    ultimaActualizacion,
    productos
  })
})

app.get("/update-catalogo", (req, res) => {
  if (req.query.key !== API_KEY) return res.status(403).json({ error: "Unauthorized" })
  console.log("Actualización manual del catálogo")
  generarCatalogo()
  res.json({ status: "actualizando" })
})

app.get("/reset", (req, res) => {
  if (req.query.key !== API_KEY) return res.status(403).json({ error: "Unauthorized" })

  // desbloquea
  generando = false

  // opcional: borrar cache si mandas ?clear=1
  const clear = String(req.query.clear || "0") === "1"
  if (clear) {
    try {
      if (fs.existsSync(CACHE_FILE)) fs.unlinkSync(CACHE_FILE)
      productos = []
      ultimaActualizacion = null
      console.log("RESET + cache borrado")
    } catch (e) {
      console.log("Error borrando cache:", e.message)
    }
  } else {
    console.log("RESET (solo desbloqueo)")
  }

  res.json({ reset: true, clear })
})

app.get("/update-images", (req, res) => {
  if (req.query.key !== API_KEY) return res.status(403).json({ error: "Unauthorized" })

  console.log("Actualizando imágenes desde GitHub (manual)")

  // descarga SOLO webp desde carpeta public del repo (como ya venías haciendo)
  exec(
    "wget -q -r -np -nH --cut-dirs=3 -A .webp https://raw.githubusercontent.com/Dominus09/api-quillotana/main/public/ -P /app/public/ && echo OK",
    (err, stdout, stderr) => {
      if (err) {
        console.log("Error update-images:", err.message)
        return res.status(500).json({ status: "error" })
      }
      res.json({ status: "imagenes actualizadas" })
    }
  )
})

/* ========================= */
/* STARTUP + AUTO UPDATE      */
/* ========================= */

loadCache()

setInterval(() => {
  console.log("Auto actualización (cada 30 min)")
  generarCatalogo()
}, 30 * 60 * 1000)

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log("Servidor iniciado", PORT)
  // Si no hay cache, genera una vez al partir
  if (productos.length === 0) {
    console.log("Sin cache, generando catálogo inicial...")
    generarCatalogo()
  }
})
