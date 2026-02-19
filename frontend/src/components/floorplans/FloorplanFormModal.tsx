import { useState, useEffect, useRef } from 'react';
import { Button, Modal, Label, TextInput, Alert, Spinner } from 'flowbite-react';
import { HiUpload, HiPencil, HiPhotograph } from 'react-icons/hi';
import type { Floorplan, CreateFloorplanDTO } from '../../services/floorplan';

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        setError('Please select an image file (JPG, PNG, WebP)');
        return;
      }
      // Validate file size (5MB max)
      if (file.size > 5 * 1024 * 1024) {
        setError('File size must be less than 5MB');
        return;
      }
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setError('');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setError('Please select an image file (JPG, PNG, WebP)');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setError('File size must be less than 5MB');
        return;
      }
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setError('');
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
    } catch (err: any) {
      const errorData = err.response?.data?.error;
      let errorMessage: string;
      if (typeof errorData === 'object' && errorData !== null) {
        if (errorData.issues && Array.isArray(errorData.issues)) {
          errorMessage = errorData.issues.map((issue: any) => issue.message).join(', ');
        } else {
          errorMessage = JSON.stringify(errorData);
        }
      } else {
        errorMessage = errorData || err.message || `Failed to ${isEdit ? 'update' : 'create'} floorplan`;
      }
      setError(errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setError('');
    setSelectedFile(null);
    setPreviewUrl(null);
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
    <Modal show={isOpen} onClose={handleClose}>
      <Modal.Header>{isEdit ? 'Edit Floorplan' : 'Add New Floorplan'}</Modal.Header>
      <Modal.Body>
        {error && (
          <Alert color="failure" className="mb-4">
            {error}
          </Alert>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Floorplan Name */}
          <div>
            <Label htmlFor="name" value="Floorplan Name *" />
            <TextInput
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
            <Label value={isEdit ? 'Floorplan Image' : 'Floorplan Image *'} />
            <div
              className="mt-2 border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-500 transition-colors cursor-pointer"
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
                    <Button
                      size="xs"
                      color="light"
                      onClick={(e) => {
                        e.stopPropagation();
                        clearFile();
                      }}
                    >
                      Remove
                    </Button>
                    <Button
                      size="xs"
                      color="light"
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}
                    >
                      Change
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="text-gray-500">
                  <HiPhotograph className="mx-auto h-12 w-12 text-gray-400 mb-2" />
                  <p className="text-sm">Click to upload or drag and drop</p>
                  <p className="text-xs text-gray-400 mt-1">JPG, PNG, WebP (max 5MB)</p>
                </div>
              )}
            </div>
          </div>
        </form>
      </Modal.Body>
      <Modal.Footer>
        <Button onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Spinner size="sm" className="mr-2" />
              {isEdit ? 'Saving...' : 'Uploading...'}
            </>
          ) : (
            <>
              {isEdit ? <HiPencil className="mr-2 h-5 w-5" /> : <HiUpload className="mr-2 h-5 w-5" />}
              {isEdit ? 'Save Changes' : 'Upload Floorplan'}
            </>
          )}
        </Button>
        <Button color="gray" onClick={handleClose}>
          Cancel
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
