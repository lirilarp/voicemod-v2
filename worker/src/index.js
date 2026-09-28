const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

const TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const id = env.APP_STATE.idFromName('global');
    const stub = env.APP_STATE.get(id);
    return stub.fetch(request);
  },
};

export class AppState {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    try {
      const url = new URL(request.url);

      if (request.method === 'GET' && url.pathname === '/api/health') {
        return this.json({ ok: true, service: 'voicemod-v2-worker' });
      }

      if (request.method === 'POST' && url.pathname === '/api/auth/register') {
        const body = await this.readJson(request);
        return this.register(body);
      }

      if (request.method === 'POST' && url.pathname === '/api/auth/login') {
        const body = await this.readJson(request);
        return this.login(body);
      }

      if (request.method === 'GET' && url.pathname === '/api/auth/me') {
        const auth = await this.requireAuth(request);
        return this.json({ user: auth.user });
      }

      if (request.method === 'GET' && url.pathname === '/api/uploads') {
        const auth = await this.requireAuth(request);
        return this.listUploads(auth.user.id);
      }

      if (request.method === 'POST' && url.pathname === '/api/uploads') {
        const auth = await this.requireAuth(request);
        return this.uploadFile(request, auth.user.id);
      }

      if (url.pathname.startsWith('/api/uploads/')) {
        const auth = await this.requireAuth(request);
        const uploadId = decodeURIComponent(url.pathname.slice('/api/uploads/'.length));

        if (request.method === 'GET') {
          return this.getUpload(auth.user.id, uploadId);
        }

        if (request.method === 'DELETE') {
          return this.deleteUpload(auth.user.id, uploadId);
        }
      }

      if (request.method === 'GET' && url.pathname === '/api/settings') {
        const auth = await this.requireAuth(request);
        return this.getUserSettings(auth.user.id);
      }

      if (request.method === 'PUT' && url.pathname === '/api/settings') {
        const auth = await this.requireAuth(request);
        const body = await this.readJson(request);
        return this.updateUserSettings(auth.user.id, body);
      }

      if (request.method === 'GET' && url.pathname === '/api/presets') {
        const auth = await this.requireAuth(request);
        return this.getPresets(auth.user.id);
      }

      if (request.method === 'PUT' && url.pathname === '/api/presets') {
        const auth = await this.requireAuth(request);
        const body = await this.readJson(request);
        return this.updatePresets(auth.user.id, body);
      }

      if (request.method === 'GET' && url.pathname === '/api/library') {
        const auth = await this.requireAuth(request);
        return this.getLibrary(auth.user.id);
      }

      return this.error('Not found', 404);
    } catch (error) {
      return this.error(error.message || 'Internal server error', error.status || 500);
    }
  }

  async register(body) {
    const username = this.normalizeUsername(body?.username);
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!username || password.length < 8) {
      return this.error('username and password (min 8 chars) are required', 400);
    }

    const existing = await this.state.storage.get(`user:${username}`);
    if (existing) {
      return this.error('username already exists', 409);
    }

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await this.hashPassword(password, salt);
    const id = crypto.randomUUID();

    const user = {
      id,
      username,
      salt: this.toBase64(salt),
      hash,
      createdAt: new Date().toISOString(),
    };

    await this.state.storage.put(`user:${username}`, user);
    await this.state.storage.put(`userById:${id}`, { id, username, createdAt: user.createdAt });

    const session = await this.createSession(user);
    return this.json(session, 201);
  }

  async login(body) {
    const username = this.normalizeUsername(body?.username);
    const password = typeof body?.password === 'string' ? body.password : '';

    if (!username || !password) {
      return this.error('username and password are required', 400);
    }

    const user = await this.state.storage.get(`user:${username}`);
    if (!user) {
      return this.error('invalid credentials', 401);
    }

    const salt = this.fromBase64(user.salt);
    const hash = await this.hashPassword(password, salt);
    if (hash !== user.hash) {
      return this.error('invalid credentials', 401);
    }

    return this.json(await this.createSession(user));
  }

  async createSession(user) {
    const now = Date.now();
    const payload = {
      sub: user.id,
      username: user.username,
      iat: now,
      exp: now + TOKEN_TTL_MS,
      nonce: crypto.randomUUID(),
    };

    const token = await this.signPayload(payload);
    await this.state.storage.put(`session:${token}`, payload, {
      expiration: Math.floor(payload.exp / 1000),
    });

    return {
      token,
      expiresAt: new Date(payload.exp).toISOString(),
      user: { id: user.id, username: user.username },
    };
  }

  async requireAuth(request) {
    const header = request.headers.get('Authorization') || '';
    if (!header.startsWith('Bearer ')) {
      throw this.httpError('Missing bearer token', 401);
    }

    const token = header.slice(7).trim();
    const payload = await this.verifyToken(token);
    if (!payload || payload.exp < Date.now()) {
      throw this.httpError('Invalid or expired token', 401);
    }

    const savedSession = await this.state.storage.get(`session:${token}`);
    if (!savedSession) {
      throw this.httpError('Session not found', 401);
    }

    const user = await this.state.storage.get(`userById:${payload.sub}`);
    if (!user) {
      throw this.httpError('User not found', 401);
    }

    return { token, user };
  }

  async uploadFile(request, userId) {
    const contentType = request.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return this.error('Expected multipart/form-data', 400);
    }

    const form = await request.formData();
    const file = form.get('file');
    const slot = this.normalizeSlot(form.get('slot'));

    if (!(file instanceof File)) {
      return this.error('Missing file', 400);
    }

    const size = file.size;
    if (size <= 0 || size > MAX_UPLOAD_BYTES) {
      return this.error(`File size must be between 1 and ${MAX_UPLOAD_BYTES} bytes`, 400);
    }

    const uploadId = crypto.randomUUID();
    const data = await file.arrayBuffer();

    const metadata = {
      id: uploadId,
      userId,
      slot,
      filename: file.name,
      contentType: file.type || 'application/octet-stream',
      size,
      uploadedAt: new Date().toISOString(),
    };

    await this.state.storage.put(`upload:${userId}:${uploadId}:meta`, metadata);
    await this.state.storage.put(`upload:${userId}:${uploadId}:data`, data);

    return this.json({ upload: metadata }, 201);
  }

  async listUploads(userId) {
    const prefix = `upload:${userId}:`;
    const list = await this.state.storage.list({ prefix });
    const uploads = [];

    for (const [key, value] of list.entries()) {
      if (!key.endsWith(':meta')) continue;
      uploads.push(value);
    }

    uploads.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
    return this.json({ uploads });
  }

  async getUpload(userId, uploadId) {
    const metadata = await this.state.storage.get(`upload:${userId}:${uploadId}:meta`);
    const data = await this.state.storage.get(`upload:${userId}:${uploadId}:data`);

    if (!metadata || !data) {
      return this.error('Upload not found', 404);
    }

    return new Response(data, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': metadata.contentType,
        'Content-Length': String(metadata.size),
        'Content-Disposition': `inline; filename="${this.safeFilename(metadata.filename)}"`,
      },
    });
  }

  async deleteUpload(userId, uploadId) {
    const metaKey = `upload:${userId}:${uploadId}:meta`;
    const dataKey = `upload:${userId}:${uploadId}:data`;
    const metadata = await this.state.storage.get(metaKey);

    if (!metadata) {
      return this.error('Upload not found', 404);
    }

    await this.state.storage.delete(metaKey);
    await this.state.storage.delete(dataKey);
    return this.json({ deleted: true, uploadId });
  }

  async getUserSettings(userId) {
    const settings = (await this.state.storage.get(`settings:${userId}`)) || {
      masterGain: 0.9,
      monitorGain: 0.12,
      soundboardGain: 0.8,
    };
    return this.json({ settings });
  }

  async updateUserSettings(userId, body) {
    const settings = {
      masterGain: this.clampNumber(body?.masterGain, 0, 1.5, 0.9),
      monitorGain: this.clampNumber(body?.monitorGain, 0, 0.6, 0.12),
      soundboardGain: this.clampNumber(body?.soundboardGain, 0, 1.5, 0.8),
      updatedAt: new Date().toISOString(),
    };

    await this.state.storage.put(`settings:${userId}`, settings);
    return this.json({ settings });
  }

  async getPresets(userId) {
    const presets = (await this.state.storage.get(`presets:${userId}`)) || [];
    return this.json({ presets });
  }

  async updatePresets(userId, body) {
    const input = Array.isArray(body?.presets) ? body.presets : null;
    if (!input) {
      return this.error('presets must be an array', 400);
    }

    const presets = input.slice(0, 30).map((preset) => ({
      id: typeof preset?.id === 'string' ? preset.id.slice(0, 64) : crypto.randomUUID(),
      name: typeof preset?.name === 'string' ? preset.name.slice(0, 50) : 'Unnamed preset',
      values: typeof preset?.values === 'object' && preset?.values ? preset.values : {},
    }));

    await this.state.storage.put(`presets:${userId}`, presets);
    return this.json({ presets });
  }

  async getLibrary(userId) {
    const settings = (await this.state.storage.get(`settings:${userId}`)) || null;
    const presets = (await this.state.storage.get(`presets:${userId}`)) || [];
    const uploadCount = (await this.listUploads(userId)).clone();
    const uploadJson = await uploadCount.json();

    return this.json({
      summary: {
        uploads: uploadJson.uploads.length,
        presets: presets.length,
        hasSettings: Boolean(settings),
      },
      settings,
      presets,
      uploads: uploadJson.uploads,
    });
  }

  async readJson(request) {
    try {
      return await request.json();
    } catch {
      throw this.httpError('Invalid JSON body', 400);
    }
  }

  normalizeUsername(value) {
    if (typeof value !== 'string') return '';
    const username = value.trim().toLowerCase();
    if (!/^[a-z0-9_\-.]{3,32}$/.test(username)) return '';
    return username;
  }

  normalizeSlot(value) {
    if (typeof value !== 'string') return 'custom';
    const slot = value.trim().toLowerCase();
    if (!slot) return 'custom';
    return slot.slice(0, 24);
  }

  safeFilename(value) {
    return String(value || 'file').replace(/[^a-zA-Z0-9_.-]/g, '_');
  }

  clampNumber(value, min, max, fallback) {
    const number = typeof value === 'number' ? value : fallback;
    return Math.min(max, Math.max(min, number));
  }

  async signPayload(payload) {
    const encodedPayload = this.toBase64Url(JSON.stringify(payload));
    const signature = await this.hmac(encodedPayload);
    return `${encodedPayload}.${signature}`;
  }

  async verifyToken(token) {
    const [payloadPart, signaturePart] = token.split('.');
    if (!payloadPart || !signaturePart) return null;

    const expected = await this.hmac(payloadPart);
    if (expected !== signaturePart) return null;

    try {
      const payload = JSON.parse(this.fromBase64Url(payloadPart));
      return payload;
    } catch {
      return null;
    }
  }

  async hashPassword(password, saltBytes) {
    const encoder = new TextEncoder();
    const baseKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );

    const bits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: saltBytes,
        iterations: 120000,
        hash: 'SHA-256',
      },
      baseKey,
      256
    );

    return this.toBase64(new Uint8Array(bits));
  }

  async hmac(message) {
    const keyData = new TextEncoder().encode(
      this.env.AUTH_SECRET || 'voicemod-v2-default-worker-secret-change-me'
    );
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
    return this.toBase64Url(new Uint8Array(signature));
  }

  toBase64(bytes) {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      const part = bytes.subarray(i, i + chunk);
      binary += String.fromCharCode(...part);
    }
    return btoa(binary);
  }

  fromBase64(value) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  toBase64Url(value) {
    const input =
      value instanceof Uint8Array ? this.toBase64(value) : btoa(unescape(encodeURIComponent(value)));
    return input.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  }

  fromBase64Url(value) {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4);
    return decodeURIComponent(escape(atob(padded)));
  }

  json(data, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json; charset=utf-8',
      },
    });
  }

  error(message, status = 400) {
    return this.json({ error: message }, status);
  }

  httpError(message, status = 400) {
    const error = new Error(message);
    error.status = status;
    return error;
  }
}
