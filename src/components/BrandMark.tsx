import React, { useState } from 'react';
import { Building2 } from 'lucide-react';

export function BrandLogoMark({ dark = false }: { dark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0">
      <svg
        width="30"
        height="30"
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect
          width="36"
          height="36"
          rx="8"
          fill={dark ? '#FFFFFF' : '#0B1F3A'}
        />
        <path
          d="M9 26V10H16.5C21.2 10 24.5 13.1 24.5 18C24.5 22.9 21.2 26 16.5 26H9ZM13 22.4H16.3C18.9 22.4 20.4 20.7 20.4 18C20.4 15.3 18.9 13.6 16.3 13.6H13V22.4Z"
          fill={dark ? '#0B1F3A' : '#FFFFFF'}
        />
        <circle cx="27.5" cy="11.5" r="3" fill="#C9972C" />
      </svg>
      <span
        className={`font-display text-lg font-bold tracking-tight ${
          dark ? 'text-white' : 'text-[#0B1F3A]'
        }`}
      >
        DOT BOYS HOSTEL
      </span>
    </span>
  );
}

export function SafeImage({
  src,
  alt,
  className = '',
}: {
  src?: string | null;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-slate-100 text-slate-400 ${className}`}
        role="img"
        aria-label={alt}
      >
        <Building2 className="h-8 w-8 mb-2 text-slate-400" strokeWidth={1.5} />
        <span className="text-xs font-medium text-slate-500 px-3 text-center">{alt}</span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
