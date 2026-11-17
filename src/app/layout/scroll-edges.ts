import { useEffect, useRef, useState } from "react";

/** Whether a scrolled box has content hidden above and below its visible part. */
export function scrollEdges(box: {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
}): { above: boolean; below: boolean } {
  return {
    above: box.scrollTop > 1,
    below: box.scrollTop + box.clientHeight < box.scrollHeight - 1,
  };
}

/**
 * The edges of the element's content out of sight, followed as it scrolls and as it
 * or its content resizes: a section folded, a search typed, the window resized.
 */
export function useScrollEdges() {
  const ref = useRef<HTMLElement>(null);
  const [edges, setEdges] = useState({ above: false, below: false });
  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    const measure = () => {
      const next = scrollEdges(element);
      setEdges((previous) =>
        previous.above === next.above && previous.below === next.below ? previous : next,
      );
    };
    measure();
    element.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    for (const child of element.children) observer.observe(child);
    return () => {
      element.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, []);
  return { ref, ...edges };
}
