export interface PlacementDecorationState {
  isSelected: boolean;
  isDragging: boolean;
  isDuplicating: boolean;
  color?: string;
}

export function getPlacementDecorationStyle({
  isSelected,
  isDragging,
  isDuplicating,
  color = 'hsl(var(--primary))',
}: PlacementDecorationState): { boxShadow: string; outline: string } {
  const width = isSelected ? 3 : 2;
  const opacity = isDuplicating && isDragging ? 0.7 : 1;
  return {
    boxShadow: `inset 0 0 0 ${width}px color-mix(in srgb, ${color} ${opacity * 100}%, transparent)`,
    outline: 'none',
  };
}
