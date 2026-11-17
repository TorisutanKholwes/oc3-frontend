/** The pagination of the addresses of a declared network. */

/** Addresses on a page: a /24 holds in one. */
export const IPS_PAGE_SIZE = 256;

/** The first and the last address of a page, counted from 1, and whether others follow. */
export function pageBounds(offset: number, shown: number, count: number) {
  return {
    from: shown === 0 ? 0 : offset + 1,
    to: offset + shown,
    hasPrevious: offset > 0,
    hasNext: offset + shown < count,
  };
}
