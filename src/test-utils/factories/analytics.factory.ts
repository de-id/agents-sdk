import { Factory } from 'rosie';

export const AnalyticsFactory = new Factory().attrs({
    track: () => jest.fn(),
    enrich: () => jest.fn(),
});
