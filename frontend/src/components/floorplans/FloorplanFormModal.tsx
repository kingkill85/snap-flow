import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Upload, Pencil, ImageIcon, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import type { Floorplan, CreateFloorplanDTO } from '@/services/floorplan';
import { extractErrorMessage } from '@/utils';

interface FloorplanFormModalProps {
  floorplan: Floorplan | null;
  projectId: number;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateFloorplanDTO | UpdateFloorDTO, image?: File) => Promise<void>;
}

interface UpdateFloorDTO {
  name?: string;
  sort_order?: number;
}

export function FloorplanFormModal({ floorplan, projectId, isOpen, onClose, onSubmit }: FloorplanFormModalProps) {
  const isEdit = !!floorplan;
  const [formData, setFormData] = useState({
    name: '',
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reusable validation and file setting function
  const validateAndSetFile = (file: File): boolean => {
    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file (JPG, PNG, WebP)');
      return false;
    }
    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      setError('File size must be less than 5MB');
      return false;
    }
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setError('');
    return true;
  };

  useEffect(() => {
    if (isOpen) {
      if (floorplan) {
        setFormData({
          name: floorplan.name,
        });
        // Show existing image preview for edit mode
        if (floorplan.image_path) {
          setPreviewUrl(`/uploads/${floorplan.image_path}`);
        }
      } else {
        setFormData({ name: '' });
        setPreviewUrl(null);
        setSelectedFile(null);
      }
      setError('');
    }
  }, [floorplan, isOpen]);

  // Handle paste events for floorplan images
  useEffect(() => {
    if (!isOpen) return;

    const handlePaste = async (e: ClipboardEvent) => {
      // Don't handle paste if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      const items = e.clipboardData?.items;
      if (!items) return;

      // Find first image in clipboard
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          e.preventDefault();
          const blob = items[i].getAsFile();
          if (blob) {
            validateAndSetFile(blob);
          }
          break;
        }
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [isOpen]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      validateAndSetFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      validateAndSetFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!formData.name.trim()) {
      setError('Floorplan name is required');
      return;
    }

    if (!isEdit && !selectedFile) {
      setError('Please upload a floorplan image');
      return;
    }

    setIsSubmitting(true);

    try {
      if (isEdit) {
        const updateData: UpdateFloorDTO = {};
        if (formData.name) updateData.name = formData.name;
        await onSubmit(updateData, selectedFile || undefined);
      } else {
        const createData: CreateFloorplanDTO = {
          project_id: projectId,
          name: formData.name,
        };
        await onSubmit(createData, selectedFile!);
      }
      onClose();
    } catch (err) {
      setError(extractErrorMessage(err, `Failed to ${isEdit ? 'update' : 'create'} floorplan`));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setError('');
    setSelectedFile(null);
    setPreviewUrl(isEdit && floorplan?.image_path ? `/uploads/${floorplan.image_path}` : null);
    onClose();
  };

  const clearFile = () => {
    setSelectedFile(null);
    setPreviewUrl(isEdit && floorplan?.image_path ? `/uploads/${floorplan.image_path}` : null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Floorplan' : 'Create Floorplan'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the floorplan name and image.'
              : 'Upload a floorplan image and provide a name for the project.'}
          </DialogDescription>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="flex-1 overflow-y-auto px-1 space-y-4">
            {/* Floorplan Name */}
            <div>
              <Label htmlFor="name">Floorplan Name *</Label>
              <Input
                id="name"
                type="text"
                placeholder="Ground Floor"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>

            {/* Image Upload */}
            <div>
              <Label>{isEdit ? 'Floorplan Image' : 'Floorplan Image *'}</Label>
              <div
                className="mt-2 border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary transition-colors cursor-pointer bg-muted/30"
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleFileChange}
                />

                    {previewUrl ? (
                  <div className="relative">
                    <img
                      src={previewUrl}
                      alt="Preview"
                      className="max-h-48 mx-auto rounded shadow"
                    />
                    <div className="mt-2 flex justify-center gap-2">
                      {!isEdit && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            clearFile();
                          }}
                        >
                          <X className="mr-1 h-4 w-4" />
                          Remove
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          fileInputRef.current?.click();
                        }}
                      >
                        <Upload className="mr-1 h-4 w-4" />
                        Change
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-muted-foreground">
                    <ImageIcon className="mx-auto h-12 w-12 mb-2" />
                    <p className="text-sm">Click to upload, drag and drop, or paste (Ctrl+V)</p>
                    <p className="text-xs text-muted-foreground mt-1">JPG, PNG, WebP (max 5MB)</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={handleClose}>
              <X className="mr-2 h-4 w-4" />
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isEdit ? 'Saving...' : 'Uploading...'}
                </>
              ) : (
                <>
                  {isEdit ? <Pencil className="mr-2 h-4 w-4" /> : <Upload className="mr-2 h-4 w-4" />}
                  {isEdit ? 'Update' : 'Create'}
                </>
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
