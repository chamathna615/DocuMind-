import { jsPDF } from 'jspdf'

export function downloadMockFile(filename:string, content:string) {
  const cleanFilename = filename.replace(/\.[^/.]+$/, '')
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const lines = doc.splitTextToSize(content || ' ', 500)
  doc.text(lines, 40, 60)
  doc.save(`${cleanFilename}.pdf`)
}
