import { useAppStore } from "../../store.ts";
import { Button } from "../ui/Button.tsx";

/** The question asked when the member's earlier edit of the picked scenario is still on its branch. */
export function EditBranchPrompt() {
  const prompt = useAppStore((s) => s.editBranch);

  return (
    <div className="edit-branch-prompt" id="edit-branch-prompt" hidden={prompt === null}>
      <h2 className="text-title">You already have an edit of this scenario in progress</h2>
      <p className="hint text-small">
        Continue from where you left off, or start over from the current Mission Book copy. Starting over replaces your
        earlier edit the moment you save.
      </p>
      <div className="scratch-row">
        <Button id="edit-continue" variant="primary" onClick={() => prompt?.onContinue()}>
          Continue my edit
        </Button>
        <Button id="edit-start-over" onClick={() => prompt?.onStartOver()}>
          Start over from main
        </Button>
      </div>
    </div>
  );
}
