/**
 * Stub for `.txt` imports in Jest, wired up via `moduleNameMapper` in
 * `jest.config.js`.
 *
 * Webpack bundles text files as strings (`asset/source`); Jest has no Webpack
 * and would try to execute the file as JavaScript. Tests that need real list
 * contents should pass them to the parser directly.
 */
const emptyTextFile = '';

export default emptyTextFile;
