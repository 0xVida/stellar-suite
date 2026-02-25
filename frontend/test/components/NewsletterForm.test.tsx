import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect } from 'vitest'
import { NewsletterForm } from '../../components/NewsletterForm'

describe('NewsletterForm', () => {
  it('renders the form elements', () => {
    render(<NewsletterForm />)
    expect(screen.getByText('Subscribe to our Newsletter')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('you@example.com')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Subscribe/i })).toBeInTheDocument()
  })

  it('handles successful submission', async () => {
    const user = userEvent.setup()
    render(<NewsletterForm />)
    const input = screen.getByPlaceholderText('you@example.com')
    const button = screen.getByRole('button', { name: /Subscribe/i })

    await user.type(input, 'test@example.com')
    await user.click(button)

    expect(await screen.findByText('Subscribing...')).toBeInTheDocument()
    
    // Wait for success message (1s delay)
    expect(await screen.findByText('Thank you for subscribing! Check your inbox for confirmation.', {}, { timeout: 2000 })).toBeInTheDocument()
  })
})
