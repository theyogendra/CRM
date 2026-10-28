import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { LineItem, Product } from '../lib/types';
import { renderWithApp, STAFF } from '../test/render';
import LineItemsEditor, { blankItem } from './LineItemsEditor';

const oxford: Product = {
  id: 'p1', sku: 'OXF-01', name: 'Leather Oxford', description: '', hsn: '6403', unit: 'pairs',
  rate: 890, gstRate: 18, archivedAt: null,
};
const oldBoot: Product = { ...oxford, id: 'p2', sku: 'OLD-9', name: 'Retired Boot', archivedAt: '2025-01-01T00:00:00.000Z' };

function Harness({ initial }: { initial: LineItem[] }) {
  const [items, setItems] = useState<LineItem[]>(initial);
  return <LineItemsEditor items={items} onChange={setItems} products={[oxford, oldBoot]}
    canManageCatalog={false} onCatalogChanged={vi.fn()} />;
}

describe('LineItemsEditor — reusable items', () => {
  it('searching the catalog offers active items only, matched by name or SKU', async () => {
    renderWithApp(<Harness initial={[blankItem()]} />, { user: STAFF });
    const search = screen.getByRole('combobox', { name: 'Search catalog' });
    await userEvent.click(search);
    // scope to the catalog results: the GST dropdown also renders <option> elements
    const results = await screen.findByRole('listbox');
    expect(within(results).getByRole('option', { name: /Leather Oxford/ })).toBeInTheDocument();
    expect(within(results).queryByRole('option', { name: /Retired Boot/ })).not.toBeInTheDocument();

    await userEvent.type(search, 'OXF');
    expect(within(screen.getByRole('listbox')).getAllByRole('option')).toHaveLength(1);
  });

  it('selecting an item fills the line and locks price and GST, but keeps quantity and discount editable', async () => {
    renderWithApp(<Harness initial={[blankItem()]} />, { user: STAFF });
    await userEvent.click(screen.getByRole('combobox', { name: 'Search catalog' }));
    await userEvent.click(await screen.findByRole('option', { name: /Leather Oxford/ }));

    expect(screen.getByText('Catalog')).toBeInTheDocument();
    expect(screen.getByText('OXF-01')).toBeInTheDocument();
    expect(screen.getByRole('spinbutton', { name: 'Line 1 rate' })).toBeDisabled();
    expect(screen.getByRole('combobox', { name: 'Line 1 GST rate' })).toBeDisabled();
    expect(screen.getByRole('spinbutton', { name: 'Line 1 quantity' })).toBeEnabled();
    expect(screen.getByRole('spinbutton', { name: 'Line 1 discount' })).toBeEnabled();
    expect(screen.getByRole('spinbutton', { name: 'Line 1 rate' })).toHaveValue(890);
  });

  it('a quantity change recalculates the line amount for the preview', async () => {
    renderWithApp(<Harness initial={[blankItem()]} />, { user: STAFF });
    await userEvent.click(screen.getByRole('combobox', { name: 'Search catalog' }));
    await userEvent.click(await screen.findByRole('option', { name: /Leather Oxford/ }));
    const qty = screen.getByRole('spinbutton', { name: 'Line 1 quantity' });
    await userEvent.clear(qty);
    await userEvent.type(qty, '2');
    expect(screen.getByText('₹1,780.00')).toBeInTheDocument();
  });

  it('unlinking a catalog line makes price and GST editable again', async () => {
    renderWithApp(<Harness initial={[blankItem()]} />, { user: STAFF });
    await userEvent.click(screen.getByRole('combobox', { name: 'Search catalog' }));
    await userEvent.click(await screen.findByRole('option', { name: /Leather Oxford/ }));
    await userEvent.click(screen.getByRole('button', { name: /Unlink/ }));

    expect(screen.getByRole('spinbutton', { name: 'Line 1 rate' })).toBeEnabled();
    expect(screen.getByRole('combobox', { name: 'Line 1 GST rate' })).toBeEnabled();
    expect(screen.queryByText('Catalog')).not.toBeInTheDocument();
  });

  it('“Save to catalog” is only offered to users who can manage the catalog', async () => {
    const item: LineItem = { ...blankItem(), description: 'Custom sandal', rate: 300 };
    renderWithApp(<LineItemsEditor items={[item]} onChange={() => {}} products={[]} canManageCatalog={false} onCatalogChanged={() => {}} />, { user: STAFF });
    expect(screen.queryByRole('button', { name: /Save to catalog/ })).not.toBeInTheDocument();
  });

  it('shows the “Save to catalog” action for catalog managers on a free-form line', async () => {
    const item: LineItem = { ...blankItem(), description: 'Custom sandal', rate: 300 };
    renderWithApp(<LineItemsEditor items={[item]} onChange={() => {}} products={[]} canManageCatalog onCatalogChanged={() => {}} />);
    expect(screen.getByRole('button', { name: /Save to catalog/ })).toBeInTheDocument();
  });
});
