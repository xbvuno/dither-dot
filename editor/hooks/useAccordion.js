import { useState, useCallback } from 'react';

/**
 * useAccordion
 * Hook for managing collapsible sections state with localStorage persistence.
 *
 * @param {string} storageKey - localStorage key for storing the accordion open state
 * @param {Record<string, boolean>} defaultState - Default open state for each section
 * @returns {[Record<string, boolean>, (section: string) => void, React.Dispatch<React.SetStateAction<Record<string, boolean>>>]}
 */
export default function useAccordion(storageKey, defaultState = {}) {
  const [openSections, setOpenSections] = useState(() => {
    try {
      if (storageKey) {
        const saved = localStorage.getItem(storageKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          return { ...defaultState, ...parsed };
        }
      }
    } catch (e) {
      console.error(`Error loading accordion state for key "${storageKey}":`, e);
    }
    return defaultState;
  });

  const toggleSection = useCallback(
    (section) => {
      setOpenSections((prev) => {
        const next = {
          ...prev,
          [section]: !prev[section],
        };
        try {
          if (storageKey) {
            localStorage.setItem(storageKey, JSON.stringify(next));
          }
        } catch (e) {
          console.error(`Error saving accordion state for key "${storageKey}":`, e);
        }
        return next;
      });
    },
    [storageKey]
  );

  return [openSections, toggleSection, setOpenSections];
}
