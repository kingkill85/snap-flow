import { Fragment, useState, useEffect } from 'react';
import { itemTypeService, type ItemType, type ZoningParameter } from '@/services/item-type';
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
import { ZoningParameterFormModal } from '@/components/items/ZoningParameterFormModal';
import ItemTypeBadge from '@/components/items/ItemTypeBadge';
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown, Loader2, ChevronDown, Power } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
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
  const [expanded, setExpanded] = useState<number | null>(null);
  const [parameters, setParameters] = useState<Record<number, ZoningParameter[]>>({});
  const [parameterModal, setParameterModal] = useState<{ itemType: ItemType; parameter: ZoningParameter | null } | null>(null);
  const [parameterToDelete, setParameterToDelete] = useState<{ itemType: ItemType; parameter: ZoningParameter } | null>(null);
  const [parameterError, setParameterError] = useState('');

  const reportParameterError = (err: unknown, fallback: string) => {
    const message = extractErrorMessage(err, '') || (err instanceof Error ? err.message : fallback);
    setParameterError(message.includes('in use') ? `${message}. Deactivate the parameter to preserve saved Area values.` : message);
    setError(message);
  };

  const loadParameters = async (itemType: ItemType) => {
    if (expanded === itemType.id) { setExpanded(null); return; }
    try { const loaded = await itemTypeService.getZoningParameters(itemType.id, true); setParameters((current) => ({ ...current, [itemType.id]: loaded })); setExpanded(itemType.id); }
    catch (err) { setError(extractErrorMessage(err) || 'Failed to load zoning parameters'); }
  };
  const refreshParameters = async (id: number) => { const loaded = await itemTypeService.getZoningParameters(id, true); setParameters((current) => ({ ...current, [id]: loaded })); };

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
                itemTypes.map((itemType, index) => (<Fragment key={itemType.id}>
                  <TableRow>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="icon" aria-label={`${expanded === itemType.id ? 'Collapse' : 'Expand'} ${itemType.name} zoning parameters`} onClick={() => loadParameters(itemType)}><ChevronDown className={`h-4 w-4 ${expanded === itemType.id ? 'rotate-180' : ''}`} /></Button>
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
                  {expanded === itemType.id && <TableRow><TableCell colSpan={4}><div className="ml-8 space-y-3" aria-label={`${itemType.name} zoning parameters`}>
                    <div className="flex justify-between"><h3 className="font-semibold">Zoning Parameters</h3>{isAdmin && <Button size="sm" onClick={() => setParameterModal({ itemType, parameter: null })}><Plus className="mr-1 h-4 w-4" />Create</Button>}</div>
                    {(parameters[itemType.id] ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No zoning parameters configured.</p> : (parameters[itemType.id] ?? []).map((parameter, parameterIndex, list) => <div key={parameter.id} className="flex flex-wrap items-center justify-between gap-2 rounded border p-2">
                      <span className={parameter.is_active ? '' : 'text-muted-foreground line-through'}>{parameter.name}</span>
                      {isAdmin && <div className="flex gap-2">
                        <Button variant="outline" size="sm" aria-label={`Move ${parameter.name} up`} disabled={parameterIndex === 0} onClick={async () => { try { const ids = list.map((row) => row.id); [ids[parameterIndex - 1], ids[parameterIndex]] = [ids[parameterIndex], ids[parameterIndex - 1]]; const reordered = await itemTypeService.reorderZoningParameters(itemType.id, ids); setParameters((current) => ({ ...current, [itemType.id]: reordered })); setParameterError(''); } catch (err) { reportParameterError(err, 'Failed to reorder zoning parameters'); } }}><ArrowUp className="h-4 w-4" /></Button>
                        <Button variant="outline" size="sm" aria-label={`Move ${parameter.name} down`} disabled={parameterIndex === list.length - 1} onClick={async () => { try { const ids = list.map((row) => row.id); [ids[parameterIndex + 1], ids[parameterIndex]] = [ids[parameterIndex], ids[parameterIndex + 1]]; const reordered = await itemTypeService.reorderZoningParameters(itemType.id, ids); setParameters((current) => ({ ...current, [itemType.id]: reordered })); setParameterError(''); } catch (err) { reportParameterError(err, 'Failed to reorder zoning parameters'); } }}><ArrowDown className="h-4 w-4" /></Button>
                        <Button variant="outline" size="sm" onClick={() => setParameterModal({ itemType, parameter })}><Pencil className="mr-1 h-4 w-4" />Edit</Button>
                        <Button variant="outline" size="sm" onClick={async () => { try { await itemTypeService.setZoningParameterActive(itemType.id, parameter.id, !parameter.is_active); await refreshParameters(itemType.id); setParameterError(''); } catch (err) { reportParameterError(err, `Failed to ${parameter.is_active ? 'deactivate' : 'activate'} zoning parameter`); } }}><Power className="mr-1 h-4 w-4" />{parameter.is_active ? 'Deactivate' : 'Activate'}</Button>
                        <Button variant="destructive" size="sm" onClick={() => setParameterToDelete({ itemType, parameter })}><Trash2 className="mr-1 h-4 w-4" />Delete</Button>
                      </div>}
                    </div>)}</div></TableCell></TableRow>}
                </Fragment>))
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
      <ZoningParameterFormModal parameter={parameterModal?.parameter ?? null} open={parameterModal !== null} onClose={() => setParameterModal(null)} onSubmit={async (data) => {
        if (!parameterModal) return; if (parameterModal.parameter) await itemTypeService.updateZoningParameter(parameterModal.itemType.id, parameterModal.parameter.id, data); else await itemTypeService.createZoningParameter(parameterModal.itemType.id, data); await refreshParameters(parameterModal.itemType.id);
      }} />
      <ConfirmDeleteModal title="Delete Zoning Parameter" itemName={parameterToDelete?.parameter.name ?? ''} warningText="Parameters with saved Area values cannot be deleted. Deactivate them instead." error={parameterError} isOpen={parameterToDelete !== null} onClose={() => { setParameterToDelete(null); setParameterError(''); }} onConfirm={async () => { if (!parameterToDelete) return; try { await itemTypeService.deleteZoningParameter(parameterToDelete.itemType.id, parameterToDelete.parameter.id); await refreshParameters(parameterToDelete.itemType.id); setParameterError(''); } catch (err) { reportParameterError(err, 'Failed to delete zoning parameter'); throw err; } }} />
    </div>
  );
};

export default ItemTypeManagement;
