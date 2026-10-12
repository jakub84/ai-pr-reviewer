import { useState, type FormEvent } from 'react'
import {
  CATEGORIES,
  validateExpense,
  type Expense,
  type ExpenseDraft,
  type ExpenseErrors,
} from '../domain/budget'

interface ExpenseFormProps {
  onAdd: (expense: Omit<Expense, 'id'>) => void
}

const today = () => new Date().toISOString().slice(0, 10)

const emptyDraft = (): ExpenseDraft => ({
  description: '',
  amount: '',
  category: 'food',
  date: today(),
})

export function ExpenseForm({ onAdd }: ExpenseFormProps) {
  const [draft, setDraft] = useState<ExpenseDraft>(emptyDraft)
  const [errors, setErrors] = useState<ExpenseErrors>({})

  const update = (field: keyof ExpenseDraft) => (value: string) =>
    setDraft((current) => ({ ...current, [field]: value }))

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const result = validateExpense(draft)
    if (!result.ok) {
      setErrors(result.errors)
      return
    }
    onAdd(result.value)
    setDraft(emptyDraft())
    setErrors({})
  }

  return (
    <form className="card expense-form" onSubmit={handleSubmit} noValidate>
      <h2>Add expense</h2>

      <label>
        Description
        <input
          value={draft.description}
          onChange={(e) => update('description')(e.target.value)}
          aria-invalid={Boolean(errors.description)}
        />
        {errors.description && <span className="error">{errors.description}</span>}
      </label>

      <label>
        Amount (PLN)
        <input
          inputMode="decimal"
          value={draft.amount}
          onChange={(e) => update('amount')(e.target.value)}
          aria-invalid={Boolean(errors.amount)}
        />
        {errors.amount && <span className="error">{errors.amount}</span>}
      </label>

      <label>
        Category
        <select value={draft.category} onChange={(e) => update('category')(e.target.value)}>
          {CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
        {errors.category && <span className="error">{errors.category}</span>}
      </label>

      <label>
        Date
        <input
          type="date"
          value={draft.date}
          onChange={(e) => update('date')(e.target.value)}
          aria-invalid={Boolean(errors.date)}
        />
        {errors.date && <span className="error">{errors.date}</span>}
      </label>

      <button type="submit">Add</button>
    </form>
  )
}
