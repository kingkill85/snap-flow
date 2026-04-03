import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ItemTypeBadge from '@/components/items/ItemTypeBadge';

describe('ItemTypeBadge', () => {
  it('renders abbreviation text', () => {
    render(<ItemTypeBadge abbreviation="ZB" color="#3b82f6" />);
    expect(screen.getByText('ZB')).toBeInTheDocument();
  });

  it('applies background color', () => {
    render(<ItemTypeBadge abbreviation="KNX" color="#f97316" />);
    const badge = screen.getByText('KNX');
    expect(badge).toHaveStyle({ backgroundColor: '#f97316' });
  });

  it('applies custom className', () => {
    render(<ItemTypeBadge abbreviation="BP" color="#22c55e" className="ml-2" />);
    const badge = screen.getByText('BP');
    expect(badge.className).toContain('ml-2');
  });
});
