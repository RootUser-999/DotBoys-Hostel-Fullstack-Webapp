import React, { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CheckCircle2, MessageCircle } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatPkr } from '../lib/billing';
import type { RoomCategorySummary } from '../types';

const schema = z.object({
  full_name: z.string().trim().min(2, 'Full name is required'),
  father_name: z.string().trim().optional().default(''),
  phone: z.string().trim().min(7, 'Valid phone number is required'),
  whatsapp_number: z.string().trim().min(7, 'Valid WhatsApp number is required'),
  email: z.string().trim().email('Enter a valid email').or(z.literal('')).optional().default(''),
  occupation: z.string().trim().min(2, 'Please specify Student or Occupation'),
  institution_or_company: z.string().trim().min(2, 'University or workplace is required'),
  category_id: z.coerce.number().int().positive('Please select a room category'),
  preferred_move_in: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Select a move-in date'),
  duration_months: z.coerce.number().int().min(1).max(60),
  occupants_count: z.coerce.number().int().min(1).max(5),
  requirements: z.string().optional().default(''),
  message: z.string().optional().default(''),
});

type FormValues = z.infer<typeof schema>;

export function BookingForm({
  categories,
  defaultCategoryId,
  whatsappNumber = '+923059308333',
}: {
  categories: RoomCategorySummary[];
  defaultCategoryId?: number;
  whatsappNumber?: string;
}) {
  const [serverError, setServerError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{
    reference_code: string;
    category_name: string;
    message: string;
  } | null>(null);

  const todayIso = new Date().toISOString().slice(0, 10);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<FormValues>({
    resolver: zodResolver(schema) as never,
    defaultValues: {
      category_id: defaultCategoryId || categories[0]?.id || 1,
      preferred_move_in: todayIso,
      duration_months: 6,
      occupants_count: 1,
      occupation: 'Student',
    },
  });

  const onSubmit = async (values: FormValues) => {
    setServerError(null);
    try {
      const res = await apiFetch<{
        reference_code: string;
        category_name: string;
        message: string;
      }>('/api/public/bookings', {
        method: 'POST',
        body: JSON.stringify(values),
      });
      setConfirmation(res);
      reset();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : 'Unable to submit booking request');
    }
  };

  if (confirmation) {
    const waDigits = whatsappNumber.replace(/\D/g, '');
    const waText = encodeURIComponent(
      `Assalam-o-Alaikum, I submitted a booking request at DOT BOYS HOSTEL. My reference code is ${confirmation.reference_code} (${confirmation.category_name}).`
    );
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-5">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="h-7 w-7 text-emerald-600 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-xl font-bold text-[#0B1F3A]">Booking Request Received</h3>
            <p className="text-sm text-slate-600 mt-1">{confirmation.message}</p>
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="text-xs font-medium text-slate-500">Booking Reference</div>
            <div className="font-mono text-lg font-semibold text-[#0B1F3A] tabular-nums">
              {confirmation.reference_code}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500">Room Category</div>
            <div className="text-sm font-semibold text-slate-800">{confirmation.category_name}</div>
          </div>
          <div>
            <div className="text-xs font-medium text-slate-500">Status</div>
            <div className="text-sm font-semibold text-amber-700">Pending Review</div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 pt-2">
          <a
            href={`https://wa.me/${waDigits}?text=${waText}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold bg-emerald-700 text-white rounded-lg hover:bg-emerald-800 transition-colors"
          >
            <MessageCircle className="h-4 w-4" />
            Message Hostel on WhatsApp
          </a>
          <button
            type="button"
            onClick={() => setConfirmation(null)}
            className="px-5 py-2.5 text-sm font-medium border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50"
          >
            Submit Another Request
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-5" noValidate>
      {serverError && (
        <div role="alert" className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          {serverError}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="bk-full-name" className="block text-sm font-medium text-slate-700 mb-1.5">
            Full Name *
          </label>
          <input
            id="bk-full-name"
            type="text"
            {...register('full_name')}
            placeholder="e.g. Muhammad Ali"
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B1F3A]"
          />
          {errors.full_name && <p className="text-xs text-red-600 mt-1">{errors.full_name.message}</p>}
        </div>

        <div>
          <label htmlFor="bk-father-name" className="block text-sm font-medium text-slate-700 mb-1.5">
            Father / Guardian Name (Optional)
          </label>
          <input
            id="bk-father-name"
            type="text"
            {...register('father_name')}
            placeholder="Guardian full name"
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B1F3A]"
          />
        </div>

        <div>
          <label htmlFor="bk-phone" className="block text-sm font-medium text-slate-700 mb-1.5">
            Phone Number *
          </label>
          <input
            id="bk-phone"
            type="tel"
            {...register('phone')}
            placeholder="03XX-XXXXXXX"
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B1F3A]"
          />
          {errors.phone && <p className="text-xs text-red-600 mt-1">{errors.phone.message}</p>}
        </div>

        <div>
          <label htmlFor="bk-whatsapp" className="block text-sm font-medium text-slate-700 mb-1.5">
            WhatsApp Number *
          </label>
          <input
            id="bk-whatsapp"
            type="tel"
            {...register('whatsapp_number')}
            placeholder="03XX-XXXXXXX"
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B1F3A]"
          />
          {errors.whatsapp_number && <p className="text-xs text-red-600 mt-1">{errors.whatsapp_number.message}</p>}
        </div>

        <div>
          <label htmlFor="bk-email" className="block text-sm font-medium text-slate-700 mb-1.5">
            Email Address (Optional)
          </label>
          <input
            id="bk-email"
            type="email"
            {...register('email')}
            placeholder="you@example.com"
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B1F3A]"
          />
          {errors.email && <p className="text-xs text-red-600 mt-1">{errors.email.message}</p>}
        </div>

        <div>
          <label htmlFor="bk-occupation" className="block text-sm font-medium text-slate-700 mb-1.5">
            Occupation *
          </label>
          <select
            id="bk-occupation"
            {...register('occupation')}
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0B1F3A]"
          >
            <option value="Student">University / College Student</option>
            <option value="Working Professional">Working Professional / Job Holder</option>
            <option value="Exam Aspirant">Exam / Entry Test Aspirant</option>
          </select>
        </div>

        <div>
          <label htmlFor="bk-inst" className="block text-sm font-medium text-slate-700 mb-1.5">
            University or Workplace *
          </label>
          <input
            id="bk-inst"
            type="text"
            {...register('institution_or_company')}
            placeholder="e.g. ARID University / 6th Road Office"
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B1F3A]"
          />
          {errors.institution_or_company && (
            <p className="text-xs text-red-600 mt-1">{errors.institution_or_company.message}</p>
          )}
        </div>

        <div>
          <label htmlFor="bk-category" className="block text-sm font-medium text-slate-700 mb-1.5">
            Preferred Room Category *
          </label>
          <select
            id="bk-category"
            {...register('category_id')}
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#0B1F3A]"
          >
            {categories.map((c) => {
              const effRent = c.promo_active && c.promo_rent ? c.promo_rent : c.monthly_rent;
              return (
                <option key={c.id} value={c.id}>
                  {c.name} — {formatPkr(effRent)}/mo ({c.available_beds} beds available)
                </option>
              );
            })}
          </select>
          {errors.category_id && <p className="text-xs text-red-600 mt-1">{errors.category_id.message}</p>}
        </div>

        <div>
          <label htmlFor="bk-move-in" className="block text-sm font-medium text-slate-700 mb-1.5">
            Preferred Move-In Date *
          </label>
          <input
            id="bk-move-in"
            type="date"
            {...register('preferred_move_in')}
            className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B1F3A]"
          />
          {errors.preferred_move_in && (
            <p className="text-xs text-red-600 mt-1">{errors.preferred_move_in.message}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="bk-duration" className="block text-sm font-medium text-slate-700 mb-1.5">
              Stay (Months) *
            </label>
            <input
              id="bk-duration"
              type="number"
              min={1}
              max={60}
              {...register('duration_months')}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0B1F3A]"
            />
          </div>
          <div>
            <label htmlFor="bk-occupants" className="block text-sm font-medium text-slate-700 mb-1.5">
              Beds Needed *
            </label>
            <input
              id="bk-occupants"
              type="number"
              min={1}
              max={5}
              {...register('occupants_count')}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-[#0B1F3A]"
            />
          </div>
        </div>
      </div>

      <div>
        <label htmlFor="bk-req" className="block text-sm font-medium text-slate-700 mb-1.5">
          Additional Requirements (Floor preference, study desk, etc.)
        </label>
        <input
          id="bk-req"
          type="text"
          {...register('requirements')}
          placeholder="Optional preferences"
          className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B1F3A]"
        />
      </div>

      <div>
        <label htmlFor="bk-msg" className="block text-sm font-medium text-slate-700 mb-1.5">
          Message
        </label>
        <textarea
          id="bk-msg"
          rows={3}
          {...register('message')}
          placeholder="Any questions for hostel management?"
          className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#0B1F3A]"
        />
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full sm:w-auto px-6 py-3 bg-[#0B1F3A] text-white text-sm font-semibold rounded-lg hover:bg-[#132D52] disabled:opacity-60 transition-colors"
      >
        {isSubmitting ? 'Submitting Request...' : 'Submit Booking Request'}
      </button>
    </form>
  );
}
