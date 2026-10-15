export const CATEGORIES = [
  'food',
  'transport',
  'housing',
  'entertainment',
  'health',
  'other',
] as const

export type Category = (typeof CATEGORIES)[number]

export interface Expense {
  id: string
  description: string
  amountCents: number
  category: Category
  /** ISO date, YYYY-MM-DD */
  date: string
}

/** Raw form values, before validation. */
export interface ExpenseDraft {
  description: string
  amount: string
  category: string
  date: string
}

export type ExpenseErrors = Partial<Record<keyof ExpenseDraft, string>>

export type ValidationResult =
  { ok: true; value: Omit<Expense, 'id'> } | { ok: false; errors: ExpenseErrors }

const MAX_DESCRIPTION_LENGTH = 80
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const AMOUNT = /^\d+([.,]\d{1,2})?$/

export function isCategory(value: string): value is Category {
  return (CATEGORIES as readonly string[]).includes(value)
}

/** Parses "12", "12.5" or "12,50" into integer cents. Returns null when invalid. */
export function parseAmountToCents(input: string): number | null {
  const trimmed = input.trim()
  if (!AMOUNT.test(trimmed)) return null
  const [whole, fraction = ''] = trimmed.replace(',', '.').split('.')
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}

function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value)
}

export function validateExpense(draft: ExpenseDraft): ValidationResult {
  const errors: ExpenseErrors = {}
  const description = draft.description.trim()

  if (description.length === 0) {
    errors.description = 'Description is required'
  } else if (description.length > MAX_DESCRIPTION_LENGTH) {
    errors.description = `Description must be at most ${MAX_DESCRIPTION_LENGTH} characters`
  }

  const amountCents = parseAmountToCents(draft.amount)
  if (amountCents === null) {
    errors.amount = 'Amount must be a number with up to 2 decimal places'
  } else if (amountCents === 0) {
    errors.amount = 'Amount must be greater than zero'
  }

  if (!isCategory(draft.category)) {
    errors.category = 'Choose a category'
  }

  if (!isValidIsoDate(draft.date)) {
    errors.date = 'Date must be a valid YYYY-MM-DD date'
  }

  if (Object.keys(errors).length > 0 || amountCents === null || !isCategory(draft.category)) {
    return { ok: false, errors }
  }

  return {
    ok: true,
    value: { description, amountCents, category: draft.category, date: draft.date },
  }
}

export function totalCents(expenses: readonly Expense[]): number {
  return expenses.reduce((sum, expense) => sum + expense.amountCents, 0)
}

export function totalsByCategory(expenses: readonly Expense[]): Record<Category, number> {
  const totals = Object.fromEntries(CATEGORIES.map((category) => [category, 0])) as Record<
    Category,
    number
  >
  for (const expense of expenses) {
    totals[expense.category] += expense.amountCents
  }
  return totals
}

/** A limit of 0 or less means "no limit". */
export function isOverLimit(expenses: readonly Expense[], limitCents: number): boolean {
  return limitCents > 0 && totalCents(expenses) > limitCents
}

/**
 * How much of the monthly limit is left, never below 0 (going over is shown by isOverLimit).
 * Returns null when there is no limit, so the UI can hide the figure.
 */
export function remainingCents(expenses: readonly Expense[], limitCents: number): number | null {
  if (limitCents <= 0) return null
  return Math.max(0, limitCents - totalCents(expenses))
}

/** Average expense amount, rounded to whole cents; 0 for an empty list. */
export function averageCents(expenses: readonly Expense[]): number {
  if (expenses.length === 0) return 0
  return Math.round(totalCents(expenses) / expenses.length)
}

const currency = new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' })

export function formatCents(cents: number): string {
  return currency.format(cents / 100)
}
