/**
 * @module event-types
 * Shared event-type primitives for the mailctl event subsystem.
 */

/**
 * Structural minimum satisfied by every AppEvent member and by event-shaped test
 * fixtures. Use as the parameter type for render functions and progress callbacks —
 * it preserves structure (type, severity, error) while accepting any event-shaped object.
 *
 * @typedef {{ type: string, severity?: string, error?: { message: string } } & Record<string, unknown>} BaseEvent
 */

export {};
