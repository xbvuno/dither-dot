import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { TEMPLATES } from '../../constants/templates';
import usePaletteStore from './paletteStore';
import useDitherStore from '../engine/ditherStore';
import useParamsStore from './paramsStore';
import usePinnedStore from '../ui/pinnedStore';
import usePageStore, { PAGE } from '../ui/pageStore';

let isApplyingTemplate = false;

export function buildCurrentTemplate() {
  const paramsState = useParamsStore.getState();
  const ditherState = useDitherStore.getState();
  const paletteState = usePaletteStore.getState();
  const pinnedState = usePinnedStore.getState();

  const colors = Array.isArray(paletteState.colors)
    ? paletteState.colors
        .map((c) => (typeof c === 'string' ? c : c?.hex))
        .filter((hex) => typeof hex === 'string' && hex.length > 0)
    : [];

  return {
    id: 'current',
    name: 'CURRENT',
    author: 'you',
    palette: {
      id: paletteState.selectedLibraryPaletteId || null,
      name: paletteState.name || 'Current',
      extractMethod: paletteState.method !== 'custom' ? paletteState.method : null,
      colors,
      colorCount: paletteState.colorCount || (colors.length || 8),
    },
    dither: {
      enabled: ditherState.enabled ?? true,
      method: ditherState.method,
      amount: ditherState.amount,
      matrixScale: ditherState.matrixScale,
      seed: ditherState.seed,
    },
    params: {
      gamma: paramsState.gamma ?? 1.0,
      blacks: paramsState.blacks ?? 0.0,
      whites: paramsState.whites ?? 0.0,
      contrast: paramsState.contrast ?? 0.0,
      saturation: paramsState.saturation ?? 1.0,
      hue: paramsState.hue ?? 0.0,
      noiseEnabled: paramsState.noiseEnabled ?? false,
      noiseCoverage: paramsState.noiseCoverage ?? 0,
      noiseIntensity: paramsState.noiseIntensity ?? 0,
      noiseSaturation: paramsState.noiseSaturation ?? 0,
      blurEnabled: paramsState.blurEnabled ?? false,
      blurStrength: paramsState.blurStrength ?? 0,
      edgeStrength: paramsState.edgeStrength ?? 0,
      passes: paramsState.passes ?? 1,
    },
    pinnedIds: Array.isArray(pinnedState.pinnedIds) ? [...pinnedState.pinnedIds] : [],
  };
}

const useTemplateStore = create(
  persist(
    (set, get) => ({
      selectedTemplateId: 'current',
      templates: TEMPLATES,
      currentTemplate: null,

      setSelectedTemplateId: (id) => set({ selectedTemplateId: id }),

      snapshotCurrentTemplate: () => {
        const current = buildCurrentTemplate();
        set({ currentTemplate: current });
        return current;
      },

      setCurrentTemplate: (current) =>
        set({
          currentTemplate: current,
        }),

      applyTemplate: (templateOrId) => {
        isApplyingTemplate = true;
        try {
          const state = get();
          let template = null;
          if (templateOrId && typeof templateOrId === 'object') {
            template = {
              ...templateOrId,
              id: 'current',
              name: 'CURRENT',
              author: 'you',
            };
            set({ currentTemplate: template, selectedTemplateId: 'current' });
          } else if (templateOrId === 'current' || templateOrId === 'custom') {
            template = state.currentTemplate || buildCurrentTemplate();
            set({ selectedTemplateId: 'current' });
          } else {
            template = TEMPLATES.find((t) => t.id === templateOrId) || TEMPLATES[0];
            set({ selectedTemplateId: template.id });
          }
          if (!template) return;

          // Apply Palette
          const paletteState = usePaletteStore.getState();
          if (template.palette?.extractMethod) {
            usePaletteStore.setState({
              method: template.palette.extractMethod,
              colorCount: template.palette.colorCount || 8,
              selectedLibraryPaletteId: null,
            });
            paletteState.generatePalette?.();
          } else if (template.palette?.id && template.palette.id.startsWith('builtin-') && template.id !== 'current') {
            paletteState.applyLibraryPaletteById?.(template.palette.id);
          } else if (template.palette?.colors && template.palette.colors.length) {
            paletteState.applyPaletteByHexes?.(template.palette.colors, template.palette.name || 'Palette');
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
        } finally {
          setTimeout(() => {
            isApplyingTemplate = false;
          }, 50);
        }
      },
    }),
    {
      name: 'dither-dot:template',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

function onParameterModified() {
  if (isApplyingTemplate) return;
  const currentPage = usePageStore.getState().currentPage;
  // If modifying parameters outside the import studio, update CURRENT
  if (currentPage !== PAGE.IMPORT) {
    const current = buildCurrentTemplate();
    useTemplateStore.setState({
      currentTemplate: current,
      selectedTemplateId: 'current',
    });
  }
}

useParamsStore.subscribe(() => onParameterModified());
useDitherStore.subscribe(() => onParameterModified());
usePaletteStore.subscribe(() => onParameterModified());
usePinnedStore.subscribe(() => onParameterModified());

// When user navigates between sections (pages), snapshot active parameters as new CURRENT
usePageStore.subscribe((state, prevState) => {
  if (state.currentPage !== prevState.currentPage) {
    const current = buildCurrentTemplate();
    useTemplateStore.setState({
      currentTemplate: current,
    });
  }
});

export default useTemplateStore;

