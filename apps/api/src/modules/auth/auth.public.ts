/** The auth module's services other modules may use (module-boundaries
 * rule). Owner 2026-10-22: the analytics consent reads the optional bearer
 * of a public endpoint. */
export { TokenService } from './services/token.service';
