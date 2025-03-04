export interface User {
  id: string
  roles?: string[]
  exp: number
  email: string
  name: string
  avatar?: string
  createdAt: string
  updatedAt: string
}