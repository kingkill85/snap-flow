import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { X, Upload } from 'lucide-react';
import type { ItemVariant } from '@/services/item';

export interface CreateVariantDTO {
  style_name: string;
  price: number;
  image?: File;
}

export interface UpdateVariantDTO {
  style_name?: string;
  price?: number;
  image?: File;
  remove_image?: boolean;
  is_active?: boolean;
}

interface VariantFormModalProps {
  itemId: number;
  variant: ItemVariant | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateVariantDTO | UpdateVariantDTO) => Promise<void>;
}

export function VariantFormModal({ variant, isOpen, onClose, onSubmit }: VariantFormModalProps) {
  const isEdit = !!variant;
  const [styleName, setStyleName] = useState('');
  const [price, setPrice] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [removeImage, setRemoveImage] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (variant) {
      setStyleName(variant.style_name);
      setPrice(variant.price.toString());
      setIsActive(variant.is_active);
      setImage(null);
      setImagePreview(variant.image_path ? `/uploads/${variant.image_path}` : null);
      setRemoveImage(false);
    } else {
      setStyleName('');
      setPrice('');
      setIsActive(true);
      setImage(null);
      setImagePreview(null);
      setRemoveImage(false);
    }
    setError('');
  }, [variant, isOpen]);

  const handleFileChange = (file: File | null) => {
    if (file && file.type.startsWith('image/')) {
      setImage(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
      setRemoveImage(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    handleFileChange(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const clearImage = () => {
    setImage(null);
    setImagePreview(null);
    setRemoveImage(true);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum < 0) {
      setError('Please enter a valid price');
      setIsLoading(false);
      return;
    }

    try {
      const data: CreateVariantDTO | UpdateVariantDTO = isEdit
        ? {
            style_name: styleName,
            price: priceNum,
            ...(image && { image }),
            ...(removeImage && { remove_image: true }),
            is_active: isActive,
          }
        : {
            style_name: styleName,
            price: priceNum,
            ...(image && { image }),
          };

      await onSubmit(data);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save variant');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Variant' : 'Create Variant'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update variant details below.'
              : 'Fill in the details to create a new variant.'}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 p-3 rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="style_name">Style Name *</Label>
            <Input
              id="style_name"
              value={styleName}
              onChange={(e) => setStyleName(e.target.value)}
              placeholder="e.g., White, Black, Matte Finish"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="price">Price *</Label>
            <Input
              id="price"
              type="number"
              step="0.01"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="0.00"
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Image</Label>
            <div
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={`
                border-2 border-dashed rounded-lg p-6 cursor-pointer
                transition-colors duration-200
                ${isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-muted-foreground/50'}
                ${imagePreview ? 'p-2' : 'p-6'}
              `}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
                className="hidden"
              />

              {imagePreview ? (
                <div className="relative">
                  <img
                    src={imagePreview}
                    alt="Preview"
                    className="max-h-48 mx-auto rounded object-contain"
                  />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      clearImage();
                    }}
                    className="absolute top-2 right-2 p-1 bg-destructive text-destructive-foreground rounded-full hover:bg-destructive/90"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="text-center">
                  <Upload className="mx-auto h-10 w-10 text-muted-foreground mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Drag and drop an image here, or click to select
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Supports: JPG, PNG, WebP
                  </p>
                </div>
              )}
            </div>
          </div>

          {isEdit && (
            <div className="flex items-center space-x-2">
              <Switch
                id="is_active"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
              <Label htmlFor="is_active" className="text-sm font-normal cursor-pointer">
                Active
              </Label>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? 'Saving...' : isEdit ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
