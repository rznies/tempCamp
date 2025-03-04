import { api } from "@/api/api";

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

const TOKEN_KEY = "campusphere_auth";

export class AuthService {
  static getToken() {
    throw new Error('Method not implemented.');
  }
  static getTokens(): Tokens | null {
    const data = localStorage.getItem(TOKEN_KEY);
    return data ? JSON.parse(data) : null;
  }

  static setTokens(tokens: Tokens) {
    localStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
  }

  static clearAuth() {
    localStorage.removeItem(TOKEN_KEY);
  }

  static async refreshToken(): Promise<Tokens> {
    const tokens = this.getTokens();
    if (!tokens?.refreshToken) throw new Error("No refresh token");
    
    try {
      const response = await api.post<Tokens>("/auth/refresh", {
        refreshToken: tokens.refreshToken
      });
      
      this.setTokens(response.data);
      return response.data;
    } catch (error) {
      this.clearAuth();
      throw error;
    }
  }
}