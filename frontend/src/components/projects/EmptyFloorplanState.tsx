import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

interface EmptyFloorplanStateProps {
  onAdd: () => void;
}

export function EmptyFloorplanState({ onAdd }: EmptyFloorplanStateProps) {
  return (
    <div className="flex-1 flex items-center justify-center text-muted-foreground">
      <div className="text-center">
        <p className="mb-2">No floorplans yet.</p>
        <Button size="sm" onClick={onAdd}>
          <Plus className="mr-2 h-4 w-4" />
          Add Your First Floorplan
        </Button>
      </div>
    </div>
  );
}
