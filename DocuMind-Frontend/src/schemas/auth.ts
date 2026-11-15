import { z } from 'zod'

export const loginSchema = z.object({ email:z.string().trim().email('Enter a valid email address'), password:z.string().min(1,'Password is required'), remember:z.boolean() })
export const registrationSchema = z.object({
  name:z.string().trim().min(2,'Name must contain at least 2 characters').max(100), email:z.string().trim().email('Enter a valid email address'),
  password:z.string().min(8,'Use at least 8 characters').regex(/[A-Z]/,'Add an uppercase letter').regex(/[a-z]/,'Add a lowercase letter').regex(/\d/,'Add a number'),
  confirmPassword:z.string(), terms:z.literal(true,{error:'You must accept the terms'}),
}).refine((v)=>v.password===v.confirmPassword,{path:['confirmPassword'],message:'Passwords do not match'})

const newPasswordRules = z.string().min(8,'Use at least 8 characters').max(72,'Use at most 72 characters').regex(/[A-Z]/,'Add an uppercase letter').regex(/[a-z]/,'Add a lowercase letter').regex(/\d/,'Add a number')
export const forgotPasswordSchema = z.object({ email:z.string().trim().email('Enter a valid email address') })
export const resetPasswordSchema = z.object({ password:newPasswordRules, confirm:z.string() }).refine((v)=>v.password===v.confirm,{path:['confirm'],message:'Passwords do not match'})

