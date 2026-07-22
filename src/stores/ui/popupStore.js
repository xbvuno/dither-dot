import { create } from 'zustand';

const usePopupStore = create((set) => ({
  message: '',
  type: 'info', // 'info' | 'success' | 'warning' | 'error'
  visible: false,

  showPopup: (message, type = 'info', customDuration = null) => {
    // Dynamic duration based on text length: min 2500ms, +60ms per character
    const duration = customDuration ?? Math.max(2500, message.length * 60);

    set({ message, type, visible: true });

    setTimeout(() => {
      set({ visible: false });
    }, duration);
  },

  hidePopup: () => set({ visible: false }),
}));

export function notify(message, type = 'info', customDuration = null) {
  usePopupStore.getState().showPopup(message, type, customDuration);
}

export default usePopupStore;
