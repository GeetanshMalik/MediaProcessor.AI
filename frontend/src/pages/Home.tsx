import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import Logo from '../components/Logo';

export const Home: React.FC = () => {
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      {/* Navigation Header */}
      <header className="sticky top-0 z-40 w-full border-b border-slate-100 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Logo />

          <nav className="flex items-center space-x-4">
            {user ? (
              <>
                <Link to="/app" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 transition">
                  Get Started
                </Link>
                <button
                  onClick={logout}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition"
                >
                  Log Out
                </button>
              </>
            ) : (
              <>
                <Link to="/register" className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-500 transition">
                  Get Started
                </Link>
                <Link to="/login" className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:text-slate-900 transition">
                  Login
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-grow">
        {/* Hero Section */}
        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8 text-center">
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl md:text-6xl max-w-4xl mx-auto leading-tight">
            AI-Powered Media Processing Platform
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600">
            Upload images and receive AI-generated captions, object detection results, and content safety analysis through an asynchronous processing pipeline.
          </p>
          <div className="mt-10 flex justify-center gap-x-4">
            <Link
              to="/app"
              className="rounded-xl bg-blue-600 px-6 py-3.5 text-base font-semibold text-white shadow-md hover:bg-blue-500 hover:shadow-lg transition duration-200"
            >
              Go to App
            </Link>
            <Link
              to="/dashboard"
              className="rounded-xl border border-slate-200 bg-white px-6 py-3.5 text-base font-semibold text-slate-700 hover:bg-slate-50 transition duration-200"
            >
              Dashboard
            </Link>
          </div>
        </section>

        {/* Features Section */}
        <section className="bg-white border-y border-slate-100 py-20 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <h2 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">
                Advanced AI Pipeline
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-slate-600">
                Every uploaded image undergoes a comprehensive three-step sequential analysis.
              </p>
            </div>

            <div className="mx-auto mt-16 grid max-w-5xl grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {/* Feature 1 */}
              <div className="relative rounded-2xl border border-slate-100 p-8 shadow-sm hover:shadow-md transition">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600 mb-6">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-slate-900">Image Captioning</h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">
                  Generates a detailed single-sentence description of image contents using a hosted Hugging Face vision-language model.
                </p>
              </div>

              {/* Feature 2 */}
              <div className="relative rounded-2xl border border-slate-100 p-8 shadow-sm hover:shadow-md transition">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600 mb-6">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.637 10.637z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-slate-900">Object & Context Labeling</h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">
                  Identifies and lists key semantic labels (humans, animals, activities, and important objects) rather than trivial details.
                </p>
              </div>

              {/* Feature 3 */}
              <div className="relative rounded-2xl border border-slate-100 p-8 shadow-sm hover:shadow-md transition col-span-1 sm:col-span-2 lg:col-span-1">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600 mb-6">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-6 h-6">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-slate-900">Content Safety</h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">
                  Screens images for inappropriate content automatically, including safety categories like violence, explicit material, bullying, harassment, and weapons.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Architecture Section */}
        <section className="py-20 sm:py-24">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <h2 className="text-3xl font-bold tracking-tight text-slate-955 sm:text-4xl">
                Scalable & Robust Architecture
              </h2>
              <p className="mx-auto mt-4 max-w-2xl text-slate-600">
                Engineered to decouple long-running media processing tasks from high-concurrency API responses.
              </p>
            </div>

            <div className="mx-auto mt-16 grid max-w-5xl grid-cols-1 gap-y-12 sm:grid-cols-2 sm:gap-x-8 lg:grid-cols-3">
              {/* Architecture 1 */}
              <div>
                <h3 className="text-lg font-bold text-slate-900 border-l-4 border-blue-600 pl-3">
                  Queue Based Processing
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">
                  Jobs are pushed to a Redis queue backed by BullMQ immediately on upload. The client receives a unique Job ID instantly, maintaining a zero-wait interface.
                </p>
              </div>

              {/* Architecture 2 */}
              <div>
                <h3 className="text-lg font-bold text-slate-900 border-l-4 border-blue-600 pl-3">
                  Asynchronous Workers
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">
                  Separate, dedicated backend workers consume tasks asynchronously from the queue. This prevents compute-heavy AI inference from blocking main API threads.
                </p>
              </div>

              {/* Architecture 3 */}
              <div>
                <h3 className="text-lg font-bold text-slate-900 border-l-4 border-blue-600 pl-3">
                  Scalable Infrastructure
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">
                  Horizontal scaling is supported out-of-the-box. Additional background worker instances can be spun up independently to digest queue loads with no API code changes.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* About Section */}
        <section className="bg-slate-100 py-20 sm:py-24 border-t border-slate-200/50">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl font-bold tracking-tight text-slate-950">
              About the Platform
            </h2>
            <div className="mt-6 text-slate-600 space-y-4 text-left leading-relaxed">
              <p>
                <strong>MediaProcessing.AI</strong> was created as a high-performance blueprint for modern media processing. In web applications, requiring users to wait synchronously for backend tasks like image analysis or video transcoding leads to high drop-offs, gateway timeouts, and server freezes under heavy load.
              </p>
              <p>
                This platform solves this by instantly persisting files in durable storage, generating a unique Job ID, recording a pending state in PostgreSQL, and enqueuing the workload. Active jobs are monitored via lightweight client-side polling, ensuring visual responsiveness.
              </p>
              <p>
                Once processed by the workers, enriched datasets (natural language captions, object matrices, safety flags) are saved back to PostgreSQL, and real-time in-app warnings are compiled for items containing unsafe material.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-100">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-y-4">
          <div className="flex items-center space-x-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-blue-600 text-white">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3 w-3">
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l-7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                <line x1="12" y1="22.08" x2="12" y2="12"/>
              </svg>
            </div>
            <span className="text-sm font-bold text-slate-900">MediaProcessing.AI</span>
          </div>
          <p className="text-xs text-slate-500">
            &copy; {new Date().getFullYear()} MediaProcessing.AI. All rights reserved. Built for professional media analysis.
          </p>
        </div>
      </footer>
    </div>
  );
};
export default Home;
