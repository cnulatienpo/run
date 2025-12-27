export const BUILD_STAMP = {
    builtAt: new Date().toISOString(),
    commit: process.env.GIT_COMMIT || 'dev',
};
