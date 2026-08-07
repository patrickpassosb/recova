export interface Props {
  title: string;
}

export default function ProductCardTitle({ title }: Props) {
  return (
    <span className="line-clamp-1 text-sm font-medium text-ink-soft tracking-[-0.14px]">
      {title}
    </span>
  );
}
