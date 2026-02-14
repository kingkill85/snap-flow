import React, { useState, useEffect } from 'react';
import { Button, Card, Table, TextInput, Select, Alert, Spinner, Pagination } from 'flowbite-react';
import { HiPlus, HiSearch, HiChevronDown, HiChevronRight } from 'react-icons/hi';
import { itemService, type Item, type ItemVariant } from '../../services/item';
import { categoryService, type Category } from '../../services/category';
import { ItemFormModal } from '../../components/items/ItemFormModal';
import { VariantFormModal } from '../../components/items/VariantFormModal';
import { DeleteVariantModal } from '../../components/items/DeleteVariantModal';
import { ConfirmDeleteModal } from '../../components/common/ConfirmDeleteModal';

const ItemManagement = () => {
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState('');
  const [showItemFormModal, setShowItemFormModal] = useState(false);
  const [itemToEdit, setItemToEdit] = useState<Item | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<Item | null>(null);

  // Filter and pagination state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<number | ''>('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const itemsPerPage = 10;

  // Variants state
  const [itemVariants, setItemVariants] = useState<Record<number, ItemVariant[]>>({});
  const [loadingVariants, setLoadingVariants] = useState<Record<number, boolean>>({});
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());

  // Unified Variant Form Modal state
  const [showVariantFormModal, setShowVariantFormModal] = useState(false);
  const [variantFormItemId, setVariantFormItemId] = useState<number | null>(null);
  const [variantFormItem, setVariantFormItem] = useState<Item | null>(null);
  const [variantToEdit, setVariantToEdit] = useState<ItemVariant | null>(null);
  const [showDeleteVariantModal, setShowDeleteVariantModal] = useState(false);
  const [variantToDelete, setVariantToDelete] = useState<ItemVariant | null>(null);

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
        
        // Auto-expand all items by default
        const allItemIds = new Set(result.items.map(item => item.id));
        setExpandedItems(allItemIds);
        
        // Load variants for all items
        result.items.forEach(item => {
          if (!itemVariants[item.id]) {
            loadVariants(item.id);
          }
        });
      } catch (err: any) {
        if (err.name === 'AbortError' || err.name === 'CanceledError' || err.message === 'canceled') {
          return;
        }
        setError(err.response?.data?.error || err.message || 'Failed to fetch items');
      } finally {
        // No loading state for searches
      }
    };
    
    fetchItems();
    
    return () => {
      controller.abort();
    };
  }, [selectedCategory, searchQuery, currentPage]);

  // Toggle item expansion
  const toggleItem = (itemId: number) => {
    setExpandedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
        // Load variants if not already loaded
        if (!itemVariants[itemId]) {
          loadVariants(itemId);
        }
      }
      return newSet;
    });
  };

  // Load variants for an item
  const loadVariants = async (itemId: number) => {
    if (itemVariants[itemId]) {
      return; // Already loaded
    }

    setLoadingVariants(prev => ({ ...prev, [itemId]: true }));
    try {
      const variants = await itemService.getVariants(itemId);
      setItemVariants(prev => ({ ...prev, [itemId]: variants }));
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load variants');
    } finally {
      setLoadingVariants(prev => ({ ...prev, [itemId]: false }));
    }
  };

  // Refresh variants for expanded item
  const refreshVariants = async (itemId: number) => {
    setLoadingVariants(prev => ({ ...prev, [itemId]: true }));
    try {
      // Clear cache first to force re-render
      setItemVariants(prev => {
        const newState = { ...prev };
        delete newState[itemId];
        return newState;
      });
      // Small delay to ensure React processes the state change
      await new Promise(resolve => setTimeout(resolve, 50));
      const variants = await itemService.getVariants(itemId);
      setItemVariants(prev => ({ ...prev, [itemId]: variants }));
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to refresh variants');
    } finally {
      setLoadingVariants(prev => ({ ...prev, [itemId]: false }));
    }
  };

  // Variant modal handlers
  const openAddVariantModal = (itemId: number) => {
    const item = items.find(i => i.id === itemId) || null;
    setVariantFormItemId(itemId);
    setVariantFormItem(item);
    setVariantToEdit(null);
    setShowVariantFormModal(true);
  };

  const openEditVariantModal = (itemId: number, variant: ItemVariant) => {
    const item = items.find(i => i.id === itemId) || null;
    setVariantFormItemId(itemId);
    setVariantFormItem(item);
    setVariantToEdit(variant);
    setShowVariantFormModal(true);
  };

  const openDeleteVariantModal = (itemId: number, variant: ItemVariant) => {
    setVariantFormItemId(itemId);
    setVariantToDelete(variant);
    setShowDeleteVariantModal(true);
  };

  const handleDeleteItem = async () => {
    if (!itemToDelete) return;
    await itemService.delete(itemToDelete.id);
    
    // Refresh items
    const result = await itemService.getAll(
      { category_id: selectedCategory || undefined, search: searchQuery || undefined },
      { page: currentPage, limit: itemsPerPage }
    );
    setItems(result.items);
    setTotalPages(result.totalPages);
  };

  const openEditModal = (item: Item) => {
    setItemToEdit(item);
    setShowItemFormModal(true);
  };

  const openCreateItem = () => {
    setItemToEdit(null);
    setShowItemFormModal(true);
  };

  const openDeleteModal = (item: Item) => {
    setItemToDelete(item);
    setShowDeleteModal(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Item Management</h1>
          <p className="text-gray-600">Manage products and their details</p>
        </div>
        <Button onClick={openCreateItem}>
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
            <Table.HeadCell className="w-10"></Table.HeadCell>
            <Table.HeadCell>NAME</Table.HeadCell>
            <Table.HeadCell>MODEL</Table.HeadCell>
            <Table.HeadCell>CATEGORY</Table.HeadCell>
            <Table.HeadCell className="w-32"></Table.HeadCell>
          </Table.Head>
          <Table.Body>
            {items.length === 0 ? (
              <Table.Row>
                <Table.Cell colSpan={5} className="text-center py-8 text-gray-500">
                  No items found. Create your first item to get started.
                </Table.Cell>
              </Table.Row>
            ) : (
              items.map((item) => {
                const category = categories.find(c => c.id === item.category_id);
                const variants = itemVariants[item.id] || [];
                const isLoading = loadingVariants[item.id];
                const isExpanded = expandedItems.has(item.id);
                
                return (
                  <React.Fragment key={item.id}>
                    {/* Main Item Row */}
                    <Table.Row className="hover:bg-gray-50">
                      <Table.Cell className="text-center">
                        <button 
                          onClick={() => toggleItem(item.id)}
                          className="p-1 hover:bg-gray-100 rounded transition-colors"
                          title={isExpanded ? "Collapse" : "Expand"}
                        >
                          {isExpanded ? <HiChevronDown className="w-5 h-5 text-gray-600" /> : <HiChevronRight className="w-5 h-5 text-gray-600" />}
                        </button>
                      </Table.Cell>
                      <Table.Cell className="font-medium">{item.name}</Table.Cell>
                      <Table.Cell className="text-gray-600">{item.base_model_number || '-'}</Table.Cell>
                      <Table.Cell>{category?.name || 'Unknown'}</Table.Cell>
                      <Table.Cell>
                        <div className="flex gap-2 justify-end">
                          <Button 
                            color="light" 
                            size="xs" 
                            onClick={() => openEditModal(item)}
                          >
                            Edit
                          </Button>
                          <Button 
                            color="failure" 
                            size="xs" 
                            onClick={() => openDeleteModal(item)}
                          >
                            Delete
                          </Button>
                        </div>
                      </Table.Cell>
                    </Table.Row>
                    
                    {/* Variants Subtable - Visible when expanded */}
                    {isExpanded && (
                    <Table.Row className="bg-gray-50">
                      <Table.Cell colSpan={5} className="p-0">
                          <div className="p-4">
                            <div className="flex justify-between items-center mb-3">
                              <h4 className="text-sm font-semibold text-gray-700">Variants</h4>
                              <Button 
                                size="xs" 
                                color="light"
                                onClick={() => openAddVariantModal(item.id)}
                              >
                                <HiPlus className="mr-1" /> Add Variant
                              </Button>
                            </div>
                            
                            {isLoading ? (
                              <div className="text-center py-4">
                                <Spinner size="sm" />
                                <span className="ml-2 text-sm text-gray-500">Loading variants...</span>
                              </div>
                            ) : variants.length === 0 ? (
                              <div className="text-center py-4 text-gray-500 text-sm">
                                No variants found. Add a variant to set price and image.
                              </div>
                            ) : (
                              <table className="w-full text-sm">
                                <thead>
                                  <tr className="border-b">
                                    <th className="text-left py-2 px-2">IMAGE</th>
                                    <th className="text-left py-2 px-2">STYLE</th>
                                    <th className="text-left py-2 px-2">PRICE</th>
                                    <th className="w-24"></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {variants.map((variant) => (
                                    <tr key={variant.id} className="border-b border-gray-200">
                                      <td className="py-2 px-2">
                                        {variant.image_path ? (
                                          <img
                                            src={itemService.getImageUrl(variant.image_path) || ''}
                                            alt={variant.style_name}
                                            className="h-16 w-auto max-w-24 object-contain rounded bg-white"
                                          />
                                        ) : (
                                          <div className="h-16 w-24 bg-gray-200 rounded flex items-center justify-center text-gray-400 text-xs">
                                            No Image
                                          </div>
                                        )}
                                      </td>
                                      <td className="py-2 px-2 font-medium">{variant.style_name}</td>
                                      <td className="py-2 px-2">${variant.price.toFixed(2)}</td>
                                      <td className="py-2 px-2 text-right">
                                        <div className="flex gap-1 justify-end">
                                          <Button 
                                            size="xs" 
                                            color="light"
                                            onClick={() => openEditVariantModal(item.id, variant)}
                                          >
                                            Edit
                                          </Button>
                                          <Button 
                                            size="xs" 
                                            color="failure"
                                            onClick={() => openDeleteVariantModal(item.id, variant)}
                                          >
                                            Delete
                                          </Button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}

                          </div>
                        </Table.Cell>
                      </Table.Row>
                    )}
                  </React.Fragment>
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

      {/* Unified Item Form Modal */}
      <ItemFormModal
        item={itemToEdit}
        categories={categories}
        isOpen={showItemFormModal}
        onClose={() => {
          setShowItemFormModal(false);
          setItemToEdit(null);
        }}
        onSubmit={async (data) => {
          if (itemToEdit) {
            // Edit mode
            await itemService.update(itemToEdit.id, data);
            // Refresh items
            const result = await itemService.getAll(
              { category_id: selectedCategory || undefined, search: searchQuery || undefined },
              { page: currentPage, limit: itemsPerPage }
            );
            setItems(result.items);
          } else {
            // Create mode - category_id is guaranteed by modal validation
            await itemService.create(data as import('../../services/item').CreateItemDTO);
            // Refresh items
            const result = await itemService.getAll(
              { category_id: selectedCategory || undefined, search: searchQuery || undefined },
              { page: currentPage, limit: itemsPerPage }
            );
            setItems(result.items);
            setTotalPages(result.totalPages);
            // Auto-expand new items
            const allItemIds = new Set(result.items.map(item => item.id));
            setExpandedItems(allItemIds);
          }
        }}
      />

      <ConfirmDeleteModal
        title="Delete Item"
        itemName={itemToDelete?.name || ''}
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setItemToDelete(null);
        }}
        onConfirm={handleDeleteItem}
      />

      {/* Unified Variant Form Modal */}
      <VariantFormModal
        itemId={variantFormItemId || 0}
        item={variantFormItem}
        variant={variantToEdit}
        availableVariants={variantFormItemId ? (itemVariants[variantFormItemId] || []) : []}
        isOpen={showVariantFormModal}
        onClose={() => {
          setShowVariantFormModal(false);
          setVariantToEdit(null);
          setVariantFormItemId(null);
          setVariantFormItem(null);
        }}
        onSubmit={async (data) => {
          if (variantToEdit && variantFormItemId) {
            // Edit mode - update and close
            await itemService.updateVariant(variantFormItemId, variantToEdit.id, data);
            // Small delay to ensure backend has processed the update
            await new Promise(resolve => setTimeout(resolve, 100));
            // Refresh variants
            if (variantFormItemId) {
              await refreshVariants(variantFormItemId);
            }
          } else if (variantFormItemId) {
            // Create mode - create variant and stay open for add-ons
            const newVariant = await itemService.createVariant(variantFormItemId, data);
            // Refresh variants to get the new one in the list
            await refreshVariants(variantFormItemId);
            // Switch to edit mode with the new variant
            setVariantToEdit(newVariant);
            // Don't close - user can now add add-ons
          }
        }}
      />

      <DeleteVariantModal
        itemId={variantFormItemId || 0}
        variant={variantToDelete}
        isOpen={showDeleteVariantModal}
        onClose={() => {
          setShowDeleteVariantModal(false);
          setVariantToDelete(null);
          setVariantFormItemId(null);
        }}
        onSuccess={() => {
          if (variantFormItemId) {
            refreshVariants(variantFormItemId);
          }
        }}
      />

    </div>
  );
};

export default ItemManagement;
