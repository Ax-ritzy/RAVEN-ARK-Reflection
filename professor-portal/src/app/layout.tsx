import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Professor Admin Portal - Reflection AI Assessment",
  description: "Authoritative Administration, Evaluation, and Mark Management Portal",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen bg-slate-50 flex flex-col">
        <header className="border-b bg-slate-900 text-white sticky top-0 z-50 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <span className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-lg">
                P
              </span>
              <div>
                <span className="font-semibold tracking-tight block text-sm sm:text-base text-slate-100">
                  Professor Admin Portal
                </span>
                <span className="text-xs text-slate-400 block">Reflection AI System</span>
              </div>
            </div>
            <nav className="flex items-center space-x-6 text-sm font-medium">
              <a href="/dashboard" className="text-slate-300 hover:text-white transition">
                Dashboard
              </a>
              <a href="/students" className="text-slate-300 hover:text-white transition">
                Students
              </a>
              <a href="/sessions" className="text-slate-300 hover:text-white transition">
                Sessions
              </a>
              <a href="/references" className="text-slate-300 hover:text-white transition">
                References
              </a>
              <a href="/assessments" className="text-slate-300 hover:text-white transition">
                Assessments
              </a>
              <a href="/reports" className="text-slate-300 hover:text-white transition">
                Reports
              </a>
              <a href="/login" className="text-xs font-semibold px-3 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 transition">
                Sign In / Out
              </a>
            </nav>
          </div>
        </header>
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-8">
          {children}
        </main>
        <footer className="border-t bg-white py-6 text-center text-xs text-slate-500">
          Reflection AI Assessment Platform &copy; 2026. Authoritative Administrative Area.
        </footer>
      </body>
    </html>
  );
}
