/**
 * Tests for retryOperation - retry sequencing, async recovery hooks and limits.
 */

import { retryOperation } from './retry-operation';

describe('retryOperation', () => {
    it('returns the result without retrying when the operation succeeds', async () => {
        const operation = jest.fn().mockResolvedValue('ok');
        const onRetry = jest.fn();

        await expect(retryOperation(operation, { onRetry })).resolves.toBe('ok');

        expect(operation).toHaveBeenCalledTimes(1);
        expect(onRetry).not.toHaveBeenCalled();
    });

    // Regression test for https://github.com/de-id/agents-sdk/issues/461:
    // `onRetry` recreates the stream (disconnect + connect) for the chat() session recovery,
    // so the next attempt must not start until it has finished.
    it('awaits onRetry before the next attempt', async () => {
        const order: string[] = [];
        let recovered = false;

        const operation = async () => {
            order.push(recovered ? 'attempt:recovered' : 'attempt:stale');

            if (!recovered) {
                throw new Error('missing or invalid session_id');
            }

            return 'ok';
        };

        const result = await retryOperation(operation, {
            limit: 2,
            delayMs: 0,
            shouldRetryFn: () => true,
            onRetry: async () => {
                // Simulates disconnect() + connect(false) taking real time.
                await new Promise(resolve => setTimeout(resolve, 50));
                recovered = true;
                order.push('onRetry:done');
            },
        });

        expect(result).toBe('ok');
        expect(order).toEqual(['attempt:stale', 'onRetry:done', 'attempt:recovered']);
    });

    it('supports a synchronous onRetry', async () => {
        const order: string[] = [];
        let recovered = false;

        const operation = async () => {
            if (!recovered) {
                order.push('attempt:stale');
                throw new Error('fail');
            }

            order.push('attempt:recovered');
            return 'ok';
        };

        await expect(
            retryOperation(operation, {
                limit: 2,
                onRetry: () => {
                    recovered = true;
                    order.push('onRetry:done');
                },
            })
        ).resolves.toBe('ok');

        expect(order).toEqual(['attempt:stale', 'onRetry:done', 'attempt:recovered']);
    });

    it('throws the operation error and skips onRetry when shouldRetryFn rejects the error', async () => {
        const error = new Error('not retryable');
        const operation = jest.fn().mockRejectedValue(error);
        const onRetry = jest.fn();

        await expect(retryOperation(operation, { limit: 3, shouldRetryFn: () => false, onRetry })).rejects.toBe(error);

        expect(operation).toHaveBeenCalledTimes(1);
        expect(onRetry).not.toHaveBeenCalled();
    });

    it('stops at the attempt limit and does not run onRetry after the last attempt', async () => {
        const error = new Error('missing or invalid session_id');
        const operation = jest.fn().mockRejectedValue(error);
        const onRetry = jest.fn();

        await expect(retryOperation(operation, { limit: 2, onRetry })).rejects.toBe(error);

        expect(operation).toHaveBeenCalledTimes(2);
        expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('rejects with the timeout error when an attempt exceeds the timeout', async () => {
        const operation = () => new Promise(resolve => setTimeout(() => resolve('too late'), 100));

        await expect(
            retryOperation(operation, { limit: 1, timeout: 10, timeoutErrorMessage: 'Chat timeout' })
        ).rejects.toThrow('Chat timeout');
    });
});
