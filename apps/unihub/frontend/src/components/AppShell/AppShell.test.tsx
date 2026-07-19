import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { IntlProvider } from 'react-intl';
import { MemoryRouter } from 'react-router-dom';
import enUS from '@/locales/en-US';
import * as authService from '@/services/unihub-backend/auth';

vi.mock('@/services/unihub-backend/auth');

// Capture Dropdown props to verify placement (US7)
const capturedDropdownProps: Record<string, unknown>[] = [];
vi.mock('antd', async () => {
  const actual = await vi.importActual<typeof import('antd')>('antd');
  return {
    ...actual,
    Dropdown: (props: Record<string, unknown>) => {
      capturedDropdownProps.push(props);
      const AntdDropdown = actual.Dropdown as React.ComponentType<Record<string, unknown>>;
      return <AntdDropdown {...props} />;
    },
  };
});

import React from 'react';
import { AppShell } from './AppShell';

function renderShell() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <IntlProvider locale="en-US" messages={enUS}>
        <MemoryRouter>
          <AppShell>
            <div data-testid="content">content</div>
          </AppShell>
        </MemoryRouter>
      </IntlProvider>
    </QueryClientProvider>,
  );
}

describe('AppShell', () => {
  beforeEach(() => {
    vi.mocked(authService.getMe).mockResolvedValue({ id: '1', username: 'testuser' } as never);
    capturedDropdownProps.length = 0;
  });

  afterEach(() => {
    document.body.style.overflowY = '';
  });

  describe('Scroll lock — US3 (CSS-driven via :has selector)', () => {
    it('AppShell renders without JS scroll-lock side effects', () => {
      // The scroll lock is handled entirely in index.css via:
      //   body:has(.ant-drawer-open.ant-drawer-inline) { overflow: hidden }
      // No JS state or effects involved — just verify the shell renders cleanly.
      const { container } = renderShell();
      expect(container.querySelector('[data-testid="content"]')).not.toBeNull();
      expect(document.body.style.overflow).toBe('');
    });
  });

  describe('User dropdown alignment — US7', () => {
    it('the user avatar Dropdown is rendered with placement="bottomRight"', () => {
      renderShell();
      const avatarDropdown = capturedDropdownProps.find((p) => p.placement !== undefined);
      expect(avatarDropdown?.placement).toBe('bottomRight');
    });
  });
});

describe('Nav hyperlinks — iteration 27 (FR-034)', () => {
  it('renders leaf menu entries as real anchors with hrefs', async () => {
    renderShell();
    // Wait for the menu to mount, then every pathed entry is an <a href>.
    const links = await screen.findAllByRole('link');
    const hrefs = links.map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(expect.arrayContaining(['/language', '/people', '/music']));
  });
});
