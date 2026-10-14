import { formatCents, type Expense } from '../domain/budget'

interface ExpenseListProps {
  expenses: readonly Expense[]
  onRemove: (id: string) => void
}

// The capture group keeps the bold parts in split(): even indexes are plain text, odd are bold.
const BOLD = /\*\*(.+?)\*\*/

/**
 * Lets users emphasise part of a description with **bold** markers. Renders React nodes,
 * never HTML, so a description is always shown as text and cannot inject markup.
 */
function FormattedDescription({ text }: { text: string }) {
  return text
    .split(BOLD)
    .map((part, index) => (index % 2 === 1 ? <strong key={index}>{part}</strong> : part))
}

export function ExpenseList({ expenses, onRemove }: ExpenseListProps) {
  if (expenses.length === 0) {
    return <p className="card empty">No expenses yet.</p>
  }

  const sorted = [...expenses].sort((a, b) => b.date.localeCompare(a.date))

  return (
    <ul className="card expense-list" aria-label="Expenses">
      {sorted.map((expense) => (
        <li key={expense.id}>
          <span className="date">{expense.date}</span>
          <span className="description">
            <FormattedDescription text={expense.description} />
          </span>
          <span className="category">{expense.category}</span>
          <span className="amount">{formatCents(expense.amountCents)}</span>
          <button
            type="button"
            onClick={() => onRemove(expense.id)}
            aria-label={`Remove ${expense.description}`}
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  )
}
