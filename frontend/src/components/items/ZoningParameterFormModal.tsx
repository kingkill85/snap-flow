import { useEffect, useState } from 'react';
import { Plus, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ZoningParameter } from '@/services/item-type';
import { extractErrorMessage } from '@/utils';

export function ZoningParameterFormModal({ parameter, open, onClose, onSubmit }: {
  parameter: ZoningParameter | null; open: boolean; onClose: () => void; onSubmit: (data: { name: string }) => Promise<void>;
}) {
  const [name, setName] = useState(''); const [error, setError] = useState(''); const [saving, setSaving] = useState(false);
  useEffect(() => { setName(parameter?.name ?? ''); setError(''); }, [parameter, open]);
  const submit = async (event: React.FormEvent) => { event.preventDefault(); const trimmed = name.trim(); if (!trimmed) { setError('Name is required'); return; }
    setSaving(true); try { await onSubmit({ name: trimmed }); onClose(); } catch (cause) { setError(extractErrorMessage(cause) || 'Unable to save parameter'); } finally { setSaving(false); } };
  return <Dialog open={open} onOpenChange={(value) => !value && onClose()}><DialogContent><DialogHeader><DialogTitle>{parameter ? 'Edit Zoning Parameter' : 'Create Zoning Parameter'}</DialogTitle><DialogDescription>Configure a reusable non-negative integer value.</DialogDescription></DialogHeader>
    <form onSubmit={submit}><div className="space-y-2"><Label htmlFor="parameter-name">Name</Label><Input id="parameter-name" maxLength={100} value={name} onChange={(event) => setName(event.target.value)} autoFocus />{error && <p role="alert" className="text-sm text-destructive">{error}</p>}</div>
      <DialogFooter className="mt-6"><Button type="button" variant="outline" onClick={onClose}><X className="mr-2 h-4 w-4" />Cancel</Button><Button type="submit" disabled={saving}>{parameter ? <Save className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}{saving ? 'Saving...' : parameter ? 'Update' : 'Create'}</Button></DialogFooter></form>
  </DialogContent></Dialog>;
}
