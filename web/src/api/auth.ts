import { request } from "./client";

export type Role = "admin" | "clinician";

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface Session {
  token: string;
  user: User;
}

export const login = async (email: string, password: string): Promise<Session> =>
  (await request<Session>("/auth/login", { method: "POST", body: { email, password } })).data;

export const register = async (name: string, email: string, password: string): Promise<Session> =>
  (await request<Session>("/auth/register", { method: "POST", body: { name, email, password } }))
    .data;

export const currentUser = async (token: string): Promise<User> =>
  (await request<{ user: User }>("/auth/me", { token })).data.user;
