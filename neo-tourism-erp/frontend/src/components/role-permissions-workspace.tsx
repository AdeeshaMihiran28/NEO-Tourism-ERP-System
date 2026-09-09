"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api/client";
import { useAuth } from "./auth-provider";
import { ItNavigation } from "./it-navigation";

type Permission = { id: string; code: string; description: string | null };
type Role = {
  id: string;
  name: string;
  description: string | null;
  permissions: Array<{ permission: Permission }>;
  users: Array<{
    user: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
      isActive: boolean;
    };
  }>;
  _count: { users: number };
};

export function RolePermissionsWorkspace() {
  const { hasPermission } = useAuth();
  const [roles, setRoles] = useState<Role[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const canManage = hasPermission("role.manage");
  const load = useCallback(async () => {
    try {
      const [roleRows, permissionRows] = await Promise.all([
        apiFetch<Role[]>("/roles"),
        apiFetch<Permission[]>("/permissions"),
      ]);
      setRoles(roleRows);
      setPermissions(permissionRows);
      setSelectedId((current) => current || roleRows[0]?.id || "");
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  const selected = roles.find((role) => role.id === selectedId);
  const groups = useMemo(
    () =>
      Object.groupBy(permissions, ({ code }) => code.split(".")[0] || "other"),
    [permissions],
  );
  const privilegedRole = selected
    ? ["SUPER_ADMIN", "SYSTEM_ADMIN", "FINANCE_APPROVER", "OWNER"].includes(
        selected.name,
      )
    : false;
  const canEditSelected =
    canManage &&
    (!privilegedRole || hasPermission("user.manage_privileged_roles")) &&
    (selected?.name !== "OWNER" || hasPermission("organization.owner.manage"));

  async function createRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      await apiFetch("/roles", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      form.reset();
      setMessage("Role created.");
      setError("");
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function saveRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    try {
      await apiFetch(`/roles/${selected.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: form.get("name"),
          description: form.get("description"),
        }),
      });
      await apiFetch(`/roles/${selected.id}/permissions`, {
        method: "PUT",
        body: JSON.stringify({ permissionIds: form.getAll("permissionIds") }),
      });
      setMessage("Role and permissions updated.");
      setError("");
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
      <p className="text-sm font-bold uppercase tracking-[0.18em] text-violet-700">
        IT & Access Management
      </p>
      <h1 className="mt-2 text-3xl font-semibold text-slate-950">
        Roles & Permissions
      </h1>
      <p className="mt-2 text-slate-600">
        Manage the existing role definitions and their permission bundles.
      </p>
      <ItNavigation />
      {message && (
        <p className="mt-5 rounded-xl bg-emerald-50 p-3 text-emerald-800">
          {message}
        </p>
      )}
      {error && (
        <p className="mt-5 rounded-xl bg-red-50 p-3 text-red-700">{error}</p>
      )}

      {canManage && (
        <details className="mt-6 rounded-2xl border bg-white p-5 shadow-sm">
          <summary className="cursor-pointer font-semibold">
            Create role
          </summary>
          <form
            onSubmit={createRole}
            className="mt-4 grid gap-3 sm:grid-cols-3"
          >
            <input
              name="name"
              required
              maxLength={100}
              placeholder="Role name"
              className="rounded-xl border p-3"
            />
            <input
              name="description"
              maxLength={500}
              placeholder="Description"
              className="rounded-xl border p-3"
            />
            <button className="rounded-xl bg-violet-700 px-4 font-semibold text-white">
              Create role
            </button>
          </form>
        </details>
      )}

      <div className="mt-6 grid gap-5 lg:grid-cols-[260px_1fr]">
        <section className="rounded-2xl border bg-white p-3 shadow-sm">
          <h2 className="px-3 py-2 font-semibold">Roles</h2>
          <div className="space-y-1">
            {roles.map((role) => (
              <button
                key={role.id}
                type="button"
                onClick={() => setSelectedId(role.id)}
                className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm ${selectedId === role.id ? "bg-violet-700 text-white" : "hover:bg-slate-100"}`}
              >
                <span>{role.name.replaceAll("_", " ")}</span>
                <span className="text-xs opacity-70">{role._count.users}</span>
              </button>
            ))}
          </div>
        </section>

        {selected && (
          <form
            key={selected.id}
            onSubmit={saveRole}
            className="rounded-2xl border bg-white p-5 shadow-sm"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-600">
                Role name
                <input
                  name="name"
                  required
                  defaultValue={selected.name}
                  disabled={!canEditSelected}
                  className="mt-1 w-full rounded-xl border p-3 disabled:bg-slate-100"
                />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Users with role
                <input
                  readOnly
                  value={selected._count.users}
                  className="mt-1 w-full rounded-xl border bg-slate-100 p-3"
                />
              </label>
              <label className="text-xs font-semibold text-slate-600 sm:col-span-2">
                Description
                <textarea
                  name="description"
                  defaultValue={selected.description ?? ""}
                  disabled={!canEditSelected}
                  className="mt-1 min-h-20 w-full rounded-xl border p-3 disabled:bg-slate-100"
                />
              </label>
            </div>
            <details className="mt-4 rounded-xl bg-slate-50 p-4">
              <summary className="cursor-pointer text-sm font-semibold">
                Users with role ({selected.users.length})
              </summary>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {selected.users.map(({ user }) => (
                  <div key={user.id} className="rounded-lg border bg-white p-3">
                    <p className="text-sm font-semibold">
                      {user.firstName} {user.lastName}
                    </p>
                    <p className="text-xs text-slate-500">
                      {user.email} · {user.isActive ? "ACTIVE" : "DISABLED"}
                    </p>
                  </div>
                ))}
                {!selected.users.length && (
                  <p className="text-sm text-slate-500">No users assigned.</p>
                )}
              </div>
            </details>
            <h2 className="mt-6 font-semibold">Assigned permissions</h2>
            <div className="mt-3 space-y-4">
              {Object.entries(groups).map(([group, rows]) => (
                <fieldset key={group} className="rounded-xl border p-4">
                  <legend className="px-2 text-sm font-bold uppercase text-violet-700">
                    {group}
                  </legend>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {rows?.map((permission) => (
                      <label
                        key={permission.id}
                        className="flex items-start gap-2 text-sm"
                      >
                        <input
                          type="checkbox"
                          name="permissionIds"
                          value={permission.id}
                          defaultChecked={selected.permissions.some(
                            ({ permission: assigned }) =>
                              assigned.id === permission.id,
                          )}
                          disabled={!canEditSelected}
                          className="mt-1"
                        />
                        <span>
                          <span className="block font-medium">
                            {permission.code}
                          </span>
                          {permission.description && (
                            <span className="text-xs text-slate-500">
                              {permission.description}
                            </span>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              ))}
            </div>
            {canEditSelected && (
              <button className="mt-5 rounded-xl bg-violet-700 px-5 py-2.5 font-semibold text-white">
                Save role
              </button>
            )}
          </form>
        )}
      </div>
    </main>
  );
}

function errorMessage(caught: unknown) {
  return caught instanceof ApiError
    ? caught.message
    : "Unable to update roles and permissions.";
}
