"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { ApiError, apiFetch } from "@/lib/api/client";
import { useAuth } from "./auth-provider";
import { ItNavigation } from "./it-navigation";
import { StatusBadge } from "./status-badge";

type Position = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  isActive: boolean;
};
type Role = { id: string; name: string };
type Mapping = {
  id: string;
  positionId: string;
  roleId: string;
  requiresApproval: boolean;
  isActive: boolean;
  approvalEnforced?: boolean;
  position: { id: string; code: string; title: string };
  role: { id: string; name: string };
};

export function PositionAccessWorkspace() {
  const { hasPermission } = useAuth();
  const [positions, setPositions] = useState<Position[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [filter, setFilter] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const canManageMappings = hasPermission("role.manage");
  const canManagePositions = hasPermission("hr.position.manage");

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const [positionRows, mappingRows, roleRows] = await Promise.all([
        apiFetch<Position[]>("/positions"),
        apiFetch<Mapping[]>("/positions/mappings"),
        hasPermission("role.view")
          ? apiFetch<Role[]>("/roles")
          : Promise.resolve([] as Role[]),
      ]);
      setPositions(positionRows);
      setMappings(mappingRows);
      setRoles(roleRows);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Unable to load position access data.",
      );
    } finally {
      setBusy(false);
    }
  }, [hasPermission]);
  useEffect(() => {
    void Promise.resolve().then(load);
  }, [load]);

  async function submit(
    path: string,
    body: object,
    method = "POST",
    success = "Saved successfully.",
  ) {
    setMessage("");
    setError("");
    try {
      const result = (await apiFetch<unknown>(path, {
        method,
        body: JSON.stringify(body),
      })) as { approvalEnforced?: boolean };
      setMessage(
        result && result.approvalEnforced
          ? `${success} Privileged role: automatic grant blocked, approval required.`
          : success,
      );
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Request failed.");
    }
  }

  async function remove(path: string, label: string) {
    if (!window.confirm(`Delete ${label}?`)) return;
    setMessage("");
    setError("");
    try {
      await apiFetch(path, { method: "DELETE" });
      setMessage("Deleted. Affected employees were re-synchronised.");
      await load();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Request failed.");
    }
  }

  const visibleMappings = filter
    ? mappings.filter((mapping) => mapping.positionId === filter)
    : mappings;

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
      <header>
        <p className="text-sm font-medium text-violet-700">
          IT &amp; Access Management
        </p>
        <h1 className="mt-1 text-3xl font-semibold text-slate-950">
          Position Access Mapping
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Positions are HR master data. Which ERP roles a position grants
          automatically — and which require approval — is controlled here by
          access administrators. HR changing an employee&apos;s position
          synchronises only automatically-managed roles; manually assigned
          roles are never touched.
        </p>
      </header>
      <ItNavigation />
      {message && (
        <p className="mt-5 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
          {message}
        </p>
      )}
      {error && (
        <p className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {busy ? (
        <p className="mt-8 rounded-2xl border bg-white p-10 text-center text-slate-500">
          Loading…
        </p>
      ) : (
        <>
          <section className="mt-6 rounded-2xl border bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-semibold">Positions</h2>
              <select
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                aria-label="Filter mappings by position"
                className="h-10 rounded-lg border px-3 text-sm"
              >
                <option value="">All positions</option>
                {positions.map((position) => (
                  <option key={position.id} value={position.id}>
                    {position.code} — {position.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr>
                    {["Code", "Title", "Status", "Auto roles", "Actions"].map(
                      (heading) => (
                        <th key={heading} className="bg-slate-50 px-4 py-3">
                          {heading}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {positions.map((position) => {
                    const auto = mappings.filter(
                      (mapping) =>
                        mapping.positionId === position.id &&
                        mapping.isActive &&
                        !mapping.requiresApproval,
                    );
                    return (
                      <tr key={position.id} className="border-t">
                        <td className="px-4 py-3 font-semibold">
                          {position.code}
                        </td>
                        <td className="px-4 py-3">{position.title}</td>
                        <td className="px-4 py-3">
                          <StatusBadge
                            status={position.isActive ? "ACTIVE" : "INACTIVE"}
                          />
                        </td>
                        <td className="px-4 py-3">
                          {auto.length
                            ? auto.map((m) => m.role.name).join(", ")
                            : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            {canManageMappings && (
                              <button
                                type="button"
                                onClick={() =>
                                  void submit(
                                    `/positions/${position.id}/sync`,
                                    {},
                                    "POST",
                                    "Position re-synchronised.",
                                  )
                                }
                                className="font-semibold text-cyan-700 hover:text-cyan-900"
                              >
                                Sync now
                              </button>
                            )}
                            {canManagePositions && position.isActive && (
                              <button
                                type="button"
                                onClick={() =>
                                  void submit(
                                    `/positions/${position.id}`,
                                    { isActive: false },
                                    "PATCH",
                                    "Position deactivated.",
                                  )
                                }
                                className="font-semibold text-amber-700 hover:text-amber-900"
                              >
                                Deactivate
                              </button>
                            )}
                            {canManagePositions && !position.isActive && (
                              <button
                                type="button"
                                onClick={() =>
                                  void submit(
                                    `/positions/${position.id}`,
                                    { isActive: true },
                                    "PATCH",
                                    "Position reactivated.",
                                  )
                                }
                                className="font-semibold text-emerald-700 hover:text-emerald-900"
                              >
                                Reactivate
                              </button>
                            )}
                            {canManagePositions && (
                              <button
                                type="button"
                                onClick={() =>
                                  void remove(
                                    `/positions/${position.id}`,
                                    `${position.code} and its mappings`,
                                  )
                                }
                                className="font-semibold text-red-700 hover:text-red-900"
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!positions.length && (
                <p className="p-10 text-center text-sm text-slate-500">
                  No positions defined yet.
                </p>
              )}
            </div>
          </section>

          <section className="mt-6 rounded-2xl border bg-white p-5 shadow-sm">
            <h2 className="font-semibold">Position → Role mappings</h2>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr>
                    {["Position", "Role", "Mode", "Status", "Actions"].map(
                      (heading) => (
                        <th key={heading} className="bg-slate-50 px-4 py-3">
                          {heading}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {visibleMappings.map((mapping) => (
                    <tr key={mapping.id} className="border-t">
                      <td className="px-4 py-3 font-semibold">
                        {mapping.position.code}
                      </td>
                      <td className="px-4 py-3">{mapping.role.name}</td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          status={
                            mapping.requiresApproval
                              ? "APPROVAL_REQUIRED"
                              : "AUTOMATIC"
                          }
                        />
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          status={mapping.isActive ? "ACTIVE" : "INACTIVE"}
                        />
                      </td>
                      <td className="px-4 py-3">
                        {canManageMappings && (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                void submit(
                                  `/positions/mappings/${mapping.id}`,
                                  {
                                    requiresApproval:
                                      !mapping.requiresApproval,
                                  },
                                  "PATCH",
                                  "Mapping updated. Affected employees were re-synchronised.",
                                )
                              }
                              className="font-semibold text-cyan-700 hover:text-cyan-900"
                            >
                              {mapping.requiresApproval
                                ? "Make automatic"
                                : "Require approval"}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void submit(
                                  `/positions/mappings/${mapping.id}`,
                                  { isActive: !mapping.isActive },
                                  "PATCH",
                                  "Mapping updated. Affected employees were re-synchronised.",
                                )
                              }
                              className="font-semibold text-amber-700 hover:text-amber-900"
                            >
                              {mapping.isActive ? "Deactivate" : "Reactivate"}
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                void remove(
                                  `/positions/mappings/${mapping.id}`,
                                  `mapping ${mapping.position.code} → ${mapping.role.name}`,
                                )
                              }
                              className="font-semibold text-red-700 hover:text-red-900"
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!visibleMappings.length && (
                <p className="p-10 text-center text-sm text-slate-500">
                  No mappings defined yet. With no mappings, position changes
                  never alter access.
                </p>
              )}
            </div>
          </section>

          {canManagePositions && (
            <PositionForm
              onSubmit={(body) => submit("/positions", body)}
            />
          )}
          {canManageMappings && (
            <MappingForm
              positions={positions}
              roles={roles}
              onSubmit={(body) => submit("/positions/mappings", body)}
            />
          )}
        </>
      )}
    </div>
  );
}

function PositionForm({
  onSubmit,
}: {
  onSubmit: (body: object) => Promise<void>;
}) {
  async function handle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit(Object.fromEntries(new FormData(event.currentTarget)));
    event.currentTarget.reset();
  }
  return (
    <details className="group mt-6 overflow-hidden rounded-2xl border bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 font-semibold [&::-webkit-details-marker]:hidden">
        <span>Add position (HR master data)</span>
        <span className="text-xl transition-transform group-open:rotate-45">
          +
        </span>
      </summary>
      <form
        onSubmit={handle}
        className="grid gap-3 border-t bg-slate-50/40 p-5 sm:grid-cols-3"
      >
        <input
          name="code"
          required
          maxLength={40}
          placeholder="Code, e.g. SALES_EXEC"
          onChange={(event) => {
            event.target.value = event.target.value.toUpperCase();
          }}
          className="rounded-lg border p-2"
        />
        <input
          name="title"
          required
          maxLength={120}
          placeholder="Title, e.g. Sales Executive"
          className="rounded-lg border p-2"
        />
        <input
          name="description"
          maxLength={1000}
          placeholder="Description (optional)"
          className="rounded-lg border p-2"
        />
        <button className="rounded-lg bg-violet-700 px-4 py-2 font-semibold text-white sm:col-span-3">
          Add position
        </button>
      </form>
    </details>
  );
}

function MappingForm({
  positions,
  roles,
  onSubmit,
}: {
  positions: Position[];
  roles: Role[];
  onSubmit: (body: object) => Promise<void>;
}) {
  async function handle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSubmit(mappingFormValues(event.currentTarget));
    event.currentTarget.reset();
  }
  return (
    <details className="group mt-6 overflow-hidden rounded-2xl border bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 font-semibold [&::-webkit-details-marker]:hidden">
        <span>Map position to role (access administrators only)</span>
        <span className="text-xl transition-transform group-open:rotate-45">
          +
        </span>
      </summary>
      <form
        onSubmit={handle}
        className="grid gap-3 border-t bg-slate-50/40 p-5 sm:grid-cols-4"
      >
        <select name="positionId" required className="rounded-lg border p-2">
          <option value="">Select position</option>
          {positions
            .filter((position) => position.isActive)
            .map((position) => (
              <option key={position.id} value={position.id}>
                {position.code} — {position.title}
              </option>
            ))}
        </select>
        <select name="roleId" required className="rounded-lg border p-2">
          <option value="">Select role</option>
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 rounded-lg border bg-white px-3 text-sm">
          <input type="checkbox" name="requiresApproval" value="true" />
          Requires approval
        </label>
        <button className="rounded-lg bg-violet-700 px-4 py-2 font-semibold text-white">
          Add mapping
        </button>
      </form>
    </details>
  );
}

function mappingFormValues(form: HTMLFormElement) {
  const values = new FormData(form);
  return {
    positionId: values.get("positionId"),
    roleId: values.get("roleId"),
    requiresApproval: values.get("requiresApproval") === "true",
  };
}
