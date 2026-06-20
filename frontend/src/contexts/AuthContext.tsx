import React, { createContext, useState, useEffect, useContext } from 'react';
import { User, AuthResponse } from '../types';
import { api } from '../services/api';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Attempt to restore user profile from localStorage for instant render.
 */
function getCachedUser(): User | null {
  try {
    const cached = localStorage.getItem('user');
    return cached ? JSON.parse(cached) : null;
  } catch {
    return null;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const storedToken = localStorage.getItem('token');
  const cachedUser = getCachedUser();

  // If we have both a cached user and token, render immediately (isLoading = false)
  const [user, setUser] = useState<User | null>(cachedUser);
  const [token, setToken] = useState<string | null>(storedToken);
  const [isLoading, setIsLoading] = useState(!cachedUser || !storedToken);

  // Background revalidation — silently verify the token is still valid
  useEffect(() => {
    async function revalidate() {
      const currentToken = localStorage.getItem('token');
      if (!currentToken) {
        setUser(null);
        setToken(null);
        setIsLoading(false);
        return;
      }

      try {
        const response = await api.get<{ user: User }>('/auth/me');
        const freshUser = response.data.user;
        setUser(freshUser);
        setToken(currentToken);
        localStorage.setItem('user', JSON.stringify(freshUser));
      } catch (error) {
        // Token is invalid or expired — clear everything
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setToken(null);
        setUser(null);
      }
      setIsLoading(false);
    }
    revalidate();
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const response = await api.post<AuthResponse>('/auth/login', { email, password });
      const { token: newToken, user: newUser } = response.data;
      localStorage.setItem('token', newToken);
      localStorage.setItem('user', JSON.stringify(newUser));
      setToken(newToken);
      setUser(newUser);
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (name: string, email: string, password: string) => {
    setIsLoading(true);
    try {
      const response = await api.post<AuthResponse>('/auth/register', { name, email, password });
      const { token: newToken, user: newUser } = response.data;
      localStorage.setItem('token', newToken);
      localStorage.setItem('user', JSON.stringify(newUser));
      setToken(newToken);
      setUser(newUser);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
