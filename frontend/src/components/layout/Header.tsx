import { Navbar, Button, Dropdown, Avatar } from 'flowbite-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const Header = () => {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <Navbar fluid className="bg-white border-b">
      <Navbar.Brand as={Link} to="/">
        <span className="self-center whitespace-nowrap text-xl font-semibold text-blue-600">
          SnapFlow
        </span>
      </Navbar.Brand>
      
      <div className="flex md:order-2 gap-2 items-center">
        {isAuthenticated ? (
          <Dropdown
            arrowIcon={false}
            inline
            label={
              <div className="flex items-center gap-2">
                <Avatar rounded size="sm" />
                <span className="hidden md:block text-sm font-medium">
                  {user?.email}
                </span>
              </div>
            }
          >
            <Dropdown.Header>
              <span className="block text-sm">{user?.email}</span>
              <span className="block truncate text-sm font-medium">
                Role: {user?.role}
              </span>
            </Dropdown.Header>
            <Dropdown.Item onClick={handleLogout}>
              Sign out
            </Dropdown.Item>
          </Dropdown>
        ) : (
          <Button color="light" size="sm" as={Link} to="/login">
            Login
          </Button>
        )}
      </div>
      
      <Navbar.Collapse>
        <Navbar.Link as={Link} to="/" active>
          Home
        </Navbar.Link>
        <Navbar.Link as={Link} to="/customers">
          Customers
        </Navbar.Link>
        <Navbar.Link as={Link} to="/projects">
          Projects
        </Navbar.Link>
      </Navbar.Collapse>
    </Navbar>
  );
};

export default Header;
