import { useAppStore } from "../../store.ts";
import { BackToEditing, GithubControls } from "./GithubControls.tsx";
import { HeaderActions } from "./HeaderActions.tsx";
import { OverflowMenu } from "./OverflowMenu.tsx";
import { ScenarioHeader } from "./ScenarioHeader.tsx";

/** The app's name and tagline, shown until a scenario is open. */
function AppTitles() {
  return (
    <div id="header-titles" className="min-w-0 flex-1">
      <h1 className="m-0 text-heading">Heroes III: The Board Game – Scenario Builder</h1>
      <p className="m-0 text-small text-muted">Build scenarios with LaTeX in your web browser</p>
    </div>
  );
}

/**
 * The page header, from the store: the app's name or the open scenario with
 * its notes, Build/Download/Upload, the way back to a parked scenario, the
 * GitHub controls and the overflow menu.
 */
export function Header() {
  const scenarioOpen = useAppStore((s) => s.scenarioHeaderVisible);
  const parked = useAppStore((s) => s.parked);

  return (
    <>
      {scenarioOpen ? <ScenarioHeader /> : <AppTitles />}
      <HeaderActions />
      {parked && <BackToEditing />}
      <GithubControls />
      <OverflowMenu />
    </>
  );
}
