import { useState, useEffect } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { Item } from '@/services/item';
import type { Category } from '@/services/category';
import { X, Save, Plus } from 'lucide-react';

export interface CreateItemDTO {
  category_id: number;
  name: string;
  description?: string;
  base_model_number?: string;
  dimensions?: string;
  is_active?: boolean;
}

export interface UpdateItemDTO {
  category_id?: number;
  name?: string;
  description?: string;
  base_model_number?: string;
  dimensions?: string;
  is_active?: boolean;
}

interface ItemFormModalProps {
  item: Item | null;
  categories: Category[];
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CreateItemDTO | UpdateItemDTO) => Promise<void>;
}

export function ItemFormModal({ item, categories, isOpen, onClose, onSubmit }: ItemFormModalProps) {
  const isEdit = !!item;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [baseModelNumber, setBaseModelNumber] = useState('');
  const [dimensions, setDimensions] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [isActive, setIsActive] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (item) {
      setName(item.name);
      setDescription(item.description || '');
      setBaseModelNumber(item.base_model_number || '');
      setDimensions(item.dimensions || '');
      setCategoryId(item.category_id.toString());
      setIsActive(item.is_active);
    } else {
      setName('');
      setDescription('');
      setBaseModelNumber('');
      setDimensions('');
      setCategoryId(categories.length > 0 ? categories[0].id.toString() : '');
      setIsActive(true);
    }
    setError('');
  }, [item, isOpen, categories]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    if (!categoryId) {
      setError('Please select a category');
      setIsLoading(false);
      return;
    }

    try {
      const data: CreateItemDTO | UpdateItemDTO = isEdit
        ? {
            name,
            description: description || undefined,
            base_model_number: baseModelNumber || undefined,
            dimensions: dimensions || undefined,
            category_id: parseInt(categoryId),
            is_active: isActive,
          }
        : {
            name,
            description: description || undefined,
            base_model_number: baseModelNumber || undefined,
            dimensions: dimensions || undefined,
            category_id: parseInt(categoryId),
            is_active: isActive,
          };

      await onSubmit(data);
      onClose();
    } catch (err: unknown) {
      setError(extractErrorMessage(err) || 'Failed to save item');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Product' : 'Create Product'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update product details below.'
              : 'Fill in the details to create a new product.'}
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="text-sm text-destructive bg-destructive/10 p-3 rounded">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Smart Bulb, Security Camera"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Category *</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((category) => (
                  <SelectItem key={category.id} value={category.id.toString()}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of the product"
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="base_model_number">Model Number</Label>
              <Input
                id="base_model_number"
                value={baseModelNumber}
                onChange={(e) => setBaseModelNumber(e.target.value)}
                placeholder="e.g., SB-100"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="dimensions">Dimensions</Label>
              <Input
                id="dimensions"
                value={dimensions}
                onChange={(e) => setDimensions(e.target.value)}
                placeholder="e.g., 120x80mm"
              />
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
              <X className="mr-2 h-4 w-4" />
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !categoryId}>
              {isLoading ? (
                'Saving...'
              ) : isEdit ? (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Update
                </>
              ) : (
                <>
                  <Plus className="mr-2 h-4 w-4" />
                  Create
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
