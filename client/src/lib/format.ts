export const inr = (n: number, digits = 2) =>
  `₹${(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;

export const num2 = (n: number) => (n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Splits ₹ amounts into a value and a compact suffix (K / L / Cr) for the big KPI numbers. */
export function compact(n: number): { value: string; suffix: string } {
  const a = Math.abs(n);
  if (a >= 1e7) return { value: `₹${(n / 1e7).toFixed(2)}`, suffix: 'Cr' };
  if (a >= 1e5) return { value: `₹${(n / 1e5).toFixed(2)}`, suffix: 'L' };
  if (a >= 1e3) return { value: `₹${(n / 1e3).toFixed(1)}`, suffix: 'K' };
  return { value: `₹${Math.round(n)}`, suffix: '' };
}

export const shortInr = (n: number) => {
  const c = compact(n);
  return `${c.value}${c.suffix}`;
};

export const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';

export const fmtDateTime = (d?: string | null) =>
  d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

export const toInputDate = (d?: string | null) => (d ? new Date(d).toISOString().slice(0, 10) : '');

export const timeAgo = (d: string) => {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return fmtDate(d);
};

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');

export const STATUS_COLOR: Record<string, string> = {
  PAID: 'green', ACCEPTED: 'green', ACTIVE: 'green', CONVERTED: 'violet', SENT: 'blue', LINK: 'violet',
  UNPAID: 'amber', PARTIAL: 'amber', LEAD: 'amber', DRAFT: '', EXPIRED: '', INACTIVE: '', CANCELLED: '',
  OVERDUE: 'red', REJECTED: 'red', FAILED: 'red',
};

export const INDIAN_STATES: [string, string][] = [
  ['01', 'Jammu and Kashmir'], ['02', 'Himachal Pradesh'], ['03', 'Punjab'], ['04', 'Chandigarh'], ['05', 'Uttarakhand'],
  ['06', 'Haryana'], ['07', 'Delhi'], ['08', 'Rajasthan'], ['09', 'Uttar Pradesh'], ['10', 'Bihar'], ['11', 'Sikkim'],
  ['12', 'Arunachal Pradesh'], ['13', 'Nagaland'], ['14', 'Manipur'], ['15', 'Mizoram'], ['16', 'Tripura'],
  ['17', 'Meghalaya'], ['18', 'Assam'], ['19', 'West Bengal'], ['20', 'Jharkhand'], ['21', 'Odisha'],
  ['22', 'Chhattisgarh'], ['23', 'Madhya Pradesh'], ['24', 'Gujarat'], ['26', 'Dadra and Nagar Haveli and Daman and Diu'],
  ['27', 'Maharashtra'], ['29', 'Karnataka'], ['30', 'Goa'], ['31', 'Lakshadweep'], ['32', 'Kerala'],
  ['33', 'Tamil Nadu'], ['34', 'Puducherry'], ['35', 'Andaman and Nicobar Islands'], ['36', 'Telangana'],
  ['37', 'Andhra Pradesh'], ['38', 'Ladakh'],
];
