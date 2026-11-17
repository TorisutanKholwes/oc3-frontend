import { useEffect } from "react";

/**
 * The filterset of the session, chosen in the top bar (`SessionFilter`), for the
 * context of a question to the assistant: it narrows every list to its nodes and
 * services, server side, so that "all the rows of the list" means those it keeps.
 * `undefined` while it is not read yet, `null` for none.
 */
let filterset: string | null | undefined;

export const sessionFilterset = (): string | null | undefined => filterset;

/** Tells the filterset of the session, `undefined` while it is not read yet. */
export function useShareSessionFilterset(name: string | null | undefined): void {
  useEffect(() => {
    filterset = name;
    return () => {
      if (filterset === name) filterset = undefined;
    };
  }, [name]);
}
