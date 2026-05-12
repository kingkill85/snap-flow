import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import type { Project } from '@/services/project';

interface ProjectHeaderProps {
  project: Project;
  onBack: () => void;
}

const statusConfig: Record<string, { label: string; colorClass: string }> = {
  active: { label: 'Active', colorClass: 'bg-green-100 text-green-700 border-green-200' },
  completed: { label: 'Completed', colorClass: 'bg-blue-100 text-blue-700 border-blue-200' },
  cancelled: { label: 'Cancelled', colorClass: 'bg-red-100 text-red-700 border-red-200' },
};

export function ProjectHeader({ project, onBack }: ProjectHeaderProps) {
  const status = statusConfig[project.status] || statusConfig.active;

  return (
    <div className="bg-card border-b px-4 flex items-center justify-between h-14">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="h-5 w-px bg-border" />
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold leading-none">
            {project.group?.name || project.group_name || 'Group'}
          </span>
          <span className="text-muted-foreground leading-none">{'>'}</span>
          <span className="text-lg leading-none">{project.version_name}</span>
          <span className={`ml-2 px-2 py-0.5 rounded text-xs border ${status.colorClass}`}>
            {status.label}
          </span>
        </div>
      </div>
    </div>
  );
}
