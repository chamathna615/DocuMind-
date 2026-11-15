import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StatusBadge } from '@/components/common/shared'
import { ThemeProvider, useTheme } from '@/contexts/ThemeContext'

describe('StatusBadge',()=>{it('shows text and an icon',()=>{render(<StatusBadge status="completed"/>);expect(screen.getByText('completed')).toBeInTheDocument();expect(screen.getByText('completed').closest('span')?.querySelector('svg')).toBeTruthy()})})
function Switch(){const {theme,toggle}=useTheme();return <button onClick={toggle}>{theme}</button>}
describe('theme switching',()=>{it('toggles and persists dark mode',()=>{render(<ThemeProvider><Switch/></ThemeProvider>);fireEvent.click(screen.getByRole('button',{name:'light'}));expect(screen.getByRole('button',{name:'dark'})).toBeInTheDocument();expect(localStorage.getItem('lecturelens_theme')).toBe('dark')})})
