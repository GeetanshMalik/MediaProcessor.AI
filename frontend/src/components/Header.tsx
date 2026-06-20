import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import Logo from './Logo';

export const Header: React.FC = () => {
  const { user, logout } = useAuth();
  const location = useLocation();

  // Background poll notifications every 5 seconds to toggle the unread dot
  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const response = await api.get('/notifications');
      return response.data;
    },
    refetchInterval: 5000,
    enabled: !!user,
  });

  const notifications = data?.notifications || [];
  const hasUnread = notifications.some((n: any) => !n.isRead);

  const isActive = (path: string) => location.pathname === path;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-100 bg-white">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center space-x-8">
          <Logo />
          <nav className="hidden md:flex space-x-6">
            <Link
              to="/"
              className={`text-sm font-semibold transition ${
                isActive('/') ? 'text-blue-600' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Home
            </Link>
            <Link
              to="/dashboard"
              className={`text-sm font-semibold transition ${
                isActive('/dashboard') ? 'text-blue-600' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Dashboard
            </Link>
            <Link
              to="/app"
              className={`text-sm font-semibold transition ${
                isActive('/app') ? 'text-blue-600' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Upload
            </Link>
            <Link
              to="/history"
              className={`text-sm font-semibold transition ${
                isActive('/history') ? 'text-blue-600' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              History
            </Link>
            <Link
              to="/notifications"
              className={`relative text-sm font-semibold transition ${
                isActive('/notifications') ? 'text-blue-600' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Notifications
              {hasUnread && (
                <span className="absolute -top-1 -right-2 flex h-1.5 w-1.5 rounded-full bg-blue-600" />
              )}
            </Link>
          </nav>
        </div>
        <div className="flex items-center space-x-4">
          <span className="text-sm text-slate-500">
            Welcome, <strong className="text-slate-700 font-semibold">{user?.name}</strong>
          </span>
          <button
            onClick={logout}
            className="rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition duration-150"
          >
            Log Out
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
