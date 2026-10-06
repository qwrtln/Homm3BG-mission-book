import { useAppStore } from "../../store.ts";

/** The question asked when the member's earlier edit of the picked scenario is still on its branch. */
export function EditBranchPrompt() {
  const prompt = useAppStore((s) => s.editBranch);

  return (
    <div className="edit-branch-prompt" id="edit-branch-prompt" hidden={prompt === null}>
      <h2>You already have an edit of this scenario in progress</h2>
      <p className="hint">
        Continue from where you left off, or start over from the current Mission Book copy. Starting over replaces your
        earlier edit the moment you save.
      </p>
      <div className="scratch-row">
        <button id="edit-continue" className="primary" type="button" onClick={() => prompt?.onContinue()}>
          Continue my edit
        </button>
        <button id="edit-start-over" type="button" onClick={() => prompt?.onStartOver()}>
          Start over from main
        </button>
      </div>
    </div>
  );
}
