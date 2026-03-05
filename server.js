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

const AXIOS_TIMEOUT = 15000
const MAX_GENERATION_TIME = 5 * 60 * 1000

let cacheCatalogo = {
 generando:false,
 ultimaActualizacion:null,
 productos:[]
}

function horaChile(){
 return new Date().toLocaleString("es-CL",{timeZone:"America/Santiago"})
}

function axiosSafe(url){
 return axios.get(url,{
  headers:{access_token:BSALE_TOKEN},
  timeout:AXIOS_TIMEOUT
 })
}

/* ============================= */
/* CARGAR CACHE                  */
/* ============================= */

if(fs.existsSync(CACHE_FILE)){
 console.log("Cargando catálogo desde cache")
 try{
  const data = fs.readFileSync(CACHE_FILE)
  cacheCatalogo = JSON.parse(data)
  console.log("Catalogo cargado desde cache")
 }catch(err){
  console.log("Error leyendo cache")
 }
}

/* ============================= */
/* GENERAR CATALOGO              */
/* ============================= */

async function generarCatalogo(){

 if(cacheCatalogo.generando){
  console.log("Catálogo ya se está generando")
  return
 }

 cacheCatalogo.generando = true

 const startTime = Date.now()

 console.log("Generando catálogo optimizado...")

 try{

  const limit = 50

  /* ============================= */
  /* STOCKS                        */
  /* ============================= */

  let stocks = []
  let offset = 0
  let total = 1

  while(offset < total){

   if(Date.now() - startTime > MAX_GENERATION_TIME){
    throw new Error("Tiempo máximo de generación excedido")
   }

   const requests = []

   for(let i=0;i<5;i++){

    requests.push(
     axiosSafe(`https://api.bsale.io/v1/stocks.json?limit=${limit}&offset=${offset}`)
    )

    offset += limit
   }

   const responses = await Promise.allSettled(requests)

   responses.forEach(r=>{
    if(r.status === "fulfilled"){
     const data = r.value.data
     stocks = stocks.concat(data.items)
     if(data.total) total = data.total
    }
   })
  }

  console.log("Stocks:",stocks.length)

  /* ============================= */
  /* VARIANTS                      */
  /* ============================= */

  let variants = []
  offset = 0
  total = 1

  while(offset < total){

   if(Date.now() - startTime > MAX_GENERATION_TIME){
    throw new Error("Tiempo máximo de generación excedido")
   }

   const requests = []

   for(let i=0;i<5;i++){

    requests.push(
     axiosSafe(`https://api.bsale.io/v1/variants.json?limit=${limit}&offset=${offset}`)
    )

    offset += limit
   }

   const responses = await Promise.allSettled(requests)

   responses.forEach(r=>{
    if(r.status === "fulfilled"){
     const data = r.value.data
     variants = variants.concat(data.items)
     if(data.total) total = data.total
    }
   })
  }

  console.log("Variants:",variants.length)

  /* ============================= */
  /* PRODUCT TYPES                 */
  /* ============================= */

  const resTypes = await axiosSafe(
   "https://api.bsale.io/v1/product_types.json"
  )

  const tipos = {}

  resTypes.data.items.forEach(t=>{
   tipos[t.id] = t.name
  })

  /* ============================= */
  /* MAP VARIANTS                  */
  /* ============================= */

  const mapVariants = {}

  variants.forEach(v=>{
   mapVariants[v.id] = v
  })

  /* ============================= */
  /* GENERAR CATALOGO              */
  /* ============================= */

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
    productId:variant.productId,
    name:variant.name,
    variant:variant.description,
    barcode:barcode,
    stock:stock.quantityAvailable,
    category:categoria,
    image:imageUrl
   })
  })

  cacheCatalogo.productos = catalogo
  cacheCatalogo.ultimaActualizacion = horaChile()

  fs.writeFileSync(CACHE_FILE,JSON.stringify(cacheCatalogo))

  console.log("Catalogo generado:",catalogo.length)

 }catch(err){

  console.log("Error catálogo:",err.message)

 }finally{

  cacheCatalogo.generando = false

 }
}

/* ============================= */
/* ENDPOINTS                     */
/* ============================= */

app.get("/catalogo",(req,res)=>{

 res.json({
  generando:cacheCatalogo.generando,
  total:cacheCatalogo.productos.length,
  ultimaActualizacion:cacheCatalogo.ultimaActualizacion,
  productos:cacheCatalogo.productos
 })

})

app.get("/status",(req,res)=>{

 res.json({
  generando:cacheCatalogo.generando,
  total:cacheCatalogo.productos.length,
  ultimaActualizacion:cacheCatalogo.ultimaActualizacion
 })

})

app.get("/update-catalogo",(req,res)=>{

 if(req.query.key !== API_KEY){
  return res.status(403).json({error:"Unauthorized"})
 }

 console.log("Actualización manual del catálogo")

 generarCatalogo()

 res.json({status:"actualizando catalogo"})
})

app.get("/update-images",(req,res)=>{

 if(req.query.key !== API_KEY){
  return res.status(403).json({error:"Unauthorized"})
 }

 console.log("Actualizando imágenes desde GitHub")

 exec(
  "wget -r -np -nH --cut-dirs=3 -A .webp https://raw.githubusercontent.com/Dominus09/api-quillotana/main/public/ -P /app/public/",
  err=>{
   if(err){
    console.log("Error descargando imágenes")
    return res.json({status:"error"})
   }

   res.json({status:"imagenes actualizadas"})
  }
 )

})

/* ============================= */
/* ACTUALIZACION AUTOMATICA      */
/* ============================= */

setInterval(()=>{

 console.log("Actualización automática del catálogo")

 generarCatalogo()

},30*60*1000)

/* ============================= */
/* SERVER                        */
/* ============================= */

const PORT = process.env.PORT || 3000

app.listen(PORT,async()=>{

 console.log("Servidor iniciado en puerto",PORT)

 if(!cacheCatalogo.productos.length){

  console.log("Generando catalogo inicial")

  await generarCatalogo()

 }

})
