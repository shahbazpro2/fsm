"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  X,
  Users,
  UserPlus,
  KeyRound,
  Pencil,
  Trash2,
  Search,
  Loader2,
  Shield,
  User as UserIcon,
  Check,
  Eye,
  EyeOff,
  Car,
} from "lucide-react";
import type { UserSession } from "@/lib/auth";

export interface ManagedUser {
  id: string;
  username: string;
  name: string;
  role: "superadmin" | "user";
  isActive: boolean;
  tokenCount: number;
  createdAt: string;
}

export function UsersManagementModal({
  currentUser,
  onClose,
  notify,
}: {
  currentUser: UserSession;
  onClose: () => void;
  notify: (msg: string, err?: boolean) => void;
}) {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [addingUser, setAddingUser] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [passwordUser, setPasswordUser] = useState<ManagedUser | null>(null);
  const [deletingUser, setDeletingUser] = useState<ManagedUser | null>(null);

  // Form states
  const [newUsername, setNewUsername] = useState("");
  const [newName, setNewName] = useState("");
  const [newRole, setNewRole] = useState<"user" | "superadmin">("user");
  const [newPassword, setNewPassword] = useState("");
  const [showNewPass, setShowNewPass] = useState(false);

  const [customPassword, setCustomPassword] = useState("");
  const [showCustomPass, setShowCustomPass] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/users");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load users");
      setUsers(data);
    } catch (err: unknown) {
      notify((err as Error).message, true);
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.username.toLowerCase().includes(q) ||
        (u.name && u.name.toLowerCase().includes(q))
    );
  }, [users, search]);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUsername.trim() || !newPassword.trim()) {
      notify("Username and password are required", true);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: newUsername.trim(),
          name: newName.trim(),
          role: newRole,
          password: newPassword.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create user");
      notify(`User @${data.username} created successfully`);
      setAddingUser(false);
      setNewUsername("");
      setNewName("");
      setNewPassword("");
      setNewRole("user");
      loadUsers();
    } catch (err: unknown) {
      notify((err as Error).message, true);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordUser) return;
    if (!customPassword.trim()) {
      notify("Please enter a new password", true);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/users/${passwordUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: customPassword.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to set password");
      notify(`Password updated for @${passwordUser.username}`);
      setPasswordUser(null);
      setCustomPassword("");
    } catch (err: unknown) {
      notify((err as Error).message, true);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/users/${editingUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editingUser.name,
          role: editingUser.role,
          isActive: editingUser.isActive,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update user");
      notify(`Updated user @${editingUser.username}`);
      setEditingUser(null);
      loadUsers();
    } catch (err: unknown) {
      notify((err as Error).message, true);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deletingUser) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/users/${deletingUser.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete user");
      notify(`User @${deletingUser.username} deleted`);
      setDeletingUser(null);
      loadUsers();
    } catch (err: unknown) {
      notify((err as Error).message, true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade">
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-zinc-800/90 bg-[#121214] text-zinc-100 shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-zinc-800/80 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-tight">User Management</h2>
                <span className="rounded bg-zinc-800/90 border border-zinc-700/60 px-2 py-0.5 text-[10px] font-mono text-zinc-400">
                  {users.length} Users
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Manage accounts, grant roles, and set custom passwords
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-800 bg-zinc-800/80 text-zinc-400 hover:bg-zinc-700 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Action Bar: Search & Add */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 border-b border-zinc-800/80 bg-zinc-900/40 p-4">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search users..."
              className="w-full rounded-xl border border-zinc-800 bg-zinc-900/90 py-1.5 pl-8 pr-3 text-xs text-zinc-200 placeholder-zinc-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40 focus:outline-none"
            />
          </div>
          <button
            onClick={() => setAddingUser(true)}
            className="flex h-9 items-center justify-center gap-1.5 rounded-xl bg-emerald-500 px-3.5 text-xs font-bold text-zinc-950 transition hover:bg-emerald-400 active:scale-95 shadow-sm shadow-emerald-500/20 shrink-0"
          >
            <UserPlus className="h-3.5 w-3.5" />
            <span>Add User</span>
          </button>
        </div>

        {/* Users List Container */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5 min-h-[260px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-500">
              <Loader2 className="h-6 w-6 animate-spin text-emerald-400 mb-2" />
              <p className="text-xs">Loading accounts...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-zinc-800/90 bg-[#141416] p-8 text-center text-zinc-400">
              <UserIcon className="h-8 w-8 mx-auto mb-2 text-zinc-600" />
              <p className="text-xs font-semibold text-zinc-300">No users found</p>
              <p className="text-[11px] text-zinc-500 mt-0.5">Try searching with a different username</p>
            </div>
          ) : (
            filtered.map((u) => {
              const isMe = u.id === currentUser.userId;
              return (
                <div
                  key={u.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-zinc-800/80 bg-[#141416] p-3.5 transition hover:border-zinc-800 hover:bg-[#18181b] shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-800/90 font-bold text-zinc-300 border border-zinc-700/60 text-sm">
                      {u.username.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-bold text-white">
                          @{u.username}
                        </span>
                        {isMe && (
                          <span className="rounded bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.2 text-[10px] font-semibold text-emerald-400">
                            You
                          </span>
                        )}
                        <span
                          className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold ${
                            u.role === "superadmin"
                              ? "bg-purple-500/15 text-purple-300 border border-purple-500/30"
                              : "bg-zinc-800/80 text-zinc-300 border border-zinc-700/60"
                          }`}
                        >
                          {u.role === "superadmin" ? <Shield className="h-3 w-3" /> : <UserIcon className="h-3 w-3" />}
                          <span className="capitalize">{u.role}</span>
                        </span>
                        {!u.isActive && (
                          <span className="rounded bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.2 text-[10px] font-semibold text-rose-400">
                            Disabled
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                        {u.name ? <span className="text-zinc-300">{u.name}</span> : <span className="italic text-zinc-500">No name</span>}
                        <span>·</span>
                        <span className="flex items-center gap-1 text-emerald-400 font-mono text-[11px]">
                          <Car className="h-3 w-3" />
                          <span>{u.tokenCount} token{u.tokenCount !== 1 ? "s" : ""}</span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 self-end sm:self-center">
                    <button
                      onClick={() => {
                        setPasswordUser(u);
                        setCustomPassword("");
                      }}
                      className="flex h-8 items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 text-[11px] font-semibold text-amber-300 transition hover:bg-amber-500/20 active:scale-95"
                      title="Set custom password"
                    >
                      <KeyRound className="h-3 w-3 text-amber-400" />
                      <span>Set Password</span>
                    </button>

                    <button
                      onClick={() => setEditingUser(u)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-800/80 text-zinc-300 transition hover:bg-zinc-700 hover:text-white"
                      title="Edit user details"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>

                    {!isMe && (
                      <button
                        onClick={() => setDeletingUser(u)}
                        className="flex h-8 w-8 items-center justify-center rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-400 transition hover:bg-rose-500/20 active:scale-95"
                        title="Delete user"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t border-zinc-800/80 px-5 py-3 text-xs text-zinc-400 bg-zinc-900/50">
          <span>Every user has isolated tokens. Superadmin can view and manage all.</span>
          <button
            onClick={onClose}
            className="rounded-xl border border-zinc-800 bg-zinc-800/80 px-4 py-1.5 text-xs font-semibold text-zinc-300 hover:text-white active:bg-zinc-800 transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* Sub-modal: Set Custom Password */}
      {passwordUser && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-800/90 bg-[#121214] p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-amber-400" />
                <h3 className="text-sm font-bold text-white">Set Custom Password</h3>
              </div>
              <button
                onClick={() => setPasswordUser(null)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-zinc-400 mb-3 leading-relaxed">
              Set a new custom password for{" "}
              <span className="font-mono font-bold text-emerald-400">@{passwordUser.username}</span>.
              The user can use this immediately to log in.
            </p>

            <form onSubmit={handleSetPassword} className="space-y-3.5">
              <div className="relative">
                <input
                  type={showCustomPass ? "text" : "password"}
                  value={customPassword}
                  onChange={(e) => setCustomPassword(e.target.value)}
                  placeholder="Enter new password (min 4 chars)"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900/90 px-3.5 py-2 text-sm text-white placeholder-zinc-500 pr-10 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40 focus:outline-none"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowCustomPass(!showCustomPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
                >
                  {showCustomPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={submitting || !customPassword.trim()}
                  className="flex-1 rounded-xl bg-emerald-500 py-2.5 text-xs font-bold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50 transition shadow-sm shadow-emerald-500/20"
                >
                  {submitting ? "Updating..." : "Save Password"}
                </button>
                <button
                  type="button"
                  onClick={() => setPasswordUser(null)}
                  className="rounded-xl border border-zinc-800 bg-zinc-800/80 px-4 py-2 text-xs font-semibold text-zinc-300 hover:text-white active:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sub-modal: Add New User */}
      {addingUser && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800/90 bg-[#121214] p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">Create New User</h3>
              </div>
              <button
                onClick={() => setAddingUser(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-3.5">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
                  Username *
                </label>
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value.toLowerCase().replace(/\s+/g, ""))}
                  placeholder="e.g. cashier1, driver_ali"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900/90 px-3.5 py-2 text-sm text-white font-mono placeholder-zinc-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40 focus:outline-none"
                  autoFocus
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
                  Full Name (optional)
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Ali Raza"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900/90 px-3.5 py-2 text-sm text-white placeholder-zinc-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
                  Role
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewRole("user")}
                    className={`flex items-center justify-center gap-2 rounded-xl border p-2.5 text-xs font-semibold transition ${
                      newRole === "user"
                        ? "border-emerald-500 bg-emerald-500/15 text-emerald-400 font-bold"
                        : "border-zinc-800 bg-zinc-900/80 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    <UserIcon className="h-4 w-4" />
                    <span>Regular User</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewRole("superadmin")}
                    className={`flex items-center justify-center gap-2 rounded-xl border p-2.5 text-xs font-semibold transition ${
                      newRole === "superadmin"
                        ? "border-purple-500 bg-purple-500/15 text-purple-400 font-bold"
                        : "border-zinc-800 bg-zinc-900/80 text-zinc-400 hover:text-zinc-200"
                    }`}
                  >
                    <Shield className="h-4 w-4" />
                    <span>Superadmin</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
                  Custom Password *
                </label>
                <div className="relative">
                  <input
                    type={showNewPass ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter custom password (min 4 chars)"
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-900/90 px-3.5 py-2 text-sm text-white placeholder-zinc-500 pr-10 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPass(!showNewPass)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white"
                  >
                    {showNewPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={submitting || !newUsername.trim() || !newPassword.trim()}
                  className="flex-1 rounded-xl bg-emerald-500 py-2.5 text-xs font-bold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50 transition shadow-sm shadow-emerald-500/20"
                >
                  {submitting ? "Creating..." : "Create User"}
                </button>
                <button
                  type="button"
                  onClick={() => setAddingUser(false)}
                  className="rounded-xl border border-zinc-800 bg-zinc-800/80 px-4 py-2 text-xs font-semibold text-zinc-300 hover:text-white active:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sub-modal: Edit User */}
      {editingUser && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade">
          <div className="w-full max-w-md rounded-2xl border border-zinc-800/90 bg-[#121214] p-5 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Pencil className="h-5 w-5 text-zinc-300" />
                <h3 className="text-sm font-bold text-white">
                  Edit User @{editingUser.username}
                </h3>
              </div>
              <button
                onClick={() => setEditingUser(null)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleEditUser} className="space-y-3.5">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={editingUser.name}
                  onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                  placeholder="Full name"
                  className="w-full rounded-xl border border-zinc-800 bg-zinc-900/90 px-3.5 py-2 text-sm text-white placeholder-zinc-500 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/40 focus:outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
                  Role
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingUser({ ...editingUser, role: "user" })}
                    className={`flex items-center justify-center gap-2 rounded-xl border p-2 text-xs font-semibold transition ${
                      editingUser.role === "user"
                        ? "border-emerald-500 bg-emerald-500/15 text-emerald-400 font-bold"
                        : "border-zinc-800 bg-zinc-900/80 text-zinc-400"
                    }`}
                  >
                    <UserIcon className="h-4 w-4" />
                    <span>Regular User</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingUser({ ...editingUser, role: "superadmin" })}
                    className={`flex items-center justify-center gap-2 rounded-xl border p-2 text-xs font-semibold transition ${
                      editingUser.role === "superadmin"
                        ? "border-purple-500 bg-purple-500/15 text-purple-400 font-bold"
                        : "border-zinc-800 bg-zinc-900/80 text-zinc-400"
                    }`}
                  >
                    <Shield className="h-4 w-4" />
                    <span>Superadmin</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
                  Account Status
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingUser({ ...editingUser, isActive: true })}
                    className={`flex items-center justify-center gap-2 rounded-xl border p-2 text-xs font-semibold transition ${
                      editingUser.isActive
                        ? "border-emerald-500 bg-emerald-500/15 text-emerald-400 font-bold"
                        : "border-zinc-800 bg-zinc-900/80 text-zinc-400"
                    }`}
                  >
                    <Check className="h-4 w-4" />
                    <span>Active</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingUser({ ...editingUser, isActive: false })}
                    className={`flex items-center justify-center gap-2 rounded-xl border p-2 text-xs font-semibold transition ${
                      !editingUser.isActive
                        ? "border-rose-500 bg-rose-500/15 text-rose-400 font-bold"
                        : "border-zinc-800 bg-zinc-900/80 text-zinc-400"
                    }`}
                  >
                    <X className="h-4 w-4" />
                    <span>Disabled</span>
                  </button>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 rounded-xl bg-emerald-500 py-2.5 text-xs font-bold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50 transition shadow-sm shadow-emerald-500/20"
                >
                  {submitting ? "Saving..." : "Save Changes"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="rounded-xl border border-zinc-800 bg-zinc-800/80 px-4 py-2 text-xs font-semibold text-zinc-300 hover:text-white active:bg-zinc-800 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Sub-modal: Confirm Delete User */}
      {deletingUser && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade">
          <div className="w-full max-w-sm rounded-2xl border border-rose-500/30 bg-[#121214] p-5 shadow-2xl">
            <div className="flex items-center gap-2 text-rose-400 mb-2">
              <Trash2 className="h-5 w-5" />
              <h3 className="text-sm font-bold text-white">Delete User @{deletingUser.username}?</h3>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              This will permanently delete user account{" "}
              <span className="font-mono text-white">@{deletingUser.username}</span> and all{" "}
              <span className="font-bold text-rose-400">{deletingUser.tokenCount} token(s)</span> associated with this user.
              This action cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleDeleteUser}
                disabled={submitting}
                className="flex-1 rounded-xl bg-rose-600 py-2.5 text-xs font-bold text-white hover:bg-rose-500 transition shadow-sm shadow-rose-600/20"
              >
                {submitting ? "Deleting..." : "Yes, Delete User"}
              </button>
              <button
                onClick={() => setDeletingUser(null)}
                className="rounded-xl border border-zinc-800 bg-zinc-800/80 px-4 py-2 text-xs font-semibold text-zinc-300 hover:text-white active:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
