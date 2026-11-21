"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api/client";
import { useAuth } from "./auth-provider";
import { ItNavigation } from "./it-navigation";
import { StatusBadge } from "./status-badge";

type Role = { id: string; name: string; description: string | null };
type Department = { id: string; name: string };
type User = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  accountState: "PENDING_ACTIVATION" | "ACTIVE" | "DISABLED";
  createdAt: string;
  updatedAt: string;
  accessMismatch: boolean;
  employee: {
    id: string;
    employeeNumber: string;
    firstName: string;
    lastName: string;
    jobTitle: string;
    organizationLevel: string;
    employmentStatus: string;
    department: { name: string };
  } | null;
  roles: string[];
  rolesDetailed?: Array<{ name: string; source: string }>;
  permissions: string[];
};
type Options = {
  roles: Role[];
  departments: Department[];
};

export function AccessManagementWorkspace() {
  const { hasPermission } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [options, setOptions] = useState<Options>({
    roles: [],
    departments: [],
  });
  const [managingId, setManagingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [role, setRole] = useState("");
  const [issuesOnly, setIssuesOnly] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const canManageRoles = hasPermission("user.manage_roles");
  const load = useCallback(async () => {
    try {
      const userRows = await apiFetch<User[]>("/users");
      setUsers(userRows);
      if (canManageRoles) {
        setOptions(await apiFetch<Options>("/users/access-options"));
      }
    } catch (caught) {
      showError(caught);
    }
  }, [canManageRoles]);

  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  function showError(caught: unknown) {
    setError(
      caught instanceof ApiError
        ? caught.message
        : "Unable to update ERP access.",
    );
    setMessage("");
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const roleIds = form.getAll("roleIds").map(String);
    if (!roleIds.length) return setError("Select at least one role.");
    try {
      await apiFetch("/users", {
        method: "POST",
        body: JSON.stringify({
          firstName: form.get("firstName"),
          lastName: form.get("lastName"),
          departmentId: form.get("departmentId"),
          email: form.get("email"),
          password: form.get("password"),
          roleIds,
        }),
      });
      event.currentTarget.reset();
      setError("");
      setMessage("Technical ERP account created.");
      await load();
    } catch (caught) {
      showError(caught);
    }
  }

  async function request(path: string, body: object, success: string) {
    try {
      await apiFetch(path, { method: "PATCH", body: JSON.stringify(body) });
      setError("");
      setMessage(success);
      await load();
      return true;
    } catch (caught) {
      showError(caught);
      return false;
    }
  }

  const canAssign = (item: Role) => {
    if (["SUPER_ADMIN", "SYSTEM_ADMIN", "FINANCE_APPROVER"].includes(item.name))
      return hasPermission("user.manage_privileged_roles");
    if (item.name === "OWNER")
      return (
        hasPermission("user.manage_privileged_roles") &&
        hasPermission("organization.owner.manage")
      );
    return true;
  };
  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter(
      (user) =>
        (!term ||
          [
            user.email,
            user.firstName,
            user.lastName,
            user.employee?.employeeNumber,
          ].some((value) => value?.toLowerCase().includes(term))) &&
        (!status || user.accountState === status) &&
        (!role || user.roles.includes(role)) &&
        (!issuesOnly || user.accessMismatch),
    );
  }, [issuesOnly, role, search, status, users]);
  const roleNames = useMemo(
    () => [...new Set(users.flatMap((user) => user.roles))].sort(),
    [users],
  );

  return (
    <main className="mx-auto max-w-[1600px] px-5 py-8 sm:px-8">
      <p className="text-sm font-bold uppercase tracking-[0.18em] text-violet-700">
        IT & Access Management
      </p>
      <h1 className="mt-2 text-3xl font-semibold text-slate-950">
        User Accounts
      </h1>
      <p className="mt-2 text-slate-600">
        Create, manage, enable and disable ERP login accounts.
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

      {users.some((user) => user.accessMismatch) && (
        <p className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4 font-semibold text-red-800">
          {users.filter((user) => user.accessMismatch).length} inactive employee
          account(s) still have ERP access enabled. Review and disable access
          below.
        </p>
      )}

      {hasPermission("user.create") && canManageRoles && (
        <details className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <summary className="cursor-pointer font-semibold">
            Create technical or service account
          </summary>
          <form onSubmit={create} className="mt-5 grid gap-4 lg:grid-cols-3">
            <input
              required
              name="firstName"
              placeholder="First name"
              className="rounded-xl border border-slate-300 p-3"
            />
            <input
              required
              name="lastName"
              placeholder="Last name"
              className="rounded-xl border border-slate-300 p-3"
            />
            <input
              required
              name="email"
              type="email"
              placeholder="Login email"
              className="rounded-xl border border-slate-300 p-3"
            />
            <input
              required
              name="password"
              type="password"
              minLength={8}
              maxLength={128}
              autoComplete="new-password"
              placeholder="Temporary password"
              className="rounded-xl border border-slate-300 p-3"
            />
            <select
              required
              name="departmentId"
              defaultValue=""
              className="rounded-xl border border-slate-300 p-3"
            >
              <option value="" disabled>
                Select department
              </option>
              {options.departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
            <RoleChoices
              roles={options.roles}
              selected={[]}
              canAssign={canAssign}
            />
            <button className="rounded-xl bg-violet-700 px-5 py-3 font-semibold text-white lg:col-span-3">
              Create technical account
            </button>
          </form>
        </details>
      )}

      <div className="mt-6 grid gap-3 rounded-2xl border bg-white p-4 shadow-sm sm:grid-cols-2 xl:grid-cols-4">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search employee ID, name or login email"
          className="rounded-xl border p-3"
        />
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="rounded-xl border p-3"
        >
          <option value="">All account statuses</option>
          <option>ACTIVE</option>
          <option value="PENDING_ACTIVATION">PENDING ACTIVATION</option>
          <option>DISABLED</option>
        </select>
        <label className="flex items-center gap-2 rounded-xl border p-3 text-sm font-medium">
          <input
            type="checkbox"
            checked={issuesOnly}
            onChange={(event) => setIssuesOnly(event.target.checked)}
          />
          Access issues only
        </label>
        <select
          value={role}
          onChange={(event) => setRole(event.target.value)}
          className="rounded-xl border p-3"
        >
          <option value="">All roles</option>
          {roleNames.map((name) => (
            <option key={name} value={name}>
              {name.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </div>

      <section className="mt-6 overflow-x-auto rounded-2xl border bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr>
              {[
                "Employee",
                "Employee ID",
                "Login Email",
                "Roles",
                "Employment",
                "ERP Account",
                "Actions",
              ].map((heading) => (
                <th key={heading}>{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map((user) => (
              <UserRows
                key={user.id}
                user={user}
                roles={options.roles}
                managing={managingId === user.id}
                setManaging={setManagingId}
                canAssign={canAssign}
                canEdit={hasPermission("user.edit")}
                canManageRoles={canManageRoles}
                request={request}
              />
            ))}
          </tbody>
        </table>
        {!filteredUsers.length && (
          <p className="p-10 text-center text-slate-500">No users found.</p>
        )}
      </section>
    </main>
  );
}

function UserRows({
  user,
  roles,
  managing,
  setManaging,
  canAssign,
  canEdit,
  canManageRoles,
  request,
}: {
  user: User;
  roles: Role[];
  managing: boolean;
  setManaging: (id: string | null) => void;
  canAssign: (role: Role) => boolean;
  canEdit: boolean;
  canManageRoles: boolean;
  request: (path: string, body: object, success: string) => Promise<boolean>;
}) {
  const mismatch = user.accessMismatch;
  const [invitationLink, setInvitationLink] = useState("");
  const [invitationStatus, setInvitationStatus] = useState<
    "SENT" | "FAILED" | "NOT_CONFIGURED" | null
  >(null);
  const [invitationError, setInvitationError] = useState("");
  return (
    <>
      <tr>
        <td>
          <p className="font-semibold text-slate-900">
            {user.employee
              ? `${user.employee.firstName} ${user.employee.lastName}`
              : `${user.firstName} ${user.lastName}`}
          </p>
          <p className="text-xs text-slate-500">
            {user.employee
              ? `${user.employee.jobTitle} · ${user.employee.department.name}`
              : "Technical or service account"}
          </p>
        </td>
        <td>{user.employee?.employeeNumber ?? "—"}</td>
        <td>{user.email}</td>
        <td className="max-w-64">
          <span className="flex flex-wrap gap-1">
            {user.roles.map((name) => {
              const source = user.rolesDetailed?.find(
                (role) => role.name === name,
              )?.source;
              const auto = source === "POSITION_AUTO";
              return (
                <span
                  key={name}
                  title={
                    auto
                      ? "Automatic from position mapping"
                      : "Manually assigned"
                  }
                  className={`rounded-full px-2 py-1 text-xs font-semibold ${
                    auto
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-violet-50 text-violet-700"
                  }`}
                >
                  {name.replaceAll("_", " ")}
                  {auto ? " · auto" : ""}
                </span>
              );
            })}
          </span>
        </td>
        <td>
          <StatusBadge
            status={user.employee?.employmentStatus ?? "NOT LINKED"}
          />
        </td>
        <td>
          <StatusBadge status={user.accountState} />
          {mismatch && (
            <p className="mt-1 max-w-48 text-xs font-semibold text-red-700">
              Employee inactive — ERP access still enabled
            </p>
          )}
        </td>
        <td>
          <button
            type="button"
            onClick={() => setManaging(managing ? null : user.id)}
            className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 font-semibold text-violet-700"
          >
            {managing ? "Close" : "Manage"}
          </button>
        </td>
      </tr>
      {managing && (
        <tr>
          <td colSpan={7} className="bg-slate-50 p-5">
            {mismatch && (
              <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 font-semibold text-red-800">
                Employee is inactive but ERP access is still enabled.
              </p>
            )}
            <div className="grid gap-4 lg:grid-cols-2">
              <section className="rounded-xl border bg-white p-4">
                <h3 className="font-semibold">Account details</h3>
                <p className="mt-2 text-xs text-slate-500">
                  Created {formatDate(user.createdAt)} · Updated{" "}
                  {formatDate(user.updatedAt)}
                </p>
                {canEdit && (
                  <form
                    className="mt-4 flex gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      const email = new FormData(event.currentTarget).get(
                        "email",
                      );
                      void request(
                        `/users/${user.id}`,
                        { email },
                        "Login email updated.",
                      );
                    }}
                  >
                    <input
                      name="email"
                      type="email"
                      required
                      defaultValue={user.email}
                      className="min-w-0 flex-1 rounded-lg border p-2"
                    />
                    <button className="rounded-lg bg-violet-700 px-3 text-white">
                      Save email
                    </button>
                  </form>
                )}
                {canEdit && user.accountState !== "PENDING_ACTIVATION" && (
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        window.confirm(
                          user.isActive
                            ? `Disable ERP access for ${user.employee ? `${user.employee.firstName} ${user.employee.lastName}` : `${user.firstName} ${user.lastName}`}?\n\nEmployee ID: ${user.employee?.employeeNumber ?? "Not linked"}\n\nThis will prevent the user from logging in. Employee and historical records will remain unchanged.`
                            : `${["INACTIVE", "TERMINATED"].includes(user.employee?.employmentStatus ?? "") ? "Warning: this employee is inactive.\n\n" : ""}Enable ERP access for ${user.employee ? `${user.employee.firstName} ${user.employee.lastName}` : `${user.firstName} ${user.lastName}`}?\n\nEmployee ID: ${user.employee?.employeeNumber ?? "Not linked"}\n\nEmployee and historical records will remain unchanged.`,
                        )
                      )
                        void request(
                          `/users/${user.id}/status`,
                          { isActive: !user.isActive },
                          `ERP access ${user.isActive ? "disabled" : "enabled"}.`,
                        );
                    }}
                    className={`mt-4 rounded-lg px-4 py-2 font-semibold text-white ${user.isActive ? "bg-red-700" : "bg-emerald-700"}`}
                  >
                    {user.isActive ? "Disable ERP access" : "Enable ERP access"}
                  </button>
                )}
                {canEdit && user.accountState === "PENDING_ACTIVATION" && (
                  <div className="mt-4">
                    <button
                      type="button"
                      onClick={() => {
                        setInvitationError("");
                        setInvitationStatus(null);
                        setInvitationLink("");
                        void apiFetch<{
                          delivery: "SENT" | "FAILED" | "NOT_CONFIGURED";
                          invitationLink?: string;
                        }>(`/users/${user.id}/resend-invitation`, {
                          method: "POST",
                        })
                          .then((result) => {
                            setInvitationStatus(result.delivery);
                            if (result.invitationLink)
                              setInvitationLink(result.invitationLink);
                          })
                          .catch((caught: unknown) =>
                            setInvitationError(
                              caught instanceof ApiError
                                ? caught.message
                                : "Unable to regenerate invitation.",
                            ),
                          );
                      }}
                      className="rounded-lg bg-cyan-700 px-4 py-2 font-semibold text-white"
                    >
                      Resend invitation
                    </button>
                    {invitationStatus === "SENT" && (
                      <p className="mt-2 text-sm font-semibold text-emerald-700">
                        Invitation sent.
                      </p>
                    )}
                    {invitationStatus === "FAILED" && (
                      <p className="mt-2 text-sm font-semibold text-amber-700">
                        Email delivery failed. The invitation is still pending
                        — try again in a minute.
                      </p>
                    )}
                    {invitationStatus === "NOT_CONFIGURED" && (
                      <p className="mt-2 text-sm font-semibold text-amber-700">
                        Email is not configured. Contact IT to configure ERP
                        email delivery.
                      </p>
                    )}
                    {invitationLink && (
                      <div className="mt-3 flex gap-2">
                        <input
                          readOnly
                          value={invitationLink}
                          placeholder="Development debug link"
                          className="min-w-0 flex-1 rounded-lg border p-2"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            void navigator.clipboard.writeText(invitationLink)
                          }
                          className="rounded-lg border px-3 font-semibold"
                        >
                          Copy
                        </button>
                      </div>
                    )}
                    {invitationError && (
                      <p className="mt-2 text-sm text-red-700">
                        {invitationError}
                      </p>
                    )}
                  </div>
                )}
              </section>

              {canEdit && user.accountState !== "PENDING_ACTIVATION" && (
                <PasswordReset user={user} request={request} />
              )}
            </div>

            {canManageRoles && (
              <form
                className="mt-4 rounded-xl border bg-white p-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  const roleIds = new FormData(event.currentTarget).getAll(
                    "roleIds",
                  );
                  if (!roleIds.length) return;
                  void request(
                    `/users/${user.id}/roles`,
                    { roleIds },
                    "User roles updated.",
                  );
                }}
              >
                <RoleChoices
                  roles={roles}
                  selected={user.roles}
                  canAssign={canAssign}
                />
                <button className="mt-3 rounded-lg bg-violet-700 px-4 py-2 font-semibold text-white">
                  Save roles
                </button>
              </form>
            )}

            <details className="mt-4 rounded-xl border bg-white p-4">
              <summary className="cursor-pointer font-semibold">
                Effective permissions ({user.permissions.length})
              </summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(
                  Object.groupBy(
                    user.permissions,
                    (code) => code.split(".")[0],
                  ),
                ).map(([group, permissions]) => (
                  <div key={group}>
                    <p className="text-xs font-bold uppercase text-violet-700">
                      {group}
                    </p>
                    <p className="mt-1 break-words text-xs leading-5 text-slate-500">
                      {permissions?.join(" · ")}
                    </p>
                  </div>
                ))}
              </div>
            </details>
          </td>
        </tr>
      )}
    </>
  );
}

function PasswordReset({
  user,
  request,
}: {
  user: User;
  request: (path: string, body: object, success: string) => Promise<boolean>;
}) {
  return (
    <form
      className="rounded-xl border bg-white p-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        const password = String(data.get("password"));
        if (password !== data.get("confirmPassword")) {
          window.alert("Passwords do not match.");
          return;
        }
        void request(
          `/users/${user.id}/password`,
          { password },
          "Password reset completed.",
        ).then((saved) => {
          if (saved) form.reset();
        });
      }}
    >
      <h3 className="font-semibold">Reset password</h3>
      <p className="mt-1 text-xs text-slate-500">
        Existing passwords are never displayed.
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <input
          name="password"
          type="password"
          required
          minLength={8}
          maxLength={128}
          autoComplete="new-password"
          placeholder="New temporary password"
          className="rounded-lg border p-2"
        />
        <input
          name="confirmPassword"
          type="password"
          required
          minLength={8}
          maxLength={128}
          autoComplete="new-password"
          placeholder="Confirm password"
          className="rounded-lg border p-2"
        />
      </div>
      <button className="mt-3 rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white">
        Reset password
      </button>
    </form>
  );
}

function RoleChoices({
  roles,
  selected,
  canAssign,
}: {
  roles: Role[];
  selected: string[];
  canAssign: (role: Role) => boolean;
}) {
  return (
    <fieldset className="grid gap-2 rounded-xl border border-slate-200 p-4 sm:grid-cols-2 lg:col-span-3 lg:grid-cols-4">
      <legend className="px-2 text-sm font-semibold">ERP roles</legend>
      {roles.map((role) => (
        <label key={role.id} className="flex items-center gap-2 text-sm">
          {!canAssign(role) && selected.includes(role.name) && (
            <input type="hidden" name="roleIds" value={role.id} />
          )}
          <input
            type="checkbox"
            name="roleIds"
            value={role.id}
            defaultChecked={selected.includes(role.name)}
            disabled={!canAssign(role)}
          />
          {role.name.replaceAll("_", " ")}
        </label>
      ))}
    </fieldset>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(
    new Date(value),
  );
}
