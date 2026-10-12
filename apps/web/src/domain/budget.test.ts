import { describe, expect, it } from 'vitest'
import {
  isOverLimit,
  parseAmountToCents,
  totalCents,
  totalsByCategory,
  validateExpense,
  type Expense,
  type ExpenseDraft,
} from './budget'

const draft = (overrides: Partial<ExpenseDraft> = {}): ExpenseDraft => ({
  description: 'Groceries',
  amount: '12,50',
  category: 'food',
  date: '2026-10-01',
  ...overrides,
})

const expense = (overrides: Partial<Expense> = {}): Expense => ({
  id: '1',
  description: 'Groceries',
  amountCents: 1250,
  category: 'food',
  date: '2026-10-01',
  ...overrides,
})

describe('parseAmountToCents', () => {
  it.each([
    ['12', 1200],
    ['12.5', 1250],
    ['12,50', 1250],
    [' 0.99 ', 99],
  ])('parses %s', (input, expected) => {
    expect(parseAmountToCents(input)).toBe(expected)
  })

  it.each(['', 'abc', '-5', '1.234', '1e3'])('rejects %s', (input) => {
    expect(parseAmountToCents(input)).toBeNull()
  })
})

describe('validateExpense', () => {
  it('accepts a valid draft and normalizes it', () => {
    const result = validateExpense(draft({ description: '  Groceries  ' }))
    expect(result).toEqual({
      ok: true,
      value: { description: 'Groceries', amountCents: 1250, category: 'food', date: '2026-10-01' },
    })
  })

  it('reports every invalid field', () => {
    const result = validateExpense({
      description: ' ',
      amount: '0',
      category: 'cars',
      date: '2026-02-30',
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(Object.keys(result.errors).sort()).toEqual(['amount', 'category', 'date', 'description'])
  })

  it('rejects descriptions longer than 80 characters', () => {
    const result = validateExpense(draft({ description: 'x'.repeat(81) }))
    expect(result.ok).toBe(false)
  })
})

describe('totals', () => {
  const expenses = [
    expense({ id: '1', amountCents: 1000, category: 'food' }),
    expense({ id: '2', amountCents: 2500, category: 'transport' }),
    expense({ id: '3', amountCents: 500, category: 'food' }),
  ]

  it('sums all expenses', () => {
    expect(totalCents(expenses)).toBe(4000)
    expect(totalCents([])).toBe(0)
  })

  it('groups totals by category, including empty ones', () => {
    const totals = totalsByCategory(expenses)
    expect(totals.food).toBe(1500)
    expect(totals.transport).toBe(2500)
    expect(totals.health).toBe(0)
  })

  it('detects exceeding the limit', () => {
    expect(isOverLimit(expenses, 3999)).toBe(true)
    expect(isOverLimit(expenses, 4000)).toBe(false)
    expect(isOverLimit(expenses, 0)).toBe(false)
  })
})
