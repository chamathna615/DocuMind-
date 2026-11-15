import axios from 'axios'
import { API_BASE_URL } from '@/api/http'

export const apiClient=axios.create({baseURL:API_BASE_URL,timeout:15_000})
export const wait=(ms=450)=>new Promise(resolve=>window.setTimeout(resolve,ms))
