import React, { useState, useEffect } from 'react';
import { itemService, type Item, type ItemVariant } from '@/services/item';
import { categoryService, type Category } from '@/services/category';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { ConfirmDeleteModal } from '@/components/common/ConfirmDeleteModal';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Plus,
  Search,
  Loader2,
  CheckCircle,
  XCircle,
  Image as ImageIcon,
  ChevronDown,
  ChevronRight,
  Upload,
  Pencil,
  Trash2,
} from 'lucide-react';

const ItemManagement = () => {
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showInactive, setShowInactive] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  const [itemVariants, setItemVariants] = useState<Record<number, ItemVariant[]>>({});
  const [loadingVariants, setLoadingVariants] = useState<Record<number, boolean>>({});
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<Item | null>(null);

  const itemsPerPage = 10;

  // Fetch categories
  useEffect(() => {
    const controller = new AbortController();
    
    const fetchCategories = async () => {
      try {
        const data = await categoryService.getAll(controller.signal, true);
        setCategories(data);
      } catch (err: any) {
        if (err.name !== 'AbortError' && err.name !== 'CanceledError') {
          console.error('Failed to fetch categories:', err);
        }
      }
    };
    
    fetchCategories();
    return () => controller.abort();
  }, []);

  // Fetch items
  useEffect(() => {
    const controller = new AbortController();
    
    const fetchItems = async () => {
      try {
        setIsLoading(true);
        setError('');
        
        const filter: { category_id?: number; search?: string; include_inactive?: boolean } = {};
        if (selectedCategory !== 'all') filter.category_id = parseInt(selectedCategory);
        if (searchQuery) filter.search = searchQuery;
        if (showInactive) filter.include_inactive = true;

        const result = await itemService.getAll(
          filter,
          { page: currentPage, limit: itemsPerPage },
          controller.signal
        );

        setItems(result.items);
        setTotalPages(result.totalPages);
      } catch (err: any) {
        if (err.name !== 'AbortError' && err.name !== 'CanceledError') {
          setError(err.response?.data?.error || 'Failed to fetch items');
        }
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchItems();
    return () => controller.abort();
  }, [selectedCategory, searchQuery, currentPage, showInactive]);

  const toggleItem = (itemId: number) => {
    setExpandedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
        if (!itemVariants[itemId]) {
          loadVariants(itemId);
        }
      }
      return newSet;
    });
  };

  const loadVariants = async (itemId: number) => {
    if (itemVariants[itemId]) return;

    setLoadingVariants(prev => ({ ...prev, [itemId]: true }));
    try {
      const variants = await itemService.getVariants(itemId, showInactive);
      setItemVariants(prev => ({ ...prev, [itemId]: variants }));
    } catch (err: any) {
      if (err.name !== 'AbortError' && err.name !== 'CanceledError') {
        setError(err.response?.data?.error || 'Failed to load variants');
      }
    } finally {
      setLoadingVariants(prev => ({ ...prev, [itemId]: false }));
    }
  };

  const handleDeleteItem = async () => {
    if (!itemToDelete) return;
    await itemService.delete(itemToDelete.id);
    
    // Refresh items
    const filter: { category_id?: number; search?: string; include_inactive?: boolean } = {};
    if (selectedCategory !== 'all') filter.category_id = parseInt(selectedCategory);
    if (searchQuery) filter.search = searchQuery;
    if (showInactive) filter.include_inactive = true;
    
    const result = await itemService.getAll(
      filter,
      { page: currentPage, limit: itemsPerPage }
    );
    setItems(result.items);
    setTotalPages(result.totalPages);
  };

  const openDeleteModal = (item: Item) => {
    setItemToDelete(item);
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
          <h1 className="text-3xl font-bold tracking-tight">Item Management</h1>
          <p className="text-muted-foreground">Manage products and their details</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled>
            <Upload className="mr-2 h-4 w-4" />
            Import Catalog
          </Button>
          <Button disabled>
            <Plus className="mr-2 h-4 w-4" />
            Add Item
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Search and Filter */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search items..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="w-48">
              <Select value={selectedCategory} onValueChange={(value) => {
                setSelectedCategory(value);
                setCurrentPage(1);
              }}>
                <SelectTrigger>
                  <SelectValue placeholder="All Categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id.toString()}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Items Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Items</CardTitle>
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
                <TableHead className="w-10"></TableHead>
                <TableHead className="w-16">Image</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Model</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-32"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    No items found. Create your first item to get started.
                  </TableCell>
                </TableRow>
              ) : (
                items.map((item) => {
                  const category = categories.find(c => c.id === item.category_id);
                  const variants = itemVariants[item.id] || [];
                  const isLoadingVar = loadingVariants[item.id];
                  const isExpanded = expandedItems.has(item.id);
                  
                  return (
                    <React.Fragment key={item.id}>
                      {/* Main Item Row */}
                      <TableRow className={!item.is_active ? 'opacity-60' : ''}>
                        <TableCell className="text-center">
                          <button 
                            onClick={() => toggleItem(item.id)}
                            className="p-1 hover:bg-muted rounded transition-colors"
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-5 h-5 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="w-5 h-5 text-muted-foreground" />
                            )}
                          </button>
                        </TableCell>
                        <TableCell>
                          {item.preview_image ? (
                            <img
                              src={itemService.getImageUrl(item.preview_image) || ''}
                              alt={item.name}
                              className="h-10 w-auto max-w-16 object-contain rounded border"
                            />
                          ) : (
                            <div className="h-10 w-10 bg-muted rounded border flex items-center justify-center text-muted-foreground">
                              <ImageIcon className="w-5 h-5" />
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{item.name}</TableCell>
                        <TableCell className="text-muted-foreground">{item.base_model_number || '-'}</TableCell>
                        <TableCell>{category?.name || 'Unknown'}</TableCell>
                        <TableCell>
                          {item.is_active ? (
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
                            <Button variant="outline" size="sm" disabled>
                              Edit
                            </Button>
                            <Button 
                              variant="destructive" 
                              size="sm"
                              onClick={() => openDeleteModal(item)}
                            >
                              Delete
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      
                      {/* Variants Subtable */}
                      {isExpanded && (
                        <TableRow>
                          <TableCell colSpan={7} className="p-0">
                            <div className="mx-4 mb-4 border rounded-lg bg-muted/30">
                              <div className="flex justify-between items-center px-4 py-3 border-b bg-muted rounded-t-lg">
                                <h4 className="text-sm font-semibold flex items-center">
                                  <Badge variant="secondary" className="mr-2">
                                    {variants.length}
                                  </Badge>
                                  Variants
                                </h4>
                                <Button size="sm" variant="outline" disabled>
                                  <Plus className="mr-1 h-3 w-3" /> Add Variant
                                </Button>
                              </div>
                              
                              {isLoadingVar ? (
                                <div className="text-center py-4">
                                  <Loader2 className="h-4 w-4 animate-spin inline mr-2" />
                                  <span className="text-sm text-muted-foreground">Loading variants...</span>
                                </div>
                              ) : variants.length === 0 ? (
                                <div className="text-center py-4 text-muted-foreground text-sm">
                                  No variants found.
                                </div>
                              ) : (
                                <table className="w-full">
                                  <thead>
                                    <tr className="border-b">
                                      <th className="text-left py-2 px-4 w-16 text-xs uppercase font-semibold">Image</th>
                                      <th className="text-left py-2 px-4 text-xs uppercase font-semibold">Style</th>
                                      <th className="text-left py-2 px-4 w-24 text-xs uppercase font-semibold">Price</th>
                                      <th className="text-left py-2 px-4 w-28 text-xs uppercase font-semibold">Status</th>
                                      <th className="text-right py-2 px-4 w-32 text-xs uppercase font-semibold">Actions</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {variants.map((variant) => (
                                      <tr key={variant.id} className={`border-b last:border-b-0 text-sm ${!variant.is_active ? 'opacity-60' : ''}`}>
                                        <td className="py-3 px-4">
                                          {variant.image_path ? (
                                            <img
                                              src={itemService.getImageUrl(variant.image_path) || ''}
                                              alt={variant.style_name}
                                              className="h-16 w-auto max-w-24 object-contain rounded border"
                                            />
                                          ) : (
                                            <div className="h-16 w-24 bg-background rounded border flex items-center justify-center text-muted-foreground">
                                              <ImageIcon className="w-6 h-6" />
                                            </div>
                                          )}
                                        </td>
                                        <td className="py-3 px-4 font-medium">{variant.style_name}</td>
                                        <td className="py-3 px-4 text-muted-foreground">${variant.price.toFixed(2)}</td>
                                        <td className="py-3 px-4">
                                          {variant.is_active ? (
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
                                        </td>
                                        <td className="py-3 px-4 text-right">
                                          <div className="flex gap-2 justify-end">
                                            <Button size="sm" variant="outline" disabled>
                                              <Pencil className="mr-1 h-3 w-3" />
                                              Edit
                                            </Button>
                                            <Button size="sm" variant="destructive" disabled>
                                              <Trash2 className="mr-1 h-3 w-3" />
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
                          </TableCell>
                        </TableRow>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
          
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center mt-4 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                Previous
              </Button>
              <span className="flex items-center px-4 text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

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
    </div>
  );
};

export default ItemManagement;
