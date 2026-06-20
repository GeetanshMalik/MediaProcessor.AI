import React, { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';
import { Job } from '../types';
import Header from '../components/Header';

export const UploadPage: React.FC = () => {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successJob, setSuccessJob] = useState<Job | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Drag over states
  const [isDragActive, setIsDragActive] = useState<boolean>(false);

  const allowedFormats = ['image/jpeg', 'image/png', 'image/webp'];
  const maxSizeBytes = 5 * 1024 * 1024; // 5MB

  // Validation function
  const validateAndSetFile = (selectedFile: File) => {
    setError(null);
    setSuccessJob(null);
    setProgress(0);

    if (!allowedFormats.includes(selectedFile.type)) {
      setError('Only JPG, PNG, and WEBP formats are allowed.');
      setFile(null);
      setPreviewUrl(null);
      return;
    }

    if (selectedFile.size > maxSizeBytes) {
      setError('File size must not exceed 5 MB.');
      setFile(null);
      setPreviewUrl(null);
      return;
    }

    setFile(selectedFile);
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true);
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);


    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleUpload = async () => {
    if (!file) return;

    setIsUploading(true);
    setError(null);
    setProgress(0);

    const formData = new FormData();
    formData.append('image', file);

    try {
      const response = await api.post('/jobs/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setProgress(percent);
          }
        }
      });

      const uploadedJob: Job = {
        id: response.data.jobId,
        userId: user?.id || '',
        fileUrl: response.data.fileUrl,
        status: response.data.status,
        flagged: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      setSuccessJob(uploadedJob);
      // Clear file inputs
      setFile(null);
      setPreviewUrl(null);
    } catch (err: any) {
      console.error(err);
      setError(
        err.response?.data?.error?.message || 
        'Failed to upload image. Please try again.'
      );
      setProgress(0);
    } finally {
      setIsUploading(false);
    }
  };

  const handleClear = () => {
    setFile(null);
    setPreviewUrl(null);
    setError(null);
    setSuccessJob(null);
    setProgress(0);
  };

  // Polling for job updates if status is pending or processing
  useEffect(() => {
    if (!successJob) return;
    if (successJob.status !== 'pending' && successJob.status !== 'processing') return;

    let isSubscribed = true;
    const intervalId = setInterval(async () => {
      try {
        const response = await api.get(`/jobs/${successJob.id}`);
        if (isSubscribed) {
          const updatedJob = response.data.job;
          setSuccessJob(updatedJob);
          if (updatedJob.status === 'completed' || updatedJob.status === 'failed') {
            clearInterval(intervalId);
          }
        }
      } catch (err) {
        console.error('Error polling job status:', err);
      }
    }, 2000);

    return () => {
      isSubscribed = false;
      clearInterval(intervalId);
    };
  }, [successJob?.id, successJob?.status]);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      {/* Shared App Header */}
      <Header />

      {/* Main Body */}
      <main className="flex-grow mx-auto w-full max-w-3xl px-4 py-12 sm:px-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Upload Image</h1>
            <p className="mt-1 text-sm text-slate-500">Supported formats: JPG, PNG, WEBP (Max 5 MB)</p>
          </div>
          <Link
            to="/history"
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
          >
            View History
          </Link>
        </div>

        <div className="space-y-6">
          {error && (
            <div className="rounded-xl bg-rose-50 border border-rose-100 p-4 text-sm text-rose-600 font-medium">
              {error}
            </div>
          )}

          {successJob && (
            <>
              {successJob.status === 'pending' && (
                <div className="rounded-xl bg-blue-50 border border-blue-100 p-6 text-blue-900 space-y-3 animate-in fade-in duration-200">
                  <div className="flex items-center space-x-2.5">
                    <svg className="h-5 w-5 text-blue-600 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <h3 className="font-bold text-blue-950">Upload Successful!</h3>
                  </div>
                  <p className="text-sm">
                    Your image was successfully uploaded and enqueued. Waiting in the background processing queue...
                  </p>
                  <div className="pt-2.5 flex flex-col sm:flex-row sm:items-center gap-y-2 sm:gap-x-6 text-sm text-blue-900 border-t border-blue-100/50">
                    <span>Job ID: <code className="font-mono bg-blue-100/50 px-2 py-0.5 rounded text-xs">{successJob.id}</code></span>
                    <span className="flex items-center space-x-1.5 font-medium">
                      Status: 
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                        Pending
                      </span>
                    </span>
                  </div>
                </div>
              )}

              {successJob.status === 'processing' && (
                <div className="rounded-xl bg-amber-50 border border-amber-100 p-6 text-amber-900 space-y-3 animate-in fade-in duration-200">
                  <div className="flex items-center space-x-2.5">
                    <svg className="h-5 w-5 text-amber-500 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <h3 className="font-bold text-amber-950">Processing Media Asset...</h3>
                  </div>
                  <p className="text-sm">
                    The AI analysis pipeline is running. Generating a detailed caption, detecting objects, and performing safety checks.
                  </p>
                  <div className="pt-2.5 flex flex-col sm:flex-row sm:items-center gap-y-2 sm:gap-x-6 text-sm text-amber-900 border-t border-amber-100/50">
                    <span>Job ID: <code className="font-mono bg-amber-100/50 px-2 py-0.5 rounded text-xs">{successJob.id}</code></span>
                    <span className="flex items-center space-x-1.5 font-medium">
                      Status: 
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 animate-pulse">
                        Processing
                      </span>
                    </span>
                  </div>
                </div>
              )}

              {successJob.status === 'completed' && (
                <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-6 text-emerald-800 space-y-4 animate-in fade-in duration-200">
                  <div className="flex items-center space-x-2.5">
                    <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <h3 className="font-bold text-emerald-950">Processing Completed!</h3>
                  </div>
                  <p className="text-sm">
                    {successJob.flagged 
                      ? 'Your media asset was processed but has been FLAGGED for unsafe content.'
                      : 'Your media asset was successfully processed and verified as SAFE.'
                    }
                  </p>

                  {/* Summary of Results */}
                  <div className="bg-white/80 border border-emerald-100/50 rounded-xl p-4 space-y-3.5 text-sm text-slate-700">
                    <div>
                      <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Generated Caption</span>
                      <p className="font-medium text-slate-800 italic leading-relaxed bg-white border border-slate-100 p-3 rounded-lg">
                        "{successJob.caption || 'No caption generated.'}"
                      </p>
                    </div>

                    <div>
                      <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Detected Labels / Objects</span>
                      {successJob.labels && Array.isArray(successJob.labels) && successJob.labels.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 mt-1">
                          {successJob.labels.map((label: string, idx: number) => (
                            <span key={idx} className="inline-flex items-center rounded-lg bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 border border-blue-100/30">
                              {label}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">No labels detected.</span>
                      )}
                    </div>

                    <div>
                      <span className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Content Safety Check</span>
                      <div className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                        successJob.flagged 
                          ? 'bg-rose-100 text-rose-800 border-rose-200' 
                          : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                      }`}>
                        {successJob.flagged ? `Flagged: ${successJob.flagCategory}` : 'SAFE'}
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-y-2 text-sm text-emerald-900 border-t border-emerald-100">
                    <span>Job ID: <code className="font-mono bg-emerald-100/50 px-2 py-0.5 rounded text-xs">{successJob.id}</code></span>
                    <div className="flex items-center space-x-4">
                      <button
                        onClick={handleClear}
                        className="text-xs font-bold text-slate-500 hover:text-slate-800 transition"
                      >
                        Upload Another
                      </button>
                      <Link
                        to="/history"
                        className="inline-flex items-center font-semibold text-emerald-950 hover:text-emerald-800 hover:underline"
                      >
                        Go to Job History
                        <svg className="ml-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                    </div>
                  </div>
                </div>
              )}

              {successJob.status === 'failed' && (
                <div className="rounded-xl bg-rose-50 border border-rose-100 p-6 text-rose-800 space-y-3 animate-in fade-in duration-200">
                  <div className="flex items-center space-x-2.5">
                    <svg className="h-5 w-5 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <h3 className="font-bold text-rose-950">Processing Failed!</h3>
                  </div>
                  <p className="text-sm text-rose-900">
                    The AI processing pipeline encountered an error. The safety classification and image description could not be completed.
                  </p>
                  
                  {/* Detailed Error Box */}
                  <div className="rounded-lg border border-rose-200 bg-rose-100/40 p-4 text-xs font-mono text-rose-950 whitespace-pre-wrap break-all leading-relaxed">
                    Error: {successJob.errorMessage || 'An unknown error occurred during pipeline execution.'}
                  </div>

                  <div className="pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-y-2 text-sm text-rose-900 border-t border-rose-100/60">
                    <span>Job ID: <code className="font-mono bg-rose-100/50 px-2 py-0.5 rounded text-xs">{successJob.id}</code></span>
                    <div className="flex items-center space-x-4">
                      <button
                        onClick={handleClear}
                        className="text-xs font-bold text-slate-500 hover:text-slate-800 transition"
                      >
                        Try Again
                      </button>
                      <Link
                        to="/history"
                        className="inline-flex items-center font-semibold text-rose-950 hover:text-rose-800 hover:underline"
                      >
                        Go to Job History
                        <svg className="ml-1 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                      </Link>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* Upload Drop Zone Card */}
          <div className="bg-white rounded-2xl border border-slate-100 p-8 shadow-sm">
            {!previewUrl ? (
              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={triggerFileInput}
                className={`flex flex-col items-center justify-center border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition duration-150 ${
                  isDragActive
                    ? 'border-blue-500 bg-blue-50/50'
                    : 'border-slate-200 bg-slate-50/50 hover:bg-slate-50 hover:border-slate-300'
                }`}
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600 mb-4 shadow-sm">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-slate-800">
                  Drag and drop your image here, or <span className="text-blue-600 hover:text-blue-500">browse</span>
                </p>
                <p className="mt-1 text-xs text-slate-500">JPG, PNG, or WEBP (Max 5 MB)</p>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  accept=".jpg,.jpeg,.png,.webp"
                  className="hidden"
                />
              </div>
            ) : (
              <div className="space-y-6">
                {/* Image Preview */}
                <div className="relative flex justify-center items-center bg-slate-100 rounded-xl overflow-hidden max-h-96 border border-slate-200/50">
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="max-h-96 object-contain"
                  />
                  <button
                    onClick={handleClear}
                    disabled={isUploading}
                    className="absolute top-3 right-3 rounded-full bg-slate-900/60 p-2 text-white hover:bg-slate-900/80 transition disabled:opacity-50"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2.5" stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* File info and Progress bar */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-slate-700 truncate max-w-xs">{file?.name}</span>
                    <span className="text-slate-500">{(file!.size / (1024 * 1024)).toFixed(2)} MB</span>
                  </div>

                  {isUploading && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>Uploading...</span>
                        <span className="font-medium">{progress}%</span>
                      </div>
                      <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-600 transition-all duration-150"
                          style={{ width: `${progress}%` }}
                        ></div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Upload Buttons */}
                <div className="flex space-x-3">
                  <button
                    onClick={handleClear}
                    disabled={isUploading}
                    className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition duration-150 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUpload}
                    disabled={isUploading || !file}
                    className="flex-1 flex justify-center items-center rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 transition duration-150 disabled:opacity-50"
                  >
                    {isUploading ? (
                      <svg className="h-5 w-5 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                    ) : (
                      'Upload for AI Processing'
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};
export default UploadPage;
