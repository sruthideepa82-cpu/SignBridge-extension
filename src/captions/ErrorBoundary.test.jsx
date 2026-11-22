import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ErrorBoundary from './ErrorBoundary.jsx';

function Broken() {
  throw new Error('render failed');
}

describe('captions window error boundary', () => {
  it('keeps a visible fallback with a close action when rendering fails', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Captions window could not start')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent(/No audio or transcript was recorded/);
    expect(screen.getByRole('button', { name: 'Close window' })).toBeInTheDocument();
    errorSpy.mockRestore();
  });
});
