/** Account-scoped Electron session permissions, network policy and navigation hardening.
 *
 * This module intentionally receives all Electron operations as dependencies. It owns
 * the security decisions and event wiring, but does not create partitions or own app state.
 */

export interface SessionSecurityPreferences {
  spellcheck?: boolean;
  allowFullscreen?: boolean;
  allowNotifications?: boolean;
  allowMicrophone?: boolean;
  allowCamera?: boolean;
  blockHttp?: boolean;
  blockPopups?: boolean;
  restrictNavigation?: boolean;
  allowLoginProviders?: boolean;
}

export interface SessionSecurityAccount {
  id: string;
  serviceId?: string;
  name?: string;
  url?: string;
  authDomains?: string[];
  isVideoHubAccount?: boolean;
  isImageHubAccount?: boolean;
  preferences?: { permissions?: Record<string, boolean | undefined> };
}

export interface SessionPermissionDetails {
  mediaTypes?: string[];
  mediaType?: string;
  requestingUrl?: string;
  embeddingOrigin?: string;
}

interface AccountWebContents {
  getURL?(): string;
  setWindowOpenHandler(handler: (details: { url: string }) => WindowOpenDecision): void;
  on(event: string, listener: (...args: any[]) => void): void;
}

interface SessionLike {
  setSpellCheckerEnabled(enabled: boolean): void;
  setPermissionCheckHandler(handler: (webContents: unknown, permission: string, requestingOrigin: string, details?: SessionPermissionDetails) => boolean): void;
  setPermissionRequestHandler(handler: (webContents: AccountWebContents | null, permission: string, callback: (allowed: boolean) => void, details?: SessionPermissionDetails) => void): void;
  on(event: 'will-download', listener: (event: unknown, item: unknown) => void): void;
  setDevicePermissionHandler?(handler: () => boolean): void;
  webRequest: {
    onBeforeRequest(filter: { urls: string[] }, listener: (details: { resourceType?: string }, callback: (response: { cancel: boolean }) => void) => void): void;
    onErrorOccurred(filter: { urls: string[] }, listener: (details: { url: string; resourceType?: string; method?: string; error?: string; isMainFrame?: boolean }) => void): void;
  };
}

interface WindowOpenDecision {
  action: 'allow' | 'deny';
  overrideBrowserWindowOptions?: Record<string, unknown>;
}

interface ChildWindowLike {
  webContents: AccountWebContents;
  on(event: 'closed', listener: () => void): void;
}

export interface AccountSessionSecurityDependencies {
  getSecurity(): SessionSecurityPreferences;
  getService(id: string | undefined): { authDomains?: string[] } | null;
  hostMatches(hostname: string, patterns: string[]): boolean;
  loginProviderHosts: string[];
  safeWebPreferences: Record<string, unknown>;
  handleWillDownload(item: unknown, accountId: string): unknown;
  openExternal(url: string): Promise<unknown>;
  getPlatform(): string;
  getSessionForAccount(account: SessionSecurityAccount): SessionLike;
  getChildWindows(): Set<ChildWindowLike>;
  getVideoHubChildWindows(): Set<ChildWindowLike>;
  getImageHubChildWindows?(): Set<ChildWindowLike>;
  notice(message: string): void;
  hostOf(url: string): string;
  warn(message: string): void;
}

export interface UrlVerdict {
  allow: boolean;
  external: boolean;
  reason: 'invalid' | 'about' | 'scheme' | 'credentials' | 'insecure' | 'unrestricted' | 'ok' | 'off-site';
}

export function createAccountSessionSecurity(dependencies: AccountSessionSecurityDependencies) {
  function allowedHostsForAccount(account: SessionSecurityAccount | null | undefined): string[] {
    const known: Record<string, string[]> = {
      chatgpt: ['chatgpt.com', 'openai.com'],
      claude: ['claude.ai', 'anthropic.com'],
      deepseek: ['deepseek.com'],
      gemini: ['gemini.google.com'],
      perplexity: ['perplexity.ai'],
      grok: ['grok.com', 'x.com', 'x.ai'],
    };
    const service = dependencies.getService(account?.serviceId);
    const configured = [
      ...(Array.isArray(service?.authDomains) ? service.authDomains : []),
      ...(Array.isArray(account?.authDomains) ? account.authDomains : []),
    ];
    try {
      const hostname = new URL(account?.url || '').hostname;
      return [...new Set([...(known[account?.serviceId || ''] || []), hostname, ...configured])];
    } catch {
      return [...new Set([...(known[account?.serviceId || ''] || []), ...configured])];
    }
  }

  function permissionAllowed(permission: string, details: SessionPermissionDetails = {}, account: SessionSecurityAccount | null = null): boolean {
    const sec = dependencies.getSecurity();
    const overrides = account?.preferences?.permissions || {};
    const override = ({ media: null, notifications: overrides.notifications, fullscreen: overrides.fullscreen } as Record<string, boolean | null | undefined>)[permission];
    if (override !== undefined && override !== null) return Boolean(override);

    switch (permission) {
      case 'clipboard-sanitized-write': return true;
      case 'clipboard-read': return false;
      case 'fullscreen': return Boolean(sec.allowFullscreen);
      case 'notifications': return Boolean(sec.allowNotifications);
      case 'media': {
        const types = Array.isArray(details.mediaTypes)
          ? details.mediaTypes
          : (details.mediaType && details.mediaType !== 'unknown' ? [details.mediaType] : []);
        const wantsAudio = types.includes('audio');
        const wantsVideo = types.includes('video');
        const mic = typeof overrides.microphone === 'boolean' ? overrides.microphone : sec.allowMicrophone;
        const cam = typeof overrides.camera === 'boolean' ? overrides.camera : sec.allowCamera;
        if (!wantsAudio && !wantsVideo) return false;
        if (wantsAudio && !mic) return false;
        if (wantsVideo && !cam) return false;
        return true;
      }
      default: return false;
    }
  }

  function configureSession(sess: SessionLike, account: SessionSecurityAccount): void {
    // Keep Electron's default User-Agent. Rewriting it to impersonate Chrome does
    // not make this an ordinary browser and can make site compatibility worse.
    try { sess.setSpellCheckerEnabled(Boolean(dependencies.getSecurity().spellcheck)); } catch { /* ignore */ }

    const hostsOk = (url: string): boolean => {
      try { return dependencies.hostMatches(new URL(url).hostname, allowedHostsForAccount(account)); } catch { return false; }
    };

    sess.setPermissionCheckHandler((_webContents, permission, requestingOrigin, details = {}) => {
      const requesting = details.requestingUrl || requestingOrigin || '';
      if (!hostsOk(requesting)) return false;
      if (details.embeddingOrigin && !hostsOk(details.embeddingOrigin)) return false;
      return permissionAllowed(permission, details, account);
    });

    sess.setPermissionRequestHandler((webContents, permission, callback, details = {}) => {
      const topUrl = webContents?.getURL?.() || '';
      const requesting = details.requestingUrl || topUrl;
      callback(hostsOk(requesting) && hostsOk(topUrl) && (!details.embeddingOrigin || hostsOk(details.embeddingOrigin)) && permissionAllowed(permission, details, account));
    });

    sess.on('will-download', (_event, item) => { dependencies.handleWillDownload(item, account.id); });
    // USB / HID / serial devices are never offered to websites.
    try { sess.setDevicePermissionHandler?.(() => false); } catch { /* ignore */ }

    // Read the HTTP restriction live so changes take effect without recreating the session.
    sess.webRequest.onBeforeRequest({ urls: ['http://*/*'] }, (details, callback) => {
      callback({ cancel: Boolean(dependencies.getSecurity().blockHttp && details.resourceType === 'mainFrame') });
    });

    // Log only failed-request metadata for trusted provider and challenge hosts. Never
    // log paths, query parameters, cookies, prompts, or request bodies.
    const diagnosticHosts = [
      ...allowedHostsForAccount(account),
      'google.com', 'gstatic.com', 'recaptcha.net', 'hcaptcha.com',
      'cloudflare.com', 'higgsfield.ai',
    ];
    sess.webRequest.onErrorOccurred({ urls: ['http://*/*', 'https://*/*'] }, (details) => {
      let hostname = '';
      try { hostname = new URL(details.url).hostname.toLowerCase(); } catch { return; }
      if (!dependencies.hostMatches(hostname, diagnosticHosts)) return;
      const resourceType = String(details.resourceType || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32);
      const method = String(details.method || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 12);
      const error = String(details.error || 'unknown').replace(/[^a-zA-Z0-9:_-]/g, '').slice(0, 80);
      dependencies.warn(`[Mad Station network] Request failed: host=${hostname} type=${resourceType} method=${method} error=${error} mainFrame=${Boolean(details.isMainFrame)}`);
    });
  }

  function openExternalSafe(url: string): Promise<boolean> {
    return (async () => {
      try {
        const parsed = new URL(String(url || '').trim());
        if (!['https:', 'http:'].includes(parsed.protocol)) return false;
        if (parsed.username || parsed.password || !parsed.hostname) return false;
        // Electron documents a 2,081-character URL limit for shell.openExternal on Windows.
        if (dependencies.getPlatform() === 'win32' && parsed.href.length > 2081) {
          dependencies.warn(`[Mad Station auth] External URL not opened: Windows URL length limit exceeded (length=${parsed.href.length}).`);
          return false;
        }
        await dependencies.openExternal(parsed.href);
        return true;
      } catch {
        return false;
      }
    })();
  }

  function isGoogleAuthUrl(rawUrl: string): boolean {
    try {
      const parsed = new URL(String(rawUrl || ''));
      return parsed.protocol === 'https:' && dependencies.hostMatches(parsed.hostname, ['accounts.google.com']);
    } catch {
      return false;
    }
  }

  function externalEntryUrlForAccount(account: SessionSecurityAccount | null | undefined): string {
    try {
      const parsed = new URL(String(account?.url || ''));
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !parsed.hostname) return '';
      return `${parsed.origin}/`;
    } catch {
      return '';
    }
  }

  function externalUrlForPage(rawUrl: string, account?: SessionSecurityAccount | null): string {
    try {
      const parsed = new URL(String(rawUrl || ''));
      if (parsed.protocol !== 'https:') return rawUrl;
      const q = parsed.searchParams;
      const authHost = isGoogleAuthUrl(parsed.href) || /(^|\.)(auth|login|accounts|signin|sso)\./i.test(parsed.hostname);
      const authPath = /\/(authorize|oauth2?|signin|sign-in|login|callback|api\/auth|u\/login)(\/|$)/i.test(parsed.pathname);
      const authQuery = q.has('state') && (q.has('client_id') || q.has('code') || q.has('redirect_uri'));
      if (authHost || authPath || authQuery) return externalEntryUrlForAccount(account) || `${parsed.origin}/`;
    } catch { /* fall through to the original URL */ }
    return rawUrl;
  }

  async function openGoogleAuthFallback(account: SessionSecurityAccount): Promise<boolean> {
    const entryUrl = externalEntryUrlForAccount(account);
    const opened = entryUrl ? await openExternalSafe(entryUrl) : false;
    dependencies.notice(opened
      ? `Google sign-in must finish in a regular browser: Google blocks sign-in inside apps. Opened ${dependencies.hostOf(entryUrl)} there, but that login will not be copied into Mad Station. To sign in here, use email/password or a Microsoft or Apple account instead.`
      : 'Google sign-in must finish in a regular browser: Google blocks sign-in inside apps, and that login will not be copied into Mad Station. To sign in here, use email/password or a Microsoft or Apple account instead.');
    return opened;
  }

  function evaluateUrl(rawUrl: string, account: SessionSecurityAccount, restrictHosts: boolean): UrlVerdict {
    let parsed: URL;
    try { parsed = new URL(rawUrl); } catch { return { allow: false, external: false, reason: 'invalid' }; }
    const sec = dependencies.getSecurity();
    if (parsed.protocol === 'about:') return { allow: String(rawUrl) === 'about:blank', external: false, reason: 'about' };
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return { allow: false, external: false, reason: 'scheme' };
    if (parsed.username || parsed.password) return { allow: false, external: false, reason: 'credentials' };
    if (parsed.protocol === 'http:' && sec.blockHttp) return { allow: false, external: false, reason: 'insecure' };
    if (!restrictHosts) return { allow: true, external: false, reason: 'unrestricted' };
    const known = dependencies.hostMatches(parsed.hostname, allowedHostsForAccount(account))
      || (sec.allowLoginProviders && dependencies.hostMatches(parsed.hostname, dependencies.loginProviderHosts));
    return { allow: Boolean(known), external: !known && parsed.protocol === 'https:', reason: known ? 'ok' : 'off-site' };
  }

  function hardenAccountContents(contents: AccountWebContents, account: SessionSecurityAccount, browserSession: SessionLike = dependencies.getSessionForAccount(account)): void {
    contents.setWindowOpenHandler((details) => {
      // Do not forward an in-progress Google OAuth transaction to another browser.
      if (isGoogleAuthUrl(details.url)) {
        void openGoogleAuthFallback(account);
        return { action: 'deny' };
      }
      const verdict = evaluateUrl(details.url, account, Boolean(dependencies.getSecurity().blockPopups));
      if (verdict.allow) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            autoHideMenuBar: true,
            session: browserSession,
            webPreferences: { ...dependencies.safeWebPreferences, session: browserSession },
          },
        };
      }
      if (verdict.external) {
        void openExternalSafe(details.url).then((opened) => {
          dependencies.notice(opened ? `Opened ${dependencies.hostOf(details.url)} in your browser instead.` : 'Could not open that link in your browser.');
        });
      } else if (verdict.reason !== 'about') {
        dependencies.notice(`Blocked a popup to ${dependencies.hostOf(details.url)}.`);
      }
      return { action: 'deny' };
    });

    const guardNavigation = (event: any, legacyUrl?: string): void => {
      // Do not divert third-party iframe redirects to the system browser.
      if (event && event.isMainFrame === false) return;
      const target = typeof event.url === 'string' ? event.url : legacyUrl;
      if (!target) { event.preventDefault(); return; }
      if (isGoogleAuthUrl(target)) {
        event.preventDefault();
        void openGoogleAuthFallback(account);
        return;
      }
      const verdict = evaluateUrl(target, account, Boolean(dependencies.getSecurity().restrictNavigation));
      if (verdict.allow) return;
      event.preventDefault();
      if (verdict.external) {
        void openExternalSafe(target).then((opened) => {
          dependencies.notice(opened ? `Opened ${dependencies.hostOf(target)} in your browser instead.` : 'Could not open that link in your browser.');
        });
      } else {
        dependencies.notice(`Blocked navigation to ${dependencies.hostOf(target)}.`);
      }
    };
    contents.on('will-navigate', guardNavigation);
    contents.on('will-redirect', guardNavigation);

    contents.on('did-create-window', (child: ChildWindowLike) => {
      dependencies.getChildWindows().add(child);
      if (account?.isVideoHubAccount) dependencies.getVideoHubChildWindows().add(child);
      if (account?.isImageHubAccount) dependencies.getImageHubChildWindows?.().add(child);
      child.on('closed', () => {
        dependencies.getChildWindows().delete(child);
        dependencies.getVideoHubChildWindows().delete(child);
        dependencies.getImageHubChildWindows?.().delete(child);
      });
      // Popups retain the exact partition of their owner, including Video Hub.
      hardenAccountContents(child.webContents, account, browserSession);
    });
  }

  return {
    allowedHostsForAccount,
    permissionAllowed,
    configureSession,
    openExternalSafe,
    isGoogleAuthUrl,
    externalEntryUrlForAccount,
    externalUrlForPage,
    openGoogleAuthFallback,
    evaluateUrl,
    hardenAccountContents,
  };
}
