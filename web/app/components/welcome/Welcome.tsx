import { useAppStore } from "../../store.ts";
import { StartChoice } from "../wizard/StartChoice.tsx";
import { Wizard } from "../wizard/Wizard.tsx";
import { EditBranchPrompt } from "./EditBranchPrompt.tsx";
import { ModeChoice } from "./ModeChoice.tsx";
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
  const className = ["welcome", leaving && "leaving", wizardOpen && "wizard-open"].filter(Boolean).join(" ");

  return (
    <section className={className} id="welcome" hidden={workspaceShown}>
      <div className="welcome-inner">
        <div className="welcome-intro">
          <h2>Welcome to the Scenario Builder</h2>
          <p>
            Want to build a nicely styled PDF scenario for the Heroes of Might &amp; Magic III board game? You've come
            to the right place. You can do it right here, in your web browser, without installing any software.
          </p>
          <p>
            Every scenario you build here is styled after the{" "}
            <a
              href="https://github.com/qwrtln/Homm3BG-mission-book#heroes-of-might--magic-iii-the-board-gamefan-made-mission-book"
              target="_blank"
              rel="noopener"
            >
              Fan-Made Mission Book
            </a>
            , a community collection of scenarios for the game. If you're new here, we highly recommend checking it out
            first.
          </p>
        </div>
        <div className="welcome-top">
          <ResumeDrafts />
        </div>
        <div className="welcome-picker" id="welcome-picker">
          <div id="welcome-mode">
            <ModeChoice />
          </div>
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
