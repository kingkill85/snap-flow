import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import { SyncProvider } from '@/context/SyncContext';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import { ErrorBoundary } from '@/components/common/ErrorBoundary';
import Layout from '@/components/layout/Layout';

// Pages
import Home from '@/pages/Home';
import Login from '@/pages/Login';
import NotFound from '@/pages/NotFound';
import Profile from '@/pages/Profile';
import ProjectList from '@/pages/projects/ProjectList';
import ProjectDashboard from '@/pages/projects/ProjectDashboard';
import UserManagement from '@/pages/settings/UserManagement';
import TenantManagement from './pages/settings/TenantManagement';
import CategoryManagement from '@/pages/catalog/CategoryManagement';
import ItemManagement from '@/pages/catalog/ItemManagement';

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SyncProvider>
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
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
              <Route path="projects/:id" element={
                <ErrorBoundary>
                  <ProjectDashboard />
                </ErrorBoundary>
              } />
              
              {/* Catalog routes - browsable by all authenticated users */}
              <Route path="catalog/products" element={
                <ProtectedRoute>
                  <ItemManagement />
                </ProtectedRoute>
              } />
              <Route path="catalog/categories" element={
                <ProtectedRoute>
                  <CategoryManagement />
                </ProtectedRoute>
              } />

              {/* Admin only routes */}
              <Route path="settings/users" element={
                <ProtectedRoute requireTenantAdmin>
                  <UserManagement />
                </ProtectedRoute>
              } />
              <Route path="settings/tenants" element={
                <ProtectedRoute requireAdmin>
                  <TenantManagement />
                </ProtectedRoute>
              } />
            </Route>
            
            {/* 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          </BrowserRouter>
        </SyncProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
