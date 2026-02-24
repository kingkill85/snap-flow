import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import Layout from '@/components/layout/Layout';

// Pages
import Home from '@/pages/Home';
import Login from '@/pages/Login';
import NotFound from '@/pages/NotFound';
import Profile from '@/pages/Profile';
import ProjectList from '@/pages/projects/ProjectList';
import ProjectDashboard from '@/pages/projects/ProjectDashboard';
import UserManagement from '@/pages/settings/UserManagement';
import CategoryManagement from '@/pages/catalog/CategoryManagement';
import ItemManagement from '@/pages/catalog/ItemManagement';

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public routes */}
            <Route path="/login" element={<Login />} />
            
            {/* Protected routes */}
            <Route path="/" element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }>
              <Route index element={<Home />} />
              <Route path="profile" element={<Profile />} />
              <Route path="projects" element={<ProjectList />} />
              <Route path="projects/:id" element={<ProjectDashboard />} />
              
              {/* Admin only routes */}
              <Route path="catalog/items" element={
                <ProtectedRoute requireAdmin>
                  <ItemManagement />
                </ProtectedRoute>
              } />
              <Route path="catalog/categories" element={
                <ProtectedRoute requireAdmin>
                  <CategoryManagement />
                </ProtectedRoute>
              } />
              <Route path="settings/users" element={
                <ProtectedRoute requireAdmin>
                  <UserManagement />
                </ProtectedRoute>
              } />
            </Route>
            
            {/* 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
