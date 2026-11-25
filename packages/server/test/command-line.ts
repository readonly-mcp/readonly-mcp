/**
 * A command and its args as one line for a failure message. An arg that
 * holds anything a shell word would not, a space or nothing at all, is
 * quoted, so ['a b'] and ['a', 'b'] read differently.
 */
export const commandLine = (cmd: string, args: readonly string[]): string =>
  [cmd, ...args.map(arg => (/^[\w%+,.\/:=@\-]+$/v.test(arg) ? arg : JSON.stringify(arg)))]
    .join(' ');
