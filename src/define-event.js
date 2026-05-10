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
