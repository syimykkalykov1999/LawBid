/** The files module's DTOs for other modules (module-boundaries rule). */
export { FileDto, PresignedFileDto } from './dto/files.dto';
// Owner 2026-10-22: storage for modules that keep or release files of their
// own (media moderation).
export { S3StorageService } from './storage/s3-storage.service';
export { FileReleaseService } from './storage/file-release.service';
// Caching round 2 (S2-8): does the client being answered decode AVIF?
export { imageFormatContext } from './processing/image-format-context';
// Owner-independent object keys for new uploads (day-one foundations).
export { newFileKey } from './files.policy';
