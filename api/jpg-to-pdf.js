import { PDFDocument } from 'pdf-lib'
import formidable from 'formidable'
import fs from 'fs/promises'

export const config = { api: { bodyParser: false } }

function getSize(name) {
  const n = (name || '').toUpperCase()
  if (n === 'LETTER') return [612, 792]
  return [595, 842]
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }
  const form = formidable({ multiples: true, keepExtensions: true })
  form.parse(req, async (err, fields, files) => {
    if (err) { res.status(400).json({ error: err.message }); return }
    const list = files.files
    const imgs = Array.isArray(list) ? list : (list ? [list] : [])
    if (!imgs.length) { res.status(400).json({ error: 'No images uploaded' }); return }
    try {
      const pdfDoc = await PDFDocument.create()
      const pageSize = getSize(fields.pageSize)
      const orient = (fields.orientation || 'auto').toLowerCase()
      for (const f of imgs) {
        const buf = await fs.readFile(f.filepath)
        let img
        const lower = (f.originalFilename || '').toLowerCase()
        try {
          if (lower.endsWith('.png')) img = await pdfDoc.embedPng(buf)
          else img = await pdfDoc.embedJpg(buf)
        } catch (err) {
          console.error(`Failed to embed image ${f.originalFilename}:`, err)
          continue // Skip invalid images
        }
        let [pw, ph] = pageSize
        if (orient === 'landscape' || (orient === 'auto' && img.width > img.height)) { const t = pw; pw = ph; ph = t }
        const margin = 36
        const page = pdfDoc.addPage([pw, ph])
        const maxW = pw - margin * 2
        const maxH = ph - margin * 2
        const scale = Math.min(maxW / img.width, maxH / img.height)
        const w = img.width * scale
        const h = img.height * scale
        const x = (pw - w) / 2
        const y = (ph - h) / 2
        page.drawImage(img, { x, y, width: w, height: h })
      }

      if (pdfDoc.getPageCount() === 0) {
        throw new Error('No valid images to convert')
      }

      const bytes = await pdfDoc.save()
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', 'attachment; filename="images.pdf"')
      res.end(Buffer.from(bytes))
    } catch (e) {
      console.error('JPG to PDF error:', e)
      res.status(500).json({ error: e.message || 'Failed to create PDF from images' })
    } finally {
      // Cleanup temp files
      for (const f of imgs) {
        try { await fs.unlink(f.filepath) } catch { }
      }
    }
  })
}