// Call ONLY after your backend verified the payment provider's webhook signature,
// confirmed a paid payment, and claimed the provider event ID in durable storage.
// Never accept amount/currency from a browser or put clientSecret in frontend code.
// Use a durable outbox for delivery/retries; OpenPanel is not your payment ledger.
export async function sendVerifiedRevenue({amountMinor, currency, orderId, deviceId}) {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) throw new Error('Expected nonnegative integer minor units');
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Expected uppercase ISO currency code');
  if (typeof orderId !== 'string' || !orderId) throw new Error('Expected an order ID');
  const {OPENPANEL_API_URL, OPENPANEL_CLIENT_ID, OPENPANEL_CLIENT_SECRET} = process.env;
  if (!OPENPANEL_API_URL || !OPENPANEL_CLIENT_ID || !OPENPANEL_CLIENT_SECRET) throw new Error('Missing backend OpenPanel configuration');
  const url = new URL(OPENPANEL_API_URL.replace(/\/$/, '') + '/track');
  if (url.protocol !== 'https:') throw new Error('Use an HTTPS ingestion endpoint');
  const response = await fetch(url, {
    method: 'POST',
    headers: {'Content-Type':'application/json','openpanel-client-id':OPENPANEL_CLIENT_ID,'openpanel-client-secret':OPENPANEL_CLIENT_SECRET},
    body: JSON.stringify({type:'track',payload:{name:'revenue',properties:{__revenue:amountMinor,currency,order_id:orderId,...(deviceId?{__deviceId:deviceId}:{})}}}),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`OpenPanel ingestion failed (HTTP ${response.status})`);
}
