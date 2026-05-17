import { ConfigProvider } from 'antd';
import enUS from 'antd/locale/en_US';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AppShell } from '@/components/AppShell/AppShell';
import { LanguagePage } from '@/pages/language/LanguagePage';
import { PeoplePage } from '@/pages/people/PeoplePage';
import { MusicPage } from '@/pages/music/MusicPage';

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
              <Route path="/language" element={<LanguagePage />} />
              <Route path="/people"   element={<PeoplePage />} />
              <Route path="/music"    element={<MusicPage />} />
            </Routes>
          </AppShell>
        </BrowserRouter>
      </ConfigProvider>
    </QueryClientProvider>
  );
}
