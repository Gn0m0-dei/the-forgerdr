import { SITE } from "#config/site.ts";

/** A path inside the site, under its base: `withBase("docs/")` is `/the-forgerdr/docs/`. */
export const withBase = (path: string): string => `${SITE.base}/${path}`;

/** The absolute URL of a path inside the site, for the meta tags other sites read. */
export const absoluteUrl = (path: string): string => `${SITE.origin}${withBase(path)}`;
