// The cipher moved to common/secrets so the key-rotation job can reach it
// without importing a feature module.
export { SecretCipher, totpAad } from '../../common/secrets/totp-cipher';
