// Stable ids for content records. Fixed, hand-numbered ULID-shaped strings (26 Crockford base32 characters), so seed data
// and tests can refer to the same pack, module, role and requirement across runs without the clock or the rng.
export const contentId = (n: number): string => `01M0C0N7${String(n).padStart(18, '0')}`;
