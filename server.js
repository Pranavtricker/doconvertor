import express from 'express'
import cors from 'cors'
import multer from 'multer'
import fs from 'fs'
import fsp from 'fs/promises'
import path from 'path'
import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { v4 as uuidv4 } from 'uuid'
import { PDFDocument } from 'pdf-lib'

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
      try { await fsp.mkdir(dir, { recursive: true }) } catch { }
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

// Simple file upload endpoint for JPG to PDF conversion
app.post('/api/jpg-to-pdf', upload.array('files', 50), async (req, res) => {
  try {
    const files = req.files || [];
    if (!files.length) {
      return res.status(400).json({ error: 'No images uploaded' });
    }

    const pdfDoc = await PDFDocument.create()
    // Default to A4 if not specified, though this simple endpoint might just be for file info
    // But let's implement the actual conversion here for local server completeness if needed
    // For now, matching original logic which just returned file info, 
    // BUT the frontend expects to call /api/jpg-to-pdf and get a PDF back if it's the Vercel function.
    // The original server.js just returned JSON. Let's keep it simple or upgrade it?
    // The user is likely using Vercel functions. Let's stick to the original server.js logic for this route
    // which was just returning JSON, BUT wait, the frontend script calls this endpoint and expects a blob if successful?
    // In script.js: const res = await fetch(endpoint...); const blob = await res.blob();
    // So the original server.js was actually BROKEN for local testing of jpg-to-pdf too?
    // Original server.js line 69: returns res.json({...}). Frontend expects blob.
    // So local testing of jpg-to-pdf was probably broken.
    // Let's fix it to return a PDF.

    for (const f of files) {
      const buf = await fsp.readFile(f.path)
      let img
      const lower = (f.originalname || '').toLowerCase()
      try {
        if (lower.endsWith('.png')) img = await pdfDoc.embedPng(buf)
        else img = await pdfDoc.embedJpg(buf)
        const page = pdfDoc.addPage([img.width, img.height])
        page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height })
      } catch (e) { console.error(e) }
    }
    const bytes = await pdfDoc.save()
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'attachment; filename="images.pdf"')
    res.end(Buffer.from(bytes))

  } catch (e) {
    console.error('Error handling JPG to PDF request:', e);
    res.status(500).json({ error: 'Failed to process request' });
  } finally {
    try { for (const f of (req.files || [])) await fsp.unlink(f.path).catch(() => { }) } catch { }
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
    try { for (const f of files) { try { await fsp.unlink(f.path) } catch { } } } catch { }
  }
})

app.post('/api/pdf-to-word', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

  const secret = process.env.CONVERTAPI_SECRET
  if (!secret) return res.status(500).json({ error: 'CONVERTAPI_SECRET not configured' })

  try {
    const ConvertAPI = (await import('convertapi')).default
    const convertapi = new ConvertAPI(secret)
    const result = await convertapi.convert('docx', { File: req.file.path }, 'pdf')
    const docxUrl = result.file.url

    const resp = await fetch(docxUrl)
    if (!resp.ok) throw new Error('Failed to download converted file')

    const buf = Buffer.from(await resp.arrayBuffer())

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    res.setHeader('Content-Disposition', 'attachment; filename="' + (req.file.originalname || 'document').replace(/\.pdf$/i, '') + '.docx"')
    res.end(buf)
  } catch (e) {
    console.error('Error handling file upload:', e);
    res.status(500).json({ error: e.message || 'Failed to process file' });
  } finally {
    try { await fsp.unlink(req.file.path) } catch { }
  }
})

// File upload endpoint for Word to PDF conversion
app.post('/api/convert', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

  const secret = process.env.CONVERTAPI_SECRET
  if (!secret) return res.status(500).json({ error: 'CONVERTAPI_SECRET not configured' })

  try {
    const ConvertAPI = (await import('convertapi')).default
    const convertapi = new ConvertAPI(secret)
    const result = await convertapi.convert('pdf', { File: req.file.path }, 'docx')
    const pdfUrl = result.file.url

    const resp = await fetch(pdfUrl)
    if (!resp.ok) throw new Error('Failed to download converted file')

    const buf = Buffer.from(await resp.arrayBuffer())

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'attachment; filename="' + (req.file.originalname || 'document').replace(/\.(docx|doc)$/i, '') + '.pdf"')
    res.end(buf)
  } catch (e) {
    console.error('Error handling file upload:', e);
    res.status(500).json({ error: e.message || 'Failed to process file' });
  } finally {
    try { await fsp.unlink(req.file.path) } catch { }
  }
})

// PPTX to PDF
app.post('/api/pptx-to-pdf', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

  const secret = process.env.CONVERTAPI_SECRET
  if (!secret) return res.status(500).json({ error: 'CONVERTAPI_SECRET not configured' })

  try {
    const ConvertAPI = (await import('convertapi')).default
    const convertapi = new ConvertAPI(secret)
    const result = await convertapi.convert('pdf', { File: req.file.path }, 'pptx')
    const pdfUrl = result.file.url

    const resp = await fetch(pdfUrl)
    if (!resp.ok) throw new Error('Failed to download converted file')

    const buf = Buffer.from(await resp.arrayBuffer())

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', 'attachment; filename="' + (req.file.originalname || 'presentation').replace(/\.(pptx|ppt)$/i, '') + '.pdf"')
    res.end(buf)
  } catch (e) {
    console.error('Error handling file upload:', e);
    res.status(500).json({ error: e.message || 'Failed to process file' });
  } finally {
    try { await fsp.unlink(req.file.path) } catch { }
  }
})

const port = process.env.PORT || 3000
app.listen(port, () => {
  console.log(`doconvert server listening on http://localhost:${port}/`)
})

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})