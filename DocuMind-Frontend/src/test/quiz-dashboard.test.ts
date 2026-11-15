import { describe, expect, it } from 'vitest'
import { calculateScore, filterLectures } from '@/utils/helpers'
import { lectures, quizQuestions } from '@/mocks/data'

describe('quiz scoring',()=>{
  it('marks MCQ and keyword-based short answers',()=>{const answers={q1:'Learn from labelled examples',q3:'It memorises training data and does not generalise',q6:'Use dropout'};expect(calculateScore(quizQuestions.slice(0,6),answers)).toBe(3)})
  it('does not award unanswered questions',()=>expect(calculateScore(quizQuestions,{})).toBe(0))
})
describe('dashboard filtering',()=>{
  it('filters by status and text',()=>{const result=filterLectures([...lectures],'machine','completed','newest');expect(result).toHaveLength(1);expect(result[0].title).toContain('Machine')})
  it('sorts titles alphabetically',()=>{const result=filterLectures([...lectures],'','all','title');expect(result[0].title.localeCompare(result[1].title)).toBeLessThanOrEqual(0)})
})
