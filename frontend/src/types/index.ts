export interface User {
  id: string;
  name: string;
  email: string;
}

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface Job {
  id: string;
  userId: string;
  fileUrl: string;
  status: JobStatus;
  caption?: string | null;
  labels?: string[] | any | null; // Persisted visible labels from hosted Hugging Face analysis
  flagged: boolean;
  flagCategory?: string | null;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  jobId: string;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}
