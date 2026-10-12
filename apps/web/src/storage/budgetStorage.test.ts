import { beforeEach, describe, expect, it } from 'vitest'
import { EMPTY_STATE, loadBudget, saveBudget } from './budgetStorage'

describe('budgetStorage', () => {
  beforeEach(() => localStorage.clear())

  it('returns an empty budget when nothing is stored', () => {
    expect(loadBudget(localStorage)).toEqual(EMPTY_STATE)
  })

  it('round-trips saved state', () => {
    const state = {
      expenses: [
        {
          id: 'a',
          description: 'Bus',
          amountCents: 450,
          category: 'transport' as const,
          date: '2026-10-02',
        },
      ],
      limitCents: 100000,
    }
    saveBudget(localStorage, state)
    expect(loadBudget(localStorage)).toEqual(state)
  })

  it('ignores corrupted JSON and invalid entries', () => {
    localStorage.setItem('budget:v1', '{not json')
    expect(loadBudget(localStorage)).toEqual(EMPTY_STATE)

    localStorage.setItem(
      'budget:v1',
      JSON.stringify({ expenses: [{ id: 'x', category: 'cars' }], limitCents: 'lots' }),
    )
    expect(loadBudget(localStorage)).toEqual(EMPTY_STATE)
  })
})
