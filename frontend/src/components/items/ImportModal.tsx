import { useState, useRef, useCallback } from 'react';
import { Button, Modal, Alert, Spinner, Progress, Card } from 'flowbite-react';
import { HiUpload, HiCheckCircle, HiExclamationCircle, HiDocumentText } from 'react-icons/hi';
import { itemService } from '../../services/item';

interface SyncPhase {
  categories: {
    added: number;
    activated: number;
    deactivated: number;
    total: number;
  };
  items: {
    added: number;
    updated: number;
    deactivated: number;
    total: number;
  };
  variants: {
    added: number;
    updated: number;
    deactivated: number;
    imagesExtracted: number;
    total: number;
  };
  addons: {
    linked: number;
    notFound: number;
    total: number;
  };
}

interface SyncResult {
  success: boolean;
  phases: SyncPhase;
  log: string[];
  errors: Array<{
    row: number;
    message: string;
    details?: string;
  }>;
}

type ImportStep = 'upload' | 'syncing' | 'complete';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ImportModal({ isOpen, onClose, onSuccess }: ImportModalProps) {
  const [step, setStep] = useState<ImportStep>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      const validTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
      ];
      
      if (!validTypes.includes(file.type) && !file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
        setError('Please select a valid Excel file (.xlsx or .xls)');
        setSelectedFile(null);
        return;
      }
      
      // Validate file size (max 50MB)
      if (file.size > 50 * 1024 * 1024) {
        setError('File size must be less than 50MB');
        setSelectedFile(null);
        return;
      }

      setSelectedFile(file);
      setError(null);
    }
  };

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) {
      // Validate file type
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        setSelectedFile(file);
        setError(null);
      } else {
        setError('Please select a valid Excel file (.xlsx or .xls)');
      }
    }
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
  }, []);

  const handleStartSync = async () => {
    if (!selectedFile) return;

    setIsUploading(true);
    setStep('syncing');
    setError(null);
    setProgress(10);
    setStatusMessage('Uploading Excel file...');

    try {
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) return prev;
          return prev + Math.random() * 5;
        });
      }, 500);

      const response = await itemService.syncCatalog(selectedFile);
      
      clearInterval(progressInterval);
      setProgress(100);
      
      setResult(response);
      setStep('complete');
      
      if (response.success) {
        onSuccess();
      }
    } catch (err: any) {
      setStep('upload');
      setError(err.response?.data?.error || err.message || 'Failed to sync catalog');
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    setStep('upload');
    setSelectedFile(null);
    setError(null);
    setResult(null);
    setProgress(0);
    setStatusMessage('');
    onClose();
  };

  const handleImportAnother = () => {
    setStep('upload');
    setSelectedFile(null);
    setError(null);
    setResult(null);
    setProgress(0);
    setStatusMessage('');
  };

  const renderUploadStep = () => (
    <div className="space-y-4">
      {error && (
        <Alert color="failure" onDismiss={() => setError(null)}>
          {error}
        </Alert>
      )}

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer ${
          selectedFile
            ? 'border-green-500 bg-green-50'
            : 'border-gray-300 hover:border-blue-500 hover:bg-blue-50'
        }`}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileSelect}
          className="hidden"
          data-testid="file-input"
        />
        
        {selectedFile ? (
          <div className="space-y-2">
            <HiCheckCircle className="w-12 h-12 text-green-500 mx-auto" />
            <p className="text-lg font-medium text-gray-900">{selectedFile.name}</p>
            <p className="text-sm text-gray-500">
              {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
            </p>
            <p className="text-sm text-blue-600">Click to change file</p>
          </div>
        ) : (
          <div className="space-y-2">
            <HiUpload className="w-12 h-12 text-gray-400 mx-auto" />
            <p className="text-lg font-medium text-gray-900">
              Drop Excel file here or click to browse
            </p>
            <p className="text-sm text-gray-500">
              Supports .xlsx and .xls files up to 50MB
            </p>
          </div>
        )}
      </div>

      <div className="bg-blue-50 p-4 rounded-lg">
        <h4 className="font-medium text-blue-900 mb-2">What will happen:</h4>
        <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
          <li>Categories will be synced (new ones created, missing ones deactivated)</li>
          <li>Items will be updated or created based on model numbers</li>
          <li>Variants with images will be synced</li>
          <li>Items/variants not in Excel will be deactivated (not deleted)</li>
          <li>Excel is the source of truth - existing data will be overwritten</li>
        </ul>
      </div>
    </div>
  );

  const renderSyncingStep = () => (
    <div className="space-y-6 text-center">
      <div className="flex justify-center">
        <Spinner size="xl" />
      </div>
      
      <div>
        <h3 className="text-lg font-medium text-gray-900">Syncing Catalog...</h3>
        <p className="text-gray-500 mt-1">This may take a few minutes</p>
      </div>

      <div className="space-y-2">
        <Progress progress={progress} size="lg" color="blue" />
        <p className="text-sm text-gray-600">{statusMessage}</p>
      </div>

      <div className="bg-gray-50 p-4 rounded-lg text-left max-h-48 overflow-y-auto">
        <p className="text-xs text-gray-500 font-medium mb-2">Processing:</p>
        <div className="space-y-1 text-sm text-gray-600">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
            <span>Extracting data and images from Excel...</span>
          </div>
        </div>
      </div>
    </div>
  );

  const renderCompleteStep = () => {
    if (!result) return null;

    const hasErrors = result.errors.length > 0;
    const { phases } = result;

    return (
      <div className="space-y-6">
        {/* Summary Header */}
        <div className={`p-4 rounded-lg ${result.success ? 'bg-green-50' : 'bg-yellow-50'}`}>
          <div className="flex items-center gap-3">
            {result.success ? (
              <HiCheckCircle className="w-8 h-8 text-green-600" />
            ) : (
              <HiExclamationCircle className="w-8 h-8 text-yellow-600" />
            )}
            <div>
              <h3 className={`font-medium ${result.success ? 'text-green-900' : 'text-yellow-900'}`}>
                {result.success ? 'Sync Completed Successfully!' : 'Sync Completed with Warnings'}
              </h3>
              <p className={`text-sm ${result.success ? 'text-green-700' : 'text-yellow-700'}`}>
                {result.errors.length} error{result.errors.length !== 1 ? 's' : ''} occurred
              </p>
            </div>
          </div>
        </div>

        {/* Results Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <h4 className="font-medium text-gray-900 mb-3">Categories</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-green-600">Added:</span>
                <span className="font-medium">{phases.categories.added}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-blue-600">Activated:</span>
                <span className="font-medium">{phases.categories.activated}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-red-600">Deactivated:</span>
                <span className="font-medium">{phases.categories.deactivated}</span>
              </div>
              <div className="border-t pt-2 flex justify-between font-medium">
                <span>Total:</span>
                <span>{phases.categories.total}</span>
              </div>
            </div>
          </Card>

          <Card>
            <h4 className="font-medium text-gray-900 mb-3">Base Items</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-green-600">Added:</span>
                <span className="font-medium">{phases.items.added}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-blue-600">Updated:</span>
                <span className="font-medium">{phases.items.updated}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-red-600">Deactivated:</span>
                <span className="font-medium">{phases.items.deactivated}</span>
              </div>
              <div className="border-t pt-2 flex justify-between font-medium">
                <span>Total:</span>
                <span>{phases.items.total}</span>
              </div>
            </div>
          </Card>

          <Card>
            <h4 className="font-medium text-gray-900 mb-3">Variants</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-green-600">Added:</span>
                <span className="font-medium">{phases.variants.added}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-blue-600">Updated:</span>
                <span className="font-medium">{phases.variants.updated}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-purple-600">Images:</span>
                <span className="font-medium">{phases.variants.imagesExtracted}</span>
              </div>
              <div className="border-t pt-2 flex justify-between font-medium">
                <span>Total:</span>
                <span>{phases.variants.total}</span>
              </div>
            </div>
          </Card>

          <Card>
            <h4 className="font-medium text-gray-900 mb-3">Variant Addons</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-blue-600">References:</span>
                <span className="font-medium">{phases.addons.total}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-green-600">Resolved:</span>
                <span className="font-medium">{phases.addons.total - phases.addons.notFound}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-purple-600">Links Created:</span>
                <span className="font-medium">{phases.addons.linked}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-yellow-600">Not Found:</span>
                <span className="font-medium">{phases.addons.notFound}</span>
              </div>
            </div>
          </Card>
        </div>

        {/* Error Log */}
        {hasErrors && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <h4 className="font-medium text-red-900 mb-3 flex items-center gap-2">
              <HiExclamationCircle />
              Errors ({result.errors.length})
            </h4>
            <div className="max-h-40 overflow-y-auto space-y-2">
              {result.errors.map((err, idx) => (
                <div key={idx} className="text-sm text-red-800 bg-red-100 p-2 rounded">
                  <div className="font-medium">
                    {err.row > 0 ? `Row ${err.row}:` : 'General:'} {err.message}
                  </div>
                  {err.details && (
                    <div className="text-red-600 mt-1 text-xs">{err.details}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Log */}
        {result.log.length > 0 && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h4 className="font-medium text-gray-900 mb-3 flex items-center gap-2">
              <HiDocumentText />
              Action Log ({result.log.length} entries)
            </h4>
            <div className="max-h-32 overflow-y-auto space-y-1 text-sm text-gray-600">
              {result.log.slice(-20).map((log, idx) => (
                <div key={idx} className="font-mono text-xs">{log}</div>
              ))}
              {result.log.length > 20 && (
                <div className="text-gray-400 text-xs italic">
                  ... and {result.log.length - 20} more entries
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <Modal show={isOpen} onClose={handleClose} size={step === 'complete' ? '4xl' : 'lg'}>
      <Modal.Header>
        {step === 'upload' && 'Import Catalog from Excel'}
        {step === 'syncing' && 'Syncing Catalog...'}
        {step === 'complete' && 'Import Complete'}
      </Modal.Header>
      
      <Modal.Body>
        {step === 'upload' && renderUploadStep()}
        {step === 'syncing' && renderSyncingStep()}
        {step === 'complete' && renderCompleteStep()}
      </Modal.Body>

      <Modal.Footer>
        {step === 'upload' && (
          <>
            <Button
              onClick={handleStartSync}
              disabled={!selectedFile || isUploading}
            >
              {isUploading ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Uploading...
                </>
              ) : (
                'Start Import'
              )}
            </Button>
            <Button color="gray" onClick={handleClose}>
              Cancel
            </Button>
          </>
        )}

        {step === 'syncing' && (
          <Button color="gray" disabled>
            Processing...
          </Button>
        )}

        {step === 'complete' && (
          <>
            <Button onClick={handleImportAnother} color="light">
              Import Another
            </Button>
            <Button onClick={handleClose}>
              Close
            </Button>
          </>
        )}
      </Modal.Footer>
    </Modal>
  );
}
