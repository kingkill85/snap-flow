/**
 * Calculate the final position after drag operation
 * Accounts for canvas zoom/scale factors
 */
export const calculateDragPosition = (
  initialX: number,
  initialY: number,
  deltaX: number,
  deltaY: number,
  scaleX: number,
  scaleY: number
): { x: number; y: number } => {
  return {
    x: initialX + deltaX / scaleX,
    y: initialY + deltaY / scaleY,
  };
};
