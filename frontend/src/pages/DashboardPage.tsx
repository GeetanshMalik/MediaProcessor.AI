import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../services/api';
import { Job } from '../types';
import Header from '../components/Header';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';

// Register Chart.js components
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Filler);

export const DashboardPage: React.FC = () => {
  const { data, isLoading, error } = useQuery({
    queryKey: ['jobStats'],
    queryFn: async () => {
      const response = await api.get('/jobs/stats');
      return response.data;
    },
    refetchInterval: 10000 // Refresh every 10s
  });

  const totalJobs = data?.totalJobs || 0;
  const safeJobs = data?.safeJobs || 0;
  const unsafeJobs = data?.unsafeJobs || 0;
  const weeklyUploads = data?.weeklyUploads || [];
  const allJobs: Job[] = data?.allJobs || [];

  const [searchQuery, setSearchQuery] = useState('');
  const [safetyFilter, setSafetyFilter] = useState<'all' | 'safe' | 'unsafe' | 'failed' | 'pending-processing'>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');

  const filteredJobs = allJobs.filter((job) => {
    if (searchQuery.trim() !== '') {
      const query = searchQuery.toLowerCase();
      const matchCaption = job.caption?.toLowerCase().includes(query) || false;
      const labels = Array.isArray(job.labels) ? job.labels : [];
      const matchLabels = labels.some((label: string) => label.toLowerCase().includes(query));
      if (!matchCaption && !matchLabels) return false;
    }

    if (safetyFilter !== 'all') {
      if (safetyFilter === 'safe') {
        if (job.status !== 'completed' || job.flagged) return false;
      } else if (safetyFilter === 'unsafe') {
        if (job.status !== 'completed' || !job.flagged) return false;
      } else if (safetyFilter === 'failed') {
        if (job.status !== 'failed') return false;
      } else if (safetyFilter === 'pending-processing') {
        if (job.status !== 'pending' && job.status !== 'processing') return false;
      }
    }

    if (dateFilter !== 'all') {
      const jobDate = new Date(job.createdAt);
      const now = new Date();
      if (dateFilter === 'today') {
        const isSameDay =
          jobDate.getDate() === now.getDate() &&
          jobDate.getMonth() === now.getMonth() &&
          jobDate.getFullYear() === now.getFullYear();
        if (!isSameDay) return false;
      } else if (dateFilter === 'week') {
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(now.getDate() - 7);
        if (jobDate < oneWeekAgo) return false;
      } else if (dateFilter === 'month') {
        const oneMonthAgo = new Date();
        oneMonthAgo.setDate(now.getDate() - 30);
        if (jobDate < oneMonthAgo) return false;
      }
    }

    return true;
  });

  // Chart.js config
  const chartData = {
    labels: weeklyUploads.map((d: { date: string; count: number }) => {
      const dt = new Date(d.date + 'T00:00:00');
      return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    }),
    datasets: [
      {
        label: 'Uploads',
        data: weeklyUploads.map((d: { date: string; count: number }) => d.count),
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.08)',
        fill: true,
        tension: 0.35,
        pointRadius: 5,
        pointBackgroundColor: '#3b82f6',
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointHoverRadius: 7
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      title: { display: false },
      tooltip: {
        backgroundColor: '#1e293b',
        titleColor: '#f8fafc',
        bodyColor: '#e2e8f0',
        padding: 10,
        cornerRadius: 8,
        displayColors: false
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          stepSize: 1,
          color: '#94a3b8',
          font: { size: 12 }
        },
        grid: { color: 'rgba(148, 163, 184, 0.1)' }
      },
      x: {
        ticks: {
          color: '#94a3b8',
          font: { size: 11 }
        },
        grid: { display: false }
      }
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      {/* Header */}
      <Header />

      {/* Main Content */}
      <main className="flex-grow mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">Overview of your media processing activity.</p>
        </div>

        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="flex flex-col items-center space-y-3">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600"></div>
              <p className="text-sm text-slate-500">Loading dashboard...</p>
            </div>
          </div>
        ) : error ? (
          <div className="rounded-xl bg-rose-50 border border-rose-100 p-6 text-center text-rose-600">
            Failed to load dashboard data. Please try again.
          </div>
        ) : (
          <div className="space-y-8">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
              {/* Total Uploads */}
              <div className="relative overflow-hidden rounded-2xl bg-white border border-slate-100 p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Total Uploads</p>
                    <p className="mt-2 text-3xl font-bold text-slate-900">{totalJobs}</p>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-6 h-6">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                  </div>
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-blue-400"></div>
              </div>

              {/* Safe Images */}
              <div className="relative overflow-hidden rounded-2xl bg-white border border-slate-100 p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Safe Images</p>
                    <p className="mt-2 text-3xl font-bold text-emerald-600">{safeJobs}</p>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-6 h-6">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                    </svg>
                  </div>
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-emerald-400"></div>
              </div>

              {/* Unsafe / Flagged */}
              <div className="relative overflow-hidden rounded-2xl bg-white border border-slate-100 p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Flagged / Unsafe</p>
                    <p className="mt-2 text-3xl font-bold text-rose-600">{unsafeJobs}</p>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-6 h-6">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                    </svg>
                  </div>
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 to-rose-400"></div>
              </div>
            </div>

            {/* Weekly Line Chart */}
            <div className="rounded-2xl bg-white border border-slate-100 p-6 shadow-sm">
              <h2 className="text-lg font-bold text-slate-900 mb-4">Uploads — Last 7 Days</h2>
              <div style={{ height: '280px' }}>
                <Line data={chartData} options={chartOptions} />
              </div>
            </div>

            {/* Data Table */}
            <div className="rounded-2xl bg-white border border-slate-100 shadow-sm overflow-hidden">
              <div className="flex flex-col gap-4 border-b border-slate-100 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-lg font-bold text-slate-900">All Uploads</h2>
                <div className="flex flex-wrap items-center gap-3">
                  {/* Search Bar */}
                  <input
                    type="text"
                    placeholder="Search caption/labels..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-900 placeholder-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none transition sm:w-48"
                  />

                  {/* Safety Filter */}
                  <select
                    value={safetyFilter}
                    onChange={(e) => setSafetyFilter(e.target.value as any)}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 focus:border-blue-500 focus:bg-white focus:outline-none transition cursor-pointer"
                  >
                    <option value="all">All Safety</option>
                    <option value="safe">Safe Only</option>
                    <option value="unsafe">Flagged Only</option>
                    <option value="failed">Failed Jobs</option>
                    <option value="pending-processing">Active/Pending</option>
                  </select>

                  {/* Date Filter */}
                  <select
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value as any)}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 focus:border-blue-500 focus:bg-white focus:outline-none transition cursor-pointer"
                  >
                    <option value="all">All Dates</option>
                    <option value="today">Today</option>
                    <option value="week">Last 7 Days</option>
                    <option value="month">Last 30 Days</option>
                  </select>
                </div>
              </div>

              {allJobs.length === 0 ? (
                <div className="p-12 text-center text-slate-500 text-sm">
                  No upload records yet. Start by uploading an image.
                </div>
              ) : filteredJobs.length === 0 ? (
                <div className="p-12 text-center text-slate-500 text-sm">
                  No uploads matching the current filters.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-100">
                    <thead className="bg-slate-50/80">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">S.No</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Date & Time</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Caption</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Detected Labels</th>
                        <th className="px-6 py-3 text-left text-xs font-bold text-slate-500 uppercase tracking-wider">Safety</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {filteredJobs.map((job: Job, index: number) => {
                        const statusStyles: Record<string, string> = {
                          pending: 'bg-blue-100 text-blue-800',
                          processing: 'bg-amber-100 text-amber-800',
                          completed: 'bg-emerald-100 text-emerald-800',
                          failed: 'bg-slate-100 text-slate-700'
                        };
                        const labels = Array.isArray(job.labels) ? job.labels : [];

                        return (
                          <tr key={job.id} className="hover:bg-slate-50/50 transition">
                            <td className="px-6 py-4 text-sm font-mono font-semibold text-slate-500">{index + 1}</td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${statusStyles[job.status] || ''}`}>
                                {job.status}
                              </span>
                            </td>
                            <td className="px-6 py-4 text-sm text-slate-600">
                              {new Date(job.createdAt).toLocaleString()}
                            </td>
                            <td className="px-6 py-4 text-sm text-slate-700 max-w-xs truncate">
                              {job.status === 'failed' ? (
                                <span className="text-rose-600 font-semibold text-xs block truncate" title={job.errorMessage || 'AI Pipeline failed'}>
                                  Error: {job.errorMessage || 'AI Pipeline failed'}
                                </span>
                              ) : (
                                job.caption || <span className="text-slate-400 italic">—</span>
                              )}
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex flex-wrap gap-1 max-w-xs">
                                {labels.length > 0 ? (
                                  labels.slice(0, 4).map((label: string, i: number) => (
                                    <span key={i} className="inline-flex items-center rounded-md bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 border border-blue-100/40">
                                      {label}
                                    </span>
                                  ))
                                ) : (
                                  <span className="text-xs text-slate-400 italic">—</span>
                                )}
                                {labels.length > 4 && (
                                  <span className="text-xs text-slate-400 font-medium">+{labels.length - 4}</span>
                                )}
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              {job.status === 'completed' ? (
                                job.flagged ? (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-200">
                                    Unsafe
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                                    Safe
                                  </span>
                                )
                              ) : job.status === 'failed' ? (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-200">
                                  Failed
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 capitalize">
                                  {job.status}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default DashboardPage;
