import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { IntlProvider } from 'react-intl';
import enUS from '@/locales/en-US';
import { EntityCursorFooter } from './EntityCursorFooter';

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter>
    <IntlProvider locale="en" messages={enUS}>
      {children}
    </IntlProvider>
  </MemoryRouter>
);

describe('EntityCursorFooter', () => {
  // C-01: Previous disabled when hasPrev=false
  it('disables Previous button when hasPrev is false', () => {
    render(
      <EntityCursorFooter hasNext hasPrev={false} onNext={vi.fn()} onPrev={vi.fn()} />,
      { wrapper },
    );
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();
  });

  // C-02: Next disabled when hasNext=false
  it('disables Next button when hasNext is false', () => {
    render(
      <EntityCursorFooter hasNext={false} hasPrev onNext={vi.fn()} onPrev={vi.fn()} />,
      { wrapper },
    );
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
  });

  // C-03: Both enabled when both flags are true
  it('enables both buttons when both directions are available', () => {
    render(
      <EntityCursorFooter hasNext hasPrev onNext={vi.fn()} onPrev={vi.fn()} />,
      { wrapper },
    );
    expect(screen.getByRole('button', { name: /previous/i })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: /next/i })).not.toBeDisabled();
  });

  // C-04: Both disabled when both flags are false
  it('disables both buttons when neither direction is available', () => {
    render(
      <EntityCursorFooter hasNext={false} hasPrev={false} onNext={vi.fn()} onPrev={vi.fn()} />,
      { wrapper },
    );
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
  });

  // C-05: onPrev fires on click
  it('calls onPrev when Previous is clicked', () => {
    const onPrev = vi.fn();
    render(
      <EntityCursorFooter hasNext={false} hasPrev onNext={vi.fn()} onPrev={onPrev} />,
      { wrapper },
    );
    fireEvent.click(screen.getByRole('button', { name: /previous/i }));
    expect(onPrev).toHaveBeenCalledTimes(1);
  });

  // C-06: onNext fires on click
  it('calls onNext when Next is clicked', () => {
    const onNext = vi.fn();
    render(
      <EntityCursorFooter hasNext hasPrev={false} onNext={onNext} onPrev={vi.fn()} />,
      { wrapper },
    );
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  // C-07: i18n labels rendered
  it('renders Previous and Next labels', () => {
    render(
      <EntityCursorFooter hasNext hasPrev onNext={vi.fn()} onPrev={vi.fn()} />,
      { wrapper },
    );
    expect(screen.getByRole('button', { name: /previous/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument();
  });
});
