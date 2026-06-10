export class MusicDatabaseError extends Error {
    code;
    cause;
    constructor(input) {
        super(input.message);
        this.name = "MusicDatabaseError";
        this.code = input.code;
        if (input.cause !== undefined) {
            this.cause = input.cause;
        }
    }
}
export function isMusicDatabaseError(error) {
    return error instanceof MusicDatabaseError;
}
