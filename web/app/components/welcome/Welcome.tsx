import { useState } from "react";
import { flushSync } from "react-dom";
import { openCreate } from "../../modules/picker.ts";
import { useAppStore } from "../../store.ts";
import { Button } from "../ui/Button.tsx";
import { Disclosure } from "../ui/Disclosure.tsx";
import { Link } from "../ui/Link.tsx";
import { StartChoice } from "../wizard/StartChoice.tsx";
import { Wizard } from "../wizard/Wizard.tsx";
import { EditBranchPrompt } from "./EditBranchPrompt.tsx";
import { PickerMain } from "./PickerMain.tsx";
import { ResumeDrafts } from "./ResumeDrafts.tsx";

/**
 * The welcome screen: what the builder is, the resume list, the picker or the
 * wizard, and the edit-branch question. It hides while the workspace shows,
 * fades out as the workspace comes in, and gives the wizard its room.
 */
export function Welcome() {
  const workspaceShown = useAppStore((s) => s.workspaceShown);
  const leaving = useAppStore((s) => s.welcomeLeaving);
  const wizardOpen = useAppStore((s) => s.wizard.open);
  const resumeVisible = useAppStore((s) => s.resume.visible);
  const createOpen = useAppStore((s) => s.createOpen);
  // The intro follows the resume list until the author toggles it; then their choice wins.
  const [introChoice, setIntroChoice] = useState<boolean | null>(null);
  const introOpen = introChoice ?? !resumeVisible;
  const createHidden = resumeVisible && !createOpen;
  const className = ["welcome", leaving && "leaving", wizardOpen && "wizard-open"].filter(Boolean).join(" ");

  return (
    <section className={className} id="welcome" hidden={workspaceShown}>
      <div className="welcome-inner">
        <Disclosure
          className="welcome-intro"
          open={introOpen}
          onToggle={(open) => {
            if (open !== introOpen) setIntroChoice(open);
          }}
          summary={<h2 className="text-title">Welcome to the Scenario Builder</h2>}
        >
          <p>
            Want to build a nicely styled PDF scenario for the Heroes of Might &amp; Magic III board game? You've come
            to the right place. You can do it right here, in your web browser, without installing any software.
          </p>
          <p>
            Every scenario you build here is styled after the{" "}
            <Link
              external
              href="https://github.com/qwrtln/Homm3BG-mission-book#heroes-of-might--magic-iii-the-board-gamefan-made-mission-book"
            >
              Fan-Made Mission Book
            </Link>
            , a community collection of scenarios for the game. If you're new here, we highly recommend checking it out
            first.
          </p>
        </Disclosure>
        <div className="welcome-top">
          <ResumeDrafts />
        </div>
        <Button
          variant="primary"
          id="new-project"
          hidden={!createHidden}
          onClick={() => {
            // Render the section first: a hidden heading cannot take focus.
            flushSync(() => openCreate());
            document.getElementById("new-heading")?.focus();
          }}
        >
          New project
        </Button>
        <div className="welcome-picker" id="welcome-picker" hidden={createHidden}>
          <h2 id="new-heading" tabIndex={-1} className="text-title">
            New project
          </h2>
          <div id="welcome-start">
            <StartChoice />
          </div>
          <div id="welcome-pick">
            <PickerMain />
          </div>
          <div id="welcome-wizard">
            <Wizard />
          </div>
        </div>
        <EditBranchPrompt />
      </div>
    </section>
  );
}
