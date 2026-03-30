import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuthStore } from "../stores/authStore";
import { Button, Input, Spinner } from "../components/ui";

function AuthLayout({ children, title, subtitle }) {
  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, background: "var(--bg)", position: "relative" }}>
      <div style={{ position: "fixed", inset: 0, backgroundImage: "linear-gradient(rgba(124,107,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(124,107,255,0.03) 1px, transparent 1px)", backgroundSize: "48px 48px", pointerEvents: "none" }} />
      <div className="appear" style={{ width: "100%", maxWidth: 420, position: "relative", zIndex: 1 }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ fontFamily: "DM Serif Display, serif", fontSize: 28, marginBottom: 8 }}>AI<span style={{ color: "var(--accent2)" }}>CC</span></div>
          <h1 style={{ fontFamily: "DM Serif Display, serif", fontSize: 28, letterSpacing: "-0.5px", marginBottom: 8 }}>{title}</h1>
          <p style={{ color: "var(--text2)", fontSize: 14 }}>{subtitle}</p>
        </div>
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: "var(--radius-lg)", padding: "32px" }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export function LoginPage() {
  const navigate = useNavigate();
  const { login, loading } = useAuthStore();
  const [isAdminTab, setIsAdminTab] = useState(false);
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const loginEmail = isAdminTab ? "admin@123" : form.email;
    const res = await login(loginEmail, form.password);
    if (res.ok) {
      if (isAdminTab) navigate("/admin");
      else navigate("/dashboard");
    } else {
      setError(res.error);
    }
  };

  return (
    <AuthLayout title="Welcome back" subtitle={isAdminTab ? "Access the system administrator dashboard" : "Sign in to continue your practice"}>
      
      <div style={{ display: "flex", background: "var(--bg)", padding: 4, borderRadius: 8, marginBottom: 24, border: "1px solid var(--border)" }}>
        <div 
          onClick={() => setIsAdminTab(false)} 
          style={{ flex: 1, padding: "8px 0", textAlign: "center", cursor: "pointer", borderRadius: 6, fontWeight: !isAdminTab ? 600 : 400, background: !isAdminTab ? "var(--surface)" : "transparent", boxShadow: !isAdminTab ? "0 1px 3px rgba(0,0,0,0.1)" : "none", color: !isAdminTab ? "var(--text)" : "var(--text3)" }}
        >
          Candidate
        </div>
        <div 
          onClick={() => setIsAdminTab(true)} 
          style={{ flex: 1, padding: "8px 0", textAlign: "center", cursor: "pointer", borderRadius: 6, fontWeight: isAdminTab ? 600 : 400, background: isAdminTab ? "var(--surface)" : "transparent", boxShadow: isAdminTab ? "0 1px 3px rgba(0,0,0,0.1)" : "none", color: isAdminTab ? "var(--text)" : "var(--text3)" }}
        >
          Administrator
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {!isAdminTab && (
          <Input label="Email" type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} placeholder="you@example.com" required />
        )}
        {isAdminTab && (
          <Input label="Email" type="text" value="admin@123" readOnly />
        )}
        <Input label="Password" type="password" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} placeholder="••••••••" required />
        
        {error && <div style={{ background: "var(--red-dim)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: "var(--radius-sm)", padding: "10px 14px", fontSize: 13, color: "var(--red)" }}>{error}</div>}
        
        <Button type="submit" loading={loading} size="lg" style={{ width: "100%", marginTop: 4 }}>Sign In</Button>
        
        {!isAdminTab && (
          <p style={{ textAlign: "center", fontSize: 13, color: "var(--text3)" }}>
            Don&apos;t have an account?{" "}
            <Link to="/register" style={{ color: "var(--accent2)" }}>Register</Link>
          </p>
        )}
      </form>
    </AuthLayout>
  );
}

export function RegisterPage() {
  const navigate = useNavigate();
  const { register, loading } = useAuthStore();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (form.password.length < 8) { setError("Password must be at least 8 characters"); return; }
    const res = await register(form.name, form.email, form.password);
    if (res.ok) navigate("/onboarding");
    else setError(res.error);
  };

  return (
    <AuthLayout title="Create your account" subtitle="Start practicing smarter interviews today">
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <Input label="Full Name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} placeholder="Your name" required />
        <Input label="Email" type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} placeholder="you@example.com" required />
        <Input label="Password" type="password" value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} placeholder="Min. 8 characters" required />
        {error && <div style={{ background: "var(--red-dim)", border: "1px solid rgba(248,113,113,0.2)", borderRadius: "var(--radius-sm)", padding: "10px 14px", fontSize: 13, color: "var(--red)" }}>{error}</div>}
        <Button type="submit" loading={loading} size="lg" style={{ width: "100%", marginTop: 4 }}>Create Account</Button>
        <p style={{ textAlign: "center", fontSize: 13, color: "var(--text3)" }}>
          Already have an account?{" "}
          <Link to="/login" style={{ color: "var(--accent2)" }}>Sign in</Link>
        </p>
      </form>
    </AuthLayout>
  );
}

export default LoginPage;
