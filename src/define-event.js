/**
 * Creates a typed event factory function with a `.type` property for use as map keys.
 *
 * @template {string} T
 * @param {T} type
 * @param {...string} paramNames
 * @returns {((...args: any[]) => { type: T } & Record<string, any>) & { type: T }}
 */
export function defineEvent(type, ...paramNames) {
  const factory = (...args) => {
    const event = { type };
    for (let i = 0; i < paramNames.length; i++) {
      event[paramNames[i]] = args[i];
    }
    return event;
  };
  factory.type = type;
  return factory;
}

/**
 * Creates a typed error event factory with a `.type` property.
 * The returned factory's first argument is always the `error`; remaining args map to paramNames.
 *
 * @template {string} T
 * @param {T} type
 * @param {"error" | "warning"} severity
 * @param {...string} paramNames
 * @returns {((error: Error, ...args: any[]) => { type: T, severity: string, error: Error } & Record<string, any>) & { type: T }}
 */
export function defineErrorEvent(type, severity, ...paramNames) {
  const factory = (error, ...args) => {
    const event = { type, severity, error };
    for (let i = 0; i < paramNames.length; i++) {
      event[paramNames[i]] = args[i];
    }
    return event;
  };
  factory.type = type;
  return factory;
}
