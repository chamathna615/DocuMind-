import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import type { Role } from '@/types'

type ReturnLocation={pathname:string;search?:string;hash?:string}
type LoginLocationState={from?:ReturnLocation|string}

const defaultRoute=(role:Role)=>role==='admin'?'/admin':'/dashboard'

export function getPostLoginRoute(state:unknown,role:Role){
  const from=(state as LoginLocationState|null)?.from
  if(typeof from==='string')return from.startsWith('/')&&!from.startsWith('//')?from:defaultRoute(role)
  if(!from?.pathname||!from.pathname.startsWith('/')||from.pathname.startsWith('//'))return defaultRoute(role)
  return `${from.pathname}${from.search??''}${from.hash??''}`
}

export function ProtectedRoute({children}:{children:ReactNode}){const {user,loading}=useAuth();const location=useLocation();if(loading)return <div className="grid min-h-screen place-items-center"><p>Loading your workspace…</p></div>;return user?children:<Navigate to="/login" replace state={{from:{pathname:location.pathname,search:location.search,hash:location.hash}} satisfies LoginLocationState}/>}
export function GuestOnlyRoute({children}:{children:ReactNode}){const {user,loading}=useAuth();const location=useLocation();if(loading)return null;if(user)return <Navigate to={getPostLoginRoute(location.state,user.role)} replace/>;return children}
export function RoleGuard({role,children}:{role:'student'|'admin';children:ReactNode}){const {user}=useAuth();if(!user)return <Navigate to="/login" replace/>;return user.role===role?children:<Navigate to="/unauthorized" replace/>}
