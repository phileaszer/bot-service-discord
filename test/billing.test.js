'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'sentinel-billing-'));
process.env.DATABASE_PATH = path.join(testDirectory, 'billing.db');
process.env.DATABASE_BACKUP_ENABLED = 'false';
process.env.STRIPE_PAYMENT_GRACE_DAYS = '3';

const db = require('../database/database');
const billing = require('../billing');

const guildId = '100000000000000011';
const otherGuildId = '100000000000000012';
const userId = '100000000000000013';

test.after(() => {
    db.close();
    fs.rmSync(testDirectory, { recursive: true, force: true });
});

test('billing entitlement is isolated by guild and follows subscription status', () => {
    billing.upsertBillingCustomer(userId, 'cus_test_1', 'billing@example.test');
    billing.upsertSubscription({
        id: 'sub_test_1',
        customer: 'cus_test_1',
        status: 'active',
        metadata: { guild_id: guildId, discord_user_id: userId },
        items: { data: [{ price: { id: 'price_test_1' }, current_period_end: 1793620800 }] },
        created: 1791028800
    });
    assert.equal(billing.hasBillingPremiumGuild(guildId), true);
    assert.equal(billing.hasBillingPremiumGuild(otherGuildId), false);

    billing.upsertSubscription({
        id: 'sub_test_1',
        customer: 'cus_test_1',
        status: 'canceled',
        metadata: { guild_id: guildId, discord_user_id: userId },
        items: { data: [{ price: { id: 'price_test_1' } }] }
    });
    assert.equal(billing.hasBillingPremiumGuild(guildId), false);
});

test('invoice history is linked to the subscribed guild', () => {
    billing.upsertSubscription({
        id: 'sub_test_2',
        customer: 'cus_test_2',
        status: 'active',
        metadata: { guild_id: guildId, discord_user_id: userId },
        items: { data: [{ price: { id: 'price_test_1' } }] }
    });
    billing.upsertInvoice({
        id: 'in_test_1',
        subscription: 'sub_test_2',
        customer: 'cus_test_2',
        status: 'paid',
        currency: 'eur',
        amount_due: 999,
        amount_paid: 999,
        attempt_count: 1,
        hosted_invoice_url: 'https://invoice.stripe.test/example',
        created: 1791028800,
        status_transitions: { paid_at: 1791028860 }
    });
    const status = billing.getGuildBillingStatus(guildId);
    assert.equal(status.invoices.length, 1);
    assert.equal(status.invoices[0].amountPaid, 999);
    assert.equal(status.invoices[0].guildId, guildId);
});

test('processed Stripe events are idempotent', async () => {
    const event = {
        id: 'evt_test_1',
        type: 'customer.subscription.updated',
        livemode: false,
        data: {
            object: {
                id: 'sub_test_3',
                customer: 'cus_test_3',
                status: 'trialing',
                metadata: { guild_id: otherGuildId, discord_user_id: userId },
                items: { data: [{ price: { id: 'price_test_1' } }] }
            }
        }
    };
    const raw = Buffer.from(JSON.stringify(event));
    assert.equal((await billing.processWebhookEvent(event, raw)).duplicate, false);
    assert.equal((await billing.processWebhookEvent(event, raw)).duplicate, true);
    assert.equal(billing.hasBillingPremiumGuild(otherGuildId), true);

    const alteredRaw = Buffer.from(JSON.stringify({ ...event, created: 123 }));
    await assert.rejects(
        billing.processWebhookEvent(event, alteredRaw),
        /contenu différent/
    );
});

test('repeated payment failures do not extend the original grace period', async () => {
    billing.upsertSubscription({
        id: 'sub_test_grace',
        customer: 'cus_test_grace',
        status: 'active',
        metadata: { guild_id: guildId, discord_user_id: userId },
        items: { data: [{ price: { id: 'price_test_1' } }] }
    });
    const invoice = {
        id: 'in_test_grace',
        subscription: 'sub_test_grace',
        customer: 'cus_test_grace',
        status: 'open',
        currency: 'eur',
        amount_due: 999,
        amount_paid: 0,
        attempt_count: 1
    };
    const firstEvent = {
        id: 'evt_test_grace_1',
        type: 'invoice.payment_failed',
        livemode: false,
        data: { object: invoice }
    };
    await billing.processWebhookEvent(firstEvent, Buffer.from(JSON.stringify(firstEvent)));
    const firstGraceEnd = billing.getGuildBillingSummary(guildId).subscription.graceEndsAt;

    const secondEvent = {
        ...firstEvent,
        id: 'evt_test_grace_2',
        data: { object: { ...invoice, attempt_count: 2 } }
    };
    await billing.processWebhookEvent(secondEvent, Buffer.from(JSON.stringify(secondEvent)));
    assert.equal(billing.getGuildBillingSummary(guildId).subscription.graceEndsAt, firstGraceEnd);
});
