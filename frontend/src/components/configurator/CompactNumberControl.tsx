import { useEffect, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const MINIMUM = 0;
const MAXIMUM = 9999;
const INVALID_MESSAGE = 'Enter a whole number from 0 to 9999.';

interface CompactNumberControlProps {
  id: string;
  label: string;
  value: number;
  disabled?: boolean;
  onValueChange: (value: number) => void;
  onValidityChange?: (valid: boolean) => void;
}

function parseDraft(draft: string): number | null {
  if (draft === '') return 0;
  if (!/^\d+$/.test(draft)) return null;
  const value = Number(draft);
  return Number.isSafeInteger(value) && value >= MINIMUM && value <= MAXIMUM ? value : null;
}

const clamp = (value: number) => Math.min(MAXIMUM, Math.max(MINIMUM, value));

export function CompactNumberControl({
  id,
  label,
  value,
  disabled = false,
  onValueChange,
  onValidityChange,
}: CompactNumberControlProps) {
  const [draft, setDraft] = useState(String(clamp(value)));
  const [error, setError] = useState('');
  const lastValidValue = useRef(clamp(value));
  const lastEmittedValue = useRef<number | null>(null);
  const helpId = `${id}-help`;
  const errorId = `${id}-error`;

  useEffect(() => {
    const next = clamp(value);
    if (lastEmittedValue.current === next) {
      lastEmittedValue.current = null;
      return;
    }
    lastValidValue.current = next;
    setDraft(String(next));
    setError('');
  }, [value]);

  const accept = (next: number) => {
    const bounded = clamp(next);
    lastValidValue.current = bounded;
    setDraft(String(bounded));
    setError('');
    onValidityChange?.(true);
    lastEmittedValue.current = bounded;
    onValueChange(bounded);
  };

  const handleDraftChange = (nextDraft: string) => {
    setDraft(nextDraft);
    const parsed = parseDraft(nextDraft);
    if (parsed === null) {
      setError(INVALID_MESSAGE);
      onValidityChange?.(false);
      return;
    }
    lastValidValue.current = parsed;
    setError('');
    onValidityChange?.(true);
    lastEmittedValue.current = parsed;
    onValueChange(parsed);
  };

  const step = (delta: -1 | 1) => {
    const parsed = parseDraft(draft);
    accept((parsed ?? lastValidValue.current) + delta);
  };

  const current = parseDraft(draft);
  const describedBy = error ? `${helpId} ${errorId}` : helpId;

  return (
    <div data-testid="compact-number-row" className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 py-1.5">
      <div role="group" aria-label={`${label} value controls`} className="flex shrink-0 items-center">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-[34px] min-h-[34px] w-[34px] min-w-[34px] shrink-0 rounded-r-none"
          aria-label={`Decrease ${label}`}
          disabled={disabled || current === null || current <= MINIMUM}
          onClick={() => step(-1)}
        >
          <Minus aria-hidden="true" />
        </Button>
        <Input
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={draft}
          disabled={disabled}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className="h-[34px] min-h-[34px] w-[76px] min-w-[76px] max-w-[76px] basis-[76px] shrink-0 rounded-none border-x-0 px-2 text-center tabular-nums"
          onChange={(event) => handleDraftChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
            event.preventDefault();
            step(event.key === 'ArrowUp' ? 1 : -1);
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-[34px] min-h-[34px] w-[34px] min-w-[34px] shrink-0 rounded-l-none"
          aria-label={`Increase ${label}`}
          disabled={disabled || current === null || current >= MAXIMUM}
          onClick={() => step(1)}
        >
          <Plus aria-hidden="true" />
        </Button>
      </div>
      <Label htmlFor={id} className="min-w-0 whitespace-normal text-sm font-normal leading-tight" title={label}>
        {label}
      </Label>
      <span id={helpId} className="sr-only">Whole number from 0 to 9999. Use direct entry, Arrow keys, or the decrease and increase buttons.</span>
      {error ? <p id={errorId} className="col-span-2 text-xs text-destructive" role="alert">{error}</p> : null}
    </div>
  );
}
