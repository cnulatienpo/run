export const B2_ENABLED =
  process.env.B2_ENABLED === 'true';

export function assertB2Enabled() {
  if (!B2_ENABLED) {
    const err = new Error('B2 disabled by config');
    err.code = 'B2_DISABLED';
    throw err;
  }
}
