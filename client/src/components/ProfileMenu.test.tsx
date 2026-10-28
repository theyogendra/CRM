import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { auth } from '../lib/api';
import { ADMIN, STAFF, renderWithApp } from '../test/render';
import ProfileMenu from './ProfileMenu';

describe('ProfileMenu', () => {
  it('shows the signed-in user’s real name, email and role on the trigger and in the menu', async () => {
    renderWithApp(<ProfileMenu user={ADMIN} onSignedOut={() => {}} />);
    const trigger = screen.getByRole('button', { name: /Rahul Verma/ });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menu', { name: 'Account' })).toBeInTheDocument();
    expect(screen.getByTestId('profile-email')).toHaveTextContent('owner@example.com');
    expect(screen.getByTestId('profile-role')).toHaveTextContent('Administrator');
  });

  it('opens with the mouse and closes on a second click', async () => {
    renderWithApp(<ProfileMenu user={ADMIN} onSignedOut={() => {}} />);
    const trigger = screen.getByRole('button', { name: /Rahul Verma/ });
    await userEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    await userEvent.click(trigger);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('Escape closes the menu and returns focus to the trigger', async () => {
    renderWithApp(<ProfileMenu user={ADMIN} onSignedOut={() => {}} />);
    const trigger = screen.getByRole('button', { name: /Rahul Verma/ });
    await userEvent.click(trigger);
    // focus moves into the menu when it opens (first item for an administrator)
    await waitFor(() => expect(screen.getByRole('menuitem', { name: 'Company settings' })).toHaveFocus());

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('arrow keys move between menu items and wrap around', async () => {
    renderWithApp(<ProfileMenu user={ADMIN} onSignedOut={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /Rahul Verma/ }));
    const settings = screen.getByRole('menuitem', { name: 'Company settings' });
    const signOut = screen.getByRole('menuitem', { name: 'Sign out' });
    expect(settings).toHaveFocus();

    const password = screen.getByRole('menuitem', { name: 'Change password' });
    await userEvent.keyboard('{ArrowDown}');
    expect(password).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(signOut).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(settings).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}');
    expect(signOut).toHaveFocus();
  });

  it('clicking outside the menu closes it', async () => {
    renderWithApp(<ProfileMenu user={ADMIN} onSignedOut={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /Rahul Verma/ }));
    fireEvent.mouseDown(document.body);
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });

  it('an administrator sees Company settings and navigates to it', async () => {
    renderWithApp(<ProfileMenu user={ADMIN} onSignedOut={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /Rahul Verma/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Company settings' }));
    expect(screen.getByTestId('location')).toHaveTextContent('/settings');
  });

  it('a staff user does not see settings, only the actions their role allows', async () => {
    renderWithApp(<ProfileMenu user={STAFF} onSignedOut={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /Sales Staff/ }));
    expect(screen.queryByRole('menuitem', { name: 'Company settings' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument();
    expect(screen.getByTestId('profile-role')).toHaveTextContent('Sales staff');
  });

  it('every role can open Change password, and mismatched new passwords are refused before any request', async () => {
    renderWithApp(<ProfileMenu user={STAFF} onSignedOut={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /Sales Staff/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Change password' }));

    const dialog = await screen.findByRole('dialog', { name: 'Change password' });
    const [current, next, confirm] = Array.from(dialog.querySelectorAll('input'));
    await userEvent.type(current, 'staff123');
    await userEvent.type(next, 'a-new-password');
    await userEvent.type(confirm, 'different-one');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('do not match');
  });

  it('sign out clears the saved token and reports the sign-out', async () => {
    const onSignedOut = vi.fn();
    localStorage.setItem('dealstack_token', 'abc');
    renderWithApp(<ProfileMenu user={ADMIN} onSignedOut={onSignedOut} />);
    await userEvent.click(screen.getByRole('button', { name: /Rahul Verma/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));
    expect(onSignedOut).toHaveBeenCalledOnce();
    expect(auth.token).toBe('');
  });
});
