/**
 * Best-effort user context (location + device) resolved entirely on the client
 * and attached to the LiveKit participant as attributes on connect. The agent
 * backend reads these to enrich the LLM context (see `get_user_context`).
 *
 * `location` is the IANA timezone (e.g. `America/New_York`) — a coarse but
 * network-free location proxy. `device` is a short human-readable descriptor.
 */

function getTimezone(): string {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
    } catch {
        return '';
    }
}

function getDevice(): string {
    if (typeof navigator === 'undefined') {
        return '';
    }

    const userAgent = navigator.userAgent ?? '';
    const platform = (navigator.platform ?? '').toLowerCase();

    let os = 'Unknown';
    if (/android/i.test(userAgent)) {
        os = 'Android';
    } else if (/iphone|ipad|ipod/i.test(userAgent)) {
        os = 'iOS';
    } else if (platform.includes('win')) {
        os = 'Windows';
    } else if (platform.includes('mac')) {
        os = 'Mac OS X';
    } else if (platform.includes('linux')) {
        os = 'Linux';
    }

    const isMobile = os === 'Android' || os === 'iOS' || /Mobi/i.test(userAgent);

    return `${os}, ${isMobile ? 'Mobile' : 'Desktop'}`;
}

/**
 * Non-empty `{ timezone, device }` attributes to attach to the participant.
 * Keys with no resolvable value are omitted. The backend infers the user's
 * country from the timezone (a timezone identifies a country reliably, but its
 * reference city is not the user's actual city).
 */
export function getUserContextAttributes(): Record<string, string> {
    const attributes: Record<string, string> = {};

    const timezone = getTimezone();
    if (timezone) {
        attributes.timezone = timezone;
    }

    const device = getDevice();
    if (device) {
        attributes.device = device;
    }

    return attributes;
}
