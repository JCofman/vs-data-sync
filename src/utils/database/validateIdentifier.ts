export function validateIdentifier(identifier: string): void {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
        throw new Error(`Invalid SQL identifier: ${identifier}`);
    }
}
