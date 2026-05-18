import { create } from 'zustand';
import {
  fetchMe,
  fetchUsers,
  logout as apiLogout,
  selectUser as apiSelectUser,
} from '@api/auth';
import type { PrincipalInfo, UserSummary } from '@api/auth';

interface AuthState {
  currentUser: PrincipalInfo | null;
  users: UserSummary[];
  /** Load all active users into the store (for the role picker). */
  loadUsers: () => Promise<void>;
  /** Select a user by id — updates session and resolves the full principal. */
  selectUser: (userId: string) => Promise<void>;
  /** Logs out and clears the current user from the store. */
  logout: () => Promise<void>;
  /** Checks the server for an existing session and populates currentUser. */
  checkSession: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()((set) => ({
  currentUser: null,
  users: [],

  loadUsers: async () => {
    try {
      const users = await fetchUsers();
      set({ users });
    } catch {
      // Non-fatal — role picker will be empty; the user can retry.
    }
  },

  selectUser: async (userId: string) => {
    const principal = await apiSelectUser(userId);
    set({ currentUser: principal });
  },

  logout: async () => {
    await apiLogout();
    set({ currentUser: null });
  },

  checkSession: async () => {
    const principal = await fetchMe();
    set({ currentUser: principal });
  },
}));
