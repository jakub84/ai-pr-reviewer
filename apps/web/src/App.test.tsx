import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  beforeEach(() => localStorage.clear())

  it('adds an expense and updates the total', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText('Description'), 'Coffee')
    await user.type(screen.getByLabelText('Amount (PLN)'), '9,50')
    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(screen.getByRole('list', { name: 'Expenses' })).toHaveTextContent('Coffee')
    expect(screen.getByLabelText('Summary')).toHaveTextContent(/Total:\s*9,50/)
  })

  it('shows validation errors and does not add invalid expenses', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.click(screen.getByRole('button', { name: 'Add' }))

    expect(screen.getByText('Description is required')).toBeInTheDocument()
    expect(screen.getByText('No expenses yet.')).toBeInTheDocument()
  })

  it('removes an expense', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.type(screen.getByLabelText('Description'), 'Taxi')
    await user.type(screen.getByLabelText('Amount (PLN)'), '30')
    await user.click(screen.getByRole('button', { name: 'Add' }))
    await user.click(screen.getByRole('button', { name: 'Remove Taxi' }))

    expect(screen.getByText('No expenses yet.')).toBeInTheDocument()
  })
})
