import { useEffect, useState } from 'react';
import usePopupStore from '../../../stores/ui/popupStore';
import './styles/PopupMessage.css';

export default function PopupMessage() {
  const message = usePopupStore((s) => s.message);
  const visible = usePopupStore((s) => s.visible);
  const type = usePopupStore((s) => s.type);
  const hidePopup = usePopupStore((s) => s.hidePopup);

  const [renderedMessage, setRenderedMessage] = useState(message);
  const [animState, setAnimState] = useState('hidden'); // 'entering' | 'visible' | 'exiting' | 'hidden'

  useEffect(() => {
    if (visible) {
      setRenderedMessage(message);
      setAnimState('entering');
      const timer = setTimeout(() => setAnimState('visible'), 50);
      return () => clearTimeout(timer);
    } else if (animState === 'visible' || animState === 'entering') {
      setAnimState('exiting');
      const timer = setTimeout(() => setAnimState('hidden'), 350);
      return () => clearTimeout(timer);
    }
  }, [visible, message]);

  if (animState === 'hidden' || !renderedMessage) return null;

  return (
    <div
      className={`popup-message-overlay popup-message--${type} popup-message--${animState}`}
      role='status'
      aria-live='polite'
      onClick={hidePopup}
    >
      <span className='popup-message-text'>{renderedMessage}</span>
    </div>
  );
}
