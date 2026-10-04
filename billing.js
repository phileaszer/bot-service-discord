'use strict';

const crypto = require('crypto');
const Stripe = require('stripe');
const db = require('./database/database');

const BILLING_GRACE_DAYS = Math.min(Math.max(Number.parseInt(process.env.STRIPE_PAYMENT_GRACE_DAYS || '3', 10), 0), 30);
const ENTITLED_STATUSES = new Set(['active', 'trialing']);

let stripeClient = null;

function stripe() {
    const secretKey = String(process.env.STRIPE_SECRET_KEY || '').trim();
    if (!secretKey) throw new Error('Le paiement Premium Stripe n’est pas encore configuré.');
    if (!stripeClient) {
        stripeClient = new Stripe(secretKey, {
            maxNetworkRetries: 2,
            timeout: 10000,
            telemetry: false
        });
    }
    return stripeClient;
}

function billingStatus() {
    const secretKey = String(process.env.STRIPE_SECRET_KEY || '').trim();
    const webhookSecret = String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();
    const priceId = String(process.env.STRIPE_PREMIUM_PRICE_ID || '').trim();
    return {
        provider: 'stripe',
        enabled: Boolean(secretKey && webhookSecret && priceId),
        checkoutConfigured: Boolean(secretKey && priceId),
        portalConfigured: Boolean(secretKey),
        webhookConfigured: Boolean(webhookSecret),
        priceConfigured: Boolean(priceId),
        mode: secretKey.startsWith('sk_live_') ? 'live' : (secretKey ? 'test' : 'disabled'),
        graceDays: BILLING_GRACE_DAYS
    };
}

function stripeId(value) {
    if (!value) return null;
    return typeof value === 'string' ? value : value.id || null;
}

function unixDate(value) {
    const seconds = Number(value);
    return Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : null;
}

function subscriptionPeriodEnd(subscription) {
    return unixDate(subscription.current_period_end)
        || unixDate(subscription.items?.data?.[0]?.current_period_end)
        || null;
}

function invoiceSubscriptionId(invoice) {
    return stripeId(invoice.subscription)
        || stripeId(invoice.parent?.subscription_details?.subscription)
        || null;
}

function safeExternalUrl(value) {
    try {
        const url = new URL(String(value || ''));
        return url.protocol === 'https:' ? url.toString() : null;
    } catch (error) {
        return null;
    }
}

function upsertBillingCustomer(discordUserId, customerId, email = null) {
    if (!/^\d{17,20}$/.test(String(discordUserId || '')) || !customerId) return;
    const now = new Date().toISOString();
    db.prepare(`
        INSERT INTO premium_billing_customers (
            discord_user_id, stripe_customer_id, email, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(discord_user_id) DO UPDATE SET
            stripe_customer_id = excluded.stripe_customer_id,
            email = COALESCE(excluded.email, premium_billing_customers.email),
            updated_at = excluded.updated_at
    `).run(String(discordUserId), customerId, email ? String(email).slice(0, 320) : null, now, now);
}

function billingCustomerForUser(discordUserId) {
    return db.prepare(`
        SELECT * FROM premium_billing_customers WHERE discord_user_id = ?
    `).get(String(discordUserId));
}

function subscriptionGuildId(subscription, existing = null) {
    const candidate = subscription.metadata?.guild_id || existing?.guild_id || null;
    return /^\d{17,20}$/.test(String(candidate || '')) ? String(candidate) : null;
}

function upsertSubscription(subscription, metadataFallback = {}) {
    const subscriptionId = stripeId(subscription);
    const existing = subscriptionId
        ? db.prepare('SELECT * FROM premium_billing_subscriptions WHERE stripe_subscription_id = ?').get(subscriptionId)
        : null;
    const guildId = subscriptionGuildId(subscription, existing)
        || (/^\d{17,20}$/.test(String(metadataFallback.guildId || '')) ? String(metadataFallback.guildId) : null);
    const customerId = stripeId(subscription.customer) || existing?.stripe_customer_id || metadataFallback.customerId || null;
    if (!subscriptionId || !guildId || !customerId) return null;
    const userId = String(subscription.metadata?.discord_user_id || metadataFallback.discordUserId || existing?.discord_user_id || '');
    const status = String(subscription.status || existing?.status || 'incomplete');
    const now = new Date().toISOString();
    const graceEndsAt = status === 'past_due'
        ? (existing?.grace_ends_at || new Date(Date.now() + BILLING_GRACE_DAYS * 86400000).toISOString())
        : null;
    db.prepare(`
        INSERT INTO premium_billing_subscriptions (
            stripe_subscription_id, guild_id, discord_user_id, stripe_customer_id,
            stripe_price_id, status, current_period_end, cancel_at_period_end,
            payment_failure_at, grace_ends_at, latest_invoice_id, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(stripe_subscription_id) DO UPDATE SET
            guild_id = excluded.guild_id,
            discord_user_id = COALESCE(excluded.discord_user_id, premium_billing_subscriptions.discord_user_id),
            stripe_customer_id = excluded.stripe_customer_id,
            stripe_price_id = COALESCE(excluded.stripe_price_id, premium_billing_subscriptions.stripe_price_id),
            status = excluded.status,
            current_period_end = COALESCE(excluded.current_period_end, premium_billing_subscriptions.current_period_end),
            cancel_at_period_end = excluded.cancel_at_period_end,
            payment_failure_at = CASE WHEN excluded.status IN ('active', 'trialing') THEN NULL ELSE premium_billing_subscriptions.payment_failure_at END,
            grace_ends_at = excluded.grace_ends_at,
            latest_invoice_id = COALESCE(excluded.latest_invoice_id, premium_billing_subscriptions.latest_invoice_id),
            updated_at = excluded.updated_at
    `).run(
        subscriptionId,
        guildId,
        /^\d{17,20}$/.test(userId) ? userId : null,
        customerId,
        stripeId(subscription.items?.data?.[0]?.price) || existing?.stripe_price_id || null,
        status,
        subscriptionPeriodEnd(subscription) || existing?.current_period_end || null,
        Number(Boolean(subscription.cancel_at_period_end)),
        status === 'past_due' ? (existing?.payment_failure_at || now) : null,
        graceEndsAt,
        stripeId(subscription.latest_invoice) || existing?.latest_invoice_id || null,
        unixDate(subscription.created) || existing?.created_at || now,
        now
    );
    return db.prepare('SELECT * FROM premium_billing_subscriptions WHERE stripe_subscription_id = ?').get(subscriptionId);
}

function subscriptionForInvoice(invoice) {
    const subscriptionId = invoiceSubscriptionId(invoice);
    if (subscriptionId) {
        return db.prepare('SELECT * FROM premium_billing_subscriptions WHERE stripe_subscription_id = ?').get(subscriptionId) || null;
    }
    const customerId = stripeId(invoice.customer);
    return customerId
        ? db.prepare(`
            SELECT * FROM premium_billing_subscriptions
            WHERE stripe_customer_id = ? ORDER BY datetime(updated_at) DESC LIMIT 1
        `).get(customerId) || null
        : null;
}

function upsertInvoice(invoice, forcedStatus = null) {
    const invoiceId = stripeId(invoice);
    if (!invoiceId) return null;
    const subscription = subscriptionForInvoice(invoice);
    const now = new Date().toISOString();
    const status = String(forcedStatus || invoice.status || (invoice.paid ? 'paid' : 'open'));
    db.prepare(`
        INSERT INTO premium_billing_invoices (
            stripe_invoice_id, stripe_subscription_id, guild_id, stripe_customer_id,
            status, currency, amount_due, amount_paid, amount_refunded,
            attempt_count, hosted_invoice_url, invoice_pdf, paid_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(stripe_invoice_id) DO UPDATE SET
            stripe_subscription_id = COALESCE(excluded.stripe_subscription_id, premium_billing_invoices.stripe_subscription_id),
            guild_id = COALESCE(excluded.guild_id, premium_billing_invoices.guild_id),
            stripe_customer_id = COALESCE(excluded.stripe_customer_id, premium_billing_invoices.stripe_customer_id),
            status = excluded.status,
            currency = excluded.currency,
            amount_due = excluded.amount_due,
            amount_paid = excluded.amount_paid,
            attempt_count = excluded.attempt_count,
            hosted_invoice_url = COALESCE(excluded.hosted_invoice_url, premium_billing_invoices.hosted_invoice_url),
            invoice_pdf = COALESCE(excluded.invoice_pdf, premium_billing_invoices.invoice_pdf),
            paid_at = COALESCE(excluded.paid_at, premium_billing_invoices.paid_at),
            updated_at = excluded.updated_at
    `).run(
        invoiceId,
        invoiceSubscriptionId(invoice) || subscription?.stripe_subscription_id || null,
        subscription?.guild_id || null,
        stripeId(invoice.customer),
        status,
        String(invoice.currency || '').toLowerCase() || null,
        Number(invoice.amount_due || 0),
        Number(invoice.amount_paid || 0),
        Number(invoice.attempt_count || 0),
        safeExternalUrl(invoice.hosted_invoice_url),
        safeExternalUrl(invoice.invoice_pdf),
        unixDate(invoice.status_transitions?.paid_at),
        unixDate(invoice.created) || now,
        now
    );
    return db.prepare('SELECT * FROM premium_billing_invoices WHERE stripe_invoice_id = ?').get(invoiceId);
}

function setInvoiceFailure(invoice) {
    const saved = upsertInvoice(invoice, 'payment_failed');
    const subscriptionId = saved?.stripe_subscription_id;
    if (subscriptionId) {
        const now = new Date().toISOString();
        const graceEndsAt = new Date(Date.now() + BILLING_GRACE_DAYS * 86400000).toISOString();
        db.prepare(`
            UPDATE premium_billing_subscriptions
            SET status = 'past_due', payment_failure_at = COALESCE(payment_failure_at, ?),
                grace_ends_at = COALESCE(grace_ends_at, ?),
                latest_invoice_id = ?, updated_at = ?
            WHERE stripe_subscription_id = ?
        `).run(now, graceEndsAt, saved.stripe_invoice_id, now, subscriptionId);
    }
    return saved;
}

function setInvoicePaid(invoice) {
    const saved = upsertInvoice(invoice, 'paid');
    if (saved?.stripe_subscription_id) {
        const now = new Date().toISOString();
        db.prepare(`
            UPDATE premium_billing_subscriptions
            SET status = CASE WHEN status IN ('past_due', 'incomplete', 'unpaid') THEN 'active' ELSE status END,
                payment_failure_at = NULL, grace_ends_at = NULL,
                latest_invoice_id = ?, updated_at = ?
            WHERE stripe_subscription_id = ?
        `).run(saved.stripe_invoice_id, now, saved.stripe_subscription_id);
    }
    return saved;
}

function recordRefunds(charge) {
    const invoiceId = stripeId(charge.invoice);
    const invoice = invoiceId
        ? db.prepare('SELECT * FROM premium_billing_invoices WHERE stripe_invoice_id = ?').get(invoiceId)
        : null;
    const now = new Date().toISOString();
    for (const refund of charge.refunds?.data || []) {
        db.prepare(`
            INSERT INTO premium_billing_refunds (
                stripe_refund_id, stripe_charge_id, stripe_invoice_id, guild_id,
                amount, currency, status, reason, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(stripe_refund_id) DO UPDATE SET
                status = excluded.status, reason = excluded.reason, updated_at = excluded.updated_at
        `).run(
            refund.id,
            stripeId(charge),
            invoiceId,
            invoice?.guild_id || null,
            Number(refund.amount || 0),
            String(refund.currency || charge.currency || '').toLowerCase() || null,
            String(refund.status || 'succeeded'),
            refund.reason ? String(refund.reason).slice(0, 120) : null,
            unixDate(refund.created) || now,
            now
        );
    }
    if (invoiceId) {
        const amount = db.prepare(`
            SELECT COALESCE(SUM(amount), 0) AS amount
            FROM premium_billing_refunds WHERE stripe_invoice_id = ? AND status = 'succeeded'
        `).get(invoiceId).amount;
        db.prepare('UPDATE premium_billing_invoices SET amount_refunded = ?, updated_at = ? WHERE stripe_invoice_id = ?')
            .run(Number(amount || 0), now, invoiceId);
    }
}

async function ensureInvoiceSubscription(invoice) {
    const subscriptionId = invoiceSubscriptionId(invoice);
    if (!subscriptionId) return null;
    const existing = db.prepare(`
        SELECT * FROM premium_billing_subscriptions WHERE stripe_subscription_id = ?
    `).get(subscriptionId);
    if (existing) return existing;
    const metadata = invoice.parent?.subscription_details?.metadata
        || invoice.subscription_details?.metadata
        || {};
    try {
        const subscription = await stripe().subscriptions.retrieve(subscriptionId);
        return upsertSubscription(subscription, {
            guildId: metadata.guild_id,
            discordUserId: metadata.discord_user_id,
            customerId: stripeId(invoice.customer)
        });
    } catch (error) {
        if (!metadata.guild_id) throw error;
        return upsertSubscription({
            id: subscriptionId,
            customer: invoice.customer,
            status: 'incomplete',
            metadata
        }, {
            guildId: metadata.guild_id,
            discordUserId: metadata.discord_user_id,
            customerId: stripeId(invoice.customer)
        });
    }
}

async function createCheckoutSession({ guildId, discordUserId, successUrl, cancelUrl }) {
    const status = billingStatus();
    if (!status.enabled) throw new Error('Stripe Checkout et son webhook signé doivent être configurés ensemble.');
    const existing = db.prepare(`
        SELECT stripe_subscription_id
        FROM premium_billing_subscriptions
        WHERE guild_id = ? AND status NOT IN ('canceled', 'incomplete_expired')
        ORDER BY datetime(updated_at) DESC LIMIT 1
    `).get(String(guildId));
    if (existing) {
        throw new Error('Un abonnement existe déjà pour ce serveur. Utilise le portail de facturation.');
    }
    const customer = billingCustomerForUser(discordUserId);
    const metadata = { guild_id: String(guildId), discord_user_id: String(discordUserId) };
    const payload = {
        mode: 'subscription',
        line_items: [{ price: process.env.STRIPE_PREMIUM_PRICE_ID, quantity: 1 }],
        success_url: successUrl,
        cancel_url: cancelUrl,
        client_reference_id: `${guildId}:${discordUserId}`,
        metadata,
        subscription_data: { metadata },
        allow_promotion_codes: String(process.env.STRIPE_ALLOW_PROMOTION_CODES || '').toLowerCase() === 'true',
        billing_address_collection: 'required',
        tax_id_collection: { enabled: true }
    };
    if (customer?.stripe_customer_id) payload.customer = customer.stripe_customer_id;
    const idempotencyKey = `sentinel-premium-${crypto.createHash('sha256')
        .update(`${guildId}:${process.env.STRIPE_PREMIUM_PRICE_ID}`)
        .digest('hex')}`;
    const session = await stripe().checkout.sessions.create(payload, { idempotencyKey });
    return { id: session.id, url: session.url };
}

async function createPortalSession({ discordUserId, returnUrl }) {
    const customer = billingCustomerForUser(discordUserId);
    if (!customer?.stripe_customer_id) throw new Error('Aucun compte de facturation Stripe n’est rattaché à ce compte Discord.');
    const session = await stripe().billingPortal.sessions.create({
        customer: customer.stripe_customer_id,
        return_url: returnUrl
    });
    return { url: session.url };
}

function constructWebhookEvent(rawBody, signature) {
    const secret = String(process.env.STRIPE_WEBHOOK_SECRET || '').trim();
    if (!secret) throw new Error('Le secret de webhook Stripe est absent.');
    return stripe().webhooks.constructEvent(rawBody, signature, secret);
}

async function processWebhookEvent(event, rawBody) {
    if (!event?.id || !event.type) throw new Error('Événement Stripe invalide.');
    const now = new Date().toISOString();
    const digest = crypto.createHash('sha256').update(rawBody).digest('hex');
    const existing = db.prepare(`
        SELECT status, payload_sha256, updated_at FROM premium_billing_events WHERE stripe_event_id = ?
    `).get(event.id);
    if (existing && existing.payload_sha256 !== digest) {
        throw new Error('Le même identifiant d’événement Stripe a été reçu avec un contenu différent.');
    }
    const staleProcessingAt = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    if (existing?.status === 'processed'
        || (existing?.status === 'processing' && existing.updated_at > staleProcessingAt)) {
        return { duplicate: true };
    }
    const claimed = db.prepare(`
        INSERT INTO premium_billing_events (
            stripe_event_id, event_type, livemode, payload_sha256, status,
            received_at, updated_at
        ) VALUES (?, ?, ?, ?, 'processing', ?, ?)
        ON CONFLICT(stripe_event_id) DO UPDATE SET
            status = 'processing', error_message = NULL, updated_at = excluded.updated_at
        WHERE premium_billing_events.payload_sha256 = excluded.payload_sha256
          AND (
              premium_billing_events.status = 'failed'
              OR (premium_billing_events.status = 'processing' AND premium_billing_events.updated_at <= ?)
          )
    `).run(event.id, event.type, Number(Boolean(event.livemode)), digest, now, now, staleProcessingAt).changes;
    if (!claimed) return { duplicate: true };

    try {
        const object = event.data?.object || {};
        if (event.type === 'checkout.session.completed') {
            const userId = object.metadata?.discord_user_id;
            const guildId = object.metadata?.guild_id;
            const customerId = stripeId(object.customer);
            if (userId && customerId) upsertBillingCustomer(userId, customerId, object.customer_details?.email || null);
            const subscriptionId = stripeId(object.subscription);
            if (subscriptionId) {
                const subscription = await stripe().subscriptions.retrieve(subscriptionId);
                upsertSubscription(subscription, { guildId, discordUserId: userId, customerId });
            }
        } else if (['customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted'].includes(event.type)) {
            upsertSubscription(object);
        } else if (event.type === 'invoice.paid' || event.type === 'invoice.payment_succeeded') {
            await ensureInvoiceSubscription(object);
            setInvoicePaid(object);
        } else if (['invoice.payment_failed', 'invoice.payment_action_required'].includes(event.type)) {
            await ensureInvoiceSubscription(object);
            setInvoiceFailure(object);
        } else if (['invoice.finalized', 'invoice.updated', 'invoice.voided', 'invoice.marked_uncollectible'].includes(event.type)) {
            await ensureInvoiceSubscription(object);
            upsertInvoice(object);
        } else if (event.type === 'charge.refunded') {
            recordRefunds(object);
        }
        db.prepare(`
            UPDATE premium_billing_events
            SET status = 'processed', processed_at = ?, updated_at = ?
            WHERE stripe_event_id = ?
        `).run(new Date().toISOString(), new Date().toISOString(), event.id);
        return { duplicate: false };
    } catch (error) {
        db.prepare(`
            UPDATE premium_billing_events
            SET status = 'failed', error_message = ?, updated_at = ?
            WHERE stripe_event_id = ?
        `).run(String(error.message || error).slice(0, 500), new Date().toISOString(), event.id);
        throw error;
    }
}

function hasBillingPremiumGuild(guildId, at = Date.now()) {
    const rows = db.prepare(`
        SELECT status, grace_ends_at
        FROM premium_billing_subscriptions
        WHERE guild_id = ? ORDER BY datetime(updated_at) DESC
    `).all(String(guildId));
    return rows.some(row => ENTITLED_STATUSES.has(row.status)
        || (row.status === 'past_due' && row.grace_ends_at && Date.parse(row.grace_ends_at) > at));
}

function mapSubscription(row) {
    return row ? {
        id: row.stripe_subscription_id,
        guildId: row.guild_id,
        discordUserId: row.discord_user_id,
        customerId: row.stripe_customer_id,
        priceId: row.stripe_price_id,
        status: row.status,
        entitled: ENTITLED_STATUSES.has(row.status)
            || (row.status === 'past_due' && row.grace_ends_at && Date.parse(row.grace_ends_at) > Date.now()),
        currentPeriodEnd: row.current_period_end,
        cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
        paymentFailureAt: row.payment_failure_at,
        graceEndsAt: row.grace_ends_at,
        latestInvoiceId: row.latest_invoice_id,
        updatedAt: row.updated_at
    } : null;
}

function mapInvoice(row) {
    return {
        id: row.stripe_invoice_id,
        subscriptionId: row.stripe_subscription_id,
        guildId: row.guild_id,
        status: row.status,
        currency: row.currency,
        amountDue: row.amount_due,
        amountPaid: row.amount_paid,
        amountRefunded: row.amount_refunded,
        attemptCount: row.attempt_count,
        hostedInvoiceUrl: safeExternalUrl(row.hosted_invoice_url),
        invoicePdf: safeExternalUrl(row.invoice_pdf),
        paidAt: row.paid_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function getGuildBillingSummary(guildId) {
    const subscription = db.prepare(`
        SELECT * FROM premium_billing_subscriptions
        WHERE guild_id = ?
        ORDER BY CASE status
            WHEN 'active' THEN 0
            WHEN 'trialing' THEN 1
            WHEN 'past_due' THEN 2
            ELSE 3
        END, datetime(updated_at) DESC
        LIMIT 1
    `).get(String(guildId));
    return {
        ...billingStatus(),
        subscription: mapSubscription(subscription)
    };
}

function getGuildBillingStatus(guildId) {
    const invoices = db.prepare(`
        SELECT * FROM premium_billing_invoices
        WHERE guild_id = ? ORDER BY datetime(created_at) DESC LIMIT 24
    `).all(String(guildId)).map(mapInvoice);
    return {
        ...getGuildBillingSummary(guildId),
        invoices
    };
}

function getFounderBillingOverview(limit = 50) {
    const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 100);
    const subscriptions = db.prepare(`
        SELECT * FROM premium_billing_subscriptions ORDER BY datetime(updated_at) DESC LIMIT ?
    `).all(safeLimit).map(mapSubscription);
    const invoices = db.prepare(`
        SELECT * FROM premium_billing_invoices ORDER BY datetime(created_at) DESC LIMIT ?
    `).all(safeLimit).map(mapInvoice);
    const refunds = db.prepare(`
        SELECT * FROM premium_billing_refunds ORDER BY datetime(created_at) DESC LIMIT ?
    `).all(safeLimit).map(row => ({
        id: row.stripe_refund_id,
        invoiceId: row.stripe_invoice_id,
        guildId: row.guild_id,
        amount: row.amount,
        currency: row.currency,
        status: row.status,
        reason: row.reason,
        createdAt: row.created_at
    }));
    const failedEvents = db.prepare(`
        SELECT stripe_event_id AS id, event_type AS type, error_message AS error, received_at AS receivedAt
        FROM premium_billing_events WHERE status = 'failed'
        ORDER BY datetime(received_at) DESC LIMIT 20
    `).all();
    return {
        status: billingStatus(),
        subscriptions,
        invoices,
        refunds,
        failedEvents
    };
}

module.exports = {
    billingStatus,
    constructWebhookEvent,
    createCheckoutSession,
    createPortalSession,
    getFounderBillingOverview,
    getGuildBillingSummary,
    getGuildBillingStatus,
    hasBillingPremiumGuild,
    processWebhookEvent,
    upsertBillingCustomer,
    upsertInvoice,
    upsertSubscription
};
