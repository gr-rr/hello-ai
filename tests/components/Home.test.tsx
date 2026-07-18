import { render, screen } from '@testing-library/react'
import Home from '@/app/page'

vi.mock('@/components/Studio', () => ({
  default: () => <div data-testid="studio-mock">Studio</div>,
}))

vi.mock('@/components/Auth', () => ({
  default: () => <div data-testid="auth-mock">Auth</div>,
}))

vi.mock('@/components/AuthProvider', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({ user: { id: "test" }, session: {}, loading: false, signOut: vi.fn() }),
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
}))

describe('Home (page)', () => {
  it('renders Studio when authenticated', () => {
    render(<Home />)
    expect(screen.getByTestId('studio-mock')).toBeInTheDocument()
  })

  it('shows Sign In button when unauthenticated', async () => {
    const useAuthMod = await import('@/components/AuthProvider')
    vi.spyOn(useAuthMod, 'useAuth').mockReturnValue({
      user: null, session: null, loading: false, signOut: vi.fn(),
    })
    render(<Home />)
    expect(screen.getByText('Sign In')).toBeInTheDocument()
  })
})
