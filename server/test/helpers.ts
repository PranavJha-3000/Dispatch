import request from "supertest";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import type { Role } from "@prisma/client";
import { createApp, type AppOptions } from "../src/app.js";
import { prisma } from "../src/db.js";
import { config } from "../src/config.js";

export const app = createApp();
export const makeApp = (opts?: AppOptions) => createApp(opts);

export async function resetDb() {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "notifications","event_deliveries","events","comments","tickets","users" RESTART IDENTITY CASCADE',
  );
}

let counter = 0;
export async function makeUser(role: Role = "USER", overrides: { email?: string; name?: string } = {}) {
  counter += 1;
  const user = await prisma.user.create({
    data: {
      email: overrides.email ?? `${role.toLowerCase()}${counter}@example.com`,
      name: overrides.name ?? `${role} ${counter}`,
      passwordHash: await argon2.hash("password123"),
      role,
    },
  });
  return { user, cookie: cookieFor(user.id, role) };
}
export const makeAdmin = () => makeUser("ADMIN");

export function cookieFor(userId: string, role: Role, opts: jwt.SignOptions = { expiresIn: "1h" }) {
  return `dispatch_token=${jwt.sign({ sub: userId, role }, config.jwtSecret, opts)}`;
}

/** supertest wrapper that always sends the CSRF header and an optional auth cookie. */
export function api(cookie?: string, a = app) {
  const wrap = (m: "get" | "post" | "patch" | "put" | "delete") => (url: string) => {
    let r = request(a)[m](url).set("X-Requested-With", "dispatch");
    if (cookie) r = r.set("Cookie", cookie);
    return r;
  };
  return { get: wrap("get"), post: wrap("post"), patch: wrap("patch"), put: wrap("put"), delete: wrap("delete") };
}
