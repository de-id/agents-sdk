export const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string;
export const nodeEnv = import.meta.env.VITE_NODE_ENV as string;
export const authDomain = import.meta.env.VITE_AUTH_DOMAIN as string;
export const authAudience = import.meta.env.VITE_AUTH_AUDIENCE as string;
export const authClientId = import.meta.env.VITE_AUTH_CLIENT_ID as string;
export const didApiUrl = import.meta.env.VITE_DID_API_URL as string;
export const didSocketApiUrl = import.meta.env.VITE_WS_ENDPOINT as string;
export const launchdarklyClientKey = import.meta.env.VITE_LAUNCHDARKLY_CLIENT_KEY as string;
export const mixpanelKey = import.meta.env.VITE_MIXPANEL_KEY as string;
export const authPassword = import.meta.env.VITE_BASIC_AUTH_PASSWORD as string;
export const authUsername = import.meta.env.VITE_BASIC_AUTH_USERNAME as string;
export const clientKey = import.meta.env.VITE_CLIENT_KEY as string;
export const agentId = import.meta.env.VITE_AGENT_ID as string;
export const externalId = 'temp' //TODO discuss later where it will be generated