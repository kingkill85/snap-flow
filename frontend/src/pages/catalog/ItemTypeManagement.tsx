import { useState, useEffect } from 'react';
import { itemTypeService, type ItemType } from '@/services/item-type';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ItemTypeFormModal } from '@/components/items/ItemTypeFormModal';
import { ConfirmDeleteModal } from '@/components/common/ConfirmDeleteModal';
import ItemTypeBadge from '@/components/items/ItemTypeBadge';
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { extractErrorMessage } from '@/utils';
import type { CreateItemTypeDTO, UpdateItemTypeDTO } from '@/services/item-type';

const ItemTypeManagement = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [itemTypes, setItemTypes] = useState<ItemType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [showFormModal, setShowFormModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemTypeToEdit, setItemTypeToEdit] = useState<ItemType | null>(null);
  const [itemTypeToDelete, setItemTypeToDelete] = useState<ItemType | null>(null);

  const fetchItemTypes = async (signal?: AbortSignal) => {
    try {
      setIsLoading(true);
      const data = await itemTypeService.getAll(signal);
      setItemTypes(data);
      setError('');
    } catch (err: unknown) {
      const errorMessage = extractErrorMessage(err, '');
      if (errorMessage !== 'AbortError') {
        setError(extractErrorMessage(err) || 'Failed to fetch product types');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    fetchItemTypes(controller.signal);
    return () => controller.abort();
  }, []);

  const handleCreate = async (data: CreateItemTypeDTO | UpdateItemTypeDTO) => {
    await itemTypeService.create(data as CreateItemTypeDTO);
    fetchItemTypes();
  };

  const handleUpdate = async (data: CreateItemTypeDTO | UpdateItemTypeDTO) => {
    if (!itemTypeToEdit) return;
    await itemTypeService.update(itemTypeToEdit.id, data as UpdateItemTypeDTO);
    fetchItemTypes();
  };

  const handleDelete = async () => {
    if (!itemTypeToDelete) return;
    await itemTypeService.delete(itemTypeToDelete.id);
    fetchItemTypes();
  };

  const moveItemType = async (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === itemTypes.length - 1) return;

    const newItemTypes = [...itemTypes];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newItemTypes[index], newItemTypes[targetIndex]] = [newItemTypes[targetIndex], newItemTypes[index]];

    try {
      const updated = await itemTypeService.reorder(newItemTypes.map((t) => t.id));
      setItemTypes(updated);
    } catch (err: unknown) {
      setError(extractErrorMessage(err) || 'Failed to reorder product types');
    }
  };

  const openEditModal = (itemType: ItemType) => {
    setItemTypeToEdit(itemType);
    setShowFormModal(true);
  };

  const openDeleteModal = (itemType: ItemType) => {
    setItemTypeToDelete(itemType);
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
          <h1 className="text-3xl font-bold tracking-tight">Product Type Management</h1>
          <p className="text-muted-foreground">Manage product types and arrange their display order</p>
        </div>
        {isAdmin && (
          <Button onClick={() => { setItemTypeToEdit(null); setShowFormModal(true); }}>
            <Plus className="mr-2 h-4 w-4" />
            Add Type
          </Button>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Abbreviation</TableHead>
                {isAdmin && <TableHead className="w-48"></TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {itemTypes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={isAdmin ? 4 : 3} className="text-center py-8 text-muted-foreground">
                    No product types found. Create your first product type to get started.
                  </TableCell>
                </TableRow>
              ) : (
                itemTypes.map((itemType, index) => (
                  <TableRow key={itemType.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground w-6">{itemType.sort_order}</span>
                        {isAdmin && (
                          <div className="flex flex-col">
                            <Button variant="ghost" size="icon" className="h-6 w-6"
                              onClick={() => moveItemType(index, 'up')} disabled={index === 0}>
                              <ArrowUp className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6"
                              onClick={() => moveItemType(index, 'down')} disabled={index === itemTypes.length - 1}>
                              <ArrowDown className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full inline-block flex-shrink-0"
                          style={{ backgroundColor: itemType.color }} />
                        <span className="font-medium">{itemType.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <ItemTypeBadge abbreviation={itemType.abbreviation} color={itemType.color} />
                    </TableCell>
                    {isAdmin && (
                      <TableCell>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => openEditModal(itemType)}>
                            <Pencil className="mr-1 h-3 w-3" /> Edit
                          </Button>
                          <Button variant="destructive" size="sm" onClick={() => openDeleteModal(itemType)}>
                            <Trash2 className="mr-1 h-3 w-3" /> Delete
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ItemTypeFormModal
        itemType={itemTypeToEdit}
        open={showFormModal}
        onClose={() => { setShowFormModal(false); setItemTypeToEdit(null); }}
        onSubmit={itemTypeToEdit ? handleUpdate : handleCreate}
      />

      <ConfirmDeleteModal
        title="Delete Product Type"
        itemName={itemTypeToDelete?.name || ''}
        warningText="Note: You cannot delete a product type that has items assigned to it."
        isOpen={showDeleteModal}
        onClose={() => { setShowDeleteModal(false); setItemTypeToDelete(null); }}
        onConfirm={handleDelete}
      />
    </div>
  );
};

export default ItemTypeManagement;
