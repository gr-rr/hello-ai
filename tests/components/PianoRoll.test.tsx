import { render, screen } from '@testing-library/react'
import PianoRoll from '@/components/PianoRoll'

const mockNotes = [
  { pitch: 60, start: 0, end: 0.5, velocity: 80 },
  { pitch: 64, start: 0.5, end: 1.0, velocity: 80 },
  { pitch: 67, start: 1.0, end: 1.5, velocity: 80 },
]

describe('PianoRoll', () => {
  it('renders without crashing with notes', () => {
    render(<PianoRoll notes={mockNotes} />)
    expect(screen.getByText(/3 notes/)).toBeInTheDocument()
  })

  it('renders empty state when no notes', () => {
    render(<PianoRoll notes={[]} />)
    expect(screen.getByText('No notes to display.')).toBeInTheDocument()
  })

  it('renders note labels on SVG', () => {
    render(<PianoRoll notes={mockNotes} bpm={120} />)
    expect(screen.getAllByText(/C4/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/E4/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByText(/G4/).length).toBeGreaterThanOrEqual(1)
  })
})
