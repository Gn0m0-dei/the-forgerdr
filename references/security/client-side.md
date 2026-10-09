# Client side

Use for single-page apps, server-rendered pages with client code, browser extensions, webviews and service workers.

- **DOM injection**: values from the URL, storage, messages or the API reaching `innerHTML`, `dangerouslySetInnerHTML`, `v-html`, `eval`, `new Function`, `setTimeout` with a string, `href` or `src` with `javascript:`. Trace the source, not just the sink.
- **Object pollution**: merging or assigning parsed input into objects (`__proto__`, `constructor`) that later drive a security decision.
- **Messaging**: `postMessage` handlers that do not check the origin, or check it with a loose comparison; messages that carry tokens.
- **Storage**: tokens or personal data in `localStorage` readable by any script on the origin; data left after logout.
- **Service workers**: caching authenticated responses served to the next user; scope wider than needed.
- **CORS**: reflected origins with credentials, `null` origin allowed, suffix matching on domains.
- **Navigation and framing**: clickjacking on state-changing pages that can be framed; `target=_blank` to untrusted URLs passing `window.opener` on old targets.
- A client-side check is never a control: the server must enforce the same rule.
