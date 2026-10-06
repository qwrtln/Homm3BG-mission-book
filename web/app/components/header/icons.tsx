import type { ReactNode } from "react";

/** A 16px GitHub Octicon, drawn in the text's color and hidden from assistive technology: the button's label names it. */
function Octicon({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <svg
      className={`octicon ${className}`.trim()}
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
      fill="currentColor"
    >
      {children}
    </svg>
  );
}

export interface IconProps {
  className?: string;
}

export function ArrowLeftIcon({ className }: IconProps) {
  return (
    <Octicon className={className}>
      <path d="M7.78 12.53a.75.75 0 0 1-1.06 0L2.47 8.28a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.042.018.75.75 0 0 1 .018 1.042L4.81 7h7.44a.75.75 0 0 1 0 1.5H4.81l2.97 2.97a.75.75 0 0 1 0 1.06" />
    </Octicon>
  );
}

export function PlayIcon({ className }: IconProps) {
  return (
    <Octicon className={className}>
      <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0M1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0m4.879-2.773 4.264 2.559a.25.25 0 0 1 0 .428l-4.264 2.559A.25.25 0 0 1 6 10.559V5.442a.25.25 0 0 1 .379-.215" />
    </Octicon>
  );
}

export function StopIcon({ className }: IconProps) {
  return (
    <Octicon className={className}>
      <path d="M5.75 4h4.5c.966 0 1.75.784 1.75 1.75v4.5A1.75 1.75 0 0 1 10.25 12h-4.5A1.75 1.75 0 0 1 4 10.25v-4.5C4 4.784 4.784 4 5.75 4" />
    </Octicon>
  );
}

export function DownloadIcon({ className }: IconProps) {
  return (
    <Octicon className={className}>
      <path d="M2.75 14A1.75 1.75 0 0 1 1 12.25v-2.5a.75.75 0 0 1 1.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25v-2.5a.75.75 0 0 1 1.5 0v2.5A1.75 1.75 0 0 1 13.25 14Z" />
      <path d="M7.25 7.689V2a.75.75 0 0 1 1.5 0v5.689l1.97-1.969a.749.749 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 6.78a.749.749 0 1 1 1.06-1.06z" />
    </Octicon>
  );
}

export function ImageIcon({ className }: IconProps) {
  return (
    <Octicon className={className}>
      <path d="M16 13.25A1.75 1.75 0 0 1 14.25 15H1.75A1.75 1.75 0 0 1 0 13.25V2.75C0 1.784.784 1 1.75 1h12.5c.966 0 1.75.784 1.75 1.75ZM1.75 2.5a.25.25 0 0 0-.25.25v10.5c0 .138.112.25.25.25h.94l.03-.03 6.077-6.078a1.75 1.75 0 0 1 2.412-.06L14.5 10.31V2.75a.25.25 0 0 0-.25-.25Zm12.5 11a.25.25 0 0 0 .25-.25v-.917l-4.298-3.889a.25.25 0 0 0-.344.009L4.81 13.5ZM7 6a2 2 0 1 1-3.999.001A2 2 0 0 1 7 6M5.5 6a.5.5 0 1 0-1 0 .5.5 0 0 0 1 0" />
    </Octicon>
  );
}

export function PencilIcon({ className }: IconProps) {
  return (
    <Octicon className={className}>
      <path d="M11.013 1.427a1.75 1.75 0 0 1 2.474 0l1.086 1.086a1.75 1.75 0 0 1 0 2.474l-8.61 8.61c-.21.21-.47.364-.756.445l-3.251.93a.75.75 0 0 1-.927-.928l.929-3.25c.081-.286.235-.547.445-.758l8.61-8.61Zm.176 4.823L9.75 4.81l-6.286 6.287a.253.253 0 0 0-.064.108l-.558 1.953 1.953-.558a.253.253 0 0 0 .108-.064Zm1.238-3.763a.25.25 0 0 0-.354 0L10.811 3.75l1.439 1.44 1.263-1.263a.25.25 0 0 0 0-.354Z" />
    </Octicon>
  );
}

export function MarkGithubIcon({ className }: IconProps) {
  return (
    <Octicon className={className}>
      <path d="M8 0c4.42 0 8 3.58 8 8a8.01 8.01 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27s-1.36.09-2 .27c-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8" />
    </Octicon>
  );
}

export function UploadIcon({ className }: IconProps) {
  return (
    <Octicon className={className}>
      <path d="M2.75 14A1.75 1.75 0 0 1 1 12.25v-2.5a.75.75 0 0 1 1.5 0v2.5c0 .138.112.25.25.25h10.5a.25.25 0 0 0 .25-.25v-2.5a.75.75 0 0 1 1.5 0v2.5A1.75 1.75 0 0 1 13.25 14Z" />
      <path d="M11.78 4.72a.749.749 0 1 1-1.06 1.06L8.75 3.811V9.5a.75.75 0 0 1-1.5 0V3.811L5.28 5.78a.749.749 0 1 1-1.06-1.06l3.25-3.25a.75.75 0 0 1 1.06 0z" />
    </Octicon>
  );
}

export function GitPullRequestIcon({ className }: IconProps) {
  return (
    <Octicon className={className}>
      <path d="M1.5 3.25a2.25 2.25 0 1 1 3 2.122v5.256a2.251 2.251 0 1 1-1.5 0V5.372A2.25 2.25 0 0 1 1.5 3.25m5.677-.177L9.573.677A.25.25 0 0 1 10 .854V2.5h1A2.5 2.5 0 0 1 13.5 5v5.628a2.251 2.251 0 1 1-1.5 0V5a1 1 0 0 0-1-1h-1v1.646a.25.25 0 0 1-.427.177L7.177 3.427a.25.25 0 0 1 0-.354M3.75 2.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5m0 9.5a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5m8.25.75a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0" />
    </Octicon>
  );
}

export function LinkExternalIcon({ className }: IconProps) {
  return (
    <Octicon className={className}>
      <path d="M8 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3M1.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3m13 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3" />
    </Octicon>
  );
}

export function KebabIcon({ className }: IconProps) {
  return (
    <Octicon className={className}>
      <path d="M8 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3M1.5 9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3m13 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3" />
    </Octicon>
  );
}

export function MoonIcon({ className }: IconProps) {
  return (
    <Octicon className={className}>
      <path d="M9.598 1.591a.75.75 0 0 1 .785-.175 7.001 7.001 0 1 1-8.967 8.967.75.75 0 0 1 .961-.96 5.5 5.5 0 0 0 7.046-7.046.75.75 0 0 1 .175-.786m1.616 1.945a7 7 0 0 1-7.678 7.678 5.499 5.499 0 1 0 7.678-7.678" />
    </Octicon>
  );
}

export function CheckIcon({ className }: IconProps) {
  return (
    <Octicon className={className}>
      <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 .018-1.042.75.75 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0" />
    </Octicon>
  );
}

export function QuestionIcon({ className }: IconProps) {
  return (
    <Octicon className={className}>
      <path d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM6.92 6.085h.001a.749.749 0 1 1-1.343-.67c.169-.339.436-.701.849-.977C6.845 4.16 7.369 4 8 4a2.968 2.968 0 0 1 1.713.526c.472.325.787.828.787 1.474 0 .54-.235.864-.459 1.096-.157.162-.376.323-.59.532l-.24.235c-.317.316-.374.564-.374 1.137a.75.75 0 0 1-1.5 0c0-.75.198-1.299.715-1.806l.355-.336c.117-.101.183-.164.246-.231.185-.191.199-.321.199-.436 0-.191-.109-.364-.317-.504a1.456 1.456 0 0 0-.839-.242c-.376 0-.705.09-.995.283a1.964 1.964 0 0 0-.569.605ZM8 9a.75.75 0 0 1 .75.75v.5a.75.75 0 0 1-1.5 0v-.5A.75.75 0 0 1 8 9Z" />
    </Octicon>
  );
}

export function InfoIcon({ className }: IconProps) {
  return (
    <Octicon className={className}>
      <path d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z" />
    </Octicon>
  );
}

export function CommentIcon({ className }: IconProps) {
  return (
    <Octicon className={className}>
      <path d="M1 2.75C1 1.784 1.784 1 2.75 1h10.5c.966 0 1.75.784 1.75 1.75v7.5A1.75 1.75 0 0 1 13.25 12H9.06l-2.573 2.573A1.458 1.458 0 0 1 4 13.543V12H2.75A1.75 1.75 0 0 1 1 10.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h2a.75.75 0 0 1 .75.75v2.19l2.72-2.72a.749.749 0 0 1 .53-.22h4.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z" />
    </Octicon>
  );
}

export function SignOutIcon({ className }: IconProps) {
  return (
    <Octicon className={className}>
      <path d="M2 2.75C2 1.784 2.784 1 3.75 1h2.5a.75.75 0 0 1 0 1.5h-2.5a.25.25 0 0 0-.25.25v10.5c0 .138.112.25.25.25h2.5a.75.75 0 0 1 0 1.5h-2.5A1.75 1.75 0 0 1 2 13.25Zm10.44 4.5-1.97-1.97a.749.749 0 0 1 .326-1.275.75.75 0 0 1 .734.215l3.25 3.25a.75.75 0 0 1 0 1.06l-3.25 3.25a.749.749 0 0 1-1.275-.326.75.75 0 0 1 .215-.734l1.97-1.97H6.75a.75.75 0 0 1 0-1.5Z" />
    </Octicon>
  );
}
