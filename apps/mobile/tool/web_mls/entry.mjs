// Item 25: the one file of ts-mls the browser loads (web/js/mls.js imports
// it). Everything of ts-mls 1.6.4 as is, plus its default client config,
// which the package keeps outside its index.
export * from 'ts-mls';
export { defaultClientConfig } from 'ts-mls/clientConfig.js';
