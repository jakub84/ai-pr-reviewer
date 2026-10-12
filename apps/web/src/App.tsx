import { useEffect, useState } from 'react'
import { ExpenseForm } from './components/ExpenseForm'
import { ExpenseList } from './components/ExpenseList'
import { Summary } from './components/Summary'
import type { Expense } from './domain/budget'
import { loadBudget, saveBudget, type BudgetState } from './storage/budgetStorage'

export default function App() {
  const [state, setState] = useState<BudgetState>(() => loadBudget(localStorage))

  useEffect(() => {
    saveBudget(localStorage, state)
  }, [state])

  const addExpense = (expense: Omit<Expense, 'id'>) =>
    setState((current) => ({
      ...current,
      expenses: [...current.expenses, { ...expense, id: crypto.randomUUID() }],
    }))

  const removeExpense = (id: string) =>
    setState((current) => ({
      ...current,
      expenses: current.expenses.filter((expense) => expense.id !== id),
    }))

  const setLimit = (limitCents: number) => setState((current) => ({ ...current, limitCents }))

  return (
    <main className="app">
      <h1>Budget</h1>
      <div className="layout">
        <ExpenseForm onAdd={addExpense} />
        <Summary expenses={state.expenses} limitCents={state.limitCents} onLimitChange={setLimit} />
      </div>
      <ExpenseList expenses={state.expenses} onRemove={removeExpense} />
    </main>
  )
}
