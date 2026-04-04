import { PDFDocument } from 'pdf-lib'
import formidable from 'formidable'
import fs from 'fs/promises'

export const config = { api: { bodyParser: false } }

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }
  const form = formidable({ multiples: true, keepExtensions: true })
  form.parse(req, async (err, fields, files) => {
    if (err) { res.status(400).json({ error: err.message }); return }
    const list = files.files
    const pdfs = Array.isArray(list) ? list : (list ? [list] : [])
    if (!pdfs.length) { res.status(400).json({ error: 'No PDFs uploaded' }); return }
    try {
      const outDoc = await PDFDocument.create()
      for (const f of pdfs) {
        const buf = await fs.readFile(f.filepath)
        const src = await PDFDocument.load(buf)
        const pages = await outDoc.copyPages(src, src.getPageIndices())
        for (const p of pages) outDoc.addPage(p)
      }
      const bytes = await outDoc.save()
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', 'attachment; filename="merged.pdf"')
      res.end(Buffer.from(bytes))
    } catch (e) {
      res.status(500).json({ error: e.message || 'Failed to merge PDFs' })
    } finally {
      try { for (const f of pdfs) { await fs.unlink(f.filepath).catch(() => {}) } } catch {}
    }
  })
}