import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/context/AuthContext';
import { ThemeProvider } from '@/context/ThemeContext';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import Layout from '@/components/layout/Layout';

// Pages
import Home from '@/pages/Home';
import Login from '@/pages/Login';
import NotFound from '@/pages/NotFound';

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
              
              {/* Admin only routes */}
              <Route path="catalog/items" element={
                <ProtectedRoute requireAdmin>
                  <div>Items Management (Coming soon)</div>
                </ProtectedRoute>
              } />
              <Route path="catalog/categories" element={
                <ProtectedRoute requireAdmin>
                  <div>Categories Management (Coming soon)</div>
                </ProtectedRoute>
              } />
              <Route path="settings/users" element={
                <ProtectedRoute requireAdmin>
                  <div>User Management (Coming soon)</div>
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
