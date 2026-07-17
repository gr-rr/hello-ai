import { render, screen } from '@testing-library/react'
import Home from '@/app/page'

vi.mock('@/components/Studio', () => ({
  default: ({ initialTab }: { initialTab?: string }) => (
    <div data-testid="studio-mock">Studio: {initialTab}</div>
  ),
}))

describe('Home (page)', () => {
  it('renders Studio with default tab', async () => {
    const searchParams = Promise.resolve({})
    render(await Home({ searchParams }))
    expect(screen.getByTestId('studio-mock')).toBeInTheDocument()
  })

  it('passes tab from search params', async () => {
    const searchParams = Promise.resolve({ tab: 'transcribe' })
    render(await Home({ searchParams }))
    expect(screen.getByText(/transcribe/)).toBeInTheDocument()
  })
})
