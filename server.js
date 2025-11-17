import express from 'express'
import cors from 'cors'
import multer from 'multer'
import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { v4 as uuidv4 } from 'uuid'
import { PDFDocument, StandardFonts } from 'pdf-lib'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const app = express()

app.use(cors())
app.use(express.static(__dirname))
app.use(express.urlencoded({ extended: true }))

const upload = multer({
  storage: multer.diskStorage({
    destination: async (req, file, cb) => {
      const dir = path.join(__dirname, 'uploads')
      try { await fsp.mkdir(dir, { recursive: true }) } catch {}
      cb(null, dir)
    },
    filename: (req, file, cb) => {
      const id = uuidv4()
      const ext = path.extname(file.originalname)
      cb(null, `${id}${ext}`)
    }
  }),
  limits: { fileSize: 50 * 1024 * 1024 }
})

function findSoffice() {
  const candidates = [
    'soffice',
    'C:/Program Files/LibreOffice/program/soffice.exe',
    'C:/Program Files (x86)/LibreOffice/program/soffice.exe'
  ]
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c
    } catch {}
  }
  return 'soffice'
}

async function convertWithSoffice(inputPath, outputDir) {
  const soffice = findSoffice()
  return new Promise((resolve, reject) => {
    const args = ['--headless', '--norestore', '--nolockcheck', '--convert-to', 'pdf', '--outdir', outputDir, inputPath]
    const child = spawn(soffice, args, { stdio: 'ignore' })
    child.on('error', reject)
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error('LibreOffice conversion failed with code ' + code))
    })
  })
}

app.post('/api/jpg-to-pdf', upload.array('files', 50), async (req, res) => {
  const files = req.files || []
  if (!files.length) return res.status(400).json({ error: 'No images uploaded' })
  try {
    const pdfDoc = await PDFDocument.create()
    const size = (req.body.pageSize || 'A4').toUpperCase()
    const orientation = (req.body.orientation || 'auto').toLowerCase()
    const sizes = { A4: [595, 842], LETTER: [612, 792] }
    const base = sizes[size] || sizes.A4
    for (const f of files) {
      const bytes = await fsp.readFile(f.path)
      let img
      const ext = path.extname(f.originalname).toLowerCase()
      if (ext === '.png') img = await pdfDoc.embedPng(bytes)
      else img = await pdfDoc.embedJpg(bytes)
      const iw = img.width
      const ih = img.height
      let pageWidth = base[0]
      let pageHeight = base[1]
      if (orientation === 'landscape') { const t = pageWidth; pageWidth = pageHeight; pageHeight = t }
      else if (orientation === 'auto') { if (iw > ih) { const t = pageWidth; pageWidth = pageHeight; pageHeight = t } }
      const page = pdfDoc.addPage([pageWidth, pageHeight])
      const margin = 36
      const maxW = pageWidth - margin * 2
      const maxH = pageHeight - margin * 2
      const scale = Math.min(maxW / iw, maxH / ih)
      const drawW = iw * scale
      const drawH = ih * scale
      const x = (pageWidth - drawW) / 2
      const y = (pageHeight - drawH) / 2
      page.drawImage(img, { x, y, width: drawW, height: drawH })
    }
    const outBytes = await pdfDoc.save()
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'attachment; filename="images.pdf"')
    res.end(Buffer.from(outBytes))
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to create PDF from images' })
  } finally {
    try {
      for (const f of files) { try { await fsp.unlink(f.path) } catch {} }
    } catch {}
  }
})

app.post('/api/merge-pdf', upload.array('files', 50), async (req, res) => {
  const files = req.files || []
  if (!files.length) return res.status(400).json({ error: 'No PDFs uploaded' })
  try {
    const outDoc = await PDFDocument.create()
    for (const f of files) {
      const bytes = await fsp.readFile(f.path)
      const src = await PDFDocument.load(bytes)
      const pages = await outDoc.copyPages(src, src.getPageIndices())
      for (const p of pages) outDoc.addPage(p)
    }
    const outBytes = await outDoc.save()
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'attachment; filename="merged.pdf"')
    res.end(Buffer.from(outBytes))
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to merge PDFs' })
  } finally {
    try { for (const f of files) { try { await fsp.unlink(f.path) } catch {} } } catch {}
  }
})

app.post('/api/pdf-to-word', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
  const inputPath = req.file.path
  const outDir = path.dirname(inputPath)
  try {
    const soffice = findSoffice()
    await new Promise((resolve, reject) => {
      const args = ['--headless', '--norestore', '--nolockcheck', '--convert-to', 'docx', '--outdir', outDir, inputPath]
      const child = spawn(soffice, args, { stdio: 'ignore' })
      child.on('error', reject)
      child.on('exit', (code) => code === 0 ? resolve() : reject(new Error('LibreOffice conversion failed with code ' + code)))
    })
    const inBase = path.parse(inputPath).name
    let outPath = path.join(outDir, inBase + '.docx')
    try { await fsp.access(outPath) } catch {
      const origBase = path.parse(req.file.originalname).name
      const altPath = path.join(outDir, origBase + '.docx')
      try { await fsp.access(altPath); outPath = altPath } catch {}
    }
    await fsp.access(outPath)
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(outPath)}"`)
    const stream = fs.createReadStream(outPath)
    stream.pipe(res)
    stream.on('close', async () => {
      try { await fsp.unlink(inputPath) } catch {}
      try { await fsp.unlink(outPath) } catch {}
    })
  } catch (e) {
    res.status(500).json({ error: e.message || 'Failed to convert PDF to Word' })
  }
})

app.post('/api/convert', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
  const inputPath = req.file.path
  const outDir = path.dirname(inputPath)
  try {
    await convertWithSoffice(inputPath, outDir)
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Conversion failed' })
  }
  try {
    const inBase = path.parse(inputPath).name
    let outPath = path.join(outDir, inBase + '.pdf')
    try { await fsp.access(outPath) } catch {
      const origBase = path.parse(req.file.originalname).name
      const altPath = path.join(outDir, origBase + '.pdf')
      try { await fsp.access(altPath); outPath = altPath } catch {}
    }
    await fsp.access(outPath)
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(outPath)}"`)
    const stream = fs.createReadStream(outPath)
    stream.pipe(res)
    stream.on('close', async () => {
      try { await fsp.unlink(inputPath) } catch {}
      try { await fsp.unlink(outPath) } catch {}
    })
  } catch (e) {
    res.status(500).json({ error: 'Converted file not found' })
  }
})

const port = process.env.PORT || 3000
app.listen(port, () => {
  console.log(`doconvert server listening on http://localhost:${port}/`)
})