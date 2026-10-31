import { useLayoutEffect, useRef, useState } from 'react';

/** Commit deferred text to its owning field, including when that field is removed. */
export function useFieldDraft(onCommit: (text: string) => void) {
  const [draft, setText] = useState<string | null>(null);
  const pending = useRef<string | null>(null);
  const commitRef = useRef(onCommit);
  useLayoutEffect(() => { commitRef.current = onCommit; });
  useLayoutEffect(() => () => {
    const text = pending.current;
    pending.current = null;
    if (text !== null) commitRef.current(text);
  }, []);

  const setDraft = (text: string | null) => {
    pending.current = text;
    setText(text);
  };
  const commit = () => {
    const text = pending.current;
    setDraft(null);
    if (text !== null) onCommit(text);
  };
  return { draft, setDraft, commit };
}
