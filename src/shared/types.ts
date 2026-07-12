/**
 * Compatibility entry point for domain contracts.
 * New code may import a focused module, while existing callers keep using `@shared/types`.
 */
export * from './domain/common';
export * from './domain/campaign';
export * from './domain/player';
export * from './domain/creature';
export * from './domain/encounter';
export * from './domain/combat';
export * from './domain/settings';
export * from './domain/update';
export * from './ipc/trackerApi';
