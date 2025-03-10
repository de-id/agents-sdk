export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export const getRandom = () => Math.random().toString(16).slice(2);
