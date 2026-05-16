import { ConfigProvider } from 'antd';
import enUS from 'antd/locale/en_US';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from '@/components/AppShell/AppShell';

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
              <Route path="/" element={null} />
            </Routes>
          </AppShell>
        </BrowserRouter>
      </ConfigProvider>
    </QueryClientProvider>
  );
}
