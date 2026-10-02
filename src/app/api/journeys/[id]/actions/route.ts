import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseConfig } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { isAllowedRequestOrigin } from '@/lib/request-origin';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Context = { params: Promise<{ id: string }> };
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function GET(_request: NextRequest, { params }: Context) {
  const { id } = await params;
  if (!getSupabaseConfig()) return reply({ user: null });
  try {
    const client = await createClient();
    const { data: { user }, error } = await client.auth.getUser();
    if (error && error.name !== "AuthSessionMissingError") return reply({ error: "Unable to verify your session." }, 503);
    if (!uuid.test(id)) return reply({ user: user ? { id: user.id } : null });
    const { data, error: detailError } = await client.rpc("get_journey_detail", { target_id: id });
    if (detailError) return reply({ error: "Unable to load journey actions." }, 503);
    if (!data) return reply({ error: "Journey not found." }, 404);
    const detail = data as { liked: boolean; saved: boolean; likes_count: number };
    return reply({ user: user ? { id: user.id } : null, liked: detail.liked, saved: detail.saved, likes: Number(detail.likes_count) });
  } catch { return reply({ error: "Unable to load journey actions." }, 503); }
}

export async function POST(request: NextRequest, { params }: Context) {
  // Same-origin actions; cookie authentication is never accepted cross-origin.
  if (!isAllowedRequestOrigin(request)) return reply({ error: "Invalid request origin." }, 403);
  const { id } = await params;
  if (!getSupabaseConfig()) return reply({ error: "Connect Supabase to use account actions." }, 503);
  try {
    const client = await createClient();
    const { data: { user }, error: authError } = await client.auth.getUser();
    if (authError || !user) return reply({ error: "Please log in to continue." }, 401);
    if (!uuid.test(id)) return reply({ error: "Local demo journeys are read-only. Seed the samples in Supabase to use account actions." }, 409);
    let body: { action?: string; enabled?: boolean };
    try { body = await request.json(); } catch { return reply({ error: "Invalid action." }, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body) || !["like", "save", "copy"].includes(body.action || "") || (body.action !== "copy" && typeof body.enabled !== "boolean")) return reply({ error: "Invalid action." }, 400);
    const { data: detail, error: detailError } = await client.rpc("get_journey_detail", { target_id: id });
    if (detailError) return reply({ error: "Unable to load this journey." }, 503);
    if (!detail) return reply({ error: "Journey not found." }, 404);
    if ((detail as { status: string }).status !== 'published') return reply({ error: 'Only published journeys can be liked, saved or copied.' },400);
    if (body.action === "copy") {
      const { data: copiedId, error } = await client.rpc("copy_journey", { source_id: id });
      if (error) return reply({ error: "Could not copy the journey. Please try again." }, 503);
      return reply({ copiedId });
    }
    const table = body.action === "like" ? "journey_likes" : "saved_journeys";
    const mutation = body.enabled
      ? client.from(table).upsert({ user_id: user.id, journey_id: id }, { onConflict: "user_id,journey_id", ignoreDuplicates: true })
      : client.from(table).delete().eq("user_id", user.id).eq("journey_id", id);
    const { error } = await mutation;
    if (error) return reply({ error: "Could not update this journey. Please try again." }, 503);
    const { data: updated, error: refreshError } = await client.rpc("get_journey_detail", { target_id: id });
    if (refreshError || !updated) return reply({ error: "Your action was sent, but its state could not be refreshed. Reload to check." }, 503);
    const state = updated as { liked: boolean; saved: boolean; likes_count: number };
    return reply({ liked: state.liked, saved: state.saved, likes: Number(state.likes_count) });
  } catch { return reply({ error: "The journey service is unavailable. Please try again." }, 503); }
}
