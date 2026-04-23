import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import ProjectList from './pages/ProjectList';
import ProjectCreate from './pages/ProjectCreate';
import ProjectDetail from './pages/ProjectDetail';
import ProjectEdit from './pages/ProjectEdit';
import ProjectMembers from './pages/ProjectMembers';
import GanttChart from './pages/GanttChart';
import AppLayout from './components/AppLayout';
import MyTasks from './pages/MyTasks';
import Stats from './pages/Stats';
import UserManagement from './pages/UserManagement';
import OrgManagement from './pages/OrgManagement';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedUser = localStorage.getItem('user');
    const token = localStorage.getItem('token');
    if (savedUser && token) setUser(JSON.parse(savedUser));
    setLoading(false);
  }, []);

  const handleLogin = (userData) => setUser(userData);
  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  if (loading) return null;
  if (!user) return <Login onLogin={handleLogin} />;

  return (
    <Router>
      <AppLayout user={user} onLogout={handleLogout}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/projects" element={<ProjectList user={user} />} />
          <Route path="/projects/create" element={<ProjectCreate />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/projects/:id/edit" element={<ProjectEdit />} />
          <Route path="/projects/:id/members" element={<ProjectMembers />} />
          <Route path="/projects/:id/gantt" element={<GanttChart />} />
          <Route path="/my-tasks" element={<MyTasks user={user} />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/users" element={<UserManagement user={user} />} />
          <Route path="/org-management" element={<OrgManagement user={user} />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </AppLayout>
    </Router>
  );
}