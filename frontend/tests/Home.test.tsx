import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import Home from '@/pages/Home';

describe('Home', () => {
  it('renders welcome message', () => {
    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    );

    expect(screen.getByAltText('SnapFlow')).toBeInTheDocument();
    expect(screen.getByText('Smart home automation configurator and proposal generator')).toBeInTheDocument();
  });

  it('renders get started button', () => {
    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    );

    const getStartedButton = screen.getByRole('link', { name: /get started/i });
    expect(getStartedButton).toBeInTheDocument();
    expect(getStartedButton).toHaveAttribute('href', '/projects');
  });

  it('renders view projects button', () => {
    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    );

    const viewProjectsButton = screen.getByRole('link', { name: /view projects/i });
    expect(viewProjectsButton).toBeInTheDocument();
    expect(viewProjectsButton).toHaveAttribute('href', '/projects');
  });

  it('renders feature cards', () => {
    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    );

    expect(screen.getByText('Upload Floorplans')).toBeInTheDocument();
    expect(screen.getByText('Drag & Drop Items')).toBeInTheDocument();
    expect(screen.getByText('Generate Proposals')).toBeInTheDocument();
  });

  it('renders feature descriptions', () => {
    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    );

    expect(screen.getByText(/import floorplan images/i)).toBeInTheDocument();
    expect(screen.getByText(/place smart home devices/i)).toBeInTheDocument();
    expect(screen.getByText(/export professional excel proposals/i)).toBeInTheDocument();
  });
});
