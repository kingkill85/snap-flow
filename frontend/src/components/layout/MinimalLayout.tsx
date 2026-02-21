import { Outlet } from 'react-router-dom'
import Header from './Header'

const MinimalLayout = () => {
  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">
      <Header />
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}

export default MinimalLayout
