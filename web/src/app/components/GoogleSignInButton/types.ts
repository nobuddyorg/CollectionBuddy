export type GoogleSignInButtonProps = {
  onClick: () => Promise<unknown> | void;
  onError?: (err: unknown) => void;
};
