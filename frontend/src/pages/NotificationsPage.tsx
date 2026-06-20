import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../services/api';
import { Notification } from '../types';
import Header from '../components/Header';

export const NotificationsPage: React.FC = () => {
  const queryClient = useQueryClient();

  // Fetch notifications
  const { data, isLoading, error } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const response = await api.get('/notifications');
      return response.data;
    }
  });

  const notifications = data?.notifications || [];

  // Individual mark as read mutation
  const markReadMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/notifications/${id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
  });

  // Bulk mark all as read mutation
  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await api.patch('/notifications/read-all');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    }
  });

  const unreadCount = notifications.filter((n: Notification) => !n.isRead).length;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      {/* Header */}
      <Header />

      {/* Main Content */}
      <main className="flex-grow mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Notifications</h1>
            <p className="mt-1 text-sm text-slate-500">
              You have <strong className="text-slate-800">{unreadCount}</strong> unread alerts.
            </p>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition disabled:opacity-50"
            >
              {markAllReadMutation.isPending ? 'Clearing...' : 'Mark All as Read'}
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="flex flex-col items-center space-y-3">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600"></div>
              <p className="text-sm text-slate-500">Loading alerts...</p>
            </div>
          </div>
        ) : error ? (
          <div className="rounded-xl bg-rose-50 border border-rose-100 p-6 text-center text-rose-600">
            Failed to load notifications. Please try again.
          </div>
        ) : notifications.length === 0 ? (
          <div className="rounded-2xl bg-white border border-slate-100 p-16 text-center shadow-sm">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-50 text-slate-400">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h3 className="mt-4 text-sm font-semibold text-slate-900">All caught up!</h3>
            <p className="mt-1 text-sm text-slate-500 font-medium">You have no notification alerts at this time.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden divide-y divide-slate-100">
            {notifications.map((notification: Notification) => {
              const isWarning = notification.message.toLowerCase().includes('flagged') || notification.message.toLowerCase().includes('unsafe');
              const isUnread = !notification.isRead;

              return (
                <div
                  key={notification.id}
                  className={`flex items-start justify-between p-5 transition duration-150 ${
                    isUnread
                      ? isWarning
                        ? 'bg-rose-50/20'
                        : 'bg-blue-50/10'
                      : 'bg-white hover:bg-slate-50/30'
                  }`}
                >
                  <div className="flex items-start space-x-3.5 flex-1 pr-4">
                    {/* Visual Status Indicator Icon */}
                    <div className="mt-0.5">
                      {isWarning ? (
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-rose-50 text-rose-600 border border-rose-100/30">
                          <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                        </div>
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100/30">
                          <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        </div>
                      )}
                    </div>

                    <div className="space-y-1 flex-1">
                      <p className={`text-sm leading-relaxed text-slate-800 ${isUnread ? 'font-semibold' : 'font-medium'}`}>
                        {notification.message}
                      </p>
                      <span className="block text-xs text-slate-400 font-medium">
                        {new Date(notification.createdAt).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Actions Column */}
                  <div className="flex items-center space-x-3 pl-2">
                    {isUnread && (
                      <button
                        onClick={() => markReadMutation.mutate(notification.id)}
                        disabled={markReadMutation.isPending}
                        className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-800 transition disabled:opacity-50"
                      >
                        {markReadMutation.isPending ? '...' : 'Mark read'}
                      </button>
                    )}
                    {isUnread && (
                      <span className="h-2.5 w-2.5 rounded-full bg-blue-600 shadow-sm" title="Unread Alert"></span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};
export default NotificationsPage;
