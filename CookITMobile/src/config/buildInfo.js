// When this bundle was built, stamped in by tools/build-web.js.
//
// Metro inlines EXPO_PUBLIC_* at bundle time, so these are literals in the
// shipped JS - a page can therefore say which build it is running. A dev server
// build has neither set and reports itself as a dev build.
export const BUILD_TIME = process.env.EXPO_PUBLIC_BUILD_TIME || '';
export const BUILD_COMMIT = process.env.EXPO_PUBLIC_BUILD_COMMIT || '';

// Local time, to the minute: the point is to compare it against the clock on
// the wall while waiting for a deploy to land.
export function formatBuildStamp() {
  if (!BUILD_TIME) return 'dev build';
  const when = new Date(BUILD_TIME);
  if (Number.isNaN(when.getTime())) return 'dev build';

  const pad = n => String(n).padStart(2, '0');
  const stamp =
    `${when.getFullYear()}-${pad(when.getMonth() + 1)}-${pad(when.getDate())}` +
    ` ${pad(when.getHours())}:${pad(when.getMinutes())}`;

  return BUILD_COMMIT ? `${stamp} · ${BUILD_COMMIT}` : stamp;
}
