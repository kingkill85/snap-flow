import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { Upload, Move, FileSpreadsheet } from 'lucide-react';

const Home = () => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] px-4 py-12">
      {/* Hero Section */}
      <div className="text-center max-w-3xl mx-auto mb-16">
        <h1 className="text-5xl font-bold tracking-tight mb-6">
          Welcome to SnapFlow
        </h1>
        <p className="text-xl text-muted-foreground mb-8">
          Smart home automation configurator and proposal generator
        </p>
        <div className="flex items-center justify-center gap-4">
          <Button size="lg" asChild>
            <Link to="/projects">Get Started</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link to="/projects">View Projects</Link>
          </Button>
        </div>
      </div>

      {/* Feature Cards */}
      <div className="grid gap-6 md:grid-cols-3 w-full max-w-6xl">
        <Card className="border shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl font-semibold">Upload Floorplans</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground leading-relaxed">
              Import floorplan images and configure multiple floors per project
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl font-semibold">Drag & Drop Items</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground leading-relaxed">
              Place smart home devices on floorplans with an intuitive interface
            </p>
          </CardContent>
        </Card>

        <Card className="border shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl font-semibold">Generate Proposals</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground leading-relaxed">
              Export professional Excel proposals with item lists and pricing
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Home;
