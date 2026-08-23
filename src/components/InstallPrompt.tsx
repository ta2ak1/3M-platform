import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
};

export function InstallPrompt() {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  if (!installPrompt || isInstalled) {
    return null;
  }

  const handleInstall = async () => {
    const promptEvent = installPrompt;
    setInstallPrompt(null);
    await promptEvent.prompt();
    await promptEvent.userChoice.catch(() => null);
  };

  const handleDismiss = () => {
    setInstallPrompt(null);
  };

  return (
    <div className="fixed right-4 bottom-4 z-[1000] max-w-sm rounded-3xl border border-slate-200 bg-white/95 p-4 text-slate-900 shadow-2xl shadow-slate-900/20 backdrop-blur">
      <p className="text-sm font-bold">アプリとして追加できます</p>
      <p className="mt-1 text-xs leading-5 text-slate-600">
        ホーム画面からすぐ開けるように、3M Platformを端末に追加できます。
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => void handleInstall()}
          className="rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-primary-strong"
        >
          追加する
        </button>
        <button
          type="button"
          onClick={handleDismiss}
          className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200"
        >
          後で
        </button>
      </div>
    </div>
  );
}
