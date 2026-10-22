export type PasskeySignInButtonProps = {
  onClick: () => Promise<unknown>;
  onError: (error: unknown) => void;
};
