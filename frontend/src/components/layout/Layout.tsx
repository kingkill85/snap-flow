import { Outlet } from 'react-router-dom';
import Header from './Header';
import { BuildVersion } from './BuildVersion';

const Layout = () => {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-4 py-8">
        <Outlet />
      </main>
      <BuildVersion />
    </div>
  );
};

export default Layout;
