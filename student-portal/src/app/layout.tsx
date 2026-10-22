import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Student Portal - Reflection AI Assessment",
  description: "Academic Reflection Assessment Submission and Results Portal",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen bg-slate-50 flex flex-col">
        <header className="border-b bg-white sticky top-0 z-50 shadow-sm">
          <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <span className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold text-lg">
                R
              </span>
              <div>
                <span className="font-semibold text-slate-900 tracking-tight block text-sm sm:text-base">
                  Student Portal
                </span>
                <span className="text-xs text-slate-500 block">Reflection AI System</span>
              </div>
            </div>
            <nav className="flex items-center space-x-4">
              <a href="/dashboard" className="text-sm font-medium text-slate-600 hover:text-blue-600 transition">
                Sessions
              </a>
              <a href="/login" className="text-sm font-medium text-slate-600 hover:text-blue-600 transition">
                Sign In
              </a>
            </nav>
          </div>
        </header>
        <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8">
          {children}
        </main>
        <footer className="border-t bg-white py-6 text-center text-xs text-slate-500">
          Reflection AI Assessment Platform &copy; 2026. All rights reserved.
        </footer>
      </body>
    </html>
  );
}
