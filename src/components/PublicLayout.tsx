import React, { useState } from 'react';
import { Menu, X, Phone, MapPin, MessageCircle } from 'lucide-react';
import { Link, useRouter } from '../lib/router';
import { BrandLogoMark } from './BrandMark';
import type { WebsiteContentMap } from '../types';

export function PublicLayout({
  content,
  children,
}: {
  content?: Partial<WebsiteContentMap>;
  children: React.ReactNode;
}) {
  const { pathname } = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = [
    { label: 'About', to: '/about' },
    { label: 'Rooms & Pricing', to: '/rooms' },
    { label: 'Facilities', to: '/facilities' },
    { label: 'Mess Menu', to: '/mess-menu' },
    { label: 'Gallery', to: '/gallery' },
    { label: 'Contact', to: '/contact' },
  ];

  const whatsappRaw = (content?.whatsapp_number || '+923059308333').replace(/\D/g, '');
  const promoEnabled = content?.promo_banner_enabled === '1' && Boolean(content?.promo_banner_text);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {promoEnabled && (
        <div className="bg-[#0B1F3A] text-white text-xs py-2 px-4 text-center border-b border-white/10">
          <span>{content?.promo_banner_text}</span>
        </div>
      )}

      {/* Strict 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-6">
          <Link to="/" className="shrink-0 focus-visible:outline-2 focus-visible:outline-[#0B1F3A] rounded">
            <BrandLogoMark />
          </Link>

          <nav aria-label="Main navigation" className="hidden lg:flex items-center gap-6 text-sm font-medium text-slate-600">
            {navItems.map((item) => {
              const active = pathname === item.to || (item.to !== '/' && pathname.startsWith(item.to));
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`whitespace-nowrap shrink-0 py-1 transition-colors border-b-2 ${
                    active
                      ? 'text-[#0B1F3A] border-[#C9972C] font-semibold'
                      : 'border-transparent hover:text-[#0B1F3A] hover:border-slate-300'
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            <Link
              to="/book"
              className="hidden sm:inline-flex items-center justify-center px-5 py-2.5 text-sm font-semibold text-white bg-[#0B1F3A] hover:bg-[#132D52] rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Book a Room
            </Link>
            <button
              type="button"
              onClick={() => setMobileOpen((prev) => !prev)}
              aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileOpen}
              className="lg:hidden inline-flex items-center justify-center h-11 w-11 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="lg:hidden bg-white border-t border-slate-200 px-4 py-4 space-y-1">
            <Link
              to="/"
              onClick={() => setMobileOpen(false)}
              className="block px-3 py-2.5 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Home
            </Link>
            {navItems.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setMobileOpen(false)}
                className="block px-3 py-2.5 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                {item.label}
              </Link>
            ))}
            <div className="pt-2">
              <Link
                to="/book"
                onClick={() => setMobileOpen(false)}
                className="block w-full text-center px-4 py-3 text-sm font-semibold text-white bg-[#0B1F3A] rounded-lg"
              >
                Book a Room
              </Link>
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">{children}</main>

      <footer className="bg-[#0B1F3A] text-slate-300 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
          <div className="space-y-4">
            <BrandLogoMark dark />
            <p className="text-sm text-slate-300 leading-relaxed">
              {content?.footer_note ||
                'Comfortable, secure, and disciplined boys accommodation in Satellite Town, Rawalpindi.'}
            </p>
            <p className="text-xs text-slate-400">
              Managed by {content?.contact_person || 'Nawab Sarfaraz'}
            </p>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-white">Quick Navigation</h3>
            <ul className="space-y-2 text-sm">
              <li><Link to="/" className="hover:text-white transition-colors">Home</Link></li>
              <li><Link to="/about" className="hover:text-white transition-colors">About Us &amp; FAQ</Link></li>
              <li><Link to="/rooms" className="hover:text-white transition-colors">Rooms &amp; Pricing</Link></li>
              <li><Link to="/facilities" className="hover:text-white transition-colors">Facilities</Link></li>
              <li><Link to="/mess-menu" className="hover:text-white transition-colors">Mess Menu</Link></li>
              <li><Link to="/gallery" className="hover:text-white transition-colors">Photo &amp; Video Gallery</Link></li>
            </ul>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-white">Location &amp; Contact</h3>
            <div className="space-y-2.5 text-sm">
              <p className="flex items-start gap-2.5">
                <MapPin className="h-4 w-4 text-[#C9972C] shrink-0 mt-0.5" />
                <span>
                  {content?.address ||
                    'Building # D-399, Main 6th Road, Opposite Noor Mobile Mall, Satellite Town, Rawalpindi, Pakistan'}
                </span>
              </p>
              <p className="flex items-center gap-2.5">
                <Phone className="h-4 w-4 text-[#C9972C] shrink-0" />
                <a href={`tel:${content?.primary_phone || '+923059308333'}`} className="hover:text-white tabular-nums">
                  {content?.primary_phone || '+92 305 9308333'}
                </a>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{content?.secondary_phone || '0301-9308333'}</span>
              </p>
              <p className="flex items-center gap-2.5">
                <MessageCircle className="h-4 w-4 text-[#C9972C] shrink-0" />
                <a
                  href={`https://wa.me/${whatsappRaw}`}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-white"
                >
                  WhatsApp Management
                </a>
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-white">Reservations &amp; Portal</h3>
            <p className="text-sm text-slate-300">
              Reserve your bed online or visit us daily between 9:00 AM and 9:00 PM.
            </p>
            <div className="flex flex-col gap-2.5 pt-1">
              <Link
                to="/book"
                className="inline-flex items-center justify-center px-4 py-2.5 text-sm font-semibold bg-[#C9972C] text-[#0B1F3A] hover:bg-[#d8a73d] rounded-lg transition-colors"
              >
                Book a Room Online
              </Link>
              <div className="flex items-center gap-4 text-xs text-slate-400 pt-1">
                <a
                  href={content?.instagram_url || 'https://instagram.com/dotboyshostel'}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-white"
                >
                  Instagram {content?.instagram_handle || '@dotboyshostel'}
                </a>
                <span aria-hidden="true">·</span>
                <Link to="/legal" className="hover:text-white">Privacy &amp; Terms</Link>
                <span aria-hidden="true">·</span>
                <Link to="/admin/login" className="hover:text-white">Admin Portal</Link>
              </div>
            </div>
          </div>
        </div>
        <div className="border-t border-slate-800/80 py-4 px-4 text-center text-xs text-slate-400">
          © {new Date().getFullYear()} {content?.business_name || 'DOT BOYS HOSTEL'}, Satellite Town, Rawalpindi. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
