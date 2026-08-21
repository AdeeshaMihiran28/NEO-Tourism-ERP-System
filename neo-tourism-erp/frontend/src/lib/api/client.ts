const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ??
  "http://localhost:3001";

const TOKEN_KEY = "neo-tourism-erp-access-token";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly data: unknown,
    message: string,
  ) {
    super(message);
  }
}

export function getStoredToken(): string | null {
  return typeof window === "undefined" ? null : localStorage.getItem(TOKEN_KEY);
}

export function storeToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem(TOKEN_KEY);
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const { token = getStoredToken(), headers: customHeaders, ...request } = options;
  const headers = new Headers(customHeaders);

  if (request.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...request,
    headers,
    cache: "no-store",
  });
  const data: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    if (response.status === 401 && path !== "/auth/login") {
      clearToken();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("neo-auth-expired"));
      }
    }

    const message =
      typeof data === "object" &&
      data !== null &&
      "message" in data &&
      typeof data.message === "string"
        ? data.message
        : `Request failed with status ${response.status}.`;
    throw new ApiError(response.status, data, message);
  }

  return data as T;
}
