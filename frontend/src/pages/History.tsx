import React, { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { Job, JobStatus } from '../types';
import Header from '../components/Header';

export const History: React.FC = () => {
  const queryClient = useQueryClient();
  const [page, setPage] = useState<number>(1);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  const limit = 9; // Grid of 3x3

  // Fetch jobs with page dependencies
  const { data, isLoading, error } = useQuery({
    queryKey: ['jobs', page],
    queryFn: async () => {
      const response = await api.get(`/jobs?page=${page}&limit=${limit}`);
      return response.data;
    },
    // Dynamic polling rule: Poll every 5 seconds only if there are active processing/pending jobs in current view
    refetchInterval: (query) => {
      const jobs = query.state.data?.jobs as Job[] | undefined;
      if (!jobs) return false;
      const hasActiveJobs = jobs.some(
        (job) => job.status === 'pending' || job.status === 'processing'
      );
      return hasActiveJobs ? 5000 : false;
    }
  });

  // Retry failed job mutation
  const retryMutation = useMutation({
    mutationFn: async (jobId: string) => {
      await api.post(`/jobs/${jobId}/retry`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    }
  });

  // Delete job mutation
  const deleteMutation = useMutation({
    mutationFn: async (jobId: string) => {
      await api.delete(`/jobs/${jobId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
      queryClient.invalidateQueries({ queryKey: ['jobStats'] });
      setSelectedJob(null);
    }
  });

  const jobs = data?.jobs || [];
  const pagination = data?.pagination || { total: 0, pages: 1, page: 1 };

  useEffect(() => {
    if (!selectedJob) {
      return;
    }

    const updatedSelectedJob = jobs.find((job: Job) => job.id === selectedJob.id);
    if (updatedSelectedJob && updatedSelectedJob.updatedAt !== selectedJob.updatedAt) {
      setSelectedJob(updatedSelectedJob);
    }
  }, [jobs, selectedJob?.id, selectedJob?.updatedAt]);

  // Status styling configurations
  const getStatusBadge = (status: JobStatus, flagged: boolean) => {
    if (flagged) {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-200">
          Flagged
        </span>
      );
    }

    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
            Pending
          </span>
        );
      case 'processing':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 animate-pulse">
            Processing
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
            Completed
          </span>
        );
      case 'failed':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
            Failed
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      {/* Header */}
      <Header />

      {/* Main Body */}
      <main className="flex-grow mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-y-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Job History</h1>
            <p className="mt-1 text-sm text-slate-500">Monitor and inspect your asynchronous AI processing jobs.</p>
          </div>
          <Link
            to="/app"
            className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 transition"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-4 h-4 mr-2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            New Upload
          </Link>
        </div>

        {isLoading ? (
          <div className="flex h-64 items-center justify-center">
            <div className="flex flex-col items-center space-y-3">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600"></div>
              <p className="text-sm text-slate-500">Loading jobs...</p>
            </div>
          </div>
        ) : error ? (
          <div className="rounded-xl bg-rose-50 border border-rose-100 p-6 text-center text-rose-600">
            Failed to load jobs. Please refresh the page.
          </div>
        ) : jobs.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-16 text-center shadow-sm">
            <svg className="mx-auto h-12 w-12 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <h3 className="mt-4 text-sm font-semibold text-slate-900">No jobs uploaded yet</h3>
            <p className="mt-1 text-sm text-slate-500">Get started by uploading your first image for AI pipeline processing.</p>
            <div className="mt-6">
              <Link to="/app" className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 transition">
                Upload Image
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Jobs Grid */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {jobs.map((job: Job) => {
                const isFailed = job.status === 'failed';
                const isFlagged = job.flagged;

                return (
                  <div
                    key={job.id}
                    onClick={() => setSelectedJob(job)}
                    className={`group relative flex flex-col overflow-hidden rounded-2xl bg-white border shadow-sm cursor-pointer hover:shadow-md transition duration-200 ${
                      isFlagged
                        ? 'border-amber-200 hover:border-amber-300 bg-amber-50/5'
                        : isFailed
                        ? 'border-slate-200'
                        : 'border-slate-100 hover:border-slate-200'
                    }`}
                  >
                    {/* Thumbnail */}
                    <div className="relative aspect-video w-full bg-slate-100 overflow-hidden border-b border-slate-100">
                      <img
                        src={`${job.fileUrl}?token=${localStorage.getItem('token') || ''}`}
                        alt="Media asset"
                        className="h-full w-full object-cover group-hover:scale-[1.02] transition duration-300"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%23cbd5e1" stroke-width="1.5"%3E%3Cpath d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/%3E%3C/svg%3E';
                        }}
                      />
                      <div className="absolute top-3 left-3">
                        {getStatusBadge(job.status, isFlagged)}
                      </div>
                    </div>

                    {/* Job Details Card Body */}
                    <div className="flex flex-1 flex-col p-5">
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs font-semibold text-slate-500">
                            ID: #{job.id.substring(0, 8)}
                          </span>
                          <span className="text-xs text-slate-400">
                            {new Date(job.createdAt).toLocaleDateString()}
                          </span>
                        </div>

                        {job.caption ? (
                          <p className="mt-3 text-sm text-slate-700 line-clamp-2 font-medium">
                            {job.caption}
                          </p>
                        ) : (
                          <p className="mt-3 text-sm text-slate-400 italic">
                            {job.status === 'pending'
                              ? 'Waiting in queue...'
                              : job.status === 'processing'
                              ? 'Analyzing image...'
                              : 'No analysis results.'}
                          </p>
                        )}

                        {isFlagged && (
                          <div className="mt-3 rounded-lg bg-amber-50 border border-amber-100 px-3 py-1.5 text-xs text-amber-800 font-medium">
                            Flagged Category: <span className="font-semibold capitalize">{job.flagCategory}</span>
                          </div>
                        )}

                        {isFailed && job.errorMessage && (
                          <p className="mt-3 text-xs text-rose-600 line-clamp-2 bg-rose-50 border border-rose-100 rounded-lg px-3 py-1.5 font-medium">
                            Error: {job.errorMessage}
                          </p>
                        )}
                      </div>

                      {/* Card Actions Footer */}
                      <div className="mt-4 pt-3 border-t border-slate-100 flex space-x-2">
                        {isFailed && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              retryMutation.mutate(job.id);
                            }}
                            disabled={retryMutation.isPending}
                            className="flex-1 inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition disabled:opacity-50"
                          >
                            {retryMutation.isPending ? 'Queuing...' : 'Retry Job'}
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm('Are you sure you want to delete this job? This action cannot be undone.')) {
                              deleteMutation.mutate(job.id);
                            }
                          }}
                          disabled={deleteMutation.isPending}
                          className={`${isFailed ? 'flex-1' : 'w-full'} inline-flex items-center justify-center rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 hover:text-rose-800 transition disabled:opacity-50`}
                        >
                          {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination Controls */}
            {pagination.pages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-200/60 pt-6">
                <p className="text-sm text-slate-500">
                  Showing Page <strong className="text-slate-800">{page}</strong> of{' '}
                  <strong className="text-slate-800">{pagination.pages}</strong>
                </p>
                <div className="flex space-x-3">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(pagination.pages, p + 1))}
                    disabled={page === pagination.pages}
                    className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40 transition"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Modal Drawer: Job Details View */}
      {selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-xl animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Job Inspection</h3>
                <p className="text-xs text-slate-400 font-mono mt-0.5">ID: {selectedJob.id}</p>
              </div>
              <button
                onClick={() => setSelectedJob(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-50 hover:text-slate-700 transition"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="max-h-[75vh] overflow-y-auto px-6 py-6 space-y-6">
              {/* Full Image */}
              <div className="flex items-center justify-center bg-slate-100 rounded-xl overflow-hidden aspect-video border border-slate-200/50">
                <img
                  src={`${selectedJob.fileUrl}?token=${localStorage.getItem('token') || ''}`}
                  alt="Full Media"
                  className="max-h-[30vh] object-contain"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src =
                      'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="%23cbd5e1" stroke-width="1.5"%3E%3Cpath d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/%3E%3C/svg%3E';
                  }}
                />
              </div>

              {/* Grid Metadata */}
              <div className="grid grid-cols-2 gap-4 text-sm bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                <div>
                  <span className="block text-xs font-semibold text-slate-400 uppercase">Current Status</span>
                  <span className="mt-1 font-semibold text-slate-800 capitalize flex items-center space-x-1.5">
                    <span className={`inline-block h-2 w-2 rounded-full ${
                      selectedJob.status === 'completed' ? 'bg-emerald-500' :
                      selectedJob.status === 'failed' ? 'bg-rose-500' :
                      selectedJob.status === 'processing' ? 'bg-amber-500' : 'bg-blue-500'
                    }`}></span>
                    <span>{selectedJob.status}</span>
                  </span>
                </div>
                <div>
                  <span className="block text-xs font-semibold text-slate-400 uppercase">Created Date</span>
                  <span className="mt-1 font-medium text-slate-800">
                    {new Date(selectedJob.createdAt).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Caption (Image Captioning) */}
              <div className="space-y-1.5">
                <h4 className="text-sm font-semibold text-slate-800">Generated Caption</h4>
                {selectedJob.caption ? (
                  <div className="rounded-xl border border-slate-100 bg-white p-4 text-sm text-slate-700 leading-relaxed font-medium">
                    {selectedJob.caption}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 italic">Caption analysis not available.</p>
                )}
              </div>

              {/* Labels (Object Detection) */}
              <div className="space-y-1.5">
                <h4 className="text-sm font-semibold text-slate-800">Detected Labels / Objects</h4>
                {selectedJob.labels && Array.isArray(selectedJob.labels) && selectedJob.labels.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {selectedJob.labels.map((label: string, idx: number) => (
                      <span
                        key={idx}
                        className="inline-flex items-center rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 border border-blue-100/40"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-slate-400 italic">No labels detected.</p>
                )}
              </div>

              {/* Safety Check Results */}
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-slate-800">Content Safety Classification</h4>
                <div className={`p-4 rounded-xl border ${
                  selectedJob.status === 'completed'
                    ? selectedJob.flagged
                      ? 'border-rose-200 bg-rose-50/20 text-rose-800'
                      : 'border-emerald-100 bg-emerald-50/30 text-emerald-700'
                    : selectedJob.status === 'failed'
                    ? 'border-rose-200 bg-rose-50/20 text-rose-800'
                    : 'border-blue-100 bg-blue-50/30 text-blue-700'
                }`}>
                  {selectedJob.status === 'completed' ? (
                    selectedJob.flagged ? (
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-rose-950 flex items-center space-x-1.5">
                          <svg className="h-4.5 w-4.5 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                          <span>Content Warning: Flagged (Unsafe)</span>
                        </p>
                        <p className="text-xs">
                          This image has been flagged for containing inappropriate content matching the category:{' '}
                          <strong className="capitalize">{selectedJob.flagCategory}</strong>.
                        </p>
                      </div>
                    ) : (
                      <p className="text-sm font-semibold text-emerald-800 flex items-center space-x-1.5">
                        <svg className="h-4.5 w-4.5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                        </svg>
                        <span>Safe Search Assessment: SAFE</span>
                      </p>
                    )
                  ) : selectedJob.status === 'failed' ? (
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-rose-950 flex items-center space-x-1.5">
                        <svg className="h-4.5 w-4.5 text-rose-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>Safety Assessment: FAILED</span>
                      </p>
                      <p className="text-xs">
                        The pipeline encountered an error: <strong className="text-rose-700">{selectedJob.errorMessage || 'An error occurred during AI pipeline processing.'}</strong>
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-sm font-bold text-blue-950 flex items-center space-x-1.5">
                        <svg className="h-4.5 w-4.5 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        <span className="capitalize">Safety Assessment: {selectedJob.status}</span>
                      </p>
                      <p className="text-xs text-blue-900">
                        Safety assessment will run as soon as the image processing starts.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="border-t border-slate-100 px-6 py-4 flex justify-end">
              <button
                onClick={() => setSelectedJob(null)}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default History;
