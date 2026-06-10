import { BaseError, ErrorJson } from '@sdk/errors';
import { getErrorMessage } from './analytics';

export type ErrorAnalyticsProps = ErrorJson;

export function toErrorAnalytics(error: unknown): ErrorAnalyticsProps {
    if (error instanceof BaseError) {
        return error.toJson();
    }

    return { kind: 'UnknownError', message: getErrorMessage(error) || 'UnknownError' };
}
