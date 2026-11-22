// Small, dependency-free line icons shared by the popup and captions window. All are decorative unless a caller
// supplies an accessible label around them.

function Icon({ children, size = 18, className = '', filled = false }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function SparkleIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 3.5 13.8 9l5.5 1.8-5.5 1.8L12 18l-1.8-5.4L4.7 10.8 10.2 9 12 3.5Z" />
      <path d="m18.5 16 .7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7.7-2.1Z" />
    </Icon>
  );
}

export function CameraIcon(props) {
  return (
    <Icon {...props}>
      <rect x="3" y="6.5" width="12.5" height="11" rx="3" />
      <path d="m15.5 10.2 4.2-2.4a.8.8 0 0 1 1.2.7v7a.8.8 0 0 1-1.2.7l-4.2-2.4" />
    </Icon>
  );
}

export function MessageIcon(props) {
  return (
    <Icon {...props}>
      <path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H7l-4 2 1.4-4.6A7.5 7.5 0 0 1 12.5 4 7.5 7.5 0 0 1 20 11.5Z" />
      <path d="M8.5 11h7M8.5 14h4" />
    </Icon>
  );
}

export function BroadcastIcon(props) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="2.2" />
      <path d="M7.7 7.7a6 6 0 0 0 0 8.6M16.3 7.7a6 6 0 0 1 0 8.6" />
      <path d="M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2" />
    </Icon>
  );
}

export function PlayIcon(props) {
  return (
    <Icon {...props}>
      <path d="M8 5.4v13.2a.8.8 0 0 0 1.2.7l10-6.6a.8.8 0 0 0 0-1.4l-10-6.6A.8.8 0 0 0 8 5.4Z" />
    </Icon>
  );
}

export function StopIcon({ filled = true, ...props }) {
  return (
    <Icon {...props} filled={filled}>
      <rect x="6.5" y="6.5" width="11" height="11" rx="2.4" />
    </Icon>
  );
}

export function CopyIcon(props) {
  return (
    <Icon {...props}>
      <rect x="8" y="8" width="11" height="12" rx="2.5" />
      <path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-8A2.5 2.5 0 0 0 3 6.5v9A2.5 2.5 0 0 0 5.5 18H8" />
    </Icon>
  );
}

export function SpeakerIcon(props) {
  return (
    <Icon {...props}>
      <path d="M4 10v4h3l4 3V7l-4 3H4Z" />
      <path d="M15 9.2a4 4 0 0 1 0 5.6M17.8 6.5a8 8 0 0 1 0 11" />
    </Icon>
  );
}

export function SpeakerOffIcon(props) {
  return (
    <Icon {...props}>
      <path d="M4 10v4h3l4 3V7l-4 3H4Z" />
      <path d="m16 9.5 4 5M20 9.5l-4 5" />
    </Icon>
  );
}

export function InsertIcon(props) {
  return (
    <Icon {...props}>
      <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
      <path d="M4 12h10M10 8l4 4-4 4" />
    </Icon>
  );
}

export function SpaceIcon(props) {
  return (
    <Icon {...props}>
      <path d="M5 9v5h14V9" />
      <path d="M9 14h6" />
    </Icon>
  );
}

export function BackspaceIcon(props) {
  return (
    <Icon {...props}>
      <path d="M9 6h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H9l-5-6 5-6Z" />
      <path d="m11.5 9.5 5 5M16.5 9.5l-5 5" />
    </Icon>
  );
}

export function TrashIcon(props) {
  return (
    <Icon {...props}>
      <path d="M4 7h16M9.5 4h5l.8 3H8.7l.8-3Z" />
      <path d="m6.5 7 1 13h9l1-13M10 11v5M14 11v5" />
    </Icon>
  );
}

export function ShieldIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 3.5 19 6v5.5c0 4.4-2.8 7.5-7 9-4.2-1.5-7-4.6-7-9V6l7-2.5Z" />
      <path d="m9 12 2 2 4-4" />
    </Icon>
  );
}

export function LockIcon(props) {
  return (
    <Icon {...props}>
      <rect x="5" y="10" width="14" height="10" rx="3" />
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10M12 14v2" />
    </Icon>
  );
}

export function MonitorIcon(props) {
  return (
    <Icon {...props}>
      <rect x="3" y="4.5" width="18" height="12.5" rx="2.5" />
      <path d="M9 20h6M12 17v3" />
    </Icon>
  );
}

export function AlertIcon(props) {
  return (
    <Icon {...props}>
      <path d="M12 3.8 21 20H3L12 3.8Z" />
      <path d="M12 9v4.5M12 16.8v.2" />
    </Icon>
  );
}

export function CheckIcon(props) {
  return (
    <Icon {...props}>
      <path d="m5 12.5 4.2 4.2L19 7" />
    </Icon>
  );
}

export function RefreshIcon(props) {
  return (
    <Icon {...props}>
      <path d="M20 11a8 8 0 1 0-2.3 6.2" />
      <path d="M20 5v6h-6" />
    </Icon>
  );
}

export function TextSizeIcon(props) {
  return (
    <Icon {...props}>
      <path d="M4 18 9 6l5 12M6 14h6M15 18l3-8 3 8M16 15h4" />
    </Icon>
  );
}

export function CloseIcon(props) {
  return (
    <Icon {...props}>
      <path d="m6 6 12 12M18 6 6 18" />
    </Icon>
  );
}

export function HeadphonesIcon(props) {
  return (
    <Icon {...props}>
      <path d="M4 14v-2a8 8 0 0 1 16 0v2" />
      <rect x="3" y="13" width="4" height="7" rx="2" />
      <rect x="17" y="13" width="4" height="7" rx="2" />
    </Icon>
  );
}
