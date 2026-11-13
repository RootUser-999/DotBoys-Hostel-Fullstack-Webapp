import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2, MapPin, MessageCircle, Phone, Play, X } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import { PublicLayout } from '../../components/PublicLayout';
import { SafeImage } from '../../components/BrandMark';
import { BookingForm } from '../../components/BookingForm';
import type { PublicHomeResponse } from './HomePage';
import type { FacilityItem, GalleryMediaItem, MessMenuItem, RoomCategorySummary } from '../../types';

export function AboutPage() {
  const { data } = useQuery<PublicHomeResponse>({
    queryKey: ['public-home'],
    queryFn: () => apiFetch('/api/public/home'),
  });
  const content = data?.content;
  const faqs = data?.faqs || [];

  return (
    <PublicLayout content={content}>
      <section className="bg-[#0B1F3A] text-white py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-3">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">About DOT BOYS HOSTEL</h1>
          <p className="text-slate-300 max-w-2xl">
            {content?.address || 'Building # D-399, Main 6th Road, Opposite Noor Mobile Mall, Satellite Town, Rawalpindi.'}
          </p>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-14 space-y-12">
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-10 space-y-4">
          <h2 className="text-2xl font-bold text-[#0B1F3A]">{content?.about_title}</h2>
          <p className="text-slate-700 leading-relaxed">{content?.about_body}</p>
          <p className="text-slate-700 leading-relaxed">{content?.about_mission}</p>
        </div>

        <div className="space-y-5">
          <h2 className="text-2xl font-bold text-[#0B1F3A]">Frequently Asked Questions</h2>
          <div className="divide-y divide-slate-200 bg-white border border-slate-200 rounded-xl">
            {faqs.map((faq) => (
              <div key={faq.id} className="p-6 space-y-2">
                <h3 className="text-base font-bold text-[#0B1F3A]">{faq.question}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}

export function FacilitiesPage() {
  const { data: home } = useQuery<PublicHomeResponse>({
    queryKey: ['public-home'],
    queryFn: () => apiFetch('/api/public/home'),
  });
  const { data, isLoading } = useQuery<{ facilities: FacilityItem[] }>({
    queryKey: ['public-facilities'],
    queryFn: () => apiFetch('/api/public/facilities'),
  });

  return (
    <PublicLayout content={home?.content}>
      <section className="bg-[#0B1F3A] text-white py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-3">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Hostel Facilities</h1>
          <p className="text-slate-300 max-w-2xl">
            Everyday essentials configured by hostel management for comfortable student and working-professional living.
          </p>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-pulse">
            {[1, 2, 3].map((i) => <div key={i} className="h-64 bg-slate-200 rounded-xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {(data?.facilities || []).map((fac) => (
              <article key={fac.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
                <div className="aspect-[4/3] bg-slate-100">
                  <SafeImage src={fac.image_url} alt={fac.name} className="w-full h-full object-cover" />
                </div>
                <div className="p-6 space-y-2">
                  <h2 className="text-lg font-bold text-[#0B1F3A]">{fac.name}</h2>
                  <p className="text-sm text-slate-600 leading-relaxed">{fac.description}</p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </PublicLayout>
  );
}

export function MessMenuPage() {
  const { data: home } = useQuery<PublicHomeResponse>({
    queryKey: ['public-home'],
    queryFn: () => apiFetch('/api/public/home'),
  });
  const { data, isLoading } = useQuery<{
    todayMenu: MessMenuItem | null;
    todayDate: string;
    todayDayName: string;
    weekly: MessMenuItem[];
    overrides: MessMenuItem[];
  }>({
    queryKey: ['public-mess-menu'],
    queryFn: () => apiFetch('/api/public/mess-menu'),
  });

  return (
    <PublicLayout content={home?.content}>
      <section className="bg-[#0B1F3A] text-white py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-3">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Daily &amp; Weekly Mess Menu</h1>
          <p className="text-slate-300 max-w-2xl">
            Three daily meals prepared in our hostel kitchen. Menu below reflects the current editable schedule.
          </p>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-10">
        {isLoading ? (
          <div className="h-64 bg-slate-200 rounded-xl animate-pulse" />
        ) : (
          <>
            {data?.todayMenu && (
              <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-4">
                <div className="text-xs font-semibold text-[#A87B1B]">
                  Today&apos;s Menu · {data.todayDayName} ({data.todayDate})
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-xs font-semibold text-slate-500">Breakfast</div>
                    <div className="text-base font-bold text-[#0B1F3A] mt-1">{data.todayMenu.breakfast}</div>
                  </div>
                  <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-xs font-semibold text-slate-500">Lunch</div>
                    <div className="text-base font-bold text-[#0B1F3A] mt-1">{data.todayMenu.lunch}</div>
                  </div>
                  <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                    <div className="text-xs font-semibold text-slate-500">Dinner</div>
                    <div className="text-base font-bold text-[#0B1F3A] mt-1">{data.todayMenu.dinner}</div>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-200">
                <h2 className="text-lg font-bold text-[#0B1F3A]">Weekly Schedule</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="py-3.5 px-6 font-semibold">Day</th>
                      <th className="py-3.5 px-6 font-semibold">Breakfast</th>
                      <th className="py-3.5 px-6 font-semibold">Lunch</th>
                      <th className="py-3.5 px-6 font-semibold">Dinner</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {(data?.weekly || []).map((row) => (
                      <tr
                        key={row.id}
                        className={row.day_of_week === data?.todayDayName ? 'bg-amber-50/50' : ''}
                      >
                        <td className="py-3.5 px-6 font-semibold text-[#0B1F3A]">{row.day_of_week}</td>
                        <td className="py-3.5 px-6 text-slate-700">{row.breakfast}</td>
                        <td className="py-3.5 px-6 text-slate-700">{row.lunch}</td>
                        <td className="py-3.5 px-6 text-slate-700">{row.dinner}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {data?.overrides && data.overrides.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
                <h2 className="text-lg font-bold text-[#0B1F3A]">Special &amp; Holiday Menus</h2>
                <div className="divide-y divide-slate-100">
                  {data.overrides.map((o) => (
                    <div key={o.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-sm">
                      <div>
                        <span className="font-semibold text-[#0B1F3A]">{o.special_title || 'Special Menu'}</span>
                        <span className="text-slate-500 ml-2 font-mono">{o.effective_date}</span>
                      </div>
                      <div className="text-slate-700">
                        {o.breakfast} · {o.lunch} · {o.dinner}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </PublicLayout>
  );
}

export function GalleryPage() {
  const [selectedCat, setSelectedCat] = useState('All');
  const [lightbox, setLightbox] = useState<GalleryMediaItem | null>(null);

  const { data: home } = useQuery<PublicHomeResponse>({
    queryKey: ['public-home'],
    queryFn: () => apiFetch('/api/public/home'),
  });
  const { data, isLoading } = useQuery<{ items: GalleryMediaItem[] }>({
    queryKey: ['public-gallery'],
    queryFn: () => apiFetch('/api/public/gallery'),
  });

  const items = data?.items || [];
  const categories = ['All', ...Array.from(new Set(items.map((i) => i.category)))];
  const filtered = selectedCat === 'All' ? items : items.filter((i) => i.category === selectedCat);

  return (
    <PublicLayout content={home?.content}>
      <section className="bg-[#0B1F3A] text-white py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-3">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Photo &amp; Video Gallery</h1>
          <p className="text-slate-300 max-w-2xl">
            Browse rooms, dining mess, common spaces, and room tour videos uploaded by hostel management.
          </p>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setSelectedCat(cat)}
              className={`px-4 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap ${
                selectedCat === cat
                  ? 'bg-[#0B1F3A] text-white border-[#0B1F3A]'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 animate-pulse">
            {[1, 2, 3].map((i) => <div key={i} className="h-60 bg-slate-200 rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-500">
            No media items published in this category yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setLightbox(item)}
                className="text-left bg-white border border-slate-200 rounded-xl overflow-hidden group focus-visible:outline-2 focus-visible:outline-[#0B1F3A]"
              >
                <div className="relative aspect-[4/3] bg-slate-100 overflow-hidden">
                  {item.media_type === 'video' ? (
                    <div className="w-full h-full bg-slate-900 flex items-center justify-center text-white">
                      <Play className="h-10 w-10" />
                    </div>
                  ) : (
                    <SafeImage
                      src={item.thumbnail_url || item.url}
                      alt={item.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  )}
                </div>
                <div className="p-4 space-y-1">
                  <div className="text-xs font-medium text-slate-500">{item.category}</div>
                  <div className="text-sm font-bold text-[#0B1F3A]">{item.title}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {lightbox && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.title}
          className="fixed inset-0 z-50 bg-slate-950/85 flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-xl max-w-4xl w-full overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200">
              <div>
                <h3 className="font-bold text-[#0B1F3A]">{lightbox.title}</h3>
                <p className="text-xs text-slate-500">{lightbox.description}</p>
              </div>
              <button
                type="button"
                onClick={() => setLightbox(null)}
                aria-label="Close preview"
                className="p-2 rounded-lg hover:bg-slate-100 text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="bg-slate-950 flex items-center justify-center max-h-[75vh]">
              {lightbox.media_type === 'video' ? (
                <video
                  src={lightbox.url}
                  controls
                  muted
                  playsInline
                  className="max-h-[75vh] w-full"
                />
              ) : (
                <img
                  src={lightbox.url}
                  alt={lightbox.title}
                  className="max-h-[75vh] w-auto object-contain"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </PublicLayout>
  );
}

export function BookPage() {
  const { data: home } = useQuery<PublicHomeResponse>({
    queryKey: ['public-home'],
    queryFn: () => apiFetch('/api/public/home'),
  });
  const { data: roomsData } = useQuery<{ categories: RoomCategorySummary[] }>({
    queryKey: ['public-rooms'],
    queryFn: () => apiFetch('/api/public/rooms'),
  });

  const params = new URLSearchParams(window.location.search);
  const defaultCat = Number(params.get('category') || 0) || undefined;

  return (
    <PublicLayout content={home?.content}>
      <section className="bg-[#0B1F3A] text-white py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-3">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Book a Room Online</h1>
          <p className="text-slate-300 max-w-2xl">
            {home?.content?.booking_instructions ||
              'Submit your accommodation inquiry below. Our team will verify bed availability and contact you.'}
          </p>
        </div>
      </section>

      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <BookingForm
          categories={roomsData?.categories || home?.categories || []}
          defaultCategoryId={defaultCat}
          whatsappNumber={home?.content?.whatsapp_number}
        />
      </section>
    </PublicLayout>
  );
}

const contactSchema = z.object({
  name: z.string().trim().min(2, 'Name is required'),
  phone: z.string().trim().min(7, 'Phone number is required'),
  email: z.string().trim().email('Valid email required').or(z.literal('')).optional().default(''),
  subject: z.string().trim().min(2, 'Subject is required'),
  message: z.string().trim().min(5, 'Please enter your message'),
});

type ContactFormValues = z.infer<typeof contactSchema>;

export function ContactPage() {
  const { data: home } = useQuery<PublicHomeResponse>({
    queryKey: ['public-home'],
    queryFn: () => apiFetch('/api/public/home'),
  });
  const [sentMessage, setSentMessage] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<ContactFormValues>({
    resolver: zodResolver(contactSchema) as never,
    defaultValues: { email: '' },
  });

  const onSubmit = async (vals: ContactFormValues) => {
    setErrMsg(null);
    try {
      const res = await apiFetch<{ message: string }>('/api/public/contact', {
        method: 'POST',
        body: JSON.stringify(vals),
      });
      setSentMessage(res.message);
      reset();
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : 'Unable to send inquiry');
    }
  };

  const content = home?.content;
  const waDigits = (content?.whatsapp_number || '+923059308333').replace(/\D/g, '');
  const mapQuery = encodeURIComponent(content?.map_embed_query || 'Main 6th Road, Satellite Town, Rawalpindi');

  return (
    <PublicLayout content={content}>
      <section className="bg-[#0B1F3A] text-white py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-3">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Contact Us</h1>
          <p className="text-slate-300 max-w-2xl">
            Reach out to {content?.contact_person || 'Nawab Sarfaraz'} and hostel management for visits, room availability, or general inquiries.
          </p>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-bold text-[#0B1F3A]">Hostel Address &amp; Phones</h2>
            <p className="text-sm text-slate-700 flex items-start gap-2.5">
              <MapPin className="h-4 w-4 text-[#C9972C] shrink-0 mt-0.5" />
              <span>{content?.address}</span>
            </p>
            <p className="text-sm text-slate-700 flex items-center gap-2.5 font-mono tabular-nums">
              <Phone className="h-4 w-4 text-[#C9972C] shrink-0" />
              <span>{content?.primary_phone} · {content?.secondary_phone}</span>
            </p>
            <a
              href={`https://wa.me/${waDigits}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 w-full py-3 px-4 bg-emerald-700 text-white text-sm font-semibold rounded-lg hover:bg-emerald-800 transition-colors"
            >
              <MessageCircle className="h-4 w-4" />
              Open WhatsApp Chat
            </a>
          </div>

          <div className="rounded-xl overflow-hidden border border-slate-200 h-72 bg-slate-100">
            <iframe
              title="DOT BOYS HOSTEL Map"
              src={`https://maps.google.com/maps?q=${mapQuery}&t=&z=15&ie=UTF8&iwloc=&output=embed`}
              className="w-full h-full border-0"
              loading="lazy"
            />
          </div>
        </div>

        <div className="lg:col-span-7">
          {sentMessage ? (
            <div className="bg-white border border-slate-200 rounded-xl p-8 space-y-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-6 w-6 text-emerald-600" />
                <h2 className="text-xl font-bold text-[#0B1F3A]">Inquiry Sent</h2>
              </div>
              <p className="text-sm text-slate-600">{sentMessage}</p>
              <button
                type="button"
                onClick={() => setSentMessage(null)}
                className="px-4 py-2 text-sm font-semibold bg-[#0B1F3A] text-white rounded-lg"
              >
                Send Another Inquiry
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-4" noValidate>
              <h2 className="text-xl font-bold text-[#0B1F3A]">Send an Inquiry</h2>
              {errMsg && <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{errMsg}</div>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="ct-name" className="block text-sm font-medium text-slate-700 mb-1">Full Name *</label>
                  <input id="ct-name" {...register('name')} className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm" />
                  {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name.message}</p>}
                </div>
                <div>
                  <label htmlFor="ct-phone" className="block text-sm font-medium text-slate-700 mb-1">Phone Number *</label>
                  <input id="ct-phone" {...register('phone')} className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm" />
                  {errors.phone && <p className="text-xs text-red-600 mt-1">{errors.phone.message}</p>}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="ct-email" className="block text-sm font-medium text-slate-700 mb-1">Email (Optional)</label>
                  <input id="ct-email" type="email" {...register('email')} className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm" />
                  {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email.message}</p>}
                </div>
                <div>
                  <label htmlFor="ct-subj" className="block text-sm font-medium text-slate-700 mb-1">Subject *</label>
                  <input id="ct-subj" {...register('subject')} className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm" />
                  {errors.subject && <p className="text-xs text-red-600 mt-1">{errors.subject.message}</p>}
                </div>
              </div>
              <div>
                <label htmlFor="ct-msg" className="block text-sm font-medium text-slate-700 mb-1">Message *</label>
                <textarea id="ct-msg" rows={4} {...register('message')} className="w-full px-3.5 py-2.5 border border-slate-300 rounded-lg text-sm" />
                {errors.message && <p className="text-xs text-red-600 mt-1">{errors.message.message}</p>}
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-3 bg-[#0B1F3A] text-white text-sm font-semibold rounded-lg hover:bg-[#132D52] disabled:opacity-60"
              >
                {isSubmitting ? 'Sending...' : 'Send Message'}
              </button>
            </form>
          )}
        </div>
      </section>
    </PublicLayout>
  );
}

export function LegalPage() {
  const { data } = useQuery<PublicHomeResponse>({
    queryKey: ['public-home'],
    queryFn: () => apiFetch('/api/public/home'),
  });
  const content = data?.content;
  return (
    <PublicLayout content={content}>
      <section className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-14 space-y-8">
        <h1 className="text-3xl font-bold text-[#0B1F3A]">Privacy Policy &amp; Hostel Terms</h1>
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-3">
          <h2 className="text-xl font-bold text-[#0B1F3A]">Privacy Policy</h2>
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
            {content?.privacy_policy}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-3">
          <h2 className="text-xl font-bold text-[#0B1F3A]">Hostel Terms &amp; Conditions</h2>
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
            {content?.terms_conditions}
          </p>
        </div>
      </section>
    </PublicLayout>
  );
}
