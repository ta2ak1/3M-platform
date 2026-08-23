import { useEffect, useRef, useState } from "react";

type TurnstileInstance = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      action?: string;
      theme?: "light" | "dark" | "auto";
      callback?: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
    },
  ) => string;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileInstance;
  }
}

const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;

export function isTurnstileEnabled() {
  return Boolean(turnstileSiteKey);
}

type TurnstileWidgetProps = {
  onVerify: (token: string) => void;
  onExpire: () => void;
  onError: () => void;
};

export function TurnstileWidget({
  onVerify,
  onExpire,
  onError,
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const onVerifyRef = useRef(onVerify);
  const onExpireRef = useRef(onExpire);
  const onErrorRef = useRef(onError);
  const [isUnavailable, setIsUnavailable] = useState(false);

  useEffect(() => {
    onVerifyRef.current = onVerify;
    onExpireRef.current = onExpire;
    onErrorRef.current = onError;
  }, [onError, onExpire, onVerify]);

  useEffect(() => {
    if (!turnstileSiteKey || !containerRef.current) {
      return;
    }

    let widgetId: string | undefined;
    let retryTimer: number | undefined;
    let retryCount = 0;
    let isMounted = true;

    const renderWidget = () => {
      if (!isMounted || !containerRef.current) {
        return;
      }

      if (!window.turnstile) {
        retryCount += 1;
        if (retryCount > 20) {
          setIsUnavailable(true);
          onErrorRef.current();
          return;
        }
        retryTimer = window.setTimeout(renderWidget, 250);
        return;
      }

      widgetId = window.turnstile.render(containerRef.current, {
        sitekey: turnstileSiteKey,
        action: "community_post",
        theme: "light",
        callback: (token) => onVerifyRef.current(token),
        "expired-callback": () => onExpireRef.current(),
        "error-callback": () => onErrorRef.current(),
      });
    };

    renderWidget();

    return () => {
      isMounted = false;
      if (retryTimer) {
        window.clearTimeout(retryTimer);
      }
      if (widgetId && window.turnstile) {
        window.turnstile.remove(widgetId);
      }
    };
  }, []);

  if (!turnstileSiteKey) {
    return null;
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div ref={containerRef} />
      {isUnavailable ? (
        <p className="mt-2 text-xs text-red-600">
          セキュリティ確認を読み込めませんでした。通信環境を確認して再読み込みしてください。
        </p>
      ) : null}
    </div>
  );
}
