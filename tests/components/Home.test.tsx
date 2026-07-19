import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Home from '@/app/page'

vi.mock('@/components/Studio', () => ({
  default: ({ signedIn }: { signedIn: boolean }) => (
    <div data-testid="studio-mock" data-signed-in={String(signedIn)}>
      Studio
    </div>
  ),
}))

vi.mock('@/components/Auth', () => ({
  default: () => <div data-testid="auth-mock">Auth</div>,
}))

vi.mock('@/components/AuthProvider', () => ({
  default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useAuth: () => ({ user: { id: 'test' }, session: {}, loading: false, signOut: vi.fn() }),
}))

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace: vi.fn() }),
}))

describe('Home (page)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs()
  })

  it('renders Studio when authenticated', () => {
    render(<Home />)
    expect(screen.getByTestId('studio-mock')).toBeInTheDocument()
  })

  it('renders Studio signed out when unauthenticated', async () => {
    const useAuthMod = await import('@/components/AuthProvider')
    vi.spyOn(useAuthMod, 'useAuth').mockReturnValue({
      user: null,
      session: null,
      loading: false,
      signOut: vi.fn(),
    })
    render(<Home />)
    expect(screen.getByTestId('studio-mock')).toBeInTheDocument()
  })
})
