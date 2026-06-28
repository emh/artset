// Global auth/session state.
import { signal } from "@preact/signals";
import { api } from "./api.js";

export const me = signal(null);        // { user, studio } | null
export const authReady = signal(false); // becomes true after first /me check
export const crumbs = signal([]);       // breadcrumb trail: [{ label, href? }]

export async function loadMe() {
  try {
    me.value = await api.get("/api/auth/me");
  } catch {
    me.value = null;
  } finally {
    authReady.value = true;
  }
}

export async function login(loginId, password) {
  me.value = await api.post("/api/auth/login", { login: loginId, password });
  return me.value;
}

export async function signup(fields) {
  me.value = await api.post("/api/auth/signup", fields);
  return me.value;
}

export async function logout() {
  await api.post("/api/auth/logout");
  me.value = null;
}
