import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";

const appBaseUrl = Deno.env.get("APP_BASE_URL") || "";
const allowedOrigin = (() => { try { return new URL(appBaseUrl).origin; } catch { return ""; } })();
const json = (body: unknown, status = 200, origin = "") => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json",
    "cache-control": "no-store",
    "access-control-allow-origin": origin && origin === allowedOrigin ? origin : "null",
    "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
    "access-control-allow-methods": "POST, OPTIONS",
    vary: "Origin",
  },
});

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin") || "";
  if (req.method === "OPTIONS") return origin === allowedOrigin && allowedOrigin
    ? new Response("ok", { headers: {
      "access-control-allow-origin": allowedOrigin,
      "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-max-age": "86400",
      vary: "Origin",
    } })
    : json({ message: "Origin not allowed." }, 403, origin);
  if (req.method !== "POST") return json({ message: "Method not allowed" }, 405, origin);
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json({ message: "Sign in to continue." }, 401, origin);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const secretKey = Deno.env.get("PAYMONGO_SECRET_KEY");
  if (!url || !serviceKey || !secretKey || !appBaseUrl) {
    return json({ message: "Online checkout is not configured yet." }, 503, origin);
  }
  const base = new URL(appBaseUrl);
  const isLoopback = ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname);
  if (base.protocol !== "https:" && !isLoopback) {
    return json({ message: "Online checkout return URL is not secure." }, 503, origin);
  }

  let body: { booking_id?: unknown; action?: unknown; attempt_id?: unknown };
  try { body = await req.json(); } catch { return json({ message: "Invalid request." }, 400, origin); }

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return json({ message: "Your session has expired. Sign in again." }, 401, origin);

  if (body.action === "status") {
    const attemptId = typeof body.attempt_id === "string" ? body.attempt_id : "";
    const { data: rows, error } = await admin.rpc("get_paymongo_checkout_attempt", {
      p_attempt_id: attemptId,
      p_customer_id: authData.user.id,
    });
    const row = Array.isArray(rows) ? rows[0] : null;
    if (error || !row) return json({ message: "Checkout not found." }, 404, origin);
    return json({ attempt_id: row.id, status: row.status }, 200, origin);
  }

  const bookingId = Number(body.booking_id);
  if (!Number.isSafeInteger(bookingId) || bookingId <= 0) return json({ message: "Invalid booking." }, 400, origin);

  const { data: prepared, error: prepareError } = await admin.rpc("prepare_paymongo_checkout", {
    p_booking_id: bookingId,
    p_customer_id: authData.user.id,
  });
  if (prepareError || !Array.isArray(prepared) || !prepared[0]) {
    const message = prepareError?.message?.includes("hourly rate")
      ? "Online checkout is unavailable until this court has an hourly rate. Your booking request is still saved."
      : "This booking is not eligible for online payment.";
    return json({ message }, 409, origin);
  }

  // Read the attempt through a narrowly scoped RPC result. Service-role use
  // is kept inside this authenticated handler; the client cannot choose a price.
  const attemptId = prepared[0].attempt_id as string;
  const { data: staleAttempt, error: staleError } = await admin.rpc("review_stale_paymongo_checkout", {
    p_attempt_id: attemptId,
    p_customer_id: authData.user.id,
  });
  if (staleError) return json({ message: "Could not verify checkout status." }, 503, origin);
  if (staleAttempt === true) {
    return json({ message: "This checkout needs staff review before another payment session can be created." }, 409, origin);
  }
  const { data: attemptRows, error: attemptError } = await admin.rpc("get_paymongo_checkout_attempt", {
    p_attempt_id: attemptId,
    p_customer_id: authData.user.id,
  });
  const attemptData = Array.isArray(attemptRows) ? attemptRows[0] : null;
  if (attemptError || !attemptData) return json({ message: "Could not prepare checkout." }, 503, origin);
  if (attemptData.status === "ready" && attemptData.checkout_url) {
    return json({ attempt_id: attemptData.id, checkout_url: attemptData.checkout_url }, 200, origin);
  }
  if (attemptData.status !== "creating") return json({ message: "This checkout needs staff review." }, 409, origin);

  const reference = String(attemptData.id).replaceAll("-", "");
  const end = new URL("/Pages/user_dashboard.html", base);
  end.searchParams.set("paymongo", "success");
  end.searchParams.set("attempt", attemptId);
  const cancel = new URL("/Pages/user_dashboard.html", base);
  cancel.searchParams.set("paymongo", "cancelled");
  cancel.searchParams.set("attempt", attemptId);
  const methodTypes = ["card"];
  const { data: settings } = await admin.from("app_settings").select("gcash_enabled").eq("id", true).maybeSingle();
  if (settings?.gcash_enabled === true) methodTypes.push("gcash");
  const requestBody = {
    data: { attributes: {
      line_items: [{
        name: `${prepared[0].courts} court reservation`,
        amount: Number(attemptData.amount_minor),
        currency: "PHP",
        quantity: 1,
      }],
      payment_method_types: methodTypes,
      success_url: end.toString(),
      cancel_url: cancel.toString(),
      reference_number: reference,
      description: `IñigoSync reservation ${reference.slice(0, 12)}`,
      pass_on_fees: false,
      send_email_receipt: false,
    } },
  };

  const basic = btoa(`${secretKey}:`);
  let providerResponse: Response;
  try {
    providerResponse = await fetch("https://api.paymongo.com/v2/checkout_sessions", {
      method: "POST",
      headers: {
        authorization: `Basic ${basic}`,
        "content-type": "application/json",
        "Idempotency-Key": attemptId,
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(12000),
    });
  } catch (error) {
    console.error("PayMongo checkout request failed", error instanceof Error ? error.message : "network error");
    return json({ message: "PayMongo could not be reached. Retry this checkout in a moment." }, 503, origin);
  }
  const providerPayload = await providerResponse.json().catch(() => null);
  const session = providerPayload?.data;
  const sessionId = session?.id;
  const checkoutUrl = session?.attributes?.checkout_url;
  const isTestKey = secretKey.startsWith("sk_test_");
  const sessionMode = session?.attributes?.livemode;
  if (!providerResponse.ok || typeof sessionId !== "string" || typeof checkoutUrl !== "string"
      || typeof sessionMode !== "boolean" || sessionMode !== !isTestKey) {
    console.error("PayMongo rejected checkout creation", providerResponse.status,
      JSON.stringify(providerPayload?.errors || []).slice(0, 1000));
    return json({ message: "PayMongo did not create the checkout. Retry or contact staff." }, 502, origin);
  }
  const { data: attached, error: attachError } = await admin.rpc("attach_paymongo_checkout", {
    p_attempt_id: attemptId,
    p_session_id: sessionId,
    p_checkout_url: checkoutUrl,
  });
  if (attachError || attached !== true) {
    // The provider session exists; never create a second logical payment.
    console.error("Could not attach PayMongo checkout session", attachError?.message || "session conflict");
    return json({ message: "Checkout was created but needs reconciliation. Contact staff with this booking." }, 503, origin);
  }
  return json({ attempt_id: attemptId, checkout_url: checkoutUrl }, 200, origin);
});
