import { isCategory, type Expense } from '../domain/budget'

const STORAGE_KEY = 'budget:v1'

export interface BudgetState {
  expenses: Expense[]
  limitCents: number
}

export const EMPTY_STATE: BudgetState = { expenses: [], limitCents: 0 }

function isExpense(value: unknown): value is Expense {
  if (typeof value !== 'object' || value === null) return false
  const e = value as Record<string, unknown>
  return (
    typeof e.id === 'string' &&
    typeof e.description === 'string' &&
    Number.isInteger(e.amountCents) &&
    typeof e.category === 'string' &&
    isCategory(e.category) &&
    typeof e.date === 'string'
  )
}

/** Reads state from storage; corrupted or missing data falls back to an empty budget. */
export function loadBudget(storage: Storage): BudgetState {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return EMPTY_STATE
    const parsed = JSON.parse(raw) as Partial<BudgetState>
    return {
      expenses: Array.isArray(parsed.expenses) ? parsed.expenses.filter(isExpense) : [],
      limitCents: Number.isInteger(parsed.limitCents) ? Number(parsed.limitCents) : 0,
    }
  } catch {
    return EMPTY_STATE
  }
}

export function saveBudget(storage: Storage, state: BudgetState): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // Storage can be full or blocked (private mode); the app keeps working in memory.
  }
}
