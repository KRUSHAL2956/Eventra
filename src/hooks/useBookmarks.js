/**
 * @fileoverview useBookmarks - Event bookmarks management hook
 * @module hooks/useBookmarks
 */
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { safeJsonParse } from "../utils/safeJsonParse";
import { getOrMigrateKey } from "../utils/storageKeyManager";

// Simple synchronous hash to avoid exposing raw userId (email) in localStorage keys.
const hashUserId = (userId) => {
  if (!userId || userId === "guest") return "guest";
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    const chr = userId.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
};

/**
 * A custom React hook that manages bookmarked events for a user,
 * persisting them to localStorage keyed by userId.
 *
 * @param {string} [userId='guest'] - The user ID used as localStorage key
 *
 * @returns {{
 *   bookmarks: Object[],
 *   toggleBookmark: (event: Object) => void,
 *   isBookmarked: (id: string|number) => boolean
 * }}
 */

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------
export const MAX_BOOKMARKS = 200;

const toBookmarkEntry = (event) => ({
  id: event?.id,
  title: event?.title ?? "",
  date: event?.date ?? "",
  location: event?.location ?? "",
  type: event?.type ?? event?.category ?? "",
  image: event?.image ?? event?.imageUrl ?? "",
  status: event?.status ?? "",
  savedAt: Date.now(),
});

const useBookmarks = (userId = "guest") => {
  const [bookmarks, setBookmarks] = useState([]);
  const [storageKey, setStorageKey] = useState(null);
  const hasLoaded = useRef(false);

  useEffect(() => {
    let active = true;
    const legacyKey = `bookmarks_${hashUserId(userId)}`;
    getOrMigrateKey("bookmarks", userId, legacyKey).then((key) => {
      if (active) {
        setStorageKey(key);
      }
    });
    return () => {
      active = false;
    };
  }, [userId]);

  // Load from storage when storageKey resolves
  useEffect(() => {
    if (!storageKey) return;
    try {
      const stored = localStorage.getItem(storageKey);
      if (!stored) {
        setBookmarks([]);
      } else {
        const parsed = safeJsonParse(stored, {});
        setBookmarks(Array.isArray(parsed) ? parsed : []);
      }
    } catch {
      setBookmarks([]);
    }
    hasLoaded.current = true;
  }, [storageKey]);

  // Save to storage when bookmarks change
  useEffect(() => {
    if (!storageKey || !hasLoaded.current) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(bookmarks));
    } catch {
      // localStorage full — fail silently; in-memory state remains correct
    }
  }, [bookmarks, storageKey]);

  // Cache bookmarks in a Set for O(1) lookups
  const bookmarksSet = useMemo(() => {
    return new Set(bookmarks.map(e => e.id));
  }, [bookmarks]);

  /**
   * Toggles bookmark state for an event.
   */
  const toggleBookmark = useCallback((event) => {
    if (!event?.id) return;

    setBookmarks((prev) => {
      const exists = prev.find((e) => e.id === event.id);

      if (exists) {
        return prev.filter((e) => e.id !== event.id);
      }

      const newEntry = toBookmarkEntry(event);
      const withNew = [...prev, newEntry];

      if (withNew.length <= MAX_BOOKMARKS) {
        return withNew;
      }

      const sorted = [...withNew].sort((a, b) => (a.savedAt ?? 0) - (b.savedAt ?? 0));
      sorted.shift();
      return sorted;
    });
  }, []);

  /**
   * Returns true if an event with the given id is currently bookmarked.
   */
  const isBookmarked = useCallback(
    (id) => bookmarksSet.has(id),
    [bookmarksSet],
  );

  /**
   * Removes all bookmarks for the current user from state and localStorage.
   */
  const clearBookmarks = useCallback(() => {
    setBookmarks([]);
  }, []);

  return {
    bookmarks,
    toggleBookmark,
    isBookmarked,
    clearBookmarks,
  };
};

export default useBookmarks;