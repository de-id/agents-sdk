import { Factory } from 'rosie';

export const SocketManagerFactory = new Factory().attrs({
    disconnect: () => jest.fn(),
});
