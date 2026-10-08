/**
 * Resolve a public-asset path against the deployment base.
 *
 * The site sits on its own subdomain (`mizuhamzazu.vtube-info.xyz`), so `base`
 * is the default "/" and this is currently an identity join. It stays because
 * it is the single place that would need to change if the site ever moves to a
 * sub-path, where every `/media/...` reference would otherwise break at once.
 */
const BASE = import.meta.env.BASE_URL;

export function asset(path: string): string {
  return `${BASE}${path.replace(/^\/+/, "")}`;
}