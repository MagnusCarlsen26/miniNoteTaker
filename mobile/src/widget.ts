import { requireOptionalNativeModule } from "expo-modules-core";
const native = requireOptionalNativeModule<{
  refresh(): Promise<void>;
  getPendingNavigation(): string | null;
}>("QuicknoteTodo");
let timer: ReturnType<typeof setTimeout> | undefined;
export function refreshWidgets() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    void native?.refresh().catch(() => { /* Retry on the next commit or lifecycle event. */ });
  }, 350);
}
export const pendingWidgetNavigation = () => native?.getPendingNavigation() ?? null;
export const widgetsAvailable = Boolean(native);
