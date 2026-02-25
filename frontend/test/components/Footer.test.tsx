import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { Footer } from '../../components/layout/Footer'

describe('Footer', () => {
  it('renders all section titles', () => {
    render(<Footer />)
    expect(screen.getByText('Product')).toBeInTheDocument()
    expect(screen.getByText('Resources')).toBeInTheDocument()
    expect(screen.getByText('Community')).toBeInTheDocument()
  })

  it('renders copyright notice', () => {
    render(<Footer />)
    const year = new Date().getFullYear()
    expect(screen.getByText(new RegExp(`© ${year} Stellar Suite`))).toBeInTheDocument()
  })

  it('renders external links with correct attributes', () => {
    render(<Footer />)
    const githubLink = screen.getByText('GitHub')
    expect(githubLink.closest('a')).toHaveAttribute('href', 'https://github.com/0xVida/stellar-suite')
    expect(githubLink.closest('a')).toHaveAttribute('target', '_blank')
  })
})
