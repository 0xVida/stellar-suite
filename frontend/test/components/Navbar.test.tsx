import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Navbar } from '../../components/layout/Navbar'

describe('Navbar', () => {
  it('renders the logo and title', () => {
    render(<Navbar />)
    const logo = screen.getByAltText('Stellar Suite')
    const title = screen.getByText('Stellar Suite')
    expect(logo).toBeInTheDocument()
    expect(title).toBeInTheDocument()
  })

  it('renders all navigation links', () => {
    render(<Navbar />)
    expect(screen.getByText('Features')).toBeInTheDocument()
    expect(screen.getByText('Templates')).toBeInTheDocument()
    expect(screen.getByText('Compare')).toBeInTheDocument()
    expect(screen.getByText('Docs')).toBeInTheDocument()
  })

  it('renders external links with correct attributes', () => {
    render(<Navbar />)
    const docsLink = screen.getByText('Docs')
    expect(docsLink.closest('a')).toHaveAttribute('target', '_blank')
    expect(docsLink.closest('a')).toHaveAttribute('rel', 'noopener noreferrer')
  })
})
