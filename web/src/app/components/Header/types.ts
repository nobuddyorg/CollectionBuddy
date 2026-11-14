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
  /** Closes the menu from its own close button, handing focus back to the trigger. */
  onDismiss: () => void;
  onOpenHelp: () => void;
};
