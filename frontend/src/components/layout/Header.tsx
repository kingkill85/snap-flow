import { Navbar, Button, Dropdown, Avatar } from 'flowbite-react';
import { Link, useNavigate } from 'react-router-dom';
import { HiLogout, HiUser, HiCog } from 'react-icons/hi';
import { useAuth } from '../../context/AuthContext';

const Header = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  // Helper to get display name (full_name or email)
  const getDisplayName = () => user?.full_name || user?.email?.split('@')[0] || 'User';
  const getAvatarLetter = () => {
    const name = user?.full_name || user?.email || 'U';
    return name.charAt(0).toUpperCase();
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <Navbar fluid className="bg-white border-b shadow-sm">
      <Navbar.Brand as={Link} to="/">
        <span className="self-center whitespace-nowrap text-2xl font-bold text-blue-600">
          SnapFlow
        </span>
      </Navbar.Brand>
      
      <div className="flex md:order-2 gap-3 items-center">
        {isAuthenticated ? (
          <Dropdown
            arrowIcon={false}
            inline
            label={
              <div className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-semibold text-sm">
                    {getAvatarLetter()}
                  </div>
                  <div className="hidden md:flex flex-col items-start">
                    <span className="text-sm font-medium text-gray-900 leading-tight">
                      {getDisplayName()}
                    </span>
                    <span className="text-xs text-gray-500 capitalize leading-tight">
                      {user?.role}
                    </span>
                  </div>
                </div>
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            }
          >
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center text-white font-semibold">
                  {getAvatarLetter()}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{user?.full_name || user?.email}</p>
                  <p className="text-xs text-gray-500 capitalize">{user?.role} Account</p>
                </div>
              </div>
            </div>
            <Dropdown.Divider />
            <Dropdown.Item as={Link} to="/profile">
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Your Profile
            </Dropdown.Item>
            {user?.role === 'admin' && (
              <Dropdown.Item as={Link} to="/admin/users">
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                User Management
              </Dropdown.Item>
            )}
            <Dropdown.Divider />
            <Dropdown.Item onClick={handleLogout} className="text-red-600 hover:bg-red-50 hover:text-red-700">
              <HiLogout className="w-4 h-4 mr-2" />
              Sign out
            </Dropdown.Item>
          </Dropdown>
        ) : (
          <Button 
            color="blue" 
            size="sm" 
            as={Link} 
            to="/login"
            className="font-medium"
          >
            Login
          </Button>
        )}
      </div>
      
      <Navbar.Collapse>
        <Navbar.Link as={Link} to="/" active className="font-medium">
          Home
        </Navbar.Link>
        <Navbar.Link as={Link} to="/customers" className="font-medium">
          Customers
        </Navbar.Link>
        <Navbar.Link as={Link} to="/projects" className="font-medium">
          Projects
        </Navbar.Link>
      </Navbar.Collapse>
    </Navbar>
  );
};

export default Header;
