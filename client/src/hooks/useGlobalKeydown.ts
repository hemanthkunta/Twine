import { useEffect, useRef } from 'react';

/**
 * Register a single, stable window `keydown` listener.
 *
 * The handler is kept in a ref and refreshed after every render, so the listener
 * is attached exactly once while still observing the latest state and props.
 *
 * Declaring the handler inline in a `useEffect` whose dependency array lists the
 * state it reads (the previous approach) caused the effect body to be torn down
 * and re-run on every one of those state changes — re-adding window listeners and
 * re-running unrelated setup work such as the initial auth bootstrap.
 */
export function useGlobalKeydown(handler: (event: KeyboardEvent) => void) {
    const handlerRef = useRef(handler);

    // Refresh the ref after each render (never during render).
    useEffect(() => {
        handlerRef.current = handler;
    });

    useEffect(() => {
        const listener = (event: KeyboardEvent) => handlerRef.current(event);

        window.addEventListener('keydown', listener);
        return () => window.removeEventListener('keydown', listener);
    }, []);
}
