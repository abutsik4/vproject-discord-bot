const baseUrl = process.env.WEBUI_BASE_URL || 'http://127.0.0.1:3000';
const token = process.env.WEBUI_AUTH_TOKEN || '';

function authHeaders(extra = {}) {
  if (!token) return extra;
  return {
    ...extra,
    'x-webui-token': token
  };
}

async function checkJson(pathname, expectedStatus, headers = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, { headers });
  const ok = response.status === expectedStatus;
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!ok) {
    throw new Error(
      `${pathname}: expected ${expectedStatus}, got ${response.status}${body ? ` (${JSON.stringify(body)})` : ''}`
    );
  }
}

async function checkHtml(pathname, expectedStatus) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    headers: authHeaders()
  });

  if (response.status !== expectedStatus) {
    throw new Error(`${pathname}: expected ${expectedStatus}, got ${response.status}`);
  }
}

async function checkPost(pathname, payload, expectedStatus) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: 'POST',
    headers: authHeaders({
      'Content-Type': 'application/json'
    }),
    body: JSON.stringify(payload)
  });

  if (response.status !== expectedStatus) {
    let bodyText = '';
    try {
      bodyText = await response.text();
    } catch {
      bodyText = '';
    }
    throw new Error(`${pathname}: expected ${expectedStatus}, got ${response.status} ${bodyText}`);
  }
}

async function main() {
  console.log(`Running WebUI smoke tests against ${baseUrl}`);

  await checkJson('/healthz', 200);

  await checkHtml('/', token ? 200 : 401);
  await checkHtml('/stats', token ? 200 : 401);
  await checkHtml('/embeds', token ? 200 : 401);
  await checkHtml('/auto-roles', token ? 200 : 401);
  await checkHtml('/recruitment', token ? 200 : 401);

  await checkPost(
    '/send-embed',
    {
      channelId: 'invalid-channel-id',
      title: 'Test',
      description: 'Test body',
      action: 'send'
    },
    token ? 400 : 401
  );

  await checkPost(
    '/auto-roles',
    {
      enabled: true,
      inviteCode: ['not valid code!'],
      inviteRole: ['123456789012345678']
    },
    token ? 400 : 401
  );

  await checkPost(
    '/recruitment/policy',
    {
      requestAudience: 'invalid_mode',
      categoryVisibility: 'public',
      approverRoleNames: 'P| Admin (Full), Модератор Discord',
      approverRoleIds: '',
      applySetup: false
    },
    token ? 400 : 401
  );

  console.log('✅ WebUI smoke tests passed.');
}

main().catch(error => {
  console.error(`❌ WebUI smoke tests failed: ${error.message}`);
  process.exit(1);
});
