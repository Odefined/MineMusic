export class MusicDataPlatformError extends Error {
    code;
    cause;
    constructor(input) {
        super(input.message);
        this.name = "MusicDataPlatformError";
        this.code = input.code;
        if (input.cause !== undefined) {
            this.cause = input.cause;
        }
    }
}
export function isMusicDataPlatformError(error) {
    return error instanceof MusicDataPlatformError;
}
