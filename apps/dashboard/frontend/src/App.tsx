import { ConfigProvider } from 'antd';
import enUS from 'antd/locale/en_US';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from '@/components/AppShell/AppShell';
import { OverviewPage } from '@/components/OverviewPage/OverviewPage';
import { PortfolioPage } from '@/components/PortfolioPage/PortfolioPage';
import { AssetsPage } from '@/components/AssetsPage/AssetsPage';
import { CashFlowPage } from '@/components/CashFlowPage/CashFlowPage';
import { BalanceSheetPage } from '@/components/BalanceSheetPage/BalanceSheetPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider locale={enUS}>
        <BrowserRouter>
          <AppShell>
            <Routes>
              <Route path="/" element={<OverviewPage />} />
              <Route path="/portfolio" element={<PortfolioPage />} />
              <Route path="/assets" element={<AssetsPage />} />
              <Route path="/cash-flow" element={<CashFlowPage />} />
              <Route path="/balance-sheet" element={<BalanceSheetPage />} />
            </Routes>
          </AppShell>
        </BrowserRouter>
      </ConfigProvider>
    </QueryClientProvider>
  );
}
