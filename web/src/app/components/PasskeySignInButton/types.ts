export type PasskeySignInButtonProps = {
  onClick: () => Promise<unknown>;
  onError: (error: unknown) => void;
  /** The id of the line saying how a passkey is confirmed, read after the button's name. */
  describedBy?: string;
};
