import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { formatPkr } from '../../lib/billing';
import { Link } from '../../lib/router';
import { PublicLayout } from '../../components/PublicLayout';
import { SafeImage } from '../../components/BrandMark';
import { BookingForm } from '../../components/BookingForm';
import type { GalleryMediaItem, RoomCategorySummary } from '../../types';
import type { PublicHomeResponse } from './HomePage';

export function RoomsPage() {
  const { data: home } = useQuery<PublicHomeResponse>({
    queryKey: ['public-home'],
    queryFn: () => apiFetch('/api/public/home'),
  });
  const { data, isLoading } = useQuery<{ categories: RoomCategorySummary[] }>({
    queryKey: ['public-rooms'],
    queryFn: () => apiFetch('/api/public/rooms'),
  });

  const categories = data?.categories || [];

  return (
    <PublicLayout content={home?.content}>
      <section className="bg-[#0B1F3A] text-white py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-3">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Rooms &amp; Monthly Pricing</h1>
          <p className="text-slate-300 max-w-2xl">
            Live room categories, monthly rent in PKR, and real-time bed counts calculated from active resident allocations.
          </p>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-8">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-pulse">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-80 bg-slate-200 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {categories.map((cat) => {
              const effRent = cat.promo_active && cat.promo_rent ? cat.promo_rent : cat.monthly_rent;
              return (
                <article
                  key={cat.id}
                  className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col"
                >
                  <div className="aspect-[16/10] bg-slate-100">
                    <SafeImage
                      src={cat.cover_image}
                      alt={`${cat.name} Room`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="p-6 sm:p-7 flex-1 flex flex-col justify-between space-y-5">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-xs font-medium text-slate-500">
                            {cat.capacity} Beds per Room · {cat.total_rooms} Rooms Active
                          </div>
                          <h2 className="text-2xl font-bold text-[#0B1F3A] mt-0.5">{cat.name}</h2>
                        </div>
                        <div className="text-right">
                          <div className="font-mono text-2xl font-bold text-[#0B1F3A] tabular-nums">
                            {formatPkr(effRent)}
                          </div>
                          <div className="text-xs text-slate-500">per month</div>
                        </div>
                      </div>

                      {cat.promo_active === 1 && cat.promo_rent && (
                        <div className="text-xs font-semibold text-[#A87B1B]">
                          Promotional rate active (Standard: {formatPkr(cat.monthly_rent)})
                        </div>
                      )}

                      <p className="text-sm text-slate-600 leading-relaxed">{cat.description}</p>

                      <div className="grid grid-cols-3 gap-3 py-3 border-y border-slate-100 text-center">
                        <div>
                          <div className="font-mono text-lg font-bold text-slate-900 tabular-nums">
                            {cat.total_beds}
                          </div>
                          <div className="text-xs text-slate-500">Total Beds</div>
                        </div>
                        <div>
                          <div className="font-mono text-lg font-bold text-slate-700 tabular-nums">
                            {cat.occupied_beds + cat.reserved_beds}
                          </div>
                          <div className="text-xs text-slate-500">Occupied / Held</div>
                        </div>
                        <div>
                          <div
                            className={`font-mono text-lg font-bold tabular-nums ${
                              cat.available_beds > 0 ? 'text-emerald-700' : 'text-red-700'
                            }`}
                          >
                            {cat.available_beds}
                          </div>
                          <div className="text-xs text-slate-500">Available Now</div>
                        </div>
                      </div>

                      <ul className="grid grid-cols-2 gap-2 pt-1">
                        {cat.facilities_list.map((f) => (
                          <li key={f} className="flex items-center gap-2 text-xs text-slate-700">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 pt-2">
                      <Link
                        to={`/rooms/${cat.slug}`}
                        className="flex-1 text-center px-4 py-2.5 text-sm font-semibold border border-slate-300 text-[#0B1F3A] rounded-lg hover:bg-slate-50 transition-colors"
                      >
                        Room Details &amp; Media
                      </Link>
                      <Link
                        to={`/book?category=${cat.id}`}
                        className="flex-1 text-center px-4 py-2.5 text-sm font-semibold bg-[#0B1F3A] text-white rounded-lg hover:bg-[#132D52] transition-colors inline-flex items-center justify-center gap-1.5"
                      >
                        Request Booking <ArrowRight className="h-4 w-4" />
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </PublicLayout>
  );
}

export function RoomDetailPage({ slug }: { slug: string }) {
  const { data: home } = useQuery<PublicHomeResponse>({
    queryKey: ['public-home'],
    queryFn: () => apiFetch('/api/public/home'),
  });
  const { data: allRooms } = useQuery<{ categories: RoomCategorySummary[] }>({
    queryKey: ['public-rooms'],
    queryFn: () => apiFetch('/api/public/rooms'),
  });
  const { data, isLoading, error } = useQuery<{
    category: RoomCategorySummary;
    rooms: Array<{
      id: number;
      room_number: string;
      floor: string;
      max_occupancy: number;
      available_beds: number;
      total_beds: number;
    }>;
    media: GalleryMediaItem[];
  }>({
    queryKey: ['public-room-detail', slug],
    queryFn: () => apiFetch(`/api/public/rooms/${slug}`),
  });

  if (isLoading) {
    return (
      <PublicLayout content={home?.content}>
        <div className="max-w-7xl mx-auto px-4 py-16 animate-pulse space-y-6">
          <div className="h-10 w-64 bg-slate-200 rounded" />
          <div className="h-96 bg-slate-200 rounded-xl" />
        </div>
      </PublicLayout>
    );
  }

  if (error || !data) {
    return (
      <PublicLayout content={home?.content}>
        <div className="max-w-3xl mx-auto px-4 py-20 text-center space-y-4">
          <h1 className="text-2xl font-bold text-[#0B1F3A]">Room category not found</h1>
          <Link to="/rooms" className="inline-flex items-center gap-2 text-sm font-semibold text-[#0B1F3A] hover:underline">
            <ArrowLeft className="h-4 w-4" /> Back to Rooms &amp; Pricing
          </Link>
        </div>
      </PublicLayout>
    );
  }

  const { category, rooms, media } = data;
  const effRent = category.promo_active && category.promo_rent ? category.promo_rent : category.monthly_rent;
  const images = media.filter((m) => m.media_type === 'image');
  const videos = media.filter((m) => m.media_type === 'video');

  return (
    <PublicLayout content={home?.content}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-12">
        <div className="space-y-4">
          <Link to="/rooms" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-[#0B1F3A]">
            <ArrowLeft className="h-4 w-4" /> Back to Rooms &amp; Pricing
          </Link>
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-200 pb-6">
            <div>
              <div className="text-xs font-medium text-slate-500">
                {category.capacity} Occupants per Room · {category.total_rooms} Total Rooms
              </div>
              <h1 className="text-3xl sm:text-4xl font-bold text-[#0B1F3A] mt-1">{category.name}</h1>
            </div>
            <div className="md:text-right">
              <div className="font-mono text-3xl font-bold text-[#0B1F3A] tabular-nums">
                {formatPkr(effRent)}
                <span className="text-sm font-sans font-normal text-slate-500"> / month</span>
              </div>
              <div className={`text-sm font-semibold mt-1 ${category.available_beds > 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                {category.available_beds > 0
                  ? `${category.available_beds} of ${category.total_beds} beds currently available`
                  : 'All beds currently occupied or reserved'}
              </div>
            </div>
          </div>
        </div>

        {/* Media Gallery */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 space-y-4">
            <div className="aspect-[16/10] rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
              <SafeImage
                src={images[0]?.url || category.cover_image}
                alt={category.name}
                className="w-full h-full object-cover"
              />
            </div>

            {videos.length > 0 && (
              <div className="space-y-3 pt-2">
                <h2 className="text-lg font-bold text-[#0B1F3A]">Room Video Walkthroughs</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {videos.map((v) => (
                    <div key={v.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden p-3 space-y-2">
                      <video
                        src={v.url}
                        controls
                        muted
                        playsInline
                        preload="metadata"
                        className="w-full rounded-lg aspect-video bg-slate-900"
                      />
                      <div className="text-sm font-semibold text-[#0B1F3A]">{v.title}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h2 className="text-lg font-bold text-[#0B1F3A]">Room Overview</h2>
              <p className="text-sm text-slate-600 leading-relaxed">{category.description}</p>
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="text-xs font-semibold text-slate-500">Included Facilities</div>
                <ul className="space-y-2">
                  {category.facilities_list.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-slate-700">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
              <h2 className="text-lg font-bold text-[#0B1F3A]">Unit Breakdown</h2>
              <div className="divide-y divide-slate-100 text-sm">
                {rooms.map((rm) => (
                  <div key={rm.id} className="py-2.5 flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-slate-900">Room {rm.room_number}</span>
                      <span className="text-slate-500 text-xs ml-2">· {rm.floor}</span>
                    </div>
                    <span
                      className={`font-mono text-xs font-semibold tabular-nums ${
                        rm.available_beds > 0 ? 'text-emerald-700' : 'text-slate-500'
                      }`}
                    >
                      {rm.available_beds}/{rm.total_beds} free
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Dedicated Booking Request Form */}
        <section className="space-y-4 pt-4">
          <div>
            <h2 className="text-2xl font-bold text-[#0B1F3A]">Request a {category.name} Bed</h2>
            <p className="text-sm text-slate-600 mt-1">
              Submit your reservation request below. Management will review availability and contact you to confirm your visit.
            </p>
          </div>
          <BookingForm
            categories={allRooms?.categories || [category]}
            defaultCategoryId={category.id}
            whatsappNumber={home?.content?.whatsapp_number}
          />
        </section>
      </div>
    </PublicLayout>
  );
}
