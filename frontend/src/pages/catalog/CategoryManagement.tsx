import { useState, useEffect } from 'react';
import { Button, Card, Table, Alert, Spinner } from 'flowbite-react';
import { HiPlus, HiTrash, HiPencil, HiArrowUp, HiArrowDown } from 'react-icons/hi';
import { categoryService, type Category } from '../../services/category';
import { CategoryFormModal } from '../../components/categories/CategoryFormModal';
import { ConfirmDeleteModal } from '../../components/common/ConfirmDeleteModal';

const CategoryManagement = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showFormModal, setShowFormModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [categoryToEdit, setCategoryToEdit] = useState<Category | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);

  const fetchCategories = async (signal?: AbortSignal) => {
    try {
      setIsLoading(true);
      const data = await categoryService.getAll(signal);
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
  }, []);

  const handleCreateCategory = async (name: string) => {
    await categoryService.create({ name });
    fetchCategories();
  };

  const handleUpdateCategory = async (name: string) => {
    if (!categoryToEdit) return;
    await categoryService.update(categoryToEdit.id, { name });
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
      await categoryService.reorder(categoryIds);
      setCategories(newCategories);
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
        <Spinner size="xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Category Management
          </h1>
          <p className="text-gray-600">
            Organize product categories and arrange their display order
          </p>
        </div>
        <Button onClick={openCreateModal}>
          <HiPlus className="mr-2 h-5 w-5" />
          Add Category
        </Button>
      </div>

      {error && (
        <Alert color="failure" onDismiss={() => setError('')}>
          {error}
        </Alert>
      )}

      <Card>
        <Table hoverable>
          <Table.Head>
            <Table.HeadCell>POSITION</Table.HeadCell>
            <Table.HeadCell>NAME</Table.HeadCell>
            <Table.HeadCell className="w-32"></Table.HeadCell>
          </Table.Head>
          <Table.Body>
            {categories.length === 0 ? (
              <Table.Row>
                <Table.Cell colSpan={3} className="text-center py-8 text-gray-500">
                  No categories found. Create your first category to get started.
                </Table.Cell>
              </Table.Row>
            ) : (
              categories.map((category, index) => (
                <Table.Row key={category.id} className="hover:bg-gray-50">
                  <Table.Cell>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">{category.sort_order}</span>
                      <div className="flex flex-col">
                        <button
                          onClick={() => moveCategory(index, 'up')}
                          disabled={index === 0}
                          className="p-1 hover:bg-gray-100 rounded disabled:opacity-30"
                        >
                          <HiArrowUp className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => moveCategory(index, 'down')}
                          disabled={index === categories.length - 1}
                          className="p-1 hover:bg-gray-100 rounded disabled:opacity-30"
                        >
                          <HiArrowDown className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </Table.Cell>
                  <Table.Cell className="font-medium">{category.name}</Table.Cell>
                  <Table.Cell>
                    <div className="flex gap-2 justify-end">
                      <Button
                        color="light"
                        size="xs"
                        onClick={() => openEditModal(category)}
                      >
                        <HiPencil className="mr-1 h-4 w-4" />
                        Edit
                      </Button>
                      <Button
                        color="failure"
                        size="xs"
                        onClick={() => openDeleteModal(category)}
                      >
                        <HiTrash className="mr-1 h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                  </Table.Cell>
                </Table.Row>
              ))
            )}
          </Table.Body>
        </Table>
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
