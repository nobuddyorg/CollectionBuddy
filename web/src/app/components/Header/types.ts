type HeaderUser = { email: string };

export type HeaderProps = {
  user: HeaderUser;
  onSignOut: () => Promise<void> | void;
  onDeleteAccount: () => Promise<void> | void;
  onOpenHelp: () => void;
};

export type MenuProps = {
  user: HeaderUser;
  open: boolean;
  onSignOut: () => void | Promise<void>;
  onDeleteAccount: () => void;
  onClose: () => void;
  onOpenHelp: () => void;
};
