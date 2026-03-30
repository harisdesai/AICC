import React, { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuthStore } from "./stores/authStore";
import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import OnboardingPage from "./pages/OnboardingPage";
import InterviewPage from "./pages/InterviewPage";
import DashboardPage from "./pages/DashboardPage";
import ReportPage from "./pages/ReportPage";
import AdminPage from "./pages/AdminPage";

function PrivateRoute({ children }) {
  const token = useAuthStore((s) => s.token);
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  const init = useAuthStore((s) => s.init);

  useEffect(() => { init(); }, [init]);

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/onboarding" element={<PrivateRoute><OnboardingPage /></PrivateRoute>} />
      <Route path="/interview/:sessionId" element={<PrivateRoute><InterviewPage /></PrivateRoute>} />
      <Route path="/dashboard" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
      <Route path="/report/:sessionId" element={<PrivateRoute><ReportPage /></PrivateRoute>} />
      <Route path="/admin" element={<PrivateRoute><AdminPage /></PrivateRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
