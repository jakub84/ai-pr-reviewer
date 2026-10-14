import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Expense } from '../domain/budget'
import { ExpenseList } from './ExpenseList'

const expense = (description: string): Expense => ({
  id: '1',
  description,
  amountCents: 1250,
  category: 'food',
  date: '2026-10-01',
})

const renderDescription = (description: string) => {
  render(<ExpenseList expenses={[expense(description)]} onRemove={() => {}} />)
  const list = screen.getByRole('list', { name: 'Expenses' })
  const span = list.querySelector('.description')
  if (!span) throw new Error('description not rendered')
  return span
}

describe('ExpenseList descriptions', () => {
  it('renders **bold** parts in <strong>', () => {
    const span = renderDescription('Dinner with **Anna** and **Tom**')
    expect(span).toHaveTextContent('Dinner with Anna and Tom')
    expect([...span.querySelectorAll('strong')].map((el) => el.textContent)).toEqual([
      'Anna',
      'Tom',
    ])
  })

  it('leaves plain text and unmatched markers as they are', () => {
    expect(renderDescription('Taxi **home').textContent).toBe('Taxi **home')
  })

  it('shows HTML in a description as text instead of rendering it', () => {
    const span = renderDescription('<img src=x onerror="alert(1)"> **<b>hi</b>**')
    expect(span.querySelector('img')).toBeNull()
    expect(span.querySelector('b')).toBeNull()
    expect(span).toHaveTextContent('<img src=x onerror="alert(1)"> <b>hi</b>')
  })
})
