export default async function handler(req, res) {
  const wordEnabled = !!process.env.WORD_CONVERTER_URL
  const pdfWordEnabled = !!process.env.PDF_TO_WORD_URL
  res.json({ wordEnabled, pdfWordEnabled, imagePdfEnabled: true, mergePdfEnabled: true })
}