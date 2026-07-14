import { create } from "zustand";

/* ---------------------------------- */
/* PAGE IDs                           */
/* ---------------------------------- */

export const PAGE = {
    IMPORT: 'import',
    RESIZING: 'resizing',
    ADJUSTMENTS: 'adjustments',
    DITHER: 'dither',
    EXPORT: 'export',
    PALETTE: 'palette',
};

/* ---------------------------------- */
/* STORE                              */
/* ---------------------------------- */

const usePageStore = create((set) => ({
    currentPage: PAGE.IMPORT,

    setPage: (page) => set({ currentPage: page }),
}));

export default usePageStore;
