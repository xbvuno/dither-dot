import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

const usePinnedStore = create(
  persist(
    (set, get) => ({
      pinnedIds: [],

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
    }),
    {
      name: 'dither-dot:pinned-controls',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

export default usePinnedStore;
