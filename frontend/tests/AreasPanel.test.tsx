import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AreasPanel } from '../src/components/configurator/AreasPanel';
import type { Area } from '../src/services/area';

// Mock authService
vi.mock('../src/services/auth', () => ({
  authService: {
    getCurrentUser: vi.fn(),
    getAccessToken: vi.fn(),
    clearTokens: vi.fn(),
  },
}));

// Mock @dnd-kit/core — useDraggable is used inside AreasPanel's DraggableAreaBlock
vi.mock('@dnd-kit/core', () => ({
  useDraggable: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    isDragging: false,
  }),
  DndContext: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function makeArea(overrides: Partial<Area> = {}): Area {
  return {
    id: 1,
    floorplan_id: 10,
    x: 0,
    y: 0,
    width: 100,
    height: 100,
    name: 'Living Room',
    color: '#6366f1',
    opacity: 0.3,
    vertices: [],
    device_count: 3,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('AreasPanel', () => {
  const defaultProps = {
    areas: [] as Area[],
    selectedAreaId: null,
    hiddenAreaIds: new Set<number>(),
    onSelectArea: vi.fn(),
    onEditArea: vi.fn(),
    onDeleteArea: vi.fn(),
    onToggleAreaVisibility: vi.fn(),
    onToggleAllAreasVisibility: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the draggable area block', () => {
    render(<AreasPanel {...defaultProps} />);
    expect(screen.getByText('Area')).toBeInTheDocument();
    expect(screen.getByText('Drag onto canvas to define a room area')).toBeInTheDocument();
  });

  it('shows "No areas placed yet" when areas list is empty', () => {
    render(<AreasPanel {...defaultProps} areas={[]} />);
    expect(
      screen.getByText(/No areas placed yet/i)
    ).toBeInTheDocument();
  });

  it('renders area list with correct names and device counts', () => {
    const areas = [
      makeArea({ id: 1, name: 'Living Room', device_count: 3 }),
      makeArea({ id: 2, name: 'Kitchen', device_count: 0 }),
    ];
    render(<AreasPanel {...defaultProps} areas={areas} />);

    expect(screen.getByText('Living Room')).toBeInTheDocument();
    expect(screen.getByText('Kitchen')).toBeInTheDocument();
    // Device count badges — using getAllByText since "0" might appear in the count pill too
    expect(screen.getByText('3')).toBeInTheDocument();
    // Both areas rendered means areas.length badge (2) plus device counts
    const zeros = screen.getAllByText('0');
    expect(zeros.length).toBeGreaterThanOrEqual(1);
  });

  it('calls onDeleteArea when delete button is clicked', async () => {
    const onDeleteArea = vi.fn();
    const areas = [makeArea({ id: 42, name: 'Bedroom' })];
    render(
      <AreasPanel
        {...defaultProps}
        areas={areas}
        onDeleteArea={onDeleteArea}
      />
    );

    const deleteButton = screen.getByTitle('Delete area');
    await userEvent.click(deleteButton);

    expect(onDeleteArea).toHaveBeenCalledOnce();
    expect(onDeleteArea).toHaveBeenCalledWith(42);
  });

  it('calls onSelectArea when an area is clicked', async () => {
    const onSelectArea = vi.fn();
    const areas = [makeArea({ id: 7, name: 'Office' })];
    render(
      <AreasPanel
        {...defaultProps}
        areas={areas}
        onSelectArea={onSelectArea}
      />
    );

    const areaRow = screen.getByText('Office');
    await userEvent.click(areaRow);

    expect(onSelectArea).toHaveBeenCalledOnce();
    // First click on an unselected area passes its id
    expect(onSelectArea).toHaveBeenCalledWith(7);
  });
});
