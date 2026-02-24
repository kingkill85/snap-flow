import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { projectService, type Project } from '@/services/project';
import { floorplanService, type Floorplan } from '@/services/floorplan';
import { placementService, type Placement } from '@/services/placement';
import { itemService, type Item } from '@/services/item';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Loader2, CheckCircle, XCircle, Image as ImageIcon } from 'lucide-react';

// Generate project number: YYYY-MM-DD_Customer Name_Address
const generateProjectNumber = (project: Project): string => {
  const date = new Date(project.created_at);
  const formattedDate = date.toISOString().split('T')[0];
  const customerName = project.customer_name || 'Unknown';
  const address = project.customer_address || 'No Address';
  return `${formattedDate}_${customerName}_${address}`;
};

const ProjectDashboard = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const projectId = parseInt(id || '0');

  const [project, setProject] = useState<Project | null>(null);
  const [floorplans, setFloorplans] = useState<Floorplan[]>([]);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeFloorplan, setActiveFloorplan] = useState<Floorplan | null>(null);

  const fetchProjectData = async (signal?: AbortSignal) => {
    try {
      setIsLoading(true);
      const [projectData, floorplansData, itemsResult] = await Promise.all([
        projectService.getById(projectId, signal),
        floorplanService.getAll(projectId, signal),
        itemService.getAll({ include_inactive: false }, { page: 1, limit: 1000 }),
      ]);
      
      setProject(projectData);
      setFloorplans(floorplansData);
      setItems(itemsResult.items);
      
      if (floorplansData.length > 0 && !activeFloorplan) {
        setActiveFloorplan(floorplansData[0]);
      }

      setError('');
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.response?.data?.error || 'Failed to load project data');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch placements for active floorplan
  const fetchPlacements = async (floorplanId: number, signal?: AbortSignal) => {
    try {
      const placementsData = await placementService.getAll(floorplanId, signal);
      setPlacements(placementsData);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Failed to load placements:', err);
      }
    }
  };

  useEffect(() => {
    if (activeFloorplan) {
      const controller = new AbortController();
      fetchPlacements(activeFloorplan.id, controller.signal);
      return () => controller.abort();
    }
  }, [activeFloorplan?.id]);

  useEffect(() => {
    const controller = new AbortController();
    fetchProjectData(controller.signal);
    return () => controller.abort();
  }, [projectId]);

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!project) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Project not found</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => navigate('/projects')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-3xl font-bold tracking-tight">{project.name}</h1>
          <p className="text-muted-foreground text-sm">{generateProjectNumber(project)}</p>
        </div>
        <Badge variant={project.status === 'active' ? 'default' : project.status === 'completed' ? 'secondary' : 'destructive'}>
          {project.status === 'active' ? (
            <><CheckCircle className="w-3 h-3 mr-1" /> Active</>
          ) : project.status === 'completed' ? (
            <><CheckCircle className="w-3 h-3 mr-1" /> Completed</>
          ) : (
            <><XCircle className="w-3 h-3 mr-1" /> Cancelled</>
          )}
        </Badge>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Project Info Card */}
      <Card>
        <CardHeader>
          <CardTitle>Project Information</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-muted-foreground">Customer</p>
            <p className="font-medium">{project.customer_name}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Email</p>
            <p className="font-medium">{project.customer_email || '-'}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Phone</p>
            <p className="font-medium">{project.customer_phone || '-'}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Address</p>
            <p className="font-medium">{project.customer_address || '-'}</p>
          </div>
        </CardContent>
      </Card>

      {/* Floorplans & Configurator */}
      <Tabs defaultValue="floorplans" className="w-full">
        <TabsList>
          <TabsTrigger value="floorplans">Floorplans ({floorplans.length})</TabsTrigger>
          <TabsTrigger value="items">Available Items ({items.length})</TabsTrigger>
          <TabsTrigger value="placements">Placements ({placements.length})</TabsTrigger>
        </TabsList>
        
        <TabsContent value="floorplans" className="space-y-4">
          {floorplans.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-8 text-muted-foreground">
                  <ImageIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No floorplans yet.</p>
                  <p className="text-sm">Upload floorplan images to get started.</p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {floorplans.map((floorplan) => (
                <Card key={floorplan.id} className={activeFloorplan?.id === floorplan.id ? 'ring-2 ring-primary' : ''}>
                  <CardContent className="p-4">
                    <div className="aspect-video bg-muted rounded-md mb-3 flex items-center justify-center">
                      {floorplan.image_path ? (
                        <img
                          src={floorplanService.getImageUrl(floorplan.image_path)}
                          alt={floorplan.name}
                          className="w-full h-full object-cover rounded-md"
                        />
                      ) : (
                        <ImageIcon className="h-8 w-8 text-muted-foreground" />
                      )}
                    </div>
                    <h3 className="font-medium">{floorplan.name}</h3>
                    <p className="text-sm text-muted-foreground">Order: {floorplan.sort_order}</p>
                    <Button
                      variant={activeFloorplan?.id === floorplan.id ? 'default' : 'outline'}
                      size="sm"
                      className="w-full mt-2"
                      onClick={() => setActiveFloorplan(floorplan)}
                    >
                      {activeFloorplan?.id === floorplan.id ? 'Selected' : 'Select'}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="items">
          <Card>
            <CardHeader>
              <CardTitle>Available Items ({items.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {items.slice(0, 6).map((item) => (
                  <Card key={item.id}>
                    <CardContent className="p-4">
                      <h3 className="font-medium">{item.name}</h3>
                      <p className="text-sm text-muted-foreground">{item.description}</p>
                      <p className="text-xs text-muted-foreground mt-1">Model: {item.base_model_number}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
              {items.length > 6 && (
                <p className="text-center text-muted-foreground mt-4">
                  And {items.length - 6} more items...
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="placements">
          <Card>
            <CardHeader>
              <CardTitle>
                Placements {activeFloorplan && `(${placements.length})`}
                {!activeFloorplan && '(Select a floorplan first)'}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!activeFloorplan ? (
                <p className="text-muted-foreground text-center py-8">
                  Select a floorplan to view placements
                </p>
              ) : placements.length === 0 ? (
                <p className="text-muted-foreground text-center py-8">
                  No items placed on this floorplan yet
                </p>
              ) : (
                <div className="space-y-2">
                  {placements.map((placement) => (
                    <div key={placement.id} className="flex justify-between items-center p-3 bg-muted rounded">
                      <div>
                        <p className="font-medium">Item #{placement.item_id}</p>
                        <p className="text-sm text-muted-foreground">
                          Position: ({placement.x}, {placement.y}) | Size: {placement.width}x{placement.height}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Configurator Placeholder */}
      {activeFloorplan && (
        <Card>
          <CardHeader>
            <CardTitle>Configurator</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-muted rounded-lg aspect-video flex items-center justify-center">
              <div className="text-center">
                <ImageIcon className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">Interactive configurator coming soon</p>
                <p className="text-sm text-muted-foreground">
                  Selected floorplan: {activeFloorplan.name}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ProjectDashboard;
