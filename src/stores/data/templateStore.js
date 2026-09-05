import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { TEMPLATES } from '../../constants/templates';
import usePaletteStore from './paletteStore';
import useDitherStore from '../engine/ditherStore';
import useParamsStore from './paramsStore';
import usePinnedStore from '../ui/pinnedStore';

const useTemplateStore = create(
  persist(
    (set) => ({
      selectedTemplateId: 'default',
      templates: TEMPLATES,

      setSelectedTemplateId: (id) => set({ selectedTemplateId: id }),

      applyTemplate: (templateId) => {
        const template = TEMPLATES.find((t) => t.id === templateId) || TEMPLATES[0];
        if (!template) return;

        set({ selectedTemplateId: template.id });

        // Apply Palette
        const paletteState = usePaletteStore.getState();
        if (template.palette.id && template.palette.id.startsWith('builtin-')) {
          paletteState.applyLibraryPaletteById?.(template.palette.id);
        } else if (template.palette.colors) {
          paletteState.applyPaletteByHexes?.(template.palette.colors, template.palette.name);
        }

        // Apply Dither Settings
        if (template.dither) {
          useDitherStore.setState({
            enabled: template.dither.enabled ?? true,
            method: template.dither.method,
            amount: template.dither.amount,
            matrixScale: template.dither.matrixScale,
            seed: template.dither.seed,
          });
        }

        // Apply Image Adjustment Parameters
        if (template.params) {
          useParamsStore.setState((s) => ({
            ...s,
            ...template.params,
          }));
        }

        // Apply Pinned Controls
        if (Array.isArray(template.pinnedIds)) {
          usePinnedStore.getState().setPinnedIds(template.pinnedIds);
        }
      },
    }),
    {
      name: 'dither-dot:template',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

export default useTemplateStore;
