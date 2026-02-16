import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import Layout from './components/layout/Layout';
import ProtectedRoute from './components/auth/ProtectedRoute';
import Home from './pages/Home';
import Login from './pages/Login';
import Profile from './pages/Profile';
import UserManagement from './pages/settings/UserManagement';
import CategoryManagement from './pages/catalog/CategoryManagement';
import ItemManagement from './pages/catalog/ItemManagement';
import CustomerManagement from './pages/customers/CustomerManagement';
import CustomerDetail from './pages/customers/CustomerDetail';
import ProjectList from './pages/projects/ProjectList';
import ProjectDashboard from './pages/projects/ProjectDashboard';
import NotFound from './pages/NotFound';

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<Layout />}>
          <Route index element={
            <ProtectedRoute>
              <Home />
            </ProtectedRoute>
          } />
          <Route path="profile" element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          } />
          <Route path="settings/users" element={
            <ProtectedRoute requireAdmin>
              <UserManagement />
            </ProtectedRoute>
          } />
          <Route path="catalog/categories" element={
            <ProtectedRoute requireAdmin>
              <CategoryManagement />
            </ProtectedRoute>
          } />
          <Route path="catalog/items" element={
            <ProtectedRoute requireAdmin>
              <ItemManagement />
            </ProtectedRoute>
          } />
          <Route path="customers" element={
            <ProtectedRoute>
              <CustomerManagement />
            </ProtectedRoute>
          } />
          <Route path="customers/:id" element={
            <ProtectedRoute>
              <CustomerDetail />
            </ProtectedRoute>
          } />
          <Route path="projects" element={
            <ProtectedRoute>
              <ProjectList />
            </ProtectedRoute>
          } />
          <Route path="projects/:id" element={
            <ProtectedRoute>
              <ProjectDashboard />
            </ProtectedRoute>
          } />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </AuthProvider>
  );
}

export default App;
