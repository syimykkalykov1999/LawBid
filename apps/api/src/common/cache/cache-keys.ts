/**
 * Cache keys written in one module and deleted in another (the writer must
 * drop the key when the data changes, so both need the same string). Kept
 * here so neither module imports the other's internals.
 */
export const PRACTICE_TREE_CACHE_KEY = 'practice_areas:tree:v1';
