export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

export function createTimestamp(date = new Date()): string {
  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  const iso = local.toISOString().slice(0, -1);
  const sign = offset <= 0 ? "+" : "-";
  const abs = Math.abs(offset);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `${iso}${sign}${hh}:${mm}`;
}

export function combineSignals(signalA?: AbortSignal, signalB?: AbortSignal): AbortSignal {
  if (!signalA && !signalB) return new AbortController().signal;
  if (!signalA) return signalB!;
  if (!signalB) return signalA;
  if (typeof AbortSignal.any === "function") {
    return AbortSignal.any([signalA, signalB]);
  }
  if (signalA.aborted) return signalA;
  if (signalB.aborted) return signalB;
  const controller = new AbortController();
  const onAbort = (ev: Event) => {
    const target = ev.target as AbortSignal;
    controller.abort(target.reason);
  };
  signalA.addEventListener("abort", onAbort, { once: true });
  signalB.addEventListener("abort", onAbort, { once: true });
  return controller.signal;
}

export function withAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) {
    const error = signal.reason instanceof Error
      ? signal.reason
      : new DOMException(typeof signal.reason === "string" ? signal.reason : "Tool execution aborted.", "AbortError");
    return Promise.reject(error);
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      const error = signal.reason instanceof Error
        ? signal.reason
        : new DOMException(typeof signal.reason === "string" ? signal.reason : "Tool execution aborted.", "AbortError");
      reject(error);
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (val) => {
        signal.removeEventListener("abort", onAbort);
        resolve(val);
      },
      (err) => {
        signal.removeEventListener("abort", onAbort);
        reject(err);
      },
    );
  });
}

