import React from 'react';
import { Loader2, BookOpen } from 'lucide-react';
import { useAuth, useTeacherRole, handleLogin, handleLogout, isFirebaseConfigured } from './services/firebaseService';
import { TeacherDashboard } from './components/Teacher/TeacherDashboard';
import { StudentView } from './components/Student/StudentView';

export default function App() {
  const { user, loading } = useAuth();
  const { isTeacher, isPrimaryTeacher, loading: roleLoading } = useTeacherRole(user);

  // 1. Safety Check: Is Firebase Configured?
  if (!isFirebaseConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
        <div className="bg-red-50 text-red-700 p-6 rounded-lg max-w-md text-center border border-red-200 shadow-sm">
          <h2 className="font-bold text-lg mb-2">Configuration Missing</h2>
          <p>Please check your .env file or Netlify settings for Firebase credentials.</p>
        </div>
      </div>
    );
  }

  // 2. Loading State (Checking Auth)
  if (loading || (user && roleLoading)) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="animate-spin text-indigo-600 w-8 h-8"/>
      </div>
    );
  }

  // 3. Login Screen (No User)
  if (!user) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-100 p-4">
        <div className="bg-white p-8 rounded-xl shadow-lg text-center max-w-sm w-full">
          <BookOpen className="w-12 h-12 mx-auto text-indigo-600 mb-4"/>
          <h1 className="text-2xl font-bold mb-2 text-slate-800">Math Quiz Login</h1>
          <p className="text-slate-500 mb-6">Sign in to access your quizzes</p>
          <button 
            onClick={handleLogin} 
            className="w-full bg-white border border-slate-300 text-slate-700 py-3 rounded-lg font-bold hover:bg-slate-50 transition flex items-center justify-center gap-2"
          >
            {/* Google Icon SVG */}
            <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  // 4. Authenticated Routes (Traffic Controller)
  if (isTeacher) {
    return <TeacherDashboard user={user} handleLogout={handleLogout} isPrimaryTeacher={isPrimaryTeacher} />;
  } else {
    return <StudentView user={user} handleLogout={handleLogout} />;
  }
}
