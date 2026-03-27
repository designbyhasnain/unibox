export function resolveSpintax(text: string): string {
    let result = text;
    // Resolve nested spintax from inside out
    while (result.includes('{')) {
        const prev = result;
        result = result.replace(/\{([^{}]+)\}/g, (_, options) => {
            const choices = options.split('|');
            return choices[Math.floor(Math.random() * choices.length)];
        });
        if (result === prev) break; // Safety: avoid infinite loop on malformed input
    }
    return result;
}
