import { useState, useEffect } from 'react';
import { categoryService, type Category } from '@/services/category';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CategoryFormModal } from '@/components/categories/CategoryFormModal';
import { ConfirmDeleteModal } from '@/components/common/ConfirmDeleteModal';
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown, Loader2, CheckCircle, XCircle } from 'lucide-react';

const CategoryManagement = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showFormModal, setShowFormModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [categoryToEdit, setCategoryToEdit] = useState<Category | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const fetchCategories = async (signal?: AbortSignal) => {
    try {
      setIsLoading(true);
      const data = await categoryService.getAll(signal, showInactive);
      setCategories(data);
      setError('');
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Failed to fetch categories');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchCategories(controller.signal);
    
    return () => {
      controller.abort();
    };
  }, [showInactive]);

  const handleCreateCategory = async (data: { name: string; is_active: boolean }) => {
    await categoryService.create({ name: data.name });
    fetchCategories();
  };

  const handleUpdateCategory = async (data: { name: string; is_active: boolean }) => {
    if (!categoryToEdit) return;
    await categoryService.update(categoryToEdit.id, { 
      name: data.name, 
      is_active: data.is_active 
    });
    fetchCategories();
  };

  const handleDeleteCategory = async () => {
    if (!categoryToDelete) return;
    await categoryService.delete(categoryToDelete.id);
    fetchCategories();
  };

  const moveCategory = async (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === categories.length - 1) return;

    const newCategories = [...categories];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    [newCategories[index], newCategories[targetIndex]] = [newCategories[targetIndex], newCategories[index]];
    
    const categoryIds = newCategories.map(c => c.id);
    
    try {
      const updatedCategories = await categoryService.reorder(categoryIds);
      setCategories(updatedCategories);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to reorder categories');
    }
  };

  const openCreateModal = () => {
    setCategoryToEdit(null);
    setShowFormModal(true);
  };

  const openEditModal = (category: Category) => {
    setCategoryToEdit(category);
    setShowFormModal(true);
  };

  const openDeleteModal = (category: Category) => {
    setCategoryToDelete(category);
    setShowDeleteModal(true);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Category Management</h1>
          <p className="text-muted-foreground">Organize product categories and arrange their display order</p>
        </div>
        <Button onClick={openCreateModal}>
          <Plus className="mr-2 h-4 w-4" />
          Add Category
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-end">
          <div className="flex items-center space-x-2">
            <Switch
              id="show-inactive"
              checked={showInactive}
              onCheckedChange={setShowInactive}
            />
            <label htmlFor="show-inactive" className="text-sm text-muted-foreground cursor-pointer">
              Show inactive
            </label>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Position</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-48"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                    No categories found. Create your first category to get started.
                  </TableCell>
                </TableRow>
              ) : (
                categories.map((category, index) => (
                  <TableRow 
                    key={category.id}
                    className={!category.is_active ? 'opacity-60' : ''}
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground w-6">{category.sort_order}</span>
                        <div className="flex flex-col">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => moveCategory(index, 'up')}
                            disabled={index === 0}
                          >
                            <ArrowUp className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => moveCategory(index, 'down')}
                            disabled={index === categories.length - 1}
                          >
                            <ArrowDown className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      {category.name}
                    </TableCell>
                    <TableCell>
                      {category.is_active ? (
                        <span className="inline-flex items-center text-green-600 text-sm">
                          <CheckCircle className="w-4 h-4 mr-1" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-muted-foreground text-sm">
                          <XCircle className="w-4 h-4 mr-1" />
                          Inactive
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          onClick={() => openEditModal(category)}
                        >
                          <Pencil className="mr-1 h-3 w-3" />
                          Edit
                        </Button>
                        <Button 
                          variant="destructive" 
                          size="sm" 
                          onClick={() => openDeleteModal(category)}
                        >
                          <Trash2 className="mr-1 h-3 w-3" />
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <CategoryFormModal
        category={categoryToEdit}
        isOpen={showFormModal}
        onClose={() => {
          setShowFormModal(false);
          setCategoryToEdit(null);
        }}
        onSubmit={categoryToEdit ? handleUpdateCategory : handleCreateCategory}
      />

      <ConfirmDeleteModal
        title="Delete Category"
        itemName={categoryToDelete?.name || ''}
        warningText="Note: You cannot delete a category that has items assigned to it."
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setCategoryToDelete(null);
        }}
        onConfirm={handleDeleteCategory}
      />
    </div>
  );
};

export default CategoryManagement;
