import { useState } from 'react';
import { Button, Modal, Alert, Spinner } from 'flowbite-react';
import { HiTrash } from 'react-icons/hi';
import { itemService, type ItemVariant } from '../../services/item';

interface DeleteVariantModalProps {
  itemId: number;
  variant: ItemVariant | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function DeleteVariantModal({ itemId, variant, isOpen, onClose, onSuccess }: DeleteVariantModalProps) {
  const [error, setError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!variant) return;

    setIsDeleting(true);
    setError('');

    try {
      await itemService.deleteVariant(itemId, variant.id);
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete variant');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleClose = () => {
    setError('');
    onClose();
  };

  if (!variant) return null;

  return (
    <Modal show={isOpen} onClose={handleClose} size="md">
      <Modal.Header className="text-red-600">
        <div className="flex items-center gap-2">
          <HiTrash />
          Delete Variant
        </div>
      </Modal.Header>
      <Modal.Body>
        {error && (
          <Alert color="failure" className="mb-4">
            {error}
          </Alert>
        )}

        <div className="text-center">
          <p className="mb-4 text-gray-600">
            Are you sure you want to delete the variant <strong>"{variant.style_name}"</strong>?
          </p>
          <p className="text-sm text-gray-500">
            This action cannot be undone. The variant and its image will be permanently deleted.
          </p>
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button color="failure" onClick={handleDelete} disabled={isDeleting}>
          {isDeleting ? (
            <>
              <Spinner size="sm" className="mr-2" />
              Deleting...
            </>
          ) : (
            <>
              <HiTrash className="mr-2" />
              Delete Variant
            </>
          )}
        </Button>
        <Button color="gray" onClick={handleClose}>
          Cancel
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
