import {
  CATEGORIES,
  formatCents,
  isOverLimit,
  parseAmountToCents,
  totalCents,
  totalsByCategory,
  type Expense,
} from '../domain/budget'

interface SummaryProps {
  expenses: readonly Expense[]
  limitCents: number
  onLimitChange: (limitCents: number) => void
}

export function Summary({ expenses, limitCents, onLimitChange }: SummaryProps) {
  const total = totalCents(expenses)
  const byCategory = totalsByCategory(expenses)
  const overLimit = isOverLimit(expenses, limitCents)

  return (
    <section className="card summary" aria-label="Summary">
      <h2>Summary</h2>
      <p className={overLimit ? 'total over-limit' : 'total'}>
        Total: <strong>{formatCents(total)}</strong>
        {overLimit && <span role="alert"> — over the limit!</span>}
      </p>

      <label>
        Monthly limit (PLN, 0 = none)
        <input
          inputMode="decimal"
          defaultValue={limitCents > 0 ? String(limitCents / 100) : ''}
          onBlur={(e) => onLimitChange(parseAmountToCents(e.target.value) ?? 0)}
        />
      </label>

      <ul>
        {CATEGORIES.filter((category) => byCategory[category] > 0).map((category) => (
          <li key={category}>
            {category}: {formatCents(byCategory[category])}
          </li>
        ))}
      </ul>
    </section>
  )
}
