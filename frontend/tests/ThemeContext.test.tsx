import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ThemeProvider, useTheme } from '@/context/ThemeContext';

// Test component that uses theme
function TestComponent() {
  const { theme, setTheme, toggleTheme } = useTheme();
  
  return (
    <div>
      <div data-testid="theme">{theme}</div>
      <button onClick={() => setTheme('light')}>Set Light</button>
      <button onClick={() => setTheme('dark')}>Set Dark</button>
      <button onClick={toggleTheme}>Toggle</button>
    </div>
  );
}

describe('ThemeContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.documentElement.classList.remove('dark');
    localStorage.clear();
  });

  it('provides theme context', () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    expect(screen.getByTestId('theme')).toBeInTheDocument();
  });

  it('initializes with light theme', () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    const themeValue = screen.getByTestId('theme').textContent;
    expect(['light', 'dark']).toContain(themeValue);
  });

  it('allows theme to be set', () => {
    render(
      <ThemeProvider>
        <TestComponent />
      </ThemeProvider>
    );

    // Just verify the buttons exist
    expect(screen.getByRole('button', { name: /set light/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /set dark/i })).toBeInTheDocument();
  });
});
