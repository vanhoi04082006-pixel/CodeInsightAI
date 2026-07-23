// CodeInsight AI — Stripe billing integration
// NOTE: Requires `stripe` package: bun add stripe
// NOTE: Requires STRIPE_SECRET_KEY env var

import Stripe from "stripe";

// Lazy init — only creates client if STRIPE_SECRET_KEY is set
let stripeClient: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (!stripeClient && process.env.STRIPE_SECRET_KEY) {
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2024-06-20" as any,
    });
  }
  return stripeClient;
}

// Product/Price IDs — set these in env vars after creating products in Stripe Dashboard
export const STRIPE_PRICES = {
  pro: process.env.STRIPE_PRICE_PRO || "",
  team: process.env.STRIPE_PRICE_TEAM || "",
};

/**
 * Create a Stripe Checkout Session for upgrading to a plan.
 */
export async function createCheckoutSession(
  userId: string,
  email: string | null | undefined,
  plan: "pro" | "team",
  successUrl: string,
  cancelUrl: string,
): Promise<{ url: string } | null> {
  const stripe = getStripe();
  if (!stripe) return null;

  const priceId = STRIPE_PRICES[plan];
  if (!priceId) return null;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    payment_method_types: ["card"],
    customer_email: email ?? undefined,
    line_items: [{ price: priceId, quantity: 1 }],
    client_reference_id: userId,
    success_url: `${successUrl}?status=success&plan=${plan}`,
    cancel_url: `${cancelUrl}?status=cancelled`,
    metadata: { userId, plan },
  });

  return { url: session.url ?? "" };
}

/**
 * Create a Stripe Billing Portal session (manage subscription).
 */
export async function createPortalSession(
  customerId: string,
  returnUrl: string,
): Promise<{ url: string } | null> {
  const stripe = getStripe();
  if (!stripe) return null;

  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });

  return { url: session.url };
}

/**
 * Handle Stripe webhook events.
 */
export async function handleWebhookEvent(
  rawBody: string,
  signature: string,
): Promise<{ received: boolean }> {
  const stripe = getStripe();
  if (!stripe) return { received: false };

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) return { received: false };

  const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id;
      const plan = session.metadata?.plan ?? "free";

      if (userId) {
        // Update user plan + stripe customer ID
        const { db } = await import("@/lib/db");
        await db.user.update({
          where: { id: userId },
          data: {
            plan,
            stripeCustomerId: session.customer as string,
          },
        });
      }
      break;
    }

    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId = subscription.customer as string;

      // Find user by stripe customer ID
      const { db } = await import("@/lib/db");
      const user = await db.user.findFirst({
        where: { stripeCustomerId: customerId },
      });

      if (user) {
        // If subscription is canceled, revert to free
        const newPlan = subscription.status === "active" ? user.plan : "free";
        await db.user.update({
          where: { id: user.id },
          data: { plan: newPlan },
        });
      }
      break;
    }

    default:
      // Unhandled event — log but don't error
      break;
  }

  return { received: true };
}
