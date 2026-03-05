const express = require("express")
const axios = require("axios")
const cors = require("cors")
const path = require("path")
const fs = require("fs")

const app = express()

app.use(cors())
app.use(express.json())

app.use("/images", express.static(path.join(__dirname, "public")))

const BSALE_TOKEN = process.env.BSALE_TOKEN
const OFFICE_ID = 1
const CACHE_FILE = "/data/catalogo.json"
const API_KEY = "Quillotana123"

const REQUEST_TIMEOUT = 15000
const MAX_TIME = 5 * 60 * 1000

let generando = false
let productos = []
let ultimaActualizacion = null

function horaChile(){
 return new Date().toLocaleString("es-CL",{timeZone:"America/Santiago"})
}

function axiosSafe(url){
 return axios.get(url,{
  headers:{access_token:BSALE_TOKEN},
  timeout:REQUEST_TIMEOUT
 })
}

/* ========================= */
/* CARGAR CACHE              */
/* ========================= */

if(fs.existsSync(CACHE_FILE)){
 try{
  const data = JSON.parse(fs.readFileSync(CACHE_FILE))
  productos = data.productos || []
  ultimaActualizacion = data.ultimaActualizacion
  console.log("Cache cargado:",productos.length)
 }catch(e){
  console.log("Error leyendo cache")
 }
}

/* ========================= */
/* GENERAR CATALOGO          */
/* ========================= */

async function generarCatalogo(){

 if(generando){
  console.log("Ya se está generando catálogo")
  return
 }

 generando = true
 console.log("Generando catálogo...")

 const inicio = Date.now()

 try{

  const limit = 50

  /* ========================= */
  /* STOCKS                    */
  /* ========================= */

  let stocks = []
  let offset = 0
  let total = 1

  while(offset < total){

   if(Date.now() - inicio > MAX_TIME){
    throw new Error("Tiempo máximo excedido")
   }

   const res = await axiosSafe(
    `https://api.bsale.io/v1/stocks.json?limit=${limit}&offset=${offset}`
   )

   stocks = stocks.concat(res.data.items)

   total = res.data.total
   offset += limit
  }

  console.log("Stocks:",stocks.length)

  /* ========================= */
  /* VARIANTS                  */
  /* ========================= */

  let variants = []
  offset = 0
  total = 1

  while(offset < total){

   if(Date.now() - inicio > MAX_TIME){
    throw new Error("Tiempo máximo excedido")
   }

   const res = await axiosSafe(
    `https://api.bsale.io/v1/variants.json?limit=${limit}&offset=${offset}`
   )

   variants = variants.concat(res.data.items)

   total = res.data.total
   offset += limit
  }

  console.log("Variants:",variants.length)

  /* ========================= */
  /* PRODUCT TYPES             */
  /* ========================= */

  const resTypes = await axiosSafe(
   "https://api.bsale.io/v1/product_types.json"
  )

  const tipos = {}

  resTypes.data.items.forEach(t=>{
   tipos[t.id] = t.name
  })

  const mapVariants = {}

  variants.forEach(v=>{
   mapVariants[v.id] = v
  })

  const catalogo = []

  stocks.forEach(stock=>{

   if(parseFloat(stock.quantityAvailable) <= 0) return
   if(parseInt(stock.office.id) !== OFFICE_ID) return

   const variant = mapVariants[stock.variant.id]
   if(!variant) return

   const barcode = variant.barCode || variant.code

   const categoria = tipos[variant.productTypeId] || "Otros"

   const imagePath = `/app/public/${barcode}.webp`

   const imageUrl = fs.existsSync(imagePath)
    ? `https://api.quillotana.cl/images/${barcode}.webp`
    : `https://api.quillotana.cl/images/placeholder2.webp`

   catalogo.push({
    name:variant.name,
    variant:variant.description,
    barcode:barcode,
    stock:stock.quantityAvailable,
    category:categoria,
    image:imageUrl
   })

  })

  productos = catalogo
  ultimaActualizacion = horaChile()

  fs.writeFileSync(CACHE_FILE,JSON.stringify({
   productos,
   ultimaActualizacion
  }))

  console.log("Catalogo generado:",productos.length)

 }catch(err){

  console.log("Error catálogo:",err.message)

 }finally{

  generando = false

 }

}

/* ========================= */
/* ENDPOINTS                 */
/* ========================= */

app.get("/catalogo",(req,res)=>{

 res.json({
  generando,
  total:productos.length,
  ultimaActualizacion,
  productos
 })

})

app.get("/status",(req,res)=>{

 res.json({
  generando,
  total:productos.length,
  ultimaActualizacion
 })

})

/* UPDATE MANUAL */

app.get("/update-catalogo",(req,res)=>{

 if(req.query.key !== API_KEY){
  return res.status(403).json({error:"Unauthorized"})
 }

 console.log("Actualización manual")

 generarCatalogo()

 res.json({status:"actualizando"})

})

/* RESET SISTEMA */

app.get("/reset",(req,res)=>{

 generando = false

 console.log("Reset manual ejecutado")

 res.json({reset:true})

})

/* ========================= */
/* AUTO UPDATE               */
/* ========================= */

setInterval(()=>{

 console.log("Auto actualización")

 generarCatalogo()

},30*60*1000)

/* ========================= */
/* SERVER                    */
/* ========================= */

const PORT = process.env.PORT || 3000

app.listen(PORT,async()=>{

 console.log("Servidor iniciado",PORT)

 if(productos.length === 0){
  console.log("Generando catálogo inicial")
  await generarCatalogo()
 }

})
