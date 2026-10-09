import { useEffect, useRef } from "react";
import { AboutDialog } from "./components/AboutDialog.tsx";
import { ConfirmDialog } from "./components/ConfirmDialog.tsx";
import { FeedbackDialog } from "./components/FeedbackDialog.tsx";
import { HelpDialog } from "./components/HelpDialog.tsx";
import { Header } from "./components/header/Header.tsx";
import { SignInDialog } from "./components/SignInDialog.tsx";
import { Toaster } from "./components/Toaster.tsx";
import { TokenDialog } from "./components/TokenDialog.tsx";
import { UploadDialog } from "./components/uploads/UploadDialog.tsx";
import { RouteLoading } from "./components/welcome/RouteLoading.tsx";
import { Welcome } from "./components/welcome/Welcome.tsx";
import { SubmitDialog } from "./components/workspace/SubmitDialog.tsx";
import { Workspace } from "./components/workspace/Workspace.tsx";
import { useAppStore } from "./store.ts";

/** The workspace's slot: hidden behind the welcome screen, and it replays its entrance animation each time it shows. */
function WorkspaceSlot() {
  const shown = useAppStore((s) => s.workspaceShown);
  const entrance = useAppStore((s) => s.workspaceEntrance);
  const slot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = slot.current;
    if (!element || entrance === 0) return;
    element.classList.remove("entering");
    void element.offsetWidth; // force reflow, so repeat visits replay the animation
    element.classList.add("entering");
  }, [entrance]);

  return (
    <div id="workspace" ref={slot} hidden={!shown}>
      <Workspace />
    </div>
  );
}

/** The whole page: the header, the welcome screen or the workspace under it, and the dialogs. */
export function App() {
  return (
    <>
      <header id="header">
        <Header />
      </header>
      <div className="content">
        <RouteLoading />
        <Welcome />
        <WorkspaceSlot />
      </div>
      <div id="overlays">
        <AboutDialog />
        <HelpDialog />
        <FeedbackDialog />
        <UploadDialog />
        <ConfirmDialog />
        <SubmitDialog />
        <SignInDialog />
        <TokenDialog />
        <Toaster />
      </div>
    </>
  );
}
