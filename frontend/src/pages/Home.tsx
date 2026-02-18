import { Button, Card } from 'flowbite-react'
import { Link } from 'react-router-dom'

const Home = () => {
  return (
    <div className="space-y-8">
      <div className="text-center py-12">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">
          Welcome to SnapFlow
        </h1>
        <p className="text-xl text-gray-600 mb-8">
          Smart home automation configurator and proposal generator
        </p>
        <div className="flex justify-center gap-4">
          <Button as={Link} to="/projects" state={{ openCreateModal: true }} size="lg">
            Get Started
          </Button>
          <Button color="light" as={Link} to="/projects" size="lg">
            View Projects
          </Button>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        <Card>
          <h3 className="text-xl font-bold mb-2">Upload Floorplans</h3>
          <p className="text-gray-600">
            Import floorplan images and configure multiple floors per project
          </p>
        </Card>
        <Card>
          <h3 className="text-xl font-bold mb-2">Drag & Drop Items</h3>
          <p className="text-gray-600">
            Place smart home devices on floorplans with an intuitive interface
          </p>
        </Card>
        <Card>
          <h3 className="text-xl font-bold mb-2">Generate Proposals</h3>
          <p className="text-gray-600">
            Export professional Excel proposals with item lists and pricing
          </p>
        </Card>
      </div>
    </div>
  )
}

export default Home
