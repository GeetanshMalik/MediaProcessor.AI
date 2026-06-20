import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import Logo from './Logo';

export const Header: React.FC = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

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

  const navLinks = [
    { to: '/', label: 'Home' },
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/app', label: 'Upload' },
    { to: '/history', label: 'History' },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-100 bg-white">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Left: Logo */}
        <div className="flex items-center shrink-0">
          <Logo />
        </div>

        {/* Center: Desktop Nav Links */}
        <nav className="hidden md:flex items-center space-x-6">
          {navLinks.map(link => (
            <Link
              key={link.to}
              to={link.to}
              className={`text-sm font-semibold transition ${
                isActive(link.to) ? 'text-blue-600' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {link.label}
            </Link>
          ))}
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

        {/* Right: User Info (desktop) + Hamburger (mobile) */}
        <div className="flex items-center space-x-3">
          {/* Desktop: Welcome + Logout */}
          <span className="hidden sm:inline text-sm text-slate-500 truncate max-w-[140px]">
            Welcome, <strong className="text-slate-700 font-semibold">{user?.name}</strong>
          </span>
          <button
            onClick={logout}
            className="hidden sm:inline-flex rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition duration-150"
          >
            Log Out
          </button>

          {/* Mobile: Hamburger Toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden flex items-center justify-center rounded-lg p-2 text-slate-600 hover:bg-slate-100 transition"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? (
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            ) : (
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile Dropdown Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-100 bg-white shadow-lg animate-in slide-in-from-top duration-200">
          <nav className="flex flex-col px-4 py-3 space-y-1">
            {navLinks.map(link => (
              <Link
                key={link.to}
                to={link.to}
                onClick={() => setMobileMenuOpen(false)}
                className={`block rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                  isActive(link.to)
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                {link.label}
              </Link>
            ))}
            <Link
              to="/notifications"
              onClick={() => setMobileMenuOpen(false)}
              className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-semibold transition ${
                isActive('/notifications')
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              Notifications
              {hasUnread && (
                <span className="flex h-2 w-2 rounded-full bg-blue-600" />
              )}
            </Link>
          </nav>

          {/* Mobile: User Info + Logout */}
          <div className="border-t border-slate-100 px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-slate-500 truncate">
              <strong className="text-slate-700 font-semibold">{user?.name}</strong>
            </span>
            <button
              onClick={() => { logout(); setMobileMenuOpen(false); }}
              className="rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition"
            >
              Log Out
            </button>
          </div>
        </div>
      )}
    </header>
  );
};

export default Header;
