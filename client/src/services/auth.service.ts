import api from '@/api/api'

export class AuthService {
  static async silentCheck(): Promise<boolean> {
    try {
      const response = await api.get('/auth/verify', {
        _noRedirect: true
      })
      return response.status === 200
    } catch {
      return false
    }
  }
}