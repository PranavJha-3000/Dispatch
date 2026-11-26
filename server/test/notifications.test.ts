import { beforeEach, describe, expect, it } from "vitest";
import { dispatchDue } from "../src/modules/events/dispatcher.js";
import { api, makeAdmin, makeUser, resetDb } from "./helpers.js";

beforeEach(resetDb);

async function withNotification() {
  const user = await makeUser();
  const admin = await makeAdmin();
  const t = await api(user.cookie).post("/api/tickets").send({ title: "Hi", description: "Hello" });
  await api(admin.cookie).post(`/api/tickets/${t.body.id}/comments`).send({ body: "Reply" });
  await dispatchDue();
  return { user, admin, ticketId: t.body.id as string };
}

describe("notifications API", () => {
  it("lists own notifications newest-first with unreadCount and ticketId", async () => {
    const { user, ticketId } = await withNotification();
    const res = await api(user.cookie).get("/api/notifications");
    expect(res.status).toBe(200);
    expect(res.body.unreadCount).toBe(1);
    expect(res.body.items[0]).toMatchObject({ ticketId, readAt: null });
  });

  it("marks one read; another user's notification is 404", async () => {
    const { user, admin } = await withNotification();
    const id = (await api(user.cookie).get("/api/notifications")).body.items[0].id;
    expect((await api(admin.cookie).patch(`/api/notifications/${id}/read`)).status).toBe(404);
    expect((await api(user.cookie).patch(`/api/notifications/${id}/read`)).status).toBe(200);
    expect((await api(user.cookie).get("/api/notifications")).body.unreadCount).toBe(0);
  });

  it("read-all clears unread; requires auth", async () => {
    const { admin } = await withNotification();
    expect((await api(admin.cookie).get("/api/notifications")).body.unreadCount).toBeGreaterThan(0);
    expect((await api(admin.cookie).post("/api/notifications/read-all")).status).toBe(204);
    expect((await api(admin.cookie).get("/api/notifications")).body.unreadCount).toBe(0);
    expect((await api().get("/api/notifications")).status).toBe(401);
  });
});
