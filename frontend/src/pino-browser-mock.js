export function pino() {
    return {
        debug: console.log,
        info: console.log,
        warn: console.warn,
        error: console.error,
        fatal: console.error,
        child: () => pino(),
    };
}
export default pino;
