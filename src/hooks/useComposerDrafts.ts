import { useCallback, useRef, useState } from "react";
import type { PendingImage } from "../lib/agentHelpers";

/**
 * Per-session composer drafts so tab switches never lose input.
 * Owns prompt/images/cursor + slash dismiss flags used when loading a draft.
 */
export function useComposerDrafts() {
  const [prompt, setPrompt] = useState("");
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [composerCursor, setComposerCursor] = useState(0);
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashDismissed, setSlashDismissed] = useState(false);

  const draftsRef = useRef<
    Record<string, { prompt: string; images: PendingImage[] }>
  >({});
  const promptRef = useRef(prompt);
  promptRef.current = prompt;
  const pendingImagesRef = useRef(pendingImages);
  pendingImagesRef.current = pendingImages;

  const saveDraft = useCallback((sessionId: string | null | undefined) => {
    if (!sessionId) return;
    draftsRef.current[sessionId] = {
      prompt: promptRef.current,
      images: pendingImagesRef.current,
    };
  }, []);

  const loadDraft = useCallback((sessionId: string | null | undefined) => {
    if (!sessionId) {
      setPrompt("");
      setPendingImages([]);
      setComposerCursor(0);
      setSlashDismissed(false);
      setSlashIndex(0);
      return;
    }
    const d = draftsRef.current[sessionId];
    setPrompt(d?.prompt ?? "");
    setPendingImages(d?.images ?? []);
    setComposerCursor(d?.prompt?.length ?? 0);
    setSlashDismissed(false);
    setSlashIndex(0);
  }, []);

  const clearDraft = useCallback((sessionId: string) => {
    delete draftsRef.current[sessionId];
  }, []);

  const clearAllDrafts = useCallback(() => {
    draftsRef.current = {};
  }, []);

  return {
    prompt,
    setPrompt,
    pendingImages,
    setPendingImages,
    composerCursor,
    setComposerCursor,
    slashIndex,
    setSlashIndex,
    slashDismissed,
    setSlashDismissed,
    draftsRef,
    promptRef,
    pendingImagesRef,
    saveDraft,
    loadDraft,
    clearDraft,
    clearAllDrafts,
  };
}
