import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { Prisma, type User } from "@prisma/client";
import { config } from "../../config.js";
import { prisma } from "../../db.js";
import { conflict, unauthenticated } from "../../errors.js";

export type PublicUser = { id: string; name: string; email: string; role: User["role"] };

export const toPublicUser = (u: User): PublicUser => ({ id: u.id, name: u.name, email: u.email, role: u.role });

// Verified against when the email is unknown so both failure paths cost the same.
const DUMMY_HASH = await argon2.hash("dispatch-dummy-password");

export async function register(input: { name: string; email: string; password: string }): Promise<PublicUser> {
  const passwordHash = await argon2.hash(input.password);
  try {
    const user = await prisma.user.create({
      data: { name: input.name, email: input.email, passwordHash, role: "USER" },
    });
    return toPublicUser(user);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw conflict("Email already registered");
    throw e;
  }
}

export async function login(email: string, password: string): Promise<{ token: string; user: PublicUser }> {
  const user = await prisma.user.findUnique({ where: { email } });
  const ok = await argon2.verify(user?.passwordHash ?? DUMMY_HASH, password);
  if (!user || !ok) throw unauthenticated("Invalid email or password");
  const token = jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, { algorithm: "HS256", expiresIn: "1h" });
  return { token, user: toPublicUser(user) };
}

export async function me(userId: string): Promise<PublicUser> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return toPublicUser(user);
}
