import { useState, useEffect } from 'react';
import { Button, Card, Table, Modal, Label, TextInput, Alert, Spinner } from 'flowbite-react';
import { HiPlus, HiTrash, HiPencil, HiArrowUp, HiArrowDown } from 'react-icons/hi';
import { categoryService, type Category } from '../../services/category';

const CategoryManagement = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [categoryToEdit, setCategoryToEdit] = useState<Category | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);

  // Create form state
  const [newCategoryName, setNewCategoryName] = useState('');
  const [createError, setCreateError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editError, setEditError] = useState('');
  const [isEditing, setIsEditing] = useState(false);

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

  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    setIsCreating(true);

    try {
      await categoryService.create({ name: newCategoryName });
      setNewCategoryName('');
      setShowCreateModal(false);
      fetchCategories();
    } catch (err: any) {
      setCreateError(err.response?.data?.error || 'Failed to create category');
    } finally {
      setIsCreating(false);
    }
  };

  const handleEditCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryToEdit) return;

    setEditError('');
    setIsEditing(true);

    try {
      await categoryService.update(categoryToEdit.id, { name: editName });
      setCategoryToEdit(null);
      setEditName('');
      setShowEditModal(false);
      fetchCategories();
    } catch (err: any) {
      setEditError(err.response?.data?.error || 'Failed to update category');
    } finally {
      setIsEditing(false);
    }
  };

  const handleDeleteCategory = async () => {
    if (!categoryToDelete) return;

    try {
      await categoryService.delete(categoryToDelete.id);
      setCategoryToDelete(null);
      setShowDeleteModal(false);
      fetchCategories();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete category');
      setShowDeleteModal(false);
    }
  };

  const moveCategory = async (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === categories.length - 1) return;

    const newCategories = [...categories];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    // Swap categories
    [newCategories[index], newCategories[targetIndex]] = [newCategories[targetIndex], newCategories[index]];
    
    // Update sort order
    const categoryIds = newCategories.map(c => c.id);
    
    try {
      await categoryService.reorder(categoryIds);
      setCategories(newCategories);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to reorder categories');
    }
  };

  const openEditModal = (category: Category) => {
    setCategoryToEdit(category);
    setEditName(category.name);
    setEditError('');
    setShowEditModal(true);
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
    <div className="p-4">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Category Management
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Organize product categories and arrange their display order
          </p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <HiPlus className="mr-2 h-5 w-5" />
          Add Category
        </Button>
      </div>

      {error && (
        <Alert color="failure" className="mb-4" onDismiss={() => setError('')}>
          <span>{error}</span>
        </Alert>
      )}

      <Card>
        <Table hoverable>
          <Table.Head>
            <Table.HeadCell>Position</Table.HeadCell>
            <Table.HeadCell>Name</Table.HeadCell>
            <Table.HeadCell>Actions</Table.HeadCell>
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
                <Table.Row key={category.id}>
                  <Table.Cell className="font-medium">
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
                  <Table.Cell className="font-medium text-gray-900 dark:text-white">
                    {category.name}
                  </Table.Cell>
                  <Table.Cell>
                    <div className="flex gap-2">
                      <Button
                        size="xs"
                        color="light"
                        onClick={() => openEditModal(category)}
                      >
                        <HiPencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="xs"
                        color="failure"
                        onClick={() => openDeleteModal(category)}
                      >
                        <HiTrash className="h-4 w-4" />
                      </Button>
                    </div>
                  </Table.Cell>
                </Table.Row>
              ))
            )}
          </Table.Body>
        </Table>
      </Card>

      {/* Create Modal */}
      <Modal show={showCreateModal} onClose={() => setShowCreateModal(false)}>
        <Modal.Header>Create New Category</Modal.Header>
        <Modal.Body>
          <form onSubmit={handleCreateCategory} className="space-y-4">
            {createError && (
              <Alert color="failure" onDismiss={() => setCreateError('')}>
                <span>{createError}</span>
              </Alert>
            )}
            <div>
              <Label htmlFor="categoryName">Category Name</Label>
              <TextInput
                id="categoryName"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Enter category name"
                required
              />
            </div>
          </form>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={handleCreateCategory} disabled={isCreating}>
            {isCreating ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Creating...
              </>
            ) : (
              'Create Category'
            )}
          </Button>
          <Button color="gray" onClick={() => setShowCreateModal(false)}>
            Cancel
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Edit Modal */}
      <Modal show={showEditModal} onClose={() => setShowEditModal(false)}>
        <Modal.Header>Edit Category</Modal.Header>
        <Modal.Body>
          <form onSubmit={handleEditCategory} className="space-y-4">
            {editError && (
              <Alert color="failure" onDismiss={() => setEditError('')}>
                <span>{editError}</span>
              </Alert>
            )}
            <div>
              <Label htmlFor="editCategoryName">Category Name</Label>
              <TextInput
                id="editCategoryName"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Enter category name"
                required
              />
            </div>
          </form>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={handleEditCategory} disabled={isEditing}>
            {isEditing ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Updating...
              </>
            ) : (
              'Update Category'
            )}
          </Button>
          <Button color="gray" onClick={() => setShowEditModal(false)}>
            Cancel
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Delete Modal */}
      <Modal show={showDeleteModal} onClose={() => setShowDeleteModal(false)}>
        <Modal.Header>Delete Category</Modal.Header>
        <Modal.Body>
          <p className="text-gray-600 dark:text-gray-400">
            Are you sure you want to delete the category "{categoryToDelete?.name}"? 
            This action cannot be undone.
          </p>
          <p className="text-sm text-red-600 mt-2">
            Note: You cannot delete a category that has items assigned to it.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button color="failure" onClick={handleDeleteCategory}>
            Delete
          </Button>
          <Button color="gray" onClick={() => setShowDeleteModal(false)}>
            Cancel
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default CategoryManagement;
