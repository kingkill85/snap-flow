import { useState, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import { Upload, Loader2, CheckCircle, AlertCircle, FileSpreadsheet, FileText, X, Check } from 'lucide-react';
import { itemService } from '@/services/item';
import { extractErrorMessage } from '@/utils';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

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

export function ImportModal({ isOpen, onClose, onSuccess }: ImportModalProps) {
  const [step, setStep] = useState<ImportStep>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SyncResult | null>(null);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const validTypes = [
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
      ];
      
      if (!validTypes.includes(file.type) && !file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
        setError('Please select a valid Excel file (.xlsx or .xls)');
        setSelectedFile(null);
        return;
      }
      
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

    try {
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 90) return prev;
          return prev + Math.random() * 5;
        });
      }, 500);

      const response = await itemService.syncCatalog(selectedFile) as SyncResult;
      
      clearInterval(progressInterval);
      setProgress(100);
      
      setResult(response);
      setStep('complete');
      // Note: onSuccess is NOT called here - it's called when user clicks "Done"
      // This ensures the summary is visible before modal closes
    } catch (err: unknown) {
      setStep('upload');
      setError(extractErrorMessage(err, 'Failed to sync catalog'));
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = (shouldTriggerSuccess = false) => {
    if (shouldTriggerSuccess && result?.success) {
      onSuccess();
    }
    setStep('upload');
    setSelectedFile(null);
    setError(null);
    setResult(null);
    setProgress(0);
    onClose();
  };

  const handleImportAnother = () => {
    setStep('upload');
    setSelectedFile(null);
    setError(null);
    setResult(null);
    setProgress(0);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-[800px] lg:max-w-[900px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Catalog</DialogTitle>
          <DialogDescription>
            Upload an Excel file to import items into the catalog.
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                selectedFile
                  ? 'border-green-500 bg-green-50 dark:bg-green-950/20'
                  : 'border-muted-foreground/25 hover:border-primary hover:bg-primary/5'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileSelect}
                className="hidden"
              />
              
              {selectedFile ? (
                <div className="space-y-2">
                  <CheckCircle className="w-12 h-12 text-green-600 mx-auto" />
                  <p className="text-lg font-medium">{selectedFile.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFile(null);
                    }}
                    className="text-sm text-primary hover:underline"
                  >
                    Click to change file
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Upload className="w-12 h-12 text-muted-foreground mx-auto" />
                  <p className="text-lg font-medium">
                    Drop Excel file here or click to browse
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Supports .xlsx and .xls files up to 50MB
                  </p>
                </div>
              )}
            </div>

            <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-4 rounded-lg">
              <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">What will happen:</h4>
              <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-disc list-inside">
                <li>Categories will be synced (new ones created, missing ones deactivated)</li>
                <li>Items will be updated or created based on model numbers</li>
                <li>Styles with images will be synced</li>
                <li>Items/styles not in Excel will be deactivated (not deleted)</li>
                <li>Excel is the source of truth - existing data will be overwritten</li>
              </ul>
            </div>
          </div>
        )}

        {step === 'syncing' && (
          <div className="space-y-6 text-center py-4">
            <div className="flex justify-center">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
            
            <div>
              <h3 className="text-lg font-medium">Syncing Catalog...</h3>
              <p className="text-muted-foreground mt-1">This may take a few minutes</p>
            </div>

            <div className="space-y-2">
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-sm text-muted-foreground">{Math.round(progress)}%</p>
            </div>
          </div>
        )}

        {step === 'complete' && result && (
          <div className="space-y-6">
            <div className={`p-4 rounded-lg ${result.success ? 'bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800' : 'bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800'}`}>
              <div className="flex items-center gap-3">
                {result.success ? (
                  <CheckCircle className="w-8 h-8 text-green-600" />
                ) : (
                  <AlertCircle className="w-8 h-8 text-yellow-600" />
                )}
                <div>
                  <h3 className={`font-medium text-lg ${result.success ? 'text-green-900 dark:text-green-100' : 'text-yellow-900 dark:text-yellow-100'}`}>
                    {result.success ? 'Sync Completed Successfully!' : 'Sync Completed with Warnings'}
                  </h3>
                  <p className={`text-sm ${result.success ? 'text-green-700 dark:text-green-300' : 'text-yellow-700 dark:text-yellow-300'}`}>
                    {result.errors.length} error{result.errors.length !== 1 ? 's' : ''} occurred
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Card className="border">
                <CardContent className="p-4">
                  <h4 className="font-semibold mb-3">Categories</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-green-600">Added:</span>
                      <span className="font-bold">{result.phases.categories.added}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-blue-600">Activated:</span>
                      <span className="font-bold">{result.phases.categories.activated}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-red-600">Deactivated:</span>
                      <span className="font-bold">{result.phases.categories.deactivated}</span>
                    </div>
                    <div className="border-t pt-2 flex justify-between font-semibold">
                      <span>Total:</span>
                      <span>{result.phases.categories.total}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border">
                <CardContent className="p-4">
                  <h4 className="font-semibold mb-3">Base Items</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-green-600">Added:</span>
                      <span className="font-bold">{result.phases.items.added}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-blue-600">Updated:</span>
                      <span className="font-bold">{result.phases.items.updated}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-red-600">Deactivated:</span>
                      <span className="font-bold">{result.phases.items.deactivated}</span>
                    </div>
                    <div className="border-t pt-2 flex justify-between font-semibold">
                      <span>Total:</span>
                      <span>{result.phases.items.total}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border">
                <CardContent className="p-4">
                  <h4 className="font-semibold mb-3">Styles</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-green-600">Added:</span>
                      <span className="font-bold">{result.phases.variants.added}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-blue-600">Updated:</span>
                      <span className="font-bold">{result.phases.variants.updated}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-purple-600">Images:</span>
                      <span className="font-bold">{result.phases.variants.imagesExtracted}</span>
                    </div>
                    <div className="border-t pt-2 flex justify-between font-semibold">
                      <span>Total:</span>
                      <span>{result.phases.variants.total}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="border">
                <CardContent className="p-4">
                  <h4 className="font-semibold mb-3">Addons</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-blue-600">References:</span>
                      <span className="font-bold">{result.phases.addons.total}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-green-600">Resolved:</span>
                      <span className="font-bold">{result.phases.addons.linked}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-purple-600">Links:</span>
                      <span className="font-bold">{result.phases.addons.linked}</span>
                    </div>
                    <div className="border-t pt-2 flex justify-between font-semibold">
                      <span className="text-amber-600">Not Found:</span>
                      <span className="text-amber-600">{result.phases.addons.notFound}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {result.log && result.log.length > 0 && (
              <div className="bg-muted/50 border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="h-5 w-5 text-muted-foreground" />
                  <h4 className="font-semibold">Action Log ({result.log.length} entries)</h4>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1 text-sm font-mono">
                  {result.log.slice(0, 100).map((entry, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-muted-foreground">
                      <span className="text-green-600 mt-0.5">✓</span>
                      <span className="break-all">{entry}</span>
                    </div>
                  ))}
                  {result.log.length > 100 && (
                    <div className="text-muted-foreground italic">
                      ... and {result.log.length - 100} more entries
                    </div>
                  )}
                </div>
              </div>
            )}

            {result.errors.length > 0 && (
              <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 p-4 rounded-lg">
                <h4 className="font-semibold text-red-900 dark:text-red-100 mb-2">Errors:</h4>
                <ul className="text-sm text-red-800 dark:text-red-200 space-y-1 max-h-32 overflow-y-auto">
                  {result.errors.map((err, idx) => (
                    <li key={idx}>Row {err.row}: {err.message}{err.details ? ` — ${err.details}` : ''}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {step === 'upload' && (
            <>
              <Button variant="outline" onClick={() => handleClose(false)}>
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
              <Button
                onClick={handleStartSync}
                disabled={!selectedFile || isUploading}
              >
                {isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <FileSpreadsheet className="mr-2 h-4 w-4" />
                    Import Catalog
                  </>
                )}
              </Button>
            </>
          )}
          
          {step === 'complete' && (
            <>
              <Button variant="outline" onClick={handleImportAnother}>
                <Upload className="mr-2 h-4 w-4" />
                Import Another
              </Button>
              <Button onClick={() => handleClose(true)}>
                <Check className="mr-2 h-4 w-4" />
                Done
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
