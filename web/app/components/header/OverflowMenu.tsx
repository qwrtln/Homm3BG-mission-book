import { getSignInMethod } from "../../../shared/github-auth.ts";
import { handleSignOut, handleSignOutAndRevoke } from "../../github/session.ts";
import { toggleTheme } from "../../modules/theme.ts";
import { openDialog, useAppStore } from "../../store.ts";
import { Button } from "../ui/Button.tsx";
import { MenuItem, MenuList, MenuSeparator } from "../ui/Menu.tsx";
import { useMenu } from "../ui/useMenu.ts";
import { CheckIcon, CommentIcon, InfoIcon, KebabIcon, MoonIcon, QuestionIcon, SignOutIcon } from "./icons.tsx";

/** The header's "More actions" menu: the theme toggle, Help, About, Send feedback, and Sign out once signed in (plus revoke, under a pasted token). */
export function OverflowMenu() {
  const dark = useAppStore((s) => s.theme === "dark");
  const signedIn = useAppStore((s) => s.signedIn);
  const menu = useMenu();

  return (
    <div className="relative">
      <Button
        id="header-menu-toggle"
        variant="icon"
        size="compact"
        aria-haspopup="menu"
        aria-controls="header-menu"
        aria-label="More actions"
        title="More actions"
        {...menu.toggleProps}
      >
        <KebabIcon />
      </Button>
      <MenuList id="header-menu" label="More actions" open={menu.open} {...menu.menuProps}>
        <MenuItem id="theme-toggle" role="menuitemcheckbox" aria-checked={dark} onClick={toggleTheme}>
          <MoonIcon />
          Dark mode
          <CheckIcon className="menu-check invisible ml-auto group-aria-checked:visible" />
        </MenuItem>
        <MenuItem id="help-open" onClick={() => openDialog("help")}>
          <QuestionIcon />
          Help
        </MenuItem>
        <MenuItem id="about-open" onClick={() => openDialog("about")}>
          <InfoIcon />
          About
        </MenuItem>
        <MenuItem id="feedback-open" onClick={() => openDialog("feedback")}>
          <CommentIcon />
          Send feedback
        </MenuItem>
        {signedIn && (
          <>
            <MenuSeparator id="header-menu-separator" />
            <MenuItem id="github-signout" onClick={() => void handleSignOut()}>
              <SignOutIcon />
              Sign out
            </MenuItem>
            {getSignInMethod() === "token" && (
              <MenuItem id="github-signout-revoke" onClick={() => void handleSignOutAndRevoke()}>
                <SignOutIcon />
                Sign out and revoke token
              </MenuItem>
            )}
          </>
        )}
      </MenuList>
    </div>
  );
}
