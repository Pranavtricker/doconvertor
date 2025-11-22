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
    const child = spawn(soffice, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (d) => { stderr += d.toString() })
    child.on('error', (err) => {
      if (err && err.code === 'ENOENT') reject(new Error('LibreOffice not found. Please install LibreOffice.'))
      else reject(err)
    })
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(stderr || ('LibreOffice conversion failed with code ' + code)))
    })
  })
}

// Simple file upload endpoint for JPG to PDF conversion
app.post('/api/jpg-to-pdf', upload.array('files', 50), async (req, res) => {
  try {
    const files = req.files || [];
    if (!files.length) {
      return res.status(400).json({ error: 'No images uploaded' });
    }
    
    // Return the file information to the client
    res.json({
      success: true,
      files: files.map(file => ({
        name: file.originalname,
        path: `/uploads/${file.filename}`,
        type: file.mimetype
      }))
    });
  } catch (e) {
    console.error('Error handling JPG to PDF request:', e);
    res.status(500).json({ error: 'Failed to process request' });
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

// File upload endpoint for Word to PDF conversion
app.post('/api/convert', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  try {
    // Return the file information to the client
    res.json({
      success: true,
      file: {
        name: req.file.originalname,
        path: `/uploads/${req.file.filename}`,
        type: req.file.mimetype
      }
    });
  } catch (e) {
    console.error('Error handling file upload:', e);
    res.status(500).json({ error: 'Failed to process file' });
  }
})

const port = process.env.PORT || 3000
app.listen(port, () => {
  console.log(`doconvert server listening on http://localhost:${port}/`)
})

app.get('/api/health', (req, res) => {
  const pathGuess = findSoffice()
  const exists = (() => { try { return fs.existsSync(pathGuess) } catch { return false } })()
  res.json({ sofficePath: pathGuess, exists })
})