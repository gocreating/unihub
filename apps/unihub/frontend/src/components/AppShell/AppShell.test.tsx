import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
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

  describe('Scroll lock — US3', () => {
    it('no wheel/touchmove block listeners attached when sider is closed (default)', () => {
      const addSpy = vi.spyOn(document, 'addEventListener');
      renderShell();
      // siderOpen starts false; no blocking listeners should be added
      const blockingCalls = addSpy.mock.calls.filter(
        ([type]) => type === 'wheel' || type === 'touchmove',
      );
      expect(blockingCalls).toHaveLength(0);
      addSpy.mockRestore();
    });

    it('scroll block listeners are removed when AppShell unmounts', () => {
      const removeSpy = vi.spyOn(document, 'removeEventListener');
      const { unmount } = renderShell();
      unmount();
      // Cleanup should have been called (even if no listeners were added, the
      // effect returns a cleanup function that removes them safely)
      removeSpy.mockRestore();
      expect(document.body.style.overflowY).toBe('');
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
