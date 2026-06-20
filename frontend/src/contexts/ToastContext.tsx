import React, { createContext, useContext, useState, useCallback } from 'react';
import { X } from 'lucide-react';

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  message: string;
  duration?: number;
}

interface ToastContextType {
  toasts: Toast[];
  showToast: (type: Toast['type'], message: string, duration?: number) => void;
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
  warning: (message: string, duration?: number) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (type: Toast['type'], message: string, duration = 4000) => {
      const id = Math.random().toString(36).substring(2, 9);
      const newToast: Toast = { id, type, message, duration };
      setToasts((prev) => [...prev, newToast]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast]
  );

  const success = useCallback((message: string, duration?: number) => showToast('success', message, duration), [showToast]);
  const error = useCallback((message: string, duration?: number) => showToast('error', message, duration), [showToast]);
  const info = useCallback((message: string, duration?: number) => showToast('info', message, duration), [showToast]);
  const warning = useCallback((message: string, duration?: number) => showToast('warning', message, duration), [showToast]);

  return (
    <ToastContext.Provider value={{ toasts, showToast, success, error, info, warning, removeToast }}>
      {children}
      {/* Toast Container */}
      <div className="fixed top-5 right-5 z-50 flex w-full max-w-sm flex-col space-y-2 pointer-events-none px-4 sm:px-0">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
};

const ToastItem: React.FC<{ toast: Toast; onClose: () => void }> = ({ toast, onClose }) => {
  const dotStyles = {
    success: 'bg-emerald-500',
    error: 'bg-rose-500',
    warning: 'bg-amber-500',
    info: 'bg-blue-500',
  };

  return (
    <div
      className="pointer-events-auto flex w-full items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur-sm transition-all duration-200 animate-in fade-in slide-in-from-top-1"
      role="alert"
    >
      <div className="flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full flex-shrink-0 ${dotStyles[toast.type]}`} />
        <p className="text-xs font-semibold text-slate-800 leading-normal">{toast.message}</p>
      </div>
      <button
        onClick={onClose}
        className="flex-shrink-0 rounded-lg p-0.5 text-slate-400 hover:text-slate-600 transition"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
