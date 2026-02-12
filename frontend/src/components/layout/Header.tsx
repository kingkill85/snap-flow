import { Navbar, Button } from 'flowbite-react'
import { Link } from 'react-router-dom'

const Header = () => {
  return (
    <Navbar fluid className="bg-white border-b">
      <Navbar.Brand as={Link} to="/">
        <span className="self-center whitespace-nowrap text-xl font-semibold text-blue-600">
          SnapFlow
        </span>
      </Navbar.Brand>
      <div className="flex md:order-2 gap-2">
        <Button color="light" size="sm">Login</Button>
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
  )
}

export default Header
