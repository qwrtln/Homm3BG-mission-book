import { startSignIn } from "../github/session.ts";
import { dialogClosed, openDialog, useAppStore } from "../store.ts";
import { Button } from "./ui/Button.tsx";
import { Dialog, DialogActions, DialogTitle } from "./ui/Dialog.tsx";

/**
 * The header's sign-in button opens this. GitHub's own sign-in is the
 * recommended way; a token is the visible, quieter alternative.
 */
export function SignInDialog() {
  const open = useAppStore((state) => state.dialogs.signin);

  return (
    <Dialog id="signin-dialog" labelledBy="signin-title" open={open} onClose={() => dialogClosed("signin")}>
      <DialogTitle id="signin-title">Sign in</DialogTitle>
      <div className="flex flex-col gap-2">
        <Button id="signin-oauth" variant="primary" onClick={() => void startSignIn()}>
          Sign in with GitHub (recommended)
        </Button>
        <p className="text-center text-small text-muted">or</p>
        <Button
          id="signin-token"
          onClick={() => {
            dialogClosed("signin");
            openDialog("token");
          }}
        >
          Sign in with a fine-grained token
        </Button>
      </div>
      <p className="mt-2 text-small text-muted">
        A token gives the builder access to your fork only, but you create it by hand.
      </p>
      <DialogActions>
        <Button id="signin-close" type="submit" value="close">
          Cancel
        </Button>
      </DialogActions>
    </Dialog>
  );
}
