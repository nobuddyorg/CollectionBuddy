export type Props = {
  categoryId: string;
  onCreated: () => void;
  onDirtyChange?: (dirty: boolean) => void;
};
