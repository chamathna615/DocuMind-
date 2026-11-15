import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '@/contexts/AuthContext'
import { GuestOnlyRoute, ProtectedRoute, RoleGuard } from '@/routes/guards'
import { LoginPage } from '@/pages/auth/AuthPages'
import type { User } from '@/types'

const { getCurrentUserMock, loginUserMock } = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn(),
  loginUserMock: vi.fn(),
}))

vi.mock('@/api/authApi', () => ({
  getCurrentUser: getCurrentUserMock,
  loginUser: loginUserMock,
  loginWithGoogle: vi.fn(),
  logoutUser: vi.fn(),
  deleteUserAccount: vi.fn(),
}))

const student: User = {
  id: 'u1', name: 'Nimali Perera', email: 'student@example.com', role: 'student', status: 'active',
  preferredLanguage: 'English', joinedAt: '2026-01-01', lastActive: '2026-01-01', uploadCount: 0,
}

beforeEach(() => {
  vi.clearAllMocks()
  getCurrentUserMock.mockRejectedValue(new Error('No active session'))
})

function CurrentLocation(){const location=useLocation();return <p>{`${location.pathname}${location.search}${location.hash}`}</p>}

describe('route guards',()=>{
  it('redirects guests away from protected pages',async()=>{render(<MemoryRouter initialEntries={['/dashboard']}><AuthProvider><Routes><Route path="/login" element={<p>Login destination</p>}/><Route path="/dashboard" element={<ProtectedRoute><p>Private</p></ProtectedRoute>}/></Routes></AuthProvider></MemoryRouter>);expect(await screen.findByText('Login destination')).toBeInTheDocument()})
  it('blocks a student from the admin route using the backend session',async()=>{getCurrentUserMock.mockResolvedValue(student);render(<MemoryRouter initialEntries={['/admin']}><AuthProvider><Routes><Route path="/unauthorized" element={<p>Unauthorized destination</p>}/><Route path="/admin" element={<ProtectedRoute><RoleGuard role="admin"><p>Admin</p></RoleGuard></ProtectedRoute>}/></Routes></AuthProvider></MemoryRouter>);expect(await screen.findByText('Unauthorized destination')).toBeInTheDocument()})
  it('returns to the requested page after signing in',async()=>{loginUserMock.mockResolvedValue(student);render(<MemoryRouter initialEntries={['/notes/lec-1?tab=transcript#section-2']}><AuthProvider><Routes><Route path="/login" element={<GuestOnlyRoute><LoginPage/></GuestOnlyRoute>}/><Route path="/notes/:id" element={<ProtectedRoute><CurrentLocation/></ProtectedRoute>}/></Routes></AuthProvider></MemoryRouter>);await screen.findByRole('heading',{name:'Welcome back'});fireEvent.change(screen.getByLabelText('Email address'),{target:{value:'student@example.com'}});fireEvent.change(screen.getByLabelText('Password'),{target:{value:'Student123'}});fireEvent.click(screen.getByRole('button',{name:'Sign in'}));expect(await screen.findByText('/notes/lec-1?tab=transcript#section-2')).toBeInTheDocument()})
  it('shows the login page when the backend has no active session',async()=>{render(<MemoryRouter initialEntries={['/login']}><AuthProvider><Routes><Route path="/login" element={<GuestOnlyRoute><LoginPage/></GuestOnlyRoute>}/></Routes></AuthProvider></MemoryRouter>);expect(await screen.findByRole('heading',{name:'Welcome back'})).toBeInTheDocument()})
})
