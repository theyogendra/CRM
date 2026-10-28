import { useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Layout from './components/Layout';
import { api, auth, type AuthUser } from './lib/api';
import { SessionContext } from './lib/session';
import CustomerDetail from './pages/CustomerDetail';
import Customers from './pages/Customers';
import Dashboard from './pages/Dashboard';
import DocumentView from './pages/DocumentView';
import Invoices from './pages/Invoices';
import Login from './pages/Login';
import Payments from './pages/Payments';
import Products from './pages/Products';
import Proposals from './pages/Proposals';
import Quotations from './pages/Quotations';
import SettingsPage from './pages/Settings';
import WhatsApp from './pages/WhatsApp';

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checked, setChecked] = useState(!auth.token);

  useEffect(() => {
    if (!auth.token) return;
    api.get<{ user: AuthUser }>('/auth/me')
      .then((r) => setUser(r.user))
      .catch(() => auth.clear())
      .finally(() => setChecked(true));
  }, []);

  if (!checked) return null;

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<Login onLogin={setUser} />} />
      </Routes>
    );
  }

  return (
    <SessionContext.Provider value={user}>
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route element={<Layout user={user} />}>
        <Route index element={<Dashboard />} />
        <Route path="customers" element={<Customers />} />
        <Route path="customers/:id" element={<CustomerDetail />} />
        <Route path="proposals" element={<Proposals />} />
        <Route path="quotations" element={<Quotations />} />
        <Route path="quotations/:id" element={<DocumentView kind="quotation" />} />
        <Route path="invoices" element={<Invoices />} />
        <Route path="invoices/:id" element={<DocumentView kind="invoice" />} />
        <Route path="payments" element={<Payments />} />
        <Route path="products" element={<Products />} />
        <Route path="whatsapp" element={<WhatsApp />} />
        <Route
          path="settings"
          element={user.permissions.includes('settings:manage') ? <SettingsPage /> : <Navigate to="/" replace />}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
    </SessionContext.Provider>
  );
}
