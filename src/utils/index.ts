export const noop = (..._args: unknown[]) => {};
export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export const getRandom = (length: number = 16) => {
    const arr = new Uint8Array(length);
    window.crypto.getRandomValues(arr);
    return Array.from(arr, byte => byte.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 13);
};
