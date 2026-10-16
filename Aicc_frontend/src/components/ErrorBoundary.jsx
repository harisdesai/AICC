import React from "react";
import { Button, Card } from "./ui";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[ErrorBoundary caught an error]", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)", padding: 24 }}>
          <Card style={{ padding: 40, maxWidth: 520, width: "100%", textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
            <div style={{ fontSize: 22, fontWeight: 600, marginBottom: 8, fontFamily: "DM Serif Display, serif" }}>
              Something went wrong
            </div>
            <p style={{ color: "var(--text2)", fontSize: 14, marginBottom: 20 }}>
              {this.state.error?.message || "An unexpected error occurred while rendering the page."}
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
              <Button onClick={() => window.location.reload()}>Reload Page</Button>
              <Button variant="ghost" onClick={() => { window.location.href = "/dashboard"; }}>Go to Dashboard</Button>
            </div>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}
