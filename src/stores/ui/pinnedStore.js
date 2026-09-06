import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { PIN_ID } from '../../constants/pinnedRegistry';

export const DEFAULT_PINNED_IDS = [
  PIN_ID.COLOR_GAMMA,
  PIN_ID.COLOR_BLACKS,
  PIN_ID.COLOR_WHITES,
  PIN_ID.COLOR_CONTRAST,
  PIN_ID.COLOR_SATURATION,
  PIN_ID.COLOR_HUE,
  PIN_ID.DITHER_AMOUNT,
  PIN_ID.RESIZE_SCALE,
];

const usePinnedStore = create(
  persist(
    (set, get) => ({
      pinnedIds: DEFAULT_PINNED_IDS,

      isPinned: (id) => {
        if (!id) return false;
        return get().pinnedIds.includes(id);
      },

      pin: (id) => {
        if (!id) return;
        set((state) => {
          if (state.pinnedIds.includes(id)) return state;
          return { pinnedIds: [...state.pinnedIds, id] };
        });
      },

      unpin: (id) => {
        if (!id) return;
        set((state) => ({
          pinnedIds: state.pinnedIds.filter((x) => x !== id),
        }));
      },

      togglePin: (id) => {
        if (!id) return;
        const isCurrentlyPinned = get().pinnedIds.includes(id);
        if (isCurrentlyPinned) {
          get().unpin(id);
        } else {
          get().pin(id);
        }
      },

      resetToDefault: () => {
        set({ pinnedIds: DEFAULT_PINNED_IDS });
      },

      setPinnedIds: (ids) => {
        if (Array.isArray(ids)) {
          set({ pinnedIds: ids });
        }
      },
    }),
    {
      name: 'dither-dot:pinned-controls',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

export default usePinnedStore;
