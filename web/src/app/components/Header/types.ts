export type HeaderUser = { email: string };

export type HeaderProps = {
  user: HeaderUser;
  onSignOut: () => Promise<void> | void;
  className?: string;
};

export type MenuProps = {
  user: HeaderUser;
  open: boolean;
  onSignOut: () => void | Promise<void>;
  onClose: () => void;
  labelSignOut: string;
};
