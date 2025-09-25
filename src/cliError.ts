export type CliErrorOptions = {
    instructions?: string[];
};

export class CliError extends Error {
    /**
     * Provides guidance on how to proceed after encountering the error.
     */
    instructions: string[] = [];

    constructor(message: string, options: CliErrorOptions = {}) {
        super(message);
        this.instructions = options.instructions || [];
    }

    /**
     * Determines whether there are any suggested next steps available.
     *
     * @returns {boolean} - True if guidance is available; otherwise, false.
     */
    hasInstructions(): boolean {
        return this.instructions.length > 0;
    }
}
