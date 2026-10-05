import { useEffect } from "react";
import { el } from "../modules/dom.js";
import { dialogClosed, openDialog, useAppStore } from "../store.ts";
import { Button } from "./ui/Button.tsx";
import { Dialog, DialogActions, DialogTitle } from "./ui/Dialog.tsx";
import { Link } from "./ui/Link.tsx";

/** A feedback destination: a full-width row, tall enough to hit on a phone. */
interface Destination {
  id: string;
  href: string;
  label: string;
  viewBox: string;
  path: string;
}

// The GitHub link uses .github/ISSUE_TEMPLATE/bug_report.md: keep its name.
const DESTINATIONS: Destination[] = [
  {
    id: "feedback-github",
    href: "https://github.com/qwrtln/Homm3BG-mission-book/issues/new?template=bug_report.md",
    label: "Open an issue on GitHub",
    viewBox: "0 0 16 16",
    path: "M8 0c4.42 0 8 3.58 8 8a8.01 8.01 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27s-1.36.09-2 .27c-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8",
  },
  {
    id: "feedback-discord",
    href: "https://discord.gg/nMbawQkj9R",
    label: "Chat on Discord",
    viewBox: "0 0 24 24",
    path: "M20.317 4.37a19.8 19.8 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.3 18.3 0 0 0-5.487 0 13 13 0 0 0-.617-1.25.08.08 0 0 0-.079-.037A19.7 19.7 0 0 0 3.677 4.37a.1.1 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.08.08 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.08.08 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13 13 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10 10 0 0 0 .372-.292.07.07 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.07.07 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.08.08 0 0 0 .084.028 19.8 19.8 0 0 0 6.002-3.03.08.08 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.06.06 0 0 0-.031-.03M8.02 15.33c-1.182 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418m7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418",
  },
  {
    id: "feedback-bgg",
    href: "https://boardgamegeek.com/thread/3775763/the-fan-made-mission-book-20-and-the-scenario-buil",
    label: "Discuss on BoardGameGeek",
    viewBox: "0 0 24 24",
    path: "m19.7 4.44-2.38.64L19.65 0 4.53 5.56l.83 6.67-1.4 1.34L8.12 24l8.85-3.26 3.07-7.22-1.32-1.27.98-7.81Z",
  },
];

/**
 * The menu's Send feedback item opens this dialog. It links to a new GitHub
 * issue, to Discord and to BoardGameGeek. A link opens in a new tab and
 * closes the dialog, so the contributor comes back to the app, not to the
 * dialog.
 */
export function FeedbackDialog() {
  const open = useAppStore((state) => state.dialogs.feedback);

  useEffect(() => {
    const trigger = el("feedback-open");
    const show = () => openDialog("feedback");
    trigger.addEventListener("click", show);
    return () => trigger.removeEventListener("click", show);
  }, []);

  return (
    <Dialog id="feedback-dialog" labelledBy="feedback-title" open={open} onClose={() => dialogClosed("feedback")}>
      <DialogTitle id="feedback-title">Send feedback</DialogTitle>
      <p className="mb-2">Found a bug? Is there a feature missing? Let us know.</p>
      <ul className="m-0 mt-3 list-none p-0">
        {DESTINATIONS.map((destination) => (
          <li key={destination.id} className="border-t border-line last:border-b">
            <Link
              id={destination.id}
              href={destination.href}
              external
              underline="hover"
              className="flex items-center gap-2.5 px-1 py-3"
              onClick={() => dialogClosed("feedback")}
            >
              <svg
                className="octicon"
                viewBox={destination.viewBox}
                width="20"
                height="20"
                aria-hidden="true"
                fill="currentColor"
              >
                <path d={destination.path} />
              </svg>
              {destination.label}
            </Link>
          </li>
        ))}
      </ul>
      <DialogActions>
        <Button id="feedback-close" type="submit" value="close">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
}
