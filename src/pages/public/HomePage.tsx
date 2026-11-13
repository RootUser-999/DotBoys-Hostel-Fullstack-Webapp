import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  BedDouble,
  CheckCircle2,
  MapPin,
  MessageCircle,
  Phone,
  ShieldCheck,
  Users,
  Utensils,
  Wifi,
} from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { formatPkr } from '../../lib/billing';
import { Link } from '../../lib/router';
import { SafeImage } from '../../components/BrandMark';
import { PublicLayout } from '../../components/PublicLayout';
import type {
  AnnouncementItem,
  FacilityItem,
  FaqItem,
  GalleryMediaItem,
  MessMenuItem,
  RoomCategorySummary,
  WebsiteContentMap,
} from '../../types';

export interface PublicHomeResponse {
  content: WebsiteContentMap;
  categories: RoomCategorySummary[];
  facilities: FacilityItem[];
  todayMenu: MessMenuItem | null;
  todayDayName: string;
  todayDate: string;
  gallery: GalleryMediaItem[];
  announcements: AnnouncementItem[];
  faqs: FaqItem[];
}

function FacilityIcon({ name }: { name: string }) {
  const cls = 'h-5 w-5 text-[#0B1F3A]';
  switch (name) {
    case 'Wifi':
      return <Wifi className={cls} />;
    case 'Utensils':
      return <Utensils className={cls} />;
    case 'ShieldCheck':
      return <ShieldCheck className={cls} />;
    case 'BedDouble':
      return <BedDouble className={cls} />;
    case 'Users':
      return <Users className={cls} />;
    case 'MapPin':
      return <MapPin className={cls} />;
    default:
      return <CheckCircle2 className={cls} />;
  }
}

export function HomePage() {
  const { data, isLoading, error } = useQuery<PublicHomeResponse>({
    queryKey: ['public-home'],
    queryFn: () => apiFetch('/api/public/home'),
  });

  if (isLoading) {
    return (
      <PublicLayout>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-10 animate-pulse">
          <div className="h-[420px] bg-slate-200 rounded-xl" />
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-slate-200 rounded-lg" />
            ))}
          </div>
        </div>
      </PublicLayout>
    );
  }

  if (error || !data) {
    return (
      <PublicLayout>
        <div className="max-w-3xl mx-auto px-4 py-20 text-center">
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Unable to load hostel information</h1>
          <p className="text-slate-600 mt-2">Please refresh the page or call {`+92 305 9308333`}.</p>
        </div>
      </PublicLayout>
    );
  }

  const { content, categories, facilities, todayMenu, todayDayName, gallery, announcements } = data;

  const startingPrice = categories.reduce((min, c) => {
    const eff = c.promo_active && c.promo_rent ? c.promo_rent : c.monthly_rent;
    return eff < min ? eff : min;
  }, categories[0]?.monthly_rent || 15000);

  const totalAvailableBeds = categories.reduce((sum, c) => sum + (c.available_beds || 0), 0);
  const waDigits = (content.whatsapp_number || '+923059308333').replace(/\D/g, '');
  const mapQuery = encodeURIComponent(
    content.map_embed_query || 'Main 6th Road, Satellite Town, Rawalpindi'
  );

  return (
    <PublicLayout content={content}>
      {/* Hero Section */}
      <section className="bg-[#0B1F3A] text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-20 grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-center space-y-6">
            <p className="text-xs font-semibold tracking-wider uppercase text-[#C9972C]">
              Building # D-399 · Main 6th Road · Satellite Town, Rawalpindi
            </p>
            <h1 className="text-3xl sm:text-5xl font-bold tracking-tight leading-[1.12] text-balance">
              {content.hero_title}
            </h1>
            <p className="text-base sm:text-lg text-slate-300 leading-relaxed max-w-xl">
              {content.hero_subtitle}
            </p>
            <div className="flex flex-wrap items-center gap-4 pt-2">
              <Link
                to={content.hero_primary_cta_url || '/rooms'}
                className="inline-flex items-center gap-2 px-6 py-3.5 text-sm font-semibold bg-[#C9972C] text-[#0B1F3A] hover:bg-[#d8a73d] rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                {content.hero_primary_cta_label || 'Explore Rooms'}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to={content.hero_secondary_cta_url || '/contact'}
                className="inline-flex items-center gap-2 px-6 py-3.5 text-sm font-semibold border border-white/25 text-white hover:bg-white/10 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                {content.hero_secondary_cta_label || 'Contact Us'}
              </Link>
            </div>
          </div>

          <div className="lg:col-span-6">
            <div className="relative h-72 sm:h-96 lg:h-full min-h-[340px] rounded-xl overflow-hidden border border-white/10">
              <SafeImage
                src={content.hero_image || '/images/hero-hostel.jpg'}
                alt="DOT BOYS HOSTEL building in Satellite Town, Rawalpindi"
                className="w-full h-full object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Full-width 4-Column Quick Information Strip */}
      <section className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
          <div className="pt-2 sm:pt-0 sm:pr-4">
            <div className="text-xs font-medium text-slate-500">Monthly Rent Starting From</div>
            <div className="text-2xl font-bold text-[#0B1F3A] font-mono tabular-nums mt-1">
              {formatPkr(startingPrice)}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">{categories.length} room categories available</div>
          </div>
          <div className="pt-4 sm:pt-0 sm:px-6">
            <div className="text-xs font-medium text-slate-500">Current Bed Availability</div>
            <div className="text-2xl font-bold text-[#0B1F3A] font-mono tabular-nums mt-1">
              {totalAvailableBeds} Beds Open
            </div>
            <div className="text-xs text-slate-500 mt-0.5">Live inventory from hostel allocations</div>
          </div>
          <div className="pt-4 sm:pt-0 sm:px-6">
            <div className="text-xs font-medium text-slate-500">Prime Location</div>
            <div className="text-base font-semibold text-[#0B1F3A] mt-1">Main 6th Road, D-399</div>
            <div className="text-xs text-slate-500 mt-0.5">Opposite Noor Mobile Mall, Satellite Town</div>
          </div>
          <div className="pt-4 sm:pt-0 sm:pl-6">
            <div className="text-xs font-medium text-slate-500">Direct Management Contact</div>
            <div className="text-base font-semibold text-[#0B1F3A] font-mono tabular-nums mt-1">
              {content.primary_phone}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              {content.contact_person} · {content.secondary_phone}
            </div>
          </div>
        </div>
      </section>

      {/* Published Announcements Banner */}
      {announcements.length > 0 && (
        <section className="bg-amber-50/70 border-b border-amber-200/80">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="text-xs font-semibold text-[#A87B1B]">
                Notice · {announcements[0].publish_date}
              </div>
              <div className="text-sm font-semibold text-[#0B1F3A]">{announcements[0].title}</div>
              <p className="text-sm text-slate-700">{announcements[0].description}</p>
            </div>
            <Link
              to="/book"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0B1F3A] hover:underline whitespace-nowrap shrink-0"
            >
              Reserve Now <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      )}

      {/* Rooms & Pricing Preview */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-2 max-w-2xl">
            <h2 className="text-2xl sm:text-3xl font-bold text-[#0B1F3A] tracking-tight">
              Rooms &amp; Monthly Pricing
            </h2>
            <p className="text-slate-600 text-base">
              Choose between twin-sharing and shared student rooms. Availability updates automatically from active bed allocations.
            </p>
          </div>
          <Link
            to="/rooms"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0B1F3A] hover:text-[#1E4276] whitespace-nowrap shrink-0"
          >
            Compare all rooms <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {categories.map((cat) => {
            const effectiveRent = cat.promo_active && cat.promo_rent ? cat.promo_rent : cat.monthly_rent;
            return (
              <article
                key={cat.id}
                className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col"
              >
                <div className="aspect-[4/3] bg-slate-100 overflow-hidden">
                  <SafeImage
                    src={cat.cover_image}
                    alt={`${cat.name} room at DOT BOYS HOSTEL`}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-slate-500">
                      {cat.capacity} Residents per Room ·{' '}
                      <span className={cat.available_beds > 0 ? 'text-emerald-700 font-semibold' : 'text-red-700 font-semibold'}>
                        {cat.available_beds > 0 ? `${cat.available_beds} Beds Available` : 'Currently Full'}
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-[#0B1F3A]">{cat.name}</h3>
                    <div className="font-mono text-xl font-bold text-[#0B1F3A] tabular-nums">
                      {formatPkr(effectiveRent)}
                      <span className="text-xs font-sans font-normal text-slate-500"> / month</span>
                    </div>
                    <p className="text-sm text-slate-600 line-clamp-2">{cat.description}</p>
                  </div>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                    <Link
                      to={`/rooms/${cat.slug}`}
                      className="text-sm font-semibold text-[#0B1F3A] hover:underline"
                    >
                      View Details
                    </Link>
                    <Link
                      to={`/book?category=${cat.id}`}
                      className="px-3.5 py-2 text-xs font-semibold bg-[#0B1F3A] text-white rounded-lg hover:bg-[#132D52] transition-colors whitespace-nowrap"
                    >
                      Book Bed
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* Why Choose DOT BOYS HOSTEL & Active Facilities */}
      <section className="bg-white border-y border-slate-200 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="space-y-2 max-w-2xl">
              <h2 className="text-2xl sm:text-3xl font-bold text-[#0B1F3A] tracking-tight">
                Why Choose DOT BOYS HOSTEL
              </h2>
              <p className="text-slate-600 text-base">
                {content.about_mission}
              </p>
            </div>
            <Link
              to="/facilities"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#0B1F3A] hover:underline whitespace-nowrap shrink-0"
            >
              All facilities <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {facilities.map((fac, idx) => (
              <div key={fac.id} className="p-6 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-white border border-slate-200">
                    <FacilityIcon name={fac.icon_name} />
                  </span>
                  <span className="text-xs font-mono text-slate-400 tabular-nums">
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                </div>
                <h3 className="text-base font-bold text-[#0B1F3A]">{fac.name}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{fac.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Today's Mess Menu + Gallery Preview */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-medium text-slate-500">
                Today&apos;s Kitchen Schedule · {todayDayName}
              </div>
              <h2 className="text-2xl font-bold text-[#0B1F3A] mt-1">Daily Mess Menu</h2>
            </div>
            <Link to="/mess-menu" className="text-sm font-semibold text-[#0B1F3A] hover:underline whitespace-nowrap">
              Full Week
            </Link>
          </div>

          {todayMenu ? (
            <div className="divide-y divide-slate-200">
              <div className="py-3.5">
                <div className="text-xs font-semibold text-[#A87B1B]">Breakfast</div>
                <div className="text-sm font-medium text-slate-900 mt-1">{todayMenu.breakfast}</div>
              </div>
              <div className="py-3.5">
                <div className="text-xs font-semibold text-[#A87B1B]">Lunch</div>
                <div className="text-sm font-medium text-slate-900 mt-1">{todayMenu.lunch}</div>
              </div>
              <div className="py-3.5">
                <div className="text-xs font-semibold text-[#A87B1B]">Dinner</div>
                <div className="text-sm font-medium text-slate-900 mt-1">{todayMenu.dinner}</div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-600">Menu details will be posted shortly.</p>
          )}

          <p className="text-xs text-slate-500">
            Sample weekly schedule managed by hostel administration. Special menus apply on holidays.
          </p>
        </div>

        <div className="lg:col-span-7 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-[#0B1F3A]">Hostel Gallery</h2>
              <p className="text-sm text-slate-600">Rooms, mess dining hall, and premises at Main 6th Road.</p>
            </div>
            <Link to="/gallery" className="text-sm font-semibold text-[#0B1F3A] hover:underline whitespace-nowrap">
              View Gallery
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {gallery.slice(0, 6).map((item) => (
              <Link
                key={item.id}
                to="/gallery"
                className="group aspect-[4/3] rounded-xl overflow-hidden border border-slate-200 bg-slate-100 block"
              >
                <SafeImage
                  src={item.thumbnail_url || item.url}
                  alt={item.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Location & Direct Contact Section */}
      <section className="bg-white border-t border-slate-200 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          <div className="lg:col-span-5 flex flex-col justify-between space-y-6">
            <div className="space-y-3">
              <h2 className="text-2xl sm:text-3xl font-bold text-[#0B1F3A]">
                Visit Us in Satellite Town, Rawalpindi
              </h2>
              <p className="text-slate-600 text-base">
                {content.address}
              </p>
            </div>

            <div className="space-y-3 text-sm text-slate-700 border-t border-slate-200 pt-5">
              <div>
                <span className="text-slate-500 block text-xs">Contact Person</span>
                <span className="font-semibold text-[#0B1F3A]">{content.contact_person}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-xs">Phone &amp; WhatsApp</span>
                <span className="font-mono font-semibold text-[#0B1F3A] tabular-nums">
                  {content.primary_phone} · {content.secondary_phone}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 pt-2">
              <a
                href={`https://wa.me/${waDigits}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold bg-emerald-700 text-white hover:bg-emerald-800 rounded-lg transition-colors"
              >
                <MessageCircle className="h-4 w-4" />
                Chat on WhatsApp
              </a>
              <a
                href={`tel:${content.primary_phone}`}
                className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold border border-slate-300 text-[#0B1F3A] hover:bg-slate-50 rounded-lg transition-colors"
              >
                <Phone className="h-4 w-4" />
                Call Now
              </a>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${mapQuery}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 px-5 py-3 text-sm font-semibold border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg transition-colors"
              >
                <MapPin className="h-4 w-4" />
                Get Directions
              </a>
            </div>
          </div>

          <div className="lg:col-span-7 min-h-[320px] rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
            <iframe
              title="DOT BOYS HOSTEL Satellite Town Rawalpindi Map"
              src={`https://maps.google.com/maps?q=${mapQuery}&t=&z=15&ie=UTF8&iwloc=&output=embed`}
              className="w-full h-full min-h-[320px] border-0"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
