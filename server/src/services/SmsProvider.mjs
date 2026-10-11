// ---------------------------------------------------------------------------
// server/src/services/SmsProvider.mjs
//
// Thin, honest wrapper around an internet SMS provider.
//
//   * In SIMULATION mode (the default) — or whenever credentials are missing —
//     it performs NO network request and returns status SIMULATED.
//   * In REAL_SMS mode with complete credentials it POSTs to the configured
//     provider and records the raw provider response.
//   * It maps a successful HTTP response to PROVIDER_ACCEPTED, never to
//     DELIVERED — delivery is only ever confirmed by a provider webhook, which
//     this prototype does not implement. It never claims more than it knows.
//
// The provider call is injectable (fetchImpl) so tests need no network.
// ---------------------------------------------------------------------------

import { isRealSmsEnabled, realSmsDisabledReason } from '../utils/smsConfig.mjs';

export const PROVIDER_STATUS = {
  SIMULATED: 'SIMULATED',
  PROVIDER_ACCEPTED: 'PROVIDER_ACCEPTED',
  FAILED: 'FAILED',
};

/**
 * Send (or simulate) one SMS.
 * @returns {{status, sent, detail, providerResponse}}
 */
export async function sendSms({ to, message } = {}, config = {}, fetchImpl = globalThis.fetch) {
  // --- Simulation / not configured: make NO external call. ---------------
  if (!isRealSmsEnabled(config)) {
    return {
      status: PROVIDER_STATUS.SIMULATED,
      sent: false,
      detail:
        'SIMULATION mode — no SMS was sent. ' +
        (realSmsDisabledReason(config) || 'Real SMS is not enabled.'),
      providerResponse: null,
    };
  }

  if (typeof fetchImpl !== 'function') {
    return {
      status: PROVIDER_STATUS.FAILED,
      sent: false,
      detail: 'no fetch implementation available for the SMS provider call',
      providerResponse: null,
    };
  }

  try {
    const res = config.provider === 'twilio'
      ? await sendViaTwilio({ to, message }, config, fetchImpl)
      : await sendViaGeneric({ to, message }, config, fetchImpl);

    return res;
  } catch (err) {
    return {
      status: PROVIDER_STATUS.FAILED,
      sent: false,
      detail: `provider request failed: ${err && err.message ? err.message : 'unknown error'}`,
      providerResponse: null,
    };
  }
}

/** Read the provider body as parsed JSON when possible, else raw text. */
async function readProviderBody(res) {
  let text = '';
  try {
    text = await res.text();
  } catch {
    text = '';
  }
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text || null;
  }
}

/** Generic JSON provider: POST {to, message, sender} with bearer + api key. */
async function sendViaGeneric({ to, message }, config, fetchImpl) {
  const res = await fetchImpl(config.providerUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.providerApiKey}`,
      'X-Api-Key': config.providerApiKey,
    },
    body: JSON.stringify({
      to,
      message,
      sender: config.senderId || undefined,
    }),
  });

  const providerResponse = await readProviderBody(res);

  if (!res || !res.ok) {
    return {
      status: PROVIDER_STATUS.FAILED,
      sent: false,
      detail: `provider returned HTTP ${res ? res.status : 'unknown'}`,
      providerResponse,
    };
  }

  return {
    status: PROVIDER_STATUS.PROVIDER_ACCEPTED,
    sent: true,
    detail: 'Provider accepted — delivery not confirmed.',
    providerResponse,
  };
}

/**
 * Twilio-compatible provider: HTTPS form POST to the Messages endpoint with
 * HTTP Basic auth (Account SID : Auth Token). No SDK / no extra dependency.
 */
async function sendViaTwilio({ to, message }, config, fetchImpl) {
  const endpoint =
    config.providerUrl ||
    `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(config.twilioAccountSid)}/Messages.json`;

  const form = new URLSearchParams();
  form.set('To', to);
  form.set('From', config.twilioFromNumber);
  form.set('Body', message);

  const basic = Buffer.from(`${config.twilioAccountSid}:${config.twilioAuthToken}`).toString('base64');

  const res = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basic}`,
    },
    body: form.toString(),
  });

  const providerResponse = await readProviderBody(res);

  if (!res || !res.ok) {
    return {
      status: PROVIDER_STATUS.FAILED,
      sent: false,
      detail: `provider returned HTTP ${res ? res.status : 'unknown'}`,
      providerResponse,
    };
  }

  return {
    status: PROVIDER_STATUS.PROVIDER_ACCEPTED,
    sent: true,
    detail: 'Provider accepted — delivery not confirmed.',
    providerResponse,
  };
}
