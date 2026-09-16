---
title: Handling errors
category: Guides
---

# Handling errors

Every error the SDK raises is a {@link BaseError} carrying a `kind`, and {@link isDIDError} is the guard that recognises one. Inside that guard a `switch` on `kind` narrows the value to a single class and its own fields — {@link HttpError.status | status} and {@link HttpError.code | code} on an {@link HttpError}, {@link ValidationError.key | key} on a {@link ValidationError}. This guide covers the union, the two places a failure can surface, and what to log.

## The union

{@link DIDError} is the seven classes {@link isDIDError} narrows to:

| `kind` | Class | Raised when |
| --- | --- | --- |
| `'HttpError'` | {@link HttpError} | A request to the Agents API came back non-2xx. |
| `'NetworkError'` | {@link NetworkError} | A request never reached the server. |
| `'StreamError'` | {@link StreamError} | The media stream itself failed. |
| `'WSError'` | {@link WsError} | The notifications web socket failed. |
| `'ValidationError'` | {@link ValidationError} | An argument, or the state the manager is in, does not allow the call. |
| `'ChatCreationFailed'` | {@link ChatCreationFailed} | The Agents API answered a chat-creation request without a chat. |
| `'ChatModeDowngraded'` | {@link ChatModeDowngraded} | The server handled the session in a narrower {@link ChatMode} than the one asked for. |

Note that {@link WsError}'s `kind` is `'WSError'`, not `'WsError'`. {@link BaseError} itself is deliberately not a member of the union: its `kind` is a plain `string`, which matches every literal and would stop the narrowing from working.

## Narrowing with a switch

```ts
import { isDIDError } from '@d-id/client-sdk';

function describe(error: unknown): string {
    if (!isDIDError(error)) {
        throw error; // Not ours — do not swallow it.
    }

    switch (error.kind) {
        case 'HttpError':
            // `status` is the transport-level branch, `code` the Agents API's own classification.
            return error.code === 'InsufficientCreditsError'
                ? 'This account is out of credits.'
                : `The agent service answered ${error.status}.`;
        case 'NetworkError':
            return error.online === false
                ? 'You appear to be offline.'
                : `Could not reach ${error.endpoint ?? 'the agent service'}.`;
        case 'StreamError':
        case 'WSError':
            return 'The connection to the agent dropped.';
        case 'ValidationError':
            return error.message;
        case 'ChatCreationFailed':
            return 'The conversation could not be started.';
        case 'ChatModeDowngraded':
            return 'The agent is running in a limited mode.';
        default:
            // Total on purpose. To the type checker `error` is `never` here, but `isDIDError`
            // recognises any Error carrying a string `kind` — which is what lets it see across a
            // bundle boundary — so a value built by another copy of the SDK can land here with a
            // `kind` outside the union.
            return 'Something went wrong.';
    }
}
```

`error.kind` alone is enough for the `switch`; `instanceof HttpError` is not, because two copies of the SDK in one bundle define two classes and neither is `instanceof` the other. That is exactly the case {@link isDIDError} is built for.

## `code` on an HttpError

{@link HttpError.status | status} is the HTTP status. {@link HttpError.code | code} is the Agents API's own classification, read from D-ID's `{ kind, description }` error body, and `'HttpError'` when the response was not that envelope. It is a plain `string` because the set belongs to the API and grows without an SDK release, so branch on the codes you care about and fall through on the rest.

```ts
if (isDIDError(error) && error.kind === 'HttpError') {
    if (error.code === 'InsufficientCreditsError') {
        showTopUpDialog();
    } else if (error.status === 401 || error.status === 403) {
        // A client key that is not authorized for this agent or this domain.
        refreshCredentials();
    }
}
```

In v2 the server's classification lived on `kind`. It moved to `code` in 3.0 so that `kind` could be a literal on every class and make the `switch` above narrow — see the [migration guide](https://sdk.d-id.com/documents/Migration_guide.html).

## What rejects, and what reaches onError

A failure surfaces in one of two places, and which one it is depends on the error, not on the call.

**Rejected to the caller.** {@link ValidationError} and {@link ChatCreationFailed} are thrown to whoever called the method — {@link AgentManager.chat | chat()}, {@link AgentManager.speak | speak()}, {@link AgentManager.rate | rate()}, {@link AgentManager.deleteRate | deleteRate()}, {@link AgentManager.submitFeedback | submitFeedback()}, {@link AgentManager.changeMode | changeMode()}, the Expressive-only media methods, and {@link createAgentManager} itself. They never reach {@link AgentManagerCallbacks.onError | onError}. A `ValidationError` is a programming or state error: a message that is empty or too long, a call made before `connect()`, a second `connect()` on an open session, a mode the agent does not support.

**Delivered to {@link AgentManagerCallbacks.onError | onError}.** {@link WsError}, {@link StreamError} and {@link ChatModeDowngraded} arrive only there — they have no call to reject, because nothing the application invoked caused them.

**Both.** {@link HttpError} and {@link NetworkError} are handed to `onError` *and* rejected by the method that made the request, so either place can handle them. Two caveats: for the message-send request behind `chat()` the callback may not fire, though the error is still thrown; and `connect()` retries the initialization up to three times before its failure surfaces at all, except on a `429` and on an out-of-credits response.

The practical split is to catch around the call for anything with a UI consequence at that point, and to let `onError` feed the error reporter.

## Logging: toJson()

{@link BaseError.toJson | toJson()} produces the JSON-safe {@link ErrorJson} payload, and it is what to send to a logging service. It carries only the fields the SDK deliberately exposes: never the request body, which holds the end user's own message, and never a non-`Error` cause, which could be an arbitrary object carrying credentials. A cause that *is* an `Error` contributes its message, truncated, and only when it says something the message does not.

The second argument of {@link AgentManagerCallbacks.onError | onError} is an {@link ErrorContext} — `endpoint`, `method`, `sessionId` and `streamId`, all optional — saying where the failure happened. Attach it alongside:

```ts
import { isDIDError, type AgentManagerCallbacks } from '@d-id/client-sdk';

const onError: AgentManagerCallbacks['onError'] = (error, errorData) => {
    reportToYourErrorService({
        ...(isDIDError(error) ? error.toJson() : { kind: 'Error', message: error.message }),
        ...errorData,
    });
};
```

An {@link HttpError}'s payload adds `code`, `httpStatus` and, when the failing call is known, `endpoint` and `method`; a {@link NetworkError}'s adds `endpoint`, `method`, `durationMs`, `online` and `visibility`, which between them usually say whether the request ever left the browser. `ErrorJson`'s index signature is typed `unknown`, so a key it does not declare has to be narrowed before it is used.

## A complete handler

```ts
import * as sdk from '@d-id/client-sdk';
import { isDIDError } from '@d-id/client-sdk';

const agentManager = await sdk.createAgentManager('agt_fumf1234', {
    auth: { type: 'key', clientKey: 'YOUR_CLIENT_KEY' },
    callbacks: {
        onSrcObjectReady(value) {
            videoElement.srcObject = value;
        },
        onError(error, errorData) {
            reportToYourErrorService({
                ...(isDIDError(error) ? error.toJson() : { kind: 'Error', message: error.message }),
                ...errorData,
            });

            if (isDIDError(error) && error.kind === 'ChatModeDowngraded') {
                showBanner('The agent is running in a limited mode.');
            }
        },
    },
});

try {
    await agentManager.connect();
    await agentManager.chat('What is the distance to the moon?');
} catch (error) {
    // ValidationError and ChatCreationFailed only ever arrive here.
    showBanner(describe(error));
}
```

## See also

- {@link isDIDError} and {@link DIDError} — the guard and the union it narrows to.
- {@link BaseError}, {@link BaseError.kind | kind} and {@link BaseError.toJson | toJson()}; {@link ErrorJson}.
- {@link HttpError} — {@link HttpError.status | status}, {@link HttpError.code | code}, {@link HttpError.endpoint | endpoint}.
- {@link NetworkError}, {@link StreamError}, {@link WsError}, {@link ValidationError}, {@link ChatCreationFailed}, {@link ChatModeDowngraded}.
- {@link AgentManagerCallbacks.onError | onError} and {@link ErrorContext}.
- [Chat modes](https://sdk.d-id.com/documents/Chat_modes.html) — what a downgrade means for the session.
