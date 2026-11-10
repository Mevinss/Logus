"use client";
import React from "react";

const paths: Record<string, React.ReactNode> = {
  today: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M7 3v4m10-4v4M3 10h18m-13 4h3m3 0h2" />
    </>
  ),
  book: (
    <>
      <path d="M3 5.5c3.5-1.5 6.5-.9 9 1.4 2.5-2.3 5.5-2.9 9-1.4v14c-3.5-1.4-6.5-.8-9 1.2-2.5-2-5.5-2.6-9-1.2zM12 7v13" />
    </>
  ),
  group: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20v-2c0-3 3-5 6.5-5s6.5 2 6.5 5v2m1-15a3.5 3.5 0 010 7m1 2c2.3.5 4 2.2 4 4.5V20" />
    </>
  ),
  arrow: <path d="M4 12h15m-6-6 6 6-6 6" />,
  back: <path d="M20 12H5m6-6-6 6 6 6" />,
  plus: <path d="M12 4v16m-8-8h16" />,
  logout: (
    <>
      <path d="M9 4H4v16h5m0-8h12m-5-5 5 5-5 5" />
    </>
  ),
  check: <path d="m5 12 4 4L20 5" />,
  chev: <path d="m9 5 7 7-7 7" />,
  file: (
    <>
      <path d="M5 2h9l5 5v15H5Zm9 0v6h5M8 12h8m-8 4h6" />
    </>
  ),
  pen: (
    <>
      <path d="m4 16 12-12 4 4L8 20l-5 1zM14 6l4 4" />
    </>
  ),
  layers: (
    <>
      <path d="m3 8 9-5 9 5-9 5Zm0 5 9 5 9-5m-18 5 9 5 9-5" />
    </>
  ),
  spark: (
    <>
      <path d="m12 3 2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2Z" />
    </>
  ),
  link: (
    <>
      <path d="m9 15 6-6m-4-2 2-2a4 4 0 016 6l-2 2m-4 4-2 2a4 4 0 01-6-6l2-2" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 6v6l4 2" />
    </>
  ),
  folder: <path d="M3 7V5h7l2 2h9v13H3Z" />,
  x: <path d="m5 5 14 14M19 5 5 19" />,
  chart: (
    <>
      <path d="M3 3v17h18m-14-4 4-6 4 3 5-8" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5" />
    </>
  ),
  search: (
    <>
      <circle cx="10" cy="10" r="6" />
      <path d="m15 15 6 6" />
    </>
  ),
};
export function Icon({ n, size = 18 }: { n: string; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[n]}
    </svg>
  );
}
export function Empty({
  title,
  children,
  icon = "folder",
}: {
  title: string;
  children?: React.ReactNode;
  icon?: string;
}) {
  return (
    <div className="t-empty">
      <span className="t-iconbox">
        <Icon n={icon} size={22} />
      </span>
      <div>
        <strong>{title}</strong>
        {children && <div className="t-muted">{children}</div>}
      </div>
    </div>
  );
}
export function Overlay({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDialogElement>(null);
  React.useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="t-dialog"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <div className="t-row">
        <h2>{title}</h2>
        <button
          type="button"
          className="t-iconbtn"
          aria-label="Закрыть"
          onClick={close}
        >
          <Icon n="x" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export type AnyRow = Record<string, any>;
export async function api(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<any> {
  const multipart = body instanceof FormData;
  const res = await fetch(path, {
    method,
    cache: "no-store",
    headers:
      multipart || body === undefined
        ? {}
        : { "Content-Type": "application/json" },
    body:
      body === undefined ? undefined : multipart ? body : JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok)
    throw Error(
      typeof payload.error === "string"
        ? payload.error
        : payload.message ||
            "Не удалось выполнить действие. Попробуйте ещё раз.",
    );
  return payload;
}
export const statusName = (s: string) =>
  ({
    not_started: "Не начал",
    in_progress: "В процессе",
    pending: "Ожидает проверки",
    pending_review: "Ожидает проверки",
    graded: "Проверено",
    completed: "Проверено",
    submitted: "Сдано",
    draft: "В процессе",
  })[s] || s;
export const initials = (s: string) =>
  s
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((x) => x.charAt(0))
    .join("")
    .toUpperCase();
