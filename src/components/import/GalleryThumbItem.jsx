import { useState } from 'react';
import { Film, Trash2 } from 'lucide-react';

export default function GalleryThumbItem({ item, isActive, onSelect, onDelete, showDelete = true }) {
  const [hovered, setHovered] = useState(false);
  const displaySrc = hovered && item.gifDataUrl ? item.gifDataUrl : item.src;
  const isAnimated = item.kind === 'gif' || Boolean(item.gifDataUrl);

  return (
    <div
      className={`gallery-thumb-wrap${isActive ? ' gallery-thumb-wrap--active' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        type='button'
        className={`gallery-thumb${isActive ? ' gallery-thumb--active' : ''}`}
        onClick={onSelect}
        title={item.name}
      >
        <img src={displaySrc} alt={item.name} draggable={false} />
        <span className='gallery-thumb-label'>{item.name}</span>
        {isAnimated && (
          <span className='gallery-thumb-anim-badge' aria-hidden='true'>
            <Film size={16} strokeWidth={2} />
          </span>
        )}
      </button>
      {showDelete && (
        <button
          type='button'
          className='gallery-thumb-delete'
          onClick={onDelete}
          title={`Delete ${item.name}`}
          aria-label={`Delete ${item.name}`}
        >
          <Trash2 size={12} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}
