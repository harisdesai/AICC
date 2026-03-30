import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";
import { useAuthStore } from "../stores/authStore";
import { Button, Card, Spinner, Tag, Input } from "../components/ui";

export default function AdminPage() {
  const navigate = useNavigate();
  const token = useAuthStore((s) => s.token);
  const logout = useAuthStore((s) => s.logout);
  const user = useAuthStore((s) => s.user);
  
  const [data, setData] = useState({ users: [], sessions: [], configs: [] });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [showAddUser, setShowAddUser] = useState(false);
  const [newUserForm, setNewUserForm] = useState({ name: "", email: "", password: "" });

  const [editUser, setEditUser] = useState(null);
  const [editSession, setEditSession] = useState(null);
  const [newConfig, setNewConfig] = useState({ key: "", value: "" });

  const loadData = async () => {
    try {
      const [resSys, resConf] = await Promise.all([
        api.get("/admin/system"),
        api.get("/admin/configs")
      ]);
      setData({
        users: resSys.data.users,
        sessions: resSys.data.sessions,
        configs: resConf.data.configs
      });
    } catch (e) {
      setErr(e.response?.data?.error || "Failed to load admin data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token || user?.email !== "admin@123") {
      navigate("/");
      return;
    }
    loadData();
  }, [token, user, navigate]);

  const handleAddUser = async () => {
    try {
      await api.post("/admin/users", newUserForm);
      setShowAddUser(false);
      setNewUserForm({ name: "", email: "", password: "" });
      loadData();
    } catch (e) { alert(e.response?.data?.error || "Error adding user"); }
  };

  const handleUpdateUser = async () => {
    try {
      await api.put(`/admin/users/${editUser.id}`, { name: editUser.name, email: editUser.email });
      setEditUser(null);
      loadData();
    } catch (e) { alert(e.response?.data?.error || "Error updating user"); }
  };

  const handleUpdateSession = async () => {
    try {
      await api.put(`/admin/sessions/${editSession.id}`, { 
        target_role: editSession.target_role, 
        status: editSession.status, 
        overall_score: editSession.overall_score 
      });
      setEditSession(null);
      loadData();
    } catch (e) { alert(e.response?.data?.error || "Error updating session"); }
  };

  const handleUpdateConfig = async (key, val) => {
    try {
      let parsedVal = val;
      try { parsedVal = JSON.parse(val); } catch(_) {} // allow raw string or json 
      await api.put(`/admin/configs/${key}`, { value: parsedVal });
      setNewConfig({ key: "", value: "" });
      loadData();
    } catch (e) { alert(e.response?.data?.error || "Error updating config"); }
  };

  const removeUser = async (id) => {
    if (!window.confirm("Are you sure? This deletes the user and ALL their data.")) return;
    try {
      await api.delete(`/admin/users/${id}`);
      loadData();
    } catch (e) {
      alert(e.response?.data?.error || "Error deleting user");
    }
  };

  const removeSession = async (id) => {
    if (!window.confirm("Are you sure? This deletes the interview session permanently.")) return;
    try {
      await api.delete(`/admin/sessions/${id}`);
      loadData();
    } catch (e) {
      alert(e.response?.data?.error || "Error deleting session");
    }
  };

  if (loading) return <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}><Spinner /></div>;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", padding: 32 }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        
        <div className="appear" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
          <div>
            <div style={{ fontFamily: "DM Serif Display, serif", fontSize: 28, color: "var(--red)" }}>System Administration</div>
            <p style={{ color: "var(--text2)", marginTop: 6 }}>Manage platform users and active sessions</p>
          </div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <Button variant="ghost" onClick={() => { logout(); navigate("/"); }}>Log out</Button>
          </div>
        </div>

        {err && <div style={{ color: "var(--amber)", marginBottom: 20 }}>{err}</div>}

        <div className="appear delay-1" style={{ display: "flex", flexDirection: "column", gap: 32 }}>
          
          <Card className="hover-card" style={{ padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ fontWeight: 600, fontSize: 18 }}>Users ({data.users?.length || 0})</div>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text3)" }}>
                    <th style={{ padding: "12px 0" }}>Name</th>
                    <th style={{ padding: "12px 0" }}>Email</th>
                    <th style={{ padding: "12px 0" }}>Created On</th>
                    <th style={{ padding: "12px 0", textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.users || []).map((u) => (
                    <tr key={u.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "14px 0", fontWeight: 500 }}>{u.name}</td>
                      <td style={{ padding: "14px 0", color: "var(--text2)" }}>{u.email}</td>
                      <td style={{ padding: "14px 0", color: "var(--text3)" }}>{new Date(u.created_at).toLocaleDateString()}</td>
                      <td style={{ padding: "14px 0", textAlign: "right", display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <Button 
                          variant="ghost" 
                          style={{ fontSize: 13, height: 28 }} 
                          onClick={() => setEditUser(u)}
                        >Edit</Button>
                        <Button 
                          variant="ghost" 
                          style={{ color: "var(--red)", fontSize: 13, height: 28 }} 
                          onClick={() => removeUser(u.id)}
                          disabled={u.email === "admin@123"}
                        >Delete</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card style={{ padding: 24 }}>
            <div style={{ fontWeight: 600, fontSize: 18, marginBottom: 16 }}>Interview Sessions ({data.sessions?.length || 0})</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", textAlign: "left", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text3)" }}>
                    <th style={{ padding: "12px 0" }}>User Email</th>
                    <th style={{ padding: "12px 0" }}>Target Role</th>
                    <th style={{ padding: "12px 0" }}>Status</th>
                    <th style={{ padding: "12px 0" }}>Score</th>
                    <th style={{ padding: "12px 0" }}>Date</th>
                    <th style={{ padding: "12px 0", textAlign: "right" }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.sessions || []).map((s) => (
                    <tr key={s.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "14px 0", fontWeight: 500 }}>{s.user_email}</td>
                      <td style={{ padding: "14px 0", color: "var(--text2)" }}>{s.target_role}</td>
                      <td style={{ padding: "14px 0" }}><Tag>{s.status}</Tag></td>
                      <td style={{ padding: "14px 0", color: s.overall_score ? "var(--green)" : "var(--text3)" }}>
                        {s.overall_score || "N/A"}
                      </td>
                      <td style={{ padding: "14px 0", color: "var(--text3)" }}>{new Date(s.created_at).toLocaleString()}</td>
                      <td style={{ padding: "14px 0", textAlign: "right", display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <Button 
                          variant="ghost" 
                          style={{ fontSize: 13, height: 28 }} 
                          onClick={() => setEditSession(s)}
                        >Edit</Button>
                        <Button 
                          variant="ghost" 
                          style={{ color: "var(--red)", fontSize: 13, height: 28 }} 
                          onClick={() => removeSession(s.id)}
                        >Delete</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card style={{ padding: 24 }}>
            <div style={{ fontWeight: 600, fontSize: 18, marginBottom: 16 }}>System Configurations ({data.configs?.length || 0})</div>
            <div style={{ marginBottom: 20, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <Input placeholder="Key (e.g. ATS_STRICTNESS)" value={newConfig.key} onChange={e => setNewConfig(p => ({ ...p, key: e.target.value }))} style={{ flex: 1, minWidth: 200 }} />
              <Input placeholder="Value (JSON or String)" value={newConfig.value} onChange={e => setNewConfig(p => ({ ...p, value: e.target.value }))} style={{ flex: 1, minWidth: 200 }} />
              <Button onClick={() => handleUpdateConfig(newConfig.key, newConfig.value)} disabled={!newConfig.key || !newConfig.value}>Set Config</Button>
            </div>
            
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(data.configs || []).map(c => (
                <div key={c.key} style={{ display: "flex", justifyContent: "space-between", padding: 12, background: "var(--bg3)", borderRadius: 6, alignItems: "center" }}>
                  <div style={{ fontWeight: 500 }}>{c.key}</div>
                  <div style={{ color: "var(--text2)", fontFamily: "monospace", background: "var(--bg)", padding: "4px 8px", borderRadius: 4 }}>
                    {typeof c.value === 'object' ? JSON.stringify(c.value) : c.value}
                  </div>
                </div>
              ))}
            </div>
          </Card>

        </div>
      </div>

      {showAddUser && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <Card style={{ width: 400, padding: 24 }}>
            <div style={{ fontWeight: 600, fontSize: 18, marginBottom: 16 }}>Add Candidate</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 24 }}>
              <Input label="Name" value={newUserForm.name} onChange={e => setNewUserForm(p => ({ ...p, name: e.target.value }))} />
              <Input label="Email" type="email" value={newUserForm.email} onChange={e => setNewUserForm(p => ({ ...p, email: e.target.value }))} />
              <Input label="Password" type="password" value={newUserForm.password} onChange={e => setNewUserForm(p => ({ ...p, password: e.target.value }))} />
            </div>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <Button variant="ghost" onClick={() => setShowAddUser(false)}>Cancel</Button>
              <Button onClick={handleAddUser}>Create User</Button>
            </div>
          </Card>
        </div>
      )}

      {editUser && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <Card style={{ width: 400, padding: 24 }}>
            <div style={{ fontWeight: 600, fontSize: 18, marginBottom: 16 }}>Edit User</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 24 }}>
              <Input label="Name" value={editUser.name} onChange={e => setEditUser(p => ({ ...p, name: e.target.value }))} />
              <Input label="Email" type="email" value={editUser.email} onChange={e => setEditUser(p => ({ ...p, email: e.target.value }))} />
            </div>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <Button variant="ghost" onClick={() => setEditUser(null)}>Cancel</Button>
              <Button onClick={handleUpdateUser} disabled={editUser.email === "admin@123"}>Save</Button>
            </div>
          </Card>
        </div>
      )}

      {editSession && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100 }}>
          <Card style={{ width: 400, padding: 24 }}>
            <div style={{ fontWeight: 600, fontSize: 18, marginBottom: 16 }}>Edit Session</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 24 }}>
              <Input label="Target Role" value={editSession.target_role || ""} onChange={e => setEditSession(p => ({ ...p, target_role: e.target.value }))} />
              <Input label="Status" value={editSession.status || ""} onChange={e => setEditSession(p => ({ ...p, status: e.target.value }))} />
              <Input label="Overall Score" type="number" value={editSession.overall_score || ""} onChange={e => setEditSession(p => ({ ...p, overall_score: e.target.value }))} />
            </div>
            <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
              <Button variant="ghost" onClick={() => setEditSession(null)}>Cancel</Button>
              <Button onClick={handleUpdateSession}>Save</Button>
            </div>
          </Card>
        </div>
      )}

    </div>
  );
}
