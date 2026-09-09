"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "./auth-provider";

const links = [
  ["Overview", "/it", []],
  ["Assets", "/it/assets", ["it.asset.view"]],
  [
    "Support Tickets",
    "/it/tickets",
    ["it.ticket.view_own", "it.ticket.view_all"],
  ],
  [
    "Access Requests",
    "/it/access-requests",
    ["it.access_request.create", "it.access_request.view"],
  ],
  ["User Accounts", "/it/users", ["user.view"]],
  ["Roles & Permissions", "/it/roles", ["role.view"]],
] as const;

export function ItNavigation() {
  const pathname = usePathname();
  const { hasPermission } = useAuth();

  return (
    <nav
      aria-label="IT & Access Management"
      className="mt-5 flex gap-2 overflow-x-auto border-b border-slate-200 pb-3"
    >
      {links
        .filter(([, , permissions]) =>
          permissions.length ? permissions.some(hasPermission) : true,
        )
        .map(([label, href]) => (
          <Link
            key={href}
            href={href}
            className={`whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold ${pathname === href ? "bg-violet-700 text-white" : "bg-white text-slate-600 hover:bg-slate-100"}`}
          >
            {label}
          </Link>
        ))}
    </nav>
  );
}
