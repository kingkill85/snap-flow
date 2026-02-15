import React, { useState, useEffect } from 'react';
import { Button, Card, Table, TextInput, Select, Alert, Spinner, Pagination, ToggleSwitch } from 'flowbite-react';
import { HiPlus, HiSearch, HiChevronDown, HiChevronRight, HiCheckCircle, HiXCircle, HiPhotograph, HiUpload } from 'react-icons/hi';
import { itemService, type Item, type ItemVariant } from '../../services/item';
import { categoryService, type Category } from '../../services/category';
import { ItemFormModal } from '../../components/items/ItemFormModal';
import { VariantFormModal } from '../../components/items/VariantFormModal';
import { DeleteVariantModal } from '../../components/items/DeleteVariantModal';
import { ConfirmDeleteModal } from '../../components/common/ConfirmDeleteModal';
import { ImportModal } from '../../components/items/ImportModal';

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
  const [variantToEdit, setVariantToEdit] = useState<ItemVariant | null>(null);
  const [showDeleteVariantModal, setShowDeleteVariantModal] = useState(false);
  const [variantToDelete, setVariantToDelete] = useState<ItemVariant | null>(null);

  // Show inactive items toggle
  const [showInactive, setShowInactive] = useState(false);

  // Import modal state
  const [showImportModal, setShowImportModal] = useState(false);

  // Fetch categories (include inactive so we can display category names for all items)
  useEffect(() => {
    const controller = new AbortController();
    
    const fetchCategories = async () => {
      try {
        const data = await categoryService.getAll(controller.signal, true);
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
        
        const filter: { category_id?: number; search?: string; include_inactive?: boolean } = {};
        if (selectedCategory) filter.category_id = selectedCategory;
        if (searchQuery) filter.search = searchQuery;
        if (showInactive) filter.include_inactive = true;

        const result = await itemService.getAll(
          filter,
          { page: currentPage, limit: itemsPerPage },
          controller.signal
        );

        setItems(result.items);
        setTotalPages(result.totalPages);
        
        // Note: Items are collapsed by default, user must click to expand
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
  }, [selectedCategory, searchQuery, currentPage, showInactive]);

  // Reload variants when showInactive changes
  useEffect(() => {
    // Reload variants for all expanded items
    expandedItems.forEach(itemId => {
      refreshVariants(itemId);
    });
  }, [showInactive]);

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
      const variants = await itemService.getVariants(itemId, showInactive);
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
      const variants = await itemService.getVariants(itemId, showInactive);
      setItemVariants(prev => ({ ...prev, [itemId]: variants }));
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to refresh variants');
    } finally {
      setLoadingVariants(prev => ({ ...prev, [itemId]: false }));
    }
  };

  // Variant modal handlers
  const openAddVariantModal = (itemId: number) => {
    setVariantFormItemId(itemId);
    setVariantToEdit(null);
    setShowVariantFormModal(true);
  };

  const openEditVariantModal = (itemId: number, variant: ItemVariant) => {
    setVariantFormItemId(itemId);
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
    const filter: { category_id?: number; search?: string; include_inactive?: boolean } = {};
    if (selectedCategory) filter.category_id = selectedCategory;
    if (searchQuery) filter.search = searchQuery;
    if (showInactive) filter.include_inactive = true;
    
    const result = await itemService.getAll(
      filter,
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
        <div className="flex gap-3">
          <Button color="light" onClick={() => setShowImportModal(true)}>
            <HiUpload className="mr-2 h-5 w-5" />
            Import Catalog
          </Button>
          <Button onClick={openCreateItem}>
            <HiPlus className="mr-2 h-5 w-5" />
            Add Item
          </Button>
        </div>
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
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Items</h2>
          <ToggleSwitch
            checked={showInactive}
            onChange={setShowInactive}
            label="Show inactive"
          />
        </div>
         <Table hoverable>
          <Table.Head>
            <Table.HeadCell className="w-10"></Table.HeadCell>
            <Table.HeadCell className="w-16">IMAGE</Table.HeadCell>
            <Table.HeadCell>NAME</Table.HeadCell>
            <Table.HeadCell>MODEL</Table.HeadCell>
            <Table.HeadCell>CATEGORY</Table.HeadCell>
            <Table.HeadCell className="w-28">STATUS</Table.HeadCell>
            <Table.HeadCell className="w-32"></Table.HeadCell>
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
                const variants = itemVariants[item.id] || [];
                const isLoading = loadingVariants[item.id];
                const isExpanded = expandedItems.has(item.id);
                
                return (
                  <React.Fragment key={item.id}>
                    {/* Main Item Row */}
                    <Table.Row className={`hover:bg-gray-50 transition-colors ${!item.is_active ? 'border-l-4 border-l-gray-400 opacity-75' : ''}`}>
                      <Table.Cell className="text-center">
                        <button 
                          onClick={() => toggleItem(item.id)}
                          className="p-1 hover:bg-gray-100 rounded transition-colors"
                          title={isExpanded ? "Collapse" : "Expand"}
                        >
                          {isExpanded ? <HiChevronDown className="w-5 h-5 text-gray-600" /> : <HiChevronRight className="w-5 h-5 text-gray-600" />}
                        </button>
                      </Table.Cell>
                      <Table.Cell>
                        {item.preview_image ? (
                          <img
                            src={itemService.getImageUrl(item.preview_image) || ''}
                            alt={item.name}
                            className="h-10 w-auto max-w-16 object-contain rounded border border-gray-200"
                          />
                        ) : (
                          <div className="h-10 w-10 bg-gray-100 rounded border border-gray-200 flex items-center justify-center text-gray-400">
                            <HiPhotograph className="w-5 h-5" />
                          </div>
                        )}
                      </Table.Cell>
                      <Table.Cell className="font-medium">
                        {item.name}
                      </Table.Cell>
                      <Table.Cell className="text-gray-600">{item.base_model_number || '-'}</Table.Cell>
                      <Table.Cell>{category?.name || 'Unknown'}</Table.Cell>
                      <Table.Cell>
                        {item.is_active ? (
                          <span className="inline-flex items-center text-green-600 text-sm">
                            <HiCheckCircle className="w-5 h-5 mr-1" />
                            Active
                          </span>
                        ) : (
                          <span className="inline-flex items-center text-gray-500 text-sm">
                            <HiXCircle className="w-5 h-5 mr-1" />
                            Inactive
                          </span>
                        )}
                      </Table.Cell>
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
                    <Table.Row className="bg-white">
                      <Table.Cell colSpan={7} className="p-0">
                          <div className="mx-4 mb-4 border rounded-lg bg-gray-50 shadow-sm">
                            <div className="flex justify-between items-center px-4 py-3 border-b bg-gray-100 rounded-t-lg">
                              <h4 className="text-sm font-semibold text-gray-700 flex items-center">
                                <span className="bg-gray-200 text-gray-700 text-xs px-2 py-1 rounded-full mr-2">
                                  {variants.length} variant{variants.length !== 1 ? 's' : ''}
                                </span>
                                Variants
                              </h4>
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
                              <table className="w-full">
                                <thead>
                                  <tr className="border-b border-gray-200">
                                    <th className="text-left py-2 px-4 w-16 text-xs text-gray-700 uppercase font-semibold tracking-wider">Image</th>
                                    <th className="text-left py-2 px-4 text-xs text-gray-700 uppercase font-semibold tracking-wider">Style</th>
                                    <th className="text-left py-2 px-4 w-24 text-xs text-gray-700 uppercase font-semibold tracking-wider">Price</th>
                                    <th className="text-left py-2 px-4 w-28 text-xs text-gray-700 uppercase font-semibold tracking-wider">Status</th>
                                    <th className="w-32"></th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {variants.map((variant) => (
                                     <tr key={variant.id} className={`border-b border-gray-200 last:border-b-0 text-sm ${!variant.is_active ? 'opacity-60' : ''}`}>
                                      <td className="py-3 px-4">
                                        {variant.image_path ? (
                                          <img
                                            src={itemService.getImageUrl(variant.image_path) || ''}
                                            alt={variant.style_name}
                                            className="h-16 w-auto max-w-24 object-contain rounded border border-gray-200"
                                          />
                                        ) : (
                                          <div className="h-16 w-24 bg-white rounded border border-gray-200 flex items-center justify-center text-gray-400">
                                            <HiPhotograph className="w-6 h-6" />
                                          </div>
                                        )}
                                      </td>
                                      <td className="py-3 px-4 font-medium text-gray-900">
                                        {variant.style_name}
                                      </td>
                                      <td className="py-3 px-4 text-gray-600">${variant.price.toFixed(2)}</td>
                                      <td className="py-3 px-4">
                                        {variant.is_active ? (
                                          <span className="inline-flex items-center text-green-600 text-sm">
                                            <HiCheckCircle className="w-5 h-5 mr-1" />
                                            Active
                                          </span>
                                        ) : (
                                          <span className="inline-flex items-center text-gray-500 text-sm">
                                            <HiXCircle className="w-5 h-5 mr-1" />
                                            Inactive
                                          </span>
                                        )}
                                      </td>
                                      <td className="py-3 px-4 text-right">
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
            // Refresh items with current filters
            const filter: { category_id?: number; search?: string; include_inactive?: boolean } = {};
            if (selectedCategory) filter.category_id = selectedCategory;
            if (searchQuery) filter.search = searchQuery;
            if (showInactive) filter.include_inactive = true;
            
            const result = await itemService.getAll(
              filter,
              { page: currentPage, limit: itemsPerPage }
            );
            setItems(result.items);
          } else {
            // Create mode - category_id is guaranteed by modal validation
            await itemService.create(data as import('../../services/item').CreateItemDTO);
            // Refresh items with current filters
            const filter: { category_id?: number; search?: string; include_inactive?: boolean } = {};
            if (selectedCategory) filter.category_id = selectedCategory;
            if (searchQuery) filter.search = searchQuery;
            if (showInactive) filter.include_inactive = true;
            
            const result = await itemService.getAll(
              filter,
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
        variant={variantToEdit}
        isOpen={showVariantFormModal}
        onClose={() => {
          setShowVariantFormModal(false);
          setVariantToEdit(null);
          setVariantFormItemId(null);
        }}
        onSubmit={async (data) => {
          if (variantToEdit && variantFormItemId) {
            // Edit mode - update and close
            await itemService.updateVariant(variantFormItemId, variantToEdit.id, {
              style_name: data.style_name,
              price: data.price,
              image: data.image,
              remove_image: data.remove_image,
              is_active: data.is_active,
            });
            // Small delay to ensure backend has processed the update
            await new Promise(resolve => setTimeout(resolve, 100));
            // Refresh variants
            if (variantFormItemId) {
              await refreshVariants(variantFormItemId);
            }
            // Refresh items to update preview_image
            const filter: { category_id?: number; search?: string; include_inactive?: boolean } = {};
            if (selectedCategory) filter.category_id = selectedCategory;
            if (searchQuery) filter.search = searchQuery;
            if (showInactive) filter.include_inactive = true;
            const result = await itemService.getAll(
              filter,
              { page: currentPage, limit: itemsPerPage }
            );
            setItems(result.items);
          } else if (variantFormItemId) {
            // Create mode - create variant and stay open for add-ons
            const newVariant = await itemService.createVariant(variantFormItemId, {
              style_name: data.style_name,
              price: data.price,
              image: data.image,
            });
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

      <ImportModal
        isOpen={showImportModal}
        onClose={() => setShowImportModal(false)}
        onSuccess={() => {
          // Refresh items list after successful import
          const filter: { category_id?: number; search?: string; include_inactive?: boolean } = {};
          if (selectedCategory) filter.category_id = selectedCategory;
          if (searchQuery) filter.search = searchQuery;
          if (showInactive) filter.include_inactive = true;
          
          itemService.getAll(
            filter,
            { page: currentPage, limit: itemsPerPage }
          ).then(result => {
            setItems(result.items);
            setTotalPages(result.totalPages);
          });
        }}
      />

    </div>
  );
};

export default ItemManagement;
