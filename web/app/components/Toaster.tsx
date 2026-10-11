import { useAppStore } from "../store.ts";
import { Toast } from "./ui/Toast.tsx";

/** Renders the notice showToast() (modules/toast.ts) puts in the store. Mounted once, in the overlays region. */
export function Toaster() {
  const toast = useAppStore((state) => state.toast);
  return <Toast message={toast?.message ?? null} tone={toast?.tone ?? "ok"} shownKey={toast?.id ?? 0} />;
}
