import { Button } from 'flowbite-react'
import { Link } from 'react-router-dom'

const NotFound = () => {
  return (
    <div className="text-center py-20">
      <h1 className="text-6xl font-bold text-gray-900 mb-4">404</h1>
      <h2 className="text-2xl font-semibold text-gray-700 mb-4">
        Page Not Found
      </h2>
      <p className="text-gray-600 mb-8">
        The page you're looking for doesn't exist.
      </p>
      <Button as={Link} to="/" size="lg">
        Go Home
      </Button>
    </div>
  )
}

export default NotFound
