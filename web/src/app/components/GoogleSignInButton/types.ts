export type GoogleSignInButtonProps = {
  onClick: () => Promise<unknown> | void;
  onError?: (error: unknown) => void;
};
