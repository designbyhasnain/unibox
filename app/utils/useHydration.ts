import { useState, useEffect } from 'react';

let isGlobalHydrated = false;

export function useHydrated() {
    const [hydrated, setHydrated] = useState(isGlobalHydrated);

    useEffect(() => {
        isGlobalHydrated = true;
        setHydrated(true);
    }, []);

    return hydrated;
}
