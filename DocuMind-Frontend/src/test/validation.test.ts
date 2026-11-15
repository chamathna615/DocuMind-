import { describe, expect, it, vi } from 'vitest'
import { jsPDF } from 'jspdf'
import { loginSchema, registrationSchema } from '@/schemas/auth'
import { validateLectureFile } from '@/utils/helpers'
import { downloadMockFile } from '@/utils/download'

const { saveMock, textMock, splitMock, jsPdfMock } = vi.hoisted(() => {
  const saveMock = vi.fn()
  const textMock = vi.fn()
  const splitMock = vi.fn((value: string) => [value])
  const jsPdfMock = vi.fn(function MockJsPdf() {
    return { splitTextToSize: splitMock, text: textMock, save: saveMock }
  })
  return { saveMock, textMock, splitMock, jsPdfMock }
})

vi.mock('jspdf', () => ({
  jsPDF: jsPdfMock,
}))

describe('authentication validation',()=>{
  it('rejects an invalid login email and empty password',()=>expect(loginSchema.safeParse({email:'bad',password:'',remember:true}).success).toBe(false))
  it('accepts valid login values after trimming email',()=>expect(loginSchema.safeParse({email:' student@example.com ',password:'Student123',remember:true}).success).toBe(true))
  it('accepts valid registration data',()=>expect(registrationSchema.safeParse({name:'Nimali Perera',email:'nimali@example.com',password:'Student123',confirmPassword:'Student123',terms:true}).success).toBe(true))
  it('rejects mismatched registration passwords',()=>expect(registrationSchema.safeParse({name:'Nimali',email:'n@example.com',password:'Student123',confirmPassword:'Different123',terms:true}).success).toBe(false))
})
describe('lecture file validation',()=>{
  it('accepts a valid MP3 file',()=>expect(validateLectureFile(new File(['audio'],'lecture.mp3',{type:'audio/mpeg'}))).toBeNull())
  it('accepts a valid PDF file',()=>expect(validateLectureFile(new File(['document'],'lecture.pdf',{type:'application/pdf'}))).toBeNull())
  it('rejects unsupported file types',()=>expect(validateLectureFile(new File(['x'],'notes.docx'))).toMatch(/Only MP3/))
  it('rejects an empty file',()=>expect(validateLectureFile(new File([],'empty.mp4'))).toMatch(/empty/))
  it('rejects an oversized MP3',()=>{const file=new File(['x'],'large.mp3');Object.defineProperty(file,'size',{value:101*1024*1024});expect(validateLectureFile(file)).toMatch(/100 MB/)})
  it('rejects a PDF larger than 50 MB',()=>{const file=new File(['x'],'large.pdf');Object.defineProperty(file,'size',{value:51*1024*1024});expect(validateLectureFile(file)).toMatch(/50 MB/)})
})

describe('download utility',()=>{
  it('downloads a PDF file for generated notes',()=>{
    saveMock.mockClear()
    textMock.mockClear()
    splitMock.mockClear()

    downloadMockFile('generated-study-notes.txt', 'Generated study notes')

    expect(splitMock).toHaveBeenCalledWith('Generated study notes', 500)
    expect(textMock).toHaveBeenCalled()
    expect(saveMock).toHaveBeenCalledWith('generated-study-notes.pdf')
    expect(jsPDF).toHaveBeenCalled()
  })
})
