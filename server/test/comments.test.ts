import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../src/db.js";
import { api, makeAdmin, makeUser, resetDb } from "./helpers.js";

beforeEach(resetDb);

async function ticketFor(cookie: string) {
  const res = await api(cookie).post("/api/tickets").send({ title: "Help", description: "Need help" });
  return res.body.id as string;
}

describe("comments", () => {
  it("owner comments; records COMMENT_ADDED with author role", async () => {
    const u = await makeUser();
    const id = await ticketFor(u.cookie);
    const res = await api(u.cookie).post(`/api/tickets/${id}/comments`).send({ body: "Any update?" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ ticketId: id, body: "Any update?", author: { id: u.user.id, role: "USER" } });
    const ev = await prisma.event.findFirstOrThrow({ where: { type: "COMMENT_ADDED" } });
    expect(ev.payload).toMatchObject({ commentId: res.body.id, authorRole: "USER" });
  });

  it("admin can respond on any ticket; list is oldest-first with authors", async () => {
    const u = await makeUser();
    const admin = await makeAdmin();
    const id = await ticketFor(u.cookie);
    await api(u.cookie).post(`/api/tickets/${id}/comments`).send({ body: "first" });
    await api(admin.cookie).post(`/api/tickets/${id}/comments`).send({ body: "second" });
    const list = await api(u.cookie).get(`/api/tickets/${id}/comments`);
    expect(list.body.map((c: { body: string }) => c.body)).toEqual(["first", "second"]);
    expect(list.body[1].author.role).toBe("ADMIN");
  });

  it("another user gets 404 on read and write", async () => {
    const a = await makeUser();
    const b = await makeUser();
    const id = await ticketFor(a.cookie);
    expect((await api(b.cookie).post(`/api/tickets/${id}/comments`).send({ body: "hi" })).status).toBe(404);
    expect((await api(b.cookie).get(`/api/tickets/${id}/comments`)).status).toBe(404);
  });

  it("rejects whitespace-only and oversize bodies", async () => {
    const u = await makeUser();
    const id = await ticketFor(u.cookie);
    expect((await api(u.cookie).post(`/api/tickets/${id}/comments`).send({ body: "   " })).status).toBe(400);
    expect((await api(u.cookie).post(`/api/tickets/${id}/comments`).send({ body: "x".repeat(5001) })).status).toBe(400);
  });

  it("stores markup verbatim (escaping is the client's job)", async () => {
    const u = await makeUser();
    const id = await ticketFor(u.cookie);
    const xss = "<img src=x onerror=alert(1)>";
    const res = await api(u.cookie).post(`/api/tickets/${id}/comments`).send({ body: xss });
    expect(res.body.body).toBe(xss);
  });
});
