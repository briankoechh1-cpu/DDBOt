import { LocalStorageConstants, LocalStorageUtils, URLUtils } from '@deriv-com/utils';
import { isStaging } from '../url/helpers';

export const APP_IDS = {
    LOCALHOST: 36300,
    TMP_STAGING: 64584,
    STAGING: 29934,
    STAGING_BE: 29934,
    STAGING_ME: 29934,
    PRODUCTION: 65555,
    PRODUCTION_BE: 65556,
    PRODUCTION_ME: 65557,
};

export const livechat_license_id = 12049137;
export const livechat_client_id = '66aa088aad5a414484c1fd1fa8a5ace7';

export const domain_app_ids: Record<string, string | number> = {
    'master.bot-standalone.pages.dev': APP_IDS.TMP_STAGING,
    'staging-dbot.deriv.com': APP_IDS.STAGING,
    'staging-dbot.deriv.be': APP_IDS.STAGING_BE,
    'staging-dbot.deriv.me': APP_IDS.STAGING_ME,
    'dbot.deriv.com': APP_IDS.PRODUCTION,
    'dbot.deriv.be': APP_IDS.PRODUCTION_BE,
    'dbot.deriv.me': APP_IDS.PRODUCTION_ME,
    // NOTE: custom Vercel domains (e.g. elitradingsite.vercel.app) intentionally have
    // no entry here. Deriv's newer alphanumeric "Registered app" IDs (e.g.
    // '33E5cSHjp6JwZDugdKGGq') are OAuth/OIDC-login-only — Deriv's own WebSocket API
    // rejects them with "InvalidAppID". Using one here would break the WebSocket
    // connection and leave the app stuck loading forever.
    // Without an entry here, these domains fall through to isTestLink() below, which
    // uses the numeric dev app_id (36300) and works correctly for the trading API.
    // Their OAuth-only app IDs are registered separately below in domain_oauth_app_ids.
    // If you register a numeric "Legacy app ID" (works for both login and trading, like
    // dbot.deriv.com's 65555) with redirect URL https://<your-domain>/callback, add it
    // here instead as: '<your-domain>': <numeric_app_id>, and remove the entry from
    // domain_oauth_app_ids below.
};

// Alphanumeric Deriv "Registered app" IDs (OAuth/OIDC login only — NOT valid for the
// WebSocket trading API, see note above). Used exclusively to make the OIDC login
// flow (requestOidcAuthentication) redirect back to the correct custom domain.
export const domain_oauth_app_ids: Record<string, string> = {
    'elitradingsite.vercel.app': '33E5cSHjp6JwZDugdKGGq',
    'ddb-ot-orpin.vercel.app': '33y32fFBvxgod1B5Kb9zK',
    'eliakim-trading-site-com-4y76.vercel.app': '33yjzVFBvxegoDiBsKb9K',
};

// Ensures the OIDC login library (@deriv-com/auth-client) picks up the correct
// domain-specific OAuth app ID. That library reads its client_id from the same
// localStorage key ('config.app_id') that our own getAppId() checks — but getAppId()
// (used for the WebSocket API) ignores non-numeric values here, so this is safe to set
// without breaking the trading connection. Call this before any requestOidcAuthentication
// / OAuth2Logout call.
//
// IMPORTANT: @deriv-com/auth-client reads this key via its own LocalStorageUtils.getValue,
// which does `JSON.parse(localStorage.getItem(key))`. A raw unquoted string fails to
// parse and silently resolves to null (falling back to the wrong default app_id, which
// breaks the OAuth redirect back to this domain). The value MUST be JSON-encoded here.
export const ensureOAuthAppId = () => {
    const oauth_app_id = domain_oauth_app_ids[window.location.hostname];
    if (oauth_app_id) {
        window.localStorage.setItem('config.app_id', JSON.stringify(oauth_app_id));
    }
};

export const getCurrentProductionDomain = () =>
    !/^staging\./.test(window.location.hostname) &&
    Object.keys(domain_app_ids).find(domain => window.location.hostname === domain);

export const isProduction = () => {
    const all_domains = Object.keys(domain_app_ids).map(domain => `(www\\.)?${domain.replace('.', '\\.')}`);
    return new RegExp(`^(${all_domains.join('|')})$`, 'i').test(window.location.hostname);
};

export const isTestLink = () => {
    return (
        window.location.origin?.includes('.binary.sx') ||
        window.location.origin?.includes('bot-65f.pages.dev') ||
        window.location.origin?.includes('.replit.dev') ||
        window.location.origin?.includes('.replit.app') ||
        window.location.origin?.includes('.repl.co') ||
        window.location.origin?.includes('.vercel.app') ||
        isLocal()
    );
};

export const isLocal = () => /localhost(:\d+)?$/i.test(window.location.hostname);

const getDefaultServerURL = () => {
    if (isTestLink()) {
        return 'ws.derivws.com';
    }

    let active_loginid_from_url;
    const search = window.location.search;
    if (search) {
        const params = new URLSearchParams(document.location.search.substring(1));
        active_loginid_from_url = params.get('acct1');
    }

    const loginid = window.localStorage.getItem('active_loginid') ?? active_loginid_from_url;
    const is_real = loginid && !/^(VRT|VRW)/.test(loginid);

    const server = is_real ? 'green' : 'blue';
    const server_url = `${server}.derivws.com`;

    return server_url;
};

export const getDefaultAppIdAndUrl = () => {
    const server_url = getDefaultServerURL();

    // Check domain-specific app_id first — takes priority over isTestLink fallback
    const current_domain = getCurrentProductionDomain() ?? '';
    if (current_domain && domain_app_ids[current_domain] !== undefined) {
        return { app_id: domain_app_ids[current_domain], server_url };
    }

    if (isTestLink()) {
        return { app_id: APP_IDS.LOCALHOST, server_url };
    }

    const app_id = domain_app_ids[current_domain] ?? APP_IDS.PRODUCTION;

    return { app_id, server_url };
};

export const getAppId = () => {
    let app_id: string | number | null = null;
    const config_app_id = window.localStorage.getItem('config.app_id');
    const current_domain = getCurrentProductionDomain() ?? '';

    // Only trust a purely numeric override here — the WebSocket trading API rejects
    // alphanumeric "Registered app" IDs (see domain_oauth_app_ids above). A non-numeric
    // value in this key means ensureOAuthAppId() set it for the OIDC login flow only.
    if (config_app_id && /^\d+$/.test(config_app_id)) {
        app_id = config_app_id;
    } else if (isStaging()) {
        app_id = APP_IDS.STAGING;
    } else if (current_domain && domain_app_ids[current_domain] !== undefined) {
        // Domain-specific app_id takes priority over isTestLink
        app_id = domain_app_ids[current_domain];
    } else if (isTestLink()) {
        app_id = APP_IDS.LOCALHOST;
    } else {
        app_id = domain_app_ids[current_domain] ?? APP_IDS.PRODUCTION;
    }

    return app_id;
};

export const getSocketURL = () => {
    const local_storage_server_url = window.localStorage.getItem('config.server_url');
    if (local_storage_server_url) return local_storage_server_url;

    const server_url = getDefaultServerURL();

    return server_url;
};

export const checkAndSetEndpointFromUrl = () => {
    if (isTestLink()) {
        const url_params = new URLSearchParams(location.search.slice(1));

        if (url_params.has('qa_server') && url_params.has('app_id')) {
            const qa_server = url_params.get('qa_server') || '';
            const app_id = url_params.get('app_id') || '';

            url_params.delete('qa_server');
            url_params.delete('app_id');

            if (/^(^(www\.)?qa[0-9]{1,4}\.deriv.dev|(.*)\.derivws\.com)$/.test(qa_server) && /^[0-9]+$/.test(app_id)) {
                localStorage.setItem('config.app_id', app_id);
                localStorage.setItem('config.server_url', qa_server.replace(/"/g, ''));
            }

            const params = url_params.toString();
            const hash = location.hash;

            location.href = `${location.protocol}//${location.hostname}${location.pathname}${
                params ? `?${params}` : ''
            }${hash || ''}`;

            return true;
        }
    }

    return false;
};

export const getDebugServiceWorker = () => {
    const debug_service_worker_flag = window.localStorage.getItem('debug_service_worker');
    if (debug_service_worker_flag) return !!parseInt(debug_service_worker_flag);

    return false;
};

export const generateOAuthURL = () => {
    const { getOauthURL } = URLUtils;
    const oauth_url = getOauthURL();
    const original_url = new URL(oauth_url);
    const hostname = window.location.hostname;

    // First priority: Check for configured server URLs (for QA/testing environments)
    const configured_server_url = (LocalStorageUtils.getValue(LocalStorageConstants.configServerURL) ||
        localStorage.getItem('config.server_url')) as string;

    const valid_server_urls = ['green.derivws.com', 'red.derivws.com', 'blue.derivws.com', 'canary.derivws.com'];

    if (
        configured_server_url &&
        (typeof configured_server_url === 'string'
            ? !valid_server_urls.includes(configured_server_url)
            : !valid_server_urls.includes(JSON.stringify(configured_server_url)))
    ) {
        original_url.hostname = configured_server_url;
    } else if (original_url.hostname.includes('oauth.deriv.')) {
        // Only remap the OAuth subdomain for known Deriv TLDs (.com / .me / .be).
        // Custom domains (e.g. *.vercel.app) must always use oauth.deriv.com.
        if (hostname.includes('.deriv.me')) {
            original_url.hostname = 'oauth.deriv.me';
        } else if (hostname.includes('.deriv.be')) {
            original_url.hostname = 'oauth.deriv.be';
        } else if (hostname.includes('.deriv.com')) {
            original_url.hostname = 'oauth.deriv.com';
        }
        // For any other domain (vercel.app, replit.dev, etc.) leave oauth.deriv.com as-is.
    }

    // Always inject the correct app_id for the current domain so that the OAuth
    // server recognises the registered redirect URL (e.g. elitradingsite.vercel.app).
    // Prefer the domain's alphanumeric OAuth-only app ID (see domain_oauth_app_ids)
    // over getAppId(), which is scoped to the numeric WebSocket-safe app ID.
    const correct_app_id = domain_oauth_app_ids[hostname] || getAppId();
    if (correct_app_id) {
        original_url.searchParams.set('app_id', String(correct_app_id));
    }

    return original_url.toString() || oauth_url;
};
