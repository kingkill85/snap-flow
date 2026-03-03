import { Button } from '@/components/ui/button';
import { ArrowLeft, CheckCircle, XCircle } from 'lucide-react';
import type { Project } from '@/services/project';

interface ProjectHeaderProps {
  project: Project;
  onBack: () => void;
}

const generateProjectNumber = (project: Project): string => {
  const date = new Date(project.created_at);
  const formattedDate = date.toISOString().split('T')[0];
  const customerName = project.customer_name || 'Unknown';
  const address = project.customer_address || 'No Address';
  return `${formattedDate}_${customerName}_${address}`;
};

export function ProjectHeader({ project, onBack }: ProjectHeaderProps) {
  return (
    <div className="bg-card border-b px-2 flex items-center gap-2 flex-shrink-0 h-8">
      <Button variant="ghost" size="icon" className="h-6 w-6 p-0" onClick={onBack}>
        <ArrowLeft className="h-3 w-3" />
      </Button>
      <div className="h-4 w-px bg-border"></div>
      <div className="text-sm text-muted-foreground leading-none">{generateProjectNumber(project)}</div>
      <div className="h-4 w-px bg-border"></div>
      <div className="font-medium text-sm truncate max-w-[200px] leading-none">{project.name}</div>
      <div className="h-4 w-px bg-border"></div>
      <div className="text-sm text-muted-foreground truncate max-w-[150px] leading-none">{project.customer_name}</div>
      <div className="h-4 w-px bg-border"></div>
      {project.status === 'active' ? (
        <span className="inline-flex items-center text-green-600 text-sm leading-none">
          <CheckCircle className="w-4 h-4 mr-1" />
          Active
        </span>
      ) : project.status === 'completed' ? (
        <span className="inline-flex items-center text-blue-600 text-sm leading-none">
          <CheckCircle className="w-4 h-4 mr-1" />
          Completed
        </span>
      ) : (
        <span className="inline-flex items-center text-destructive text-sm leading-none">
          <XCircle className="w-4 h-4 mr-1" />
          Cancelled
        </span>
      )}
    </div>
  );
}
