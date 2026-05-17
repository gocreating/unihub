import { ConfigProvider, Spin } from 'antd';
import enUS from 'antd/locale/en_US';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AppShell } from '@/components/AppShell/AppShell';
import { LoginPage } from '@/pages/auth/login';
import { DashboardPage } from '@/pages/dashboard/index';
import { AccountsPage } from '@/pages/finance/accounts/index';
import { BalanceSheetsPage } from '@/pages/finance/balance-sheets/index';
import { BalanceSheetDetailPage } from '@/pages/finance/balance-sheets/detail';
import { ExchangeRatesPage } from '@/pages/finance/exchange-rates/index';
import { LanguagePage } from '@/pages/language/LanguagePage';
import { PeoplePage } from '@/pages/people/PeoplePage';
import { MusicPage } from '@/pages/music/MusicPage';
import { getMe } from '@/services/unihub-backend/auth';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function AuthGuard({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { data: user, isLoading, isError } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: getMe,
    retry: false,
  });

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (isError || !user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <AuthGuard>
            <AppShell>
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/finance/accounts" element={<AccountsPage />} />
                <Route path="/finance/balance-sheets" element={<BalanceSheetsPage />} />
                <Route path="/finance/balance-sheets/:id" element={<BalanceSheetDetailPage />} />
                <Route path="/finance/exchange-rates" element={<ExchangeRatesPage />} />
                <Route path="/language" element={<LanguagePage />} />
                <Route path="/people" element={<PeoplePage />} />
                <Route path="/music" element={<MusicPage />} />
              </Routes>
            </AppShell>
          </AuthGuard>
        }
      />
    </Routes>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ConfigProvider locale={enUS}>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </ConfigProvider>
    </QueryClientProvider>
  );
}
