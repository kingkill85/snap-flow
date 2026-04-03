interface ItemTypeBadgeProps {
  abbreviation: string;
  color: string;
  className?: string;
}

const ItemTypeBadge = ({ abbreviation, color, className = '' }: ItemTypeBadgeProps) => {
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold text-white leading-none ${className}`}
      style={{ backgroundColor: color }}
    >
      {abbreviation}
    </span>
  );
};

export default ItemTypeBadge;
