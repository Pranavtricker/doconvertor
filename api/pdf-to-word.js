import formidable from 'formidable'
import ConvertAPI from 'convertapi'
import fs from 'fs/promises'

export const config = { api: { bodyParser: false } }

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  const form = formidable({ multiples: false, keepExtensions: true })

  form.parse(req, async (err, fields, files) => {
    if (err) { res.status(400).json({ error: err.message }); return }

    const f = files.file
    if (!f) { res.status(400).json({ error: 'No file uploaded' }); return }

    const secret = process.env.CONVERTAPI_SECRET
    if (!secret) { res.status(500).json({ error: 'CONVERTAPI_SECRET not configured' }); return }

    try {
      const convertapi = new ConvertAPI(secret)
      const result = await convertapi.convert('docx', { File: f.filepath }, 'pdf')
      const docxUrl = result.file.url

      const resp = await fetch(docxUrl)
      if (!resp.ok) throw new Error('Failed to download converted file')

      const buf = Buffer.from(await resp.arrayBuffer())

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      res.setHeader('Content-Disposition', 'attachment; filename="' + (f.originalFilename || 'document').replace(/\.pdf$/i, '') + '.docx"')
      res.end(buf)

    } catch (e) {
      console.error('Conversion error:', e)
      res.status(500).json({ error: e.message || 'Conversion failed' })
    } finally {
      try { await fs.unlink(f.filepath) } catch { }
    }
  })
}