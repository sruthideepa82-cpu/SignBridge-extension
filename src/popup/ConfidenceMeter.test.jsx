import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ConfidenceMeter from './ConfidenceMeter.jsx';

describe('ConfidenceMeter', () => {
  it('renders nothing when the backend reported no confidence', () => {
    const { container } = render(<ConfidenceMeter confidence={null} threshold={0.7} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('exposes the confidence as an accessible progress value', () => {
    render(<ConfidenceMeter confidence={0.88} threshold={0.7} />);
    const bar = screen.getByRole('progressbar', { name: 'Recognition confidence' });
    expect(bar).toHaveAttribute('aria-valuenow', '88');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
  });

  it('shows the threshold marker and marks values above it', () => {
    const { container } = render(<ConfidenceMeter confidence={0.88} threshold={0.7} />);
    expect(container.querySelector('.meter-marker')).toHaveStyle({ left: '70%' });
    expect(container.querySelector('.meter-fill')).toHaveAttribute('data-above', 'yes');
    expect(screen.getByText('Threshold 70%')).toBeInTheDocument();
  });

  it('marks values below the threshold without hiding the number', () => {
    const { container } = render(<ConfidenceMeter confidence={0.42} threshold={0.7} />);
    expect(container.querySelector('.meter-fill')).toHaveAttribute('data-above', 'no');
    expect(screen.getByText('42%')).toBeInTheDocument();
  });

  it('clamps out-of-range values so the bar never overflows', () => {
    render(<ConfidenceMeter confidence={1.7} threshold={-1} />);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
  });
});
