export type GoogleSignInMode = 'oauth' | 'inline';

export type GoogleSignInButtonProps = {
  onClick: () => Promise<unknown> | void;
  className?: string;
  disabled?: boolean;
  withOverlay?: boolean;
  mode?: GoogleSignInMode;
  label?: string;
  onError?: (err: unknown) => void;
};
