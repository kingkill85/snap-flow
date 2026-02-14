import { useState, useEffect } from 'react';
import { Button, Card, Table, Modal, Label, TextInput, Textarea, Select, Alert, Spinner, Pagination } from 'flowbite-react';
import { HiPlus, HiSearch } from 'react-icons/hi';
import { itemService, type Item, type CreateItemDTO } from '../../services/item';
import { categoryService, type Category } from '../../services/category';

const ItemManagement = () => {
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToEdit, setItemToEdit] = useState<Item | null>(null);
  const [itemToDelete, setItemToDelete] = useState<Item | null>(null);

  // Filter and pagination state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<number | ''>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const itemsPerPage = 10;

  // Create form state
  const [newItem, setNewItem] = useState<{
    category_id?: number;
    name: string;
    description: string;
    model_number: string;
    dimensions: string;
    price: string;
  }>({
    category_id: undefined,
    name: '',
    description: '',
    model_number: '',
    dimensions: '',
    price: '',
  });
  const [newItemImage, setNewItemImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [createError, setCreateError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Edit form state
  const [editItem, setEditItem] = useState<Partial<CreateItemDTO>>({});
  const [editItemImage, setEditItemImage] = useState<File | null>(null);
  const [editImagePreview, setEditImagePreview] = useState<string | null>(null);
  const [editError, setEditError] = useState('');
  const [isEditing, setIsEditing] = useState(false);

  // Fetch categories
  useEffect(() => {
    const controller = new AbortController();
    
    const fetchCategories = async () => {
      try {
        const data = await categoryService.getAll(controller.signal);
        setCategories(data);
      } catch (err: any) {
        if (err.name !== 'AbortError' && err.name !== 'CanceledError' && err.message !== 'canceled') {
          console.error('Failed to fetch categories:', err);
        }
      }
    };
    
    fetchCategories();
    
    return () => {
      controller.abort();
    };
  }, []);

  // Fetch items when filters or pagination change
  useEffect(() => {
    const controller = new AbortController();
    
    const fetchItems = async () => {
      try {
        // Only show loading state on initial fetch (no items yet)
        if (items.length === 0) {
          setIsLoading(true);
        }
        setError('');
        
        const filter: { category_id?: number; search?: string } = {};
        if (selectedCategory) filter.category_id = selectedCategory;
        if (searchQuery) filter.search = searchQuery;

        const result = await itemService.getAll(
          filter,
          { page: currentPage, limit: itemsPerPage },
          controller.signal
        );

        setItems(result.items);
        setTotalPages(result.totalPages);
      } catch (err: any) {
        if (err.name === 'AbortError' || err.name === 'CanceledError' || err.message === 'canceled') {
          return;
        }
        setError(err.response?.data?.error || err.message || 'Failed to fetch items');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchItems();
    
    return () => {
      controller.abort();
    };
  }, [selectedCategory, searchQuery, currentPage]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>, isEdit = false) => {
    const file = e.target.files?.[0];
    if (file) {
      if (isEdit) {
        setEditItemImage(file);
        setEditImagePreview(URL.createObjectURL(file));
      } else {
        setNewItemImage(file);
        setImagePreview(URL.createObjectURL(file));
      }
    }
  };

  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');
    setIsCreating(true);

    try {
      if (!newItem.category_id || !newItem.name || !newItem.price) {
        setCreateError('Please fill in all required fields (Category, Name, and Price)');
        setIsCreating(false);
        return;
      }

      const priceValue = parseFloat(newItem.price);
      if (isNaN(priceValue) || priceValue < 0) {
        setCreateError('Please enter a valid price');
        setIsCreating(false);
        return;
      }

      await itemService.create({
        category_id: newItem.category_id,
        name: newItem.name,
        description: newItem.description || undefined,
        model_number: newItem.model_number || undefined,
        dimensions: newItem.dimensions || undefined,
        price: priceValue,
        image: newItemImage || undefined,
      });

      setNewItem({
        category_id: undefined,
        name: '',
        description: '',
        model_number: '',
        dimensions: '',
        price: '',
      });
      setNewItemImage(null);
      setImagePreview(null);
      setShowCreateModal(false);
      
      // Refresh items
      const result = await itemService.getAll(
        { category_id: selectedCategory || undefined, search: searchQuery || undefined },
        { page: currentPage, limit: itemsPerPage }
      );
      setItems(result.items);
      setTotalPages(result.totalPages);
    } catch (err: any) {
      setCreateError(err.response?.data?.error || 'Failed to create item');
    } finally {
      setIsCreating(false);
    }
  };

  const handleEditItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemToEdit) return;

    setEditError('');
    setIsEditing(true);

    try {
      await itemService.update(itemToEdit.id, {
        ...editItem,
        image: editItemImage || undefined,
      });

      setShowEditModal(false);
      setItemToEdit(null);
      setEditItemImage(null);
      setEditImagePreview(null);
      
      // Refresh items
      const result = await itemService.getAll(
        { category_id: selectedCategory || undefined, search: searchQuery || undefined },
        { page: currentPage, limit: itemsPerPage }
      );
      setItems(result.items);
      setTotalPages(result.totalPages);
    } catch (err: any) {
      setEditError(err.response?.data?.error || 'Failed to update item');
    } finally {
      setIsEditing(false);
    }
  };

  const handleDeleteItem = async () => {
    if (!itemToDelete) return;

    try {
      await itemService.delete(itemToDelete.id);
      setShowDeleteModal(false);
      setItemToDelete(null);
      
      // Refresh items
      const result = await itemService.getAll(
        { category_id: selectedCategory || undefined, search: searchQuery || undefined },
        { page: currentPage, limit: itemsPerPage }
      );
      setItems(result.items);
      setTotalPages(result.totalPages);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete item');
      setShowDeleteModal(false);
    }
  };

  const openEditModal = (item: Item) => {
    setItemToEdit(item);
    setEditItem({
      category_id: item.category_id,
      name: item.name,
      description: item.description,
      model_number: item.model_number,
      dimensions: item.dimensions,
      price: item.price,
    });
    setEditImagePreview(item.image_path ? itemService.getImageUrl(item.image_path) : null);
    setEditError('');
    setShowEditModal(true);
  };

  const openDeleteModal = (item: Item) => {
    setItemToDelete(item);
    setShowDeleteModal(true);
  };

  // Only show full-page loading on initial load (no items yet)
  if (isLoading && items.length === 0) {
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
          <h1 className="text-2xl font-bold text-gray-900">Item Management</h1>
          <p className="text-gray-600">Manage products and their details</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <HiPlus className="mr-2 h-5 w-5" />
          Add Item
        </Button>
      </div>

      {error && (
        <Alert color="failure" onDismiss={() => setError('')}>
          {error}
        </Alert>
      )}

      {/* Search and Filter */}
      <Card>
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <TextInput
              type="text"
              placeholder="Search items..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              icon={HiSearch}
            />
          </div>
          <div className="w-48">
            <Select
              value={selectedCategory}
              onChange={(e) => {
                setSelectedCategory(e.target.value ? parseInt(e.target.value) : '');
                setCurrentPage(1);
              }}
            >
              <option value="">All Categories</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
      </Card>

      {/* Items Table */}
      <Card>
        <Table hoverable>
          <Table.Head>
            <Table.HeadCell>Image</Table.HeadCell>
            <Table.HeadCell>Name</Table.HeadCell>
            <Table.HeadCell>Category</Table.HeadCell>
            <Table.HeadCell>Model</Table.HeadCell>
            <Table.HeadCell>Price</Table.HeadCell>
            <Table.HeadCell>
              <span className="sr-only">Actions</span>
            </Table.HeadCell>
          </Table.Head>
          <Table.Body>
            {items.length === 0 ? (
              <Table.Row>
                <Table.Cell colSpan={6} className="text-center py-8 text-gray-500">
                  No items found. Create your first item to get started.
                </Table.Cell>
              </Table.Row>
            ) : (
              items.map((item) => {
                const category = categories.find(c => c.id === item.category_id);
                return (
                  <Table.Row key={item.id}>
                    <Table.Cell>
                      {item.image_path ? (
                        <img
                          src={itemService.getImageUrl(item.image_path) || ''}
                          alt={item.name}
                          className="w-16 h-16 object-cover rounded"
                        />
                      ) : (
                        <div className="w-16 h-16 bg-gray-200 rounded flex items-center justify-center text-gray-400 text-xs">
                          No Image
                        </div>
                      )}
                    </Table.Cell>
                    <Table.Cell className="font-medium">{item.name}</Table.Cell>
                    <Table.Cell>{category?.name || 'Unknown'}</Table.Cell>
                    <Table.Cell className="text-gray-600">{item.model_number || '-'}</Table.Cell>
                    <Table.Cell>${item.price.toFixed(2)}</Table.Cell>
                    <Table.Cell>
                      <div className="flex gap-2">
                        <Button color="light" size="xs" onClick={() => openEditModal(item)}>
                          Edit
                        </Button>
                        <Button color="failure" size="xs" onClick={() => openDeleteModal(item)}>
                          Delete
                        </Button>
                      </div>
                    </Table.Cell>
                  </Table.Row>
                );
              })
            )}
          </Table.Body>
        </Table>
        
        {totalPages > 1 && (
          <div className="flex justify-center mt-4">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          </div>
        )}
      </Card>

      {/* Create Item Modal */}
      <Modal show={showCreateModal} onClose={() => setShowCreateModal(false)} size="lg">
        <Modal.Header>Create New Item</Modal.Header>
        <Modal.Body>
          {createError && (
            <Alert color="failure" className="mb-4">
              {createError}
            </Alert>
          )}
          <form onSubmit={handleCreateItem} className="space-y-4">
            <div>
              <Label htmlFor="category" value="Category *" />
              <Select
                id="category"
                required
                value={newItem.category_id || ''}
                onChange={(e) => setNewItem({ ...newItem, category_id: parseInt(e.target.value) })}
              >
                <option value="">Select a category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label htmlFor="name" value="Name *" />
              <TextInput
                id="name"
                type="text"
                required
                value={newItem.name}
                onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                placeholder="e.g., Smart Light Bulb"
              />
            </div>

            <div>
              <Label htmlFor="description" value="Description" />
              <Textarea
                id="description"
                value={newItem.description}
                onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                placeholder="Product description..."
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="modelNumber" value="Model Number" />
                <TextInput
                  id="modelNumber"
                  type="text"
                  value={newItem.model_number}
                  onChange={(e) => setNewItem({ ...newItem, model_number: e.target.value })}
                  placeholder="e.g., SB-100"
                />
              </div>
              <div>
                <Label htmlFor="dimensions" value="Dimensions" />
                <TextInput
                  id="dimensions"
                  type="text"
                  value={newItem.dimensions}
                  onChange={(e) => setNewItem({ ...newItem, dimensions: e.target.value })}
                  placeholder="e.g., 120x80mm"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="price" value="Price *" />
              <TextInput
                id="price"
                type="number"
                required
                min="0"
                step="0.01"
                value={newItem.price}
                onChange={(e) => setNewItem({ ...newItem, price: e.target.value })}
                placeholder="29.99"
              />
            </div>

            <div>
              <Label htmlFor="image" value="Image" />
              <input
                id="image"
                type="file"
                accept="image/*"
                onChange={(e) => handleImageChange(e)}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
              {imagePreview && (
                <img
                  src={imagePreview}
                  alt="Preview"
                  className="mt-2 w-32 h-32 object-cover rounded"
                />
              )}
            </div>
          </form>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={handleCreateItem} disabled={isCreating}>
            {isCreating ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Creating...
              </>
            ) : (
              'Create Item'
            )}
          </Button>
          <Button color="gray" onClick={() => setShowCreateModal(false)}>
            Cancel
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Edit Item Modal */}
      <Modal show={showEditModal} onClose={() => setShowEditModal(false)} size="lg">
        <Modal.Header>Edit Item</Modal.Header>
        <Modal.Body>
          {editError && (
            <Alert color="failure" className="mb-4">
              {editError}
            </Alert>
          )}
          <form onSubmit={handleEditItem} className="space-y-4">
            <div>
              <Label htmlFor="editCategory" value="Category" />
              <Select
                id="editCategory"
                value={editItem.category_id || ''}
                onChange={(e) => setEditItem({ ...editItem, category_id: parseInt(e.target.value) })}
              >
                <option value="">Select a category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </Select>
            </div>

            <div>
              <Label htmlFor="editName" value="Name" />
              <TextInput
                id="editName"
                type="text"
                value={editItem.name}
                onChange={(e) => setEditItem({ ...editItem, name: e.target.value })}
              />
            </div>

            <div>
              <Label htmlFor="editDescription" value="Description" />
              <Textarea
                id="editDescription"
                value={editItem.description}
                onChange={(e) => setEditItem({ ...editItem, description: e.target.value })}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="editModelNumber" value="Model Number" />
                <TextInput
                  id="editModelNumber"
                  type="text"
                  value={editItem.model_number}
                  onChange={(e) => setEditItem({ ...editItem, model_number: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="editDimensions" value="Dimensions" />
                <TextInput
                  id="editDimensions"
                  type="text"
                  value={editItem.dimensions}
                  onChange={(e) => setEditItem({ ...editItem, dimensions: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="editPrice" value="Price" />
              <TextInput
                id="editPrice"
                type="number"
                min="0"
                step="0.01"
                value={editItem.price || ''}
                onChange={(e) => setEditItem({ ...editItem, price: parseFloat(e.target.value) })}
              />
            </div>

            <div>
              <Label htmlFor="editImage" value="Image (leave empty to keep current)" />
              <input
                id="editImage"
                type="file"
                accept="image/*"
                onChange={(e) => handleImageChange(e, true)}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
              {editImagePreview && (
                <img
                  src={editImagePreview}
                  alt="Preview"
                  className="mt-2 w-32 h-32 object-cover rounded"
                />
              )}
            </div>
          </form>
        </Modal.Body>
        <Modal.Footer>
          <Button onClick={handleEditItem} disabled={isEditing}>
            {isEditing ? (
              <>
                <Spinner size="sm" className="mr-2" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
          <Button color="gray" onClick={() => setShowEditModal(false)}>
            Cancel
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Delete Modal */}
      <Modal show={showDeleteModal} onClose={() => setShowDeleteModal(false)}>
        <Modal.Header>Delete Item</Modal.Header>
        <Modal.Body>
          <p className="text-gray-600 dark:text-gray-400">
            Are you sure you want to delete &quot;{itemToDelete?.name}&quot;? 
            This action cannot be undone.
          </p>
        </Modal.Body>
        <Modal.Footer>
          <Button color="failure" onClick={handleDeleteItem}>
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

export default ItemManagement;
