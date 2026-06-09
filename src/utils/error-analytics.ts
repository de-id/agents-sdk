import { ApplicationError, BaseError, ErrorJson } from '@sdk/errors';
import { getErrorMessage } from './analytics';

export type ErrorAnalyticsProps = ErrorJson;

export function toErrorAnalytics(error: unknown): ErrorAnalyticsProps {
    const sdkError = error instanceof BaseError ? error : new ApplicationError(getErrorMessage(error), error);

    return sdkError.toJson();
}
