import { sleep } from '.';

interface RetryOptions {
    limit?: number;
    delayMs?: number;
    timeout?: number;
    timeoutErrorMessage?: string;
    shouldRetryFn?: (error: any) => boolean;
    onRetry?: (error: any) => void;
}

function createRacePromise(timeout: number, timeoutErrorMessage: string) {
    let timeId: ReturnType<typeof setTimeout> | undefined;

    const promise = new Promise<never>((_, reject) => {
        timeId = setTimeout(() => reject(new Error(timeoutErrorMessage)), timeout);
    });

    return {
        promise,
        clear: () => clearTimeout(timeId),
    };
}

/**
 * Utility function to retry a promise operation with configurable retry logic
 *
 * @param operation - A function that returns a Promise to be retried
 * @param userOptions - Configuration options for retry behavior
 * @param userOptions.limit - Maximum number of retry attempts (default: 3)
 * @param userOptions.delayMs - Delay between retries in milliseconds (default: 0, no delay)
 * @param userOptions.timeout - Timeout for each attempt in milliseconds (default: 30000, set 0 to disable)
 * @param userOptions.timeoutErrorMessage - Custom timeout error message
 * @param userOptions.shouldRetryFn - Function to determine if retry should occur based on error, that will force throw even if limit is not reached when returns "false"
 *
 * @returns Promise that resolves with the operation result or rejects with the last error
 *
 * @throws {Error} Last error encountered after all retries are exhausted
 * @throws {Error} Timeout error if operation exceeds specified timeout
 *
 * @example
 * // With custom options
 * const result = await retryOperation(
 *   async () => await fetch(url),
 *   {
 *     limit: 5,
 *     delayMs: 1000,
 *     timeout: 5000,
 *     shouldRetryFn: (error) => error.status === 429
 *   }
 * );
 */
export async function retryOperation<T>(operation: () => Promise<T>, userOptions?: RetryOptions): Promise<T> {
    const options: Required<RetryOptions> = {
        limit: userOptions?.limit ?? 3,
        delayMs: userOptions?.delayMs ?? 0,
        timeout: userOptions?.timeout ?? 30000,
        timeoutErrorMessage: userOptions?.timeoutErrorMessage || 'Timeout error',
        shouldRetryFn: userOptions?.shouldRetryFn ?? (() => true),
        onRetry: userOptions?.onRetry ?? (() => {}),
    };

    let lastError: any;
    for (let attempt = 1; attempt <= options.limit; attempt++) {
        try {
            if (!options.timeout) {
                return await operation();
            }

            const { promise, clear } = createRacePromise(options.timeout, options.timeoutErrorMessage);
            const operationPromise = operation().finally(clear);

            return await Promise.race([operationPromise, promise]);
        } catch (error) {
            lastError = error;

            if (!options.shouldRetryFn(error) || attempt >= options.limit) {
                throw error;
            }

            await sleep(options.delayMs);

            options.onRetry(error);
        }
    }

    throw lastError;
}
