import { type Expense } from '../domain/budget'

const STORAGE_KEY = 'budget:v1'

export interface BudgetState {
  expenses: Expense[]
  limitCents: number
}

export const EMPTY_STATE: BudgetState = { expenses: [], limitCents: 0 }

/** Reads state from storage; missing data falls back to an empty budget. */
export function loadBudget(storage: Storage): BudgetState {
  const raw = storage.getItem(STORAGE_KEY)
  if (!raw) return EMPTY_STATE
  const parsed = JSON.parse(raw) as BudgetState
  return {
    expenses: parsed.expenses,
    limitCents: parsed.limitCents,
  }
}

export function saveBudget(storage: Storage, state: BudgetState): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage can be full or blocked (private mode); the app keeps working in memory.
  }
}
