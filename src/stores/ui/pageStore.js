import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/* ---------------------------------- */
/* PAGE IDs                           */
/* ---------------------------------- */

export const PAGE = {
    IMPORT: 'import',
    PINNED: 'pinned',
    RESIZING: 'resizing',
    ADJUSTMENTS: 'adjustments',
    PALETTE: 'palette',
    DITHER: 'dither',
    SETTINGS: 'settings',
    EXPORT: 'export',
};

/* ---------------------------------- */
/* STORE                              */
/* ---------------------------------- */

const usePageStore = create(
    persist(
        (set) => ({
            currentPage: PAGE.IMPORT,
            exportOpen: false,

            setPage: (page) => {
                const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
                if (page === PAGE.EXPORT && !isMobile) {
                    set((s) => ({ exportOpen: !s.exportOpen }));
                    return;
                }
                set({ currentPage: page });
            },

            setExportOpen: (open) => set({ exportOpen: Boolean(open) }),
            toggleExportOpen: () => set((s) => ({ exportOpen: !s.exportOpen })),
        }),
        {
            name: 'dither-dot:page-state',
            storage: createJSONStorage(() => localStorage),
            partialize: (state) => ({
                exportOpen: state.exportOpen,
            }),
        }
    )
);

export default usePageStore;
