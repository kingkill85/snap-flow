import { useState } from 'react';
import { Button, Modal, Alert, Spinner } from 'flowbite-react';
import { HiTrash } from 'react-icons/hi';

interface ConfirmDeleteModalProps {
  title: string;
  itemName: string;
  warningText?: string;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function ConfirmDeleteModal({
  title,
  itemName,
  warningText,
  isOpen,
  onClose,
  onConfirm,
}: ConfirmDeleteModalProps) {
  const [error, setError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    setError('');

    try {
      await onConfirm();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleClose = () => {
    setError('');
    onClose();
  };

  return (
    <Modal show={isOpen} onClose={handleClose} size="md">
      <Modal.Header>{title}</Modal.Header>
      <Modal.Body>
        {error && (
          <Alert color="failure" className="mb-4">
            {error}
          </Alert>
        )}
        <p className="text-gray-600 dark:text-gray-400">
          Are you sure you want to delete &quot;{itemName}&quot;? 
          This action cannot be undone.
        </p>
        {warningText && (
          <p className="text-sm text-red-600 mt-2">
            {warningText}
          </p>
        )}
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
              Delete
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
