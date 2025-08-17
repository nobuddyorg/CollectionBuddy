export type CollectibleVariant = 'float' | 'bob';

export type CollectibleProps = {
  delay: number;
  color: string;
  emoji: string;
  x: string;
  y: string;
  size?: number;
  className?: string;
  variant?: CollectibleVariant;
};
