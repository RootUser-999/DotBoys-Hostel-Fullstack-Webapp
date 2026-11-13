import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Save, Trash2, Upload, Send } from 'lucide-react';
import { apiFetch } from '../../lib/api';
import type { AnnouncementItem, FacilityItem, GalleryMediaItem, MessMenuItem, FaqItem } from '../../types';

export function MessMenuAdminModule() {
  const qc = useQueryClient();
  const { data } = useQuery<{ items: MessMenuItem[] }>({
    queryKey: ['admin-mess'],
    queryFn: () => apiFetch('/api/admin/mess-menu'),
  });
  const [edits, setEdits] = useState<Record<number, { breakfast: string; lunch: string; dinner: string }>>({});
  const [specialDate, setSpecialDate] = useState('');
  const [specialTitle, setSpecialTitle] = useState('');
  const [specialB, setSpecialB] = useState('');
  const [specialL, setSpecialL] = useState('');
  const [specialD, setSpecialD] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    if (data?.items) {
      const m: Record<number, { breakfast: string; lunch: string; dinner: string }> = {};
      for (const i of data.items) m[i.id] = { breakfast: i.breakfast, lunch: i.lunch, dinner: i.dinner };
      setEdits(m);
    }
  }, [data]);

  const saveRow = async (id: number) => {
    await apiFetch(`/api/admin/mess-menu/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(edits[id]),
    });
    setFeedback('Menu updated and synced to public website.');
    qc.invalidateQueries({ queryKey: ['admin-mess'] });
    qc.invalidateQueries({ queryKey: ['public-mess-menu'] });
    qc.invalidateQueries({ queryKey: ['public-home'] });
  };

  const addSpecial = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/api/admin/mess-menu', {
      method: 'POST',
      body: JSON.stringify({
        day_of_week: 'Special',
        effective_date: specialDate,
        is_special: 1,
        special_title: specialTitle,
        breakfast: specialB,
        lunch: specialL,
        dinner: specialD,
      }),
    });
    setSpecialDate('');
    setSpecialTitle('');
    setSpecialB('');
    setSpecialL('');
    setSpecialD('');
    qc.invalidateQueries({ queryKey: ['admin-mess'] });
    qc.invalidateQueries({ queryKey: ['public-mess-menu'] });
  };

  return (
    <div className="space-y-6">
      {feedback && <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800">{feedback}</div>}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200">
          <h2 className="text-base font-bold text-[#0B1F3A]">Weekly Recurring &amp; Special Mess Menu</h2>
        </div>
        <div className="divide-y divide-slate-200">
          {(data?.items || []).map((row) => (
            <div key={row.id} className="p-4 grid grid-cols-1 lg:grid-cols-12 gap-3 items-center text-xs">
              <div className="lg:col-span-2 font-bold text-[#0B1F3A]">
                {row.effective_date ? `${row.special_title || 'Special'} (${row.effective_date})` : row.day_of_week}
              </div>
              <input
                aria-label={`${row.day_of_week} breakfast`}
                value={edits[row.id]?.breakfast ?? row.breakfast}
                onChange={(e) => setEdits({ ...edits, [row.id]: { ...edits[row.id], breakfast: e.target.value } })}
                className="lg:col-span-3 px-3 py-2 border border-slate-300 rounded-lg"
              />
              <input
                aria-label={`${row.day_of_week} lunch`}
                value={edits[row.id]?.lunch ?? row.lunch}
                onChange={(e) => setEdits({ ...edits, [row.id]: { ...edits[row.id], lunch: e.target.value } })}
                className="lg:col-span-3 px-3 py-2 border border-slate-300 rounded-lg"
              />
              <input
                aria-label={`${row.day_of_week} dinner`}
                value={edits[row.id]?.dinner ?? row.dinner}
                onChange={(e) => setEdits({ ...edits, [row.id]: { ...edits[row.id], dinner: e.target.value } })}
                className="lg:col-span-3 px-3 py-2 border border-slate-300 rounded-lg"
              />
              <div className="lg:col-span-1 flex justify-end gap-1">
                <button type="button" onClick={() => saveRow(row.id)} className="px-3 py-2 bg-[#0B1F3A] text-white rounded-lg font-semibold">
                  Save
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <form onSubmit={addSpecial} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 text-xs">
        <h3 className="text-sm font-bold text-[#0B1F3A]">Add Date-Specific Holiday / Special Menu Override</h3>
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          <input type="date" required value={specialDate} onChange={(e) => setSpecialDate(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg" />
          <input required placeholder="Event Title" value={specialTitle} onChange={(e) => setSpecialTitle(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg" />
          <input required placeholder="Breakfast" value={specialB} onChange={(e) => setSpecialB(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg" />
          <input required placeholder="Lunch" value={specialL} onChange={(e) => setSpecialL(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg" />
          <input required placeholder="Dinner" value={specialD} onChange={(e) => setSpecialD(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg" />
        </div>
        <button type="submit" className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0B1F3A] text-white font-semibold rounded-lg">
          <Plus className="h-3.5 w-3.5" /> Add Special Date Override
        </button>
      </form>
    </div>
  );
}

export function FacilitiesAdminModule() {
  const qc = useQueryClient();
  const { data } = useQuery<{ items: FacilityItem[] }>({
    queryKey: ['admin-facilities'],
    queryFn: () => apiFetch('/api/admin/facilities'),
  });
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');

  const addFacility = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/api/admin/facilities', {
      method: 'POST',
      body: JSON.stringify({ name, description: desc, icon_name: 'CheckCircle2' }),
    });
    setName('');
    setDesc('');
    qc.invalidateQueries({ queryKey: ['admin-facilities'] });
    qc.invalidateQueries({ queryKey: ['public-facilities'] });
    qc.invalidateQueries({ queryKey: ['public-home'] });
  };

  const toggleActive = async (fac: FacilityItem) => {
    await apiFetch(`/api/admin/facilities/${fac.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: fac.is_active === 1 ? 0 : 1 }),
    });
    qc.invalidateQueries({ queryKey: ['admin-facilities'] });
    qc.invalidateQueries({ queryKey: ['public-facilities'] });
    qc.invalidateQueries({ queryKey: ['public-home'] });
  };

  const removeFac = async (id: number) => {
    await apiFetch(`/api/admin/facilities/${id}`, { method: 'DELETE' });
    qc.invalidateQueries({ queryKey: ['admin-facilities'] });
  };

  return (
    <div className="space-y-6">
      <form onSubmit={addFacility} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 text-xs">
        <h2 className="text-sm font-bold text-[#0B1F3A]">Add Facility</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input required placeholder="Facility Name" value={name} onChange={(e) => setName(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg" />
          <input required placeholder="Description" value={desc} onChange={(e) => setDesc(e.target.value)} className="sm:col-span-2 px-3 py-2 border border-slate-300 rounded-lg" />
        </div>
        <button type="submit" className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0B1F3A] text-white font-semibold rounded-lg">
          <Plus className="h-3.5 w-3.5" /> Add Facility
        </button>
      </form>

      <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-200">
        {(data?.items || []).map((fac) => (
          <div key={fac.id} className="p-4 flex items-center justify-between gap-4 text-xs">
            <div>
              <div className="font-bold text-[#0B1F3A] text-sm">{fac.name}</div>
              <div className="text-slate-600">{fac.description}</div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => toggleActive(fac)}
                className={`px-3 py-1.5 rounded-md font-semibold ${
                  fac.is_active === 1 ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {fac.is_active === 1 ? 'Visible' : 'Hidden'}
              </button>
              <button type="button" onClick={() => removeFac(fac.id)} aria-label={`Delete ${fac.name}`} className="p-1.5 text-red-600 hover:bg-red-50 rounded-md">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function GalleryAdminModule() {
  const qc = useQueryClient();
  const { data } = useQuery<{ items: GalleryMediaItem[] }>({
    queryKey: ['admin-gallery'],
    queryFn: () => apiFetch('/api/admin/gallery'),
  });
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('2 Seater Rooms');
  const [desc, setDesc] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', title);
      fd.append('category', category);
      fd.append('description', desc);
      await apiFetch('/api/admin/gallery/upload', { method: 'POST', body: fd, isFormData: true });
      setTitle('');
      setDesc('');
      setFile(null);
      qc.invalidateQueries({ queryKey: ['admin-gallery'] });
      qc.invalidateQueries({ queryKey: ['public-gallery'] });
    } finally {
      setUploading(false);
    }
  };

  const togglePublish = async (item: GalleryMediaItem) => {
    await apiFetch(`/api/admin/gallery/${item.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_published: item.is_published === 1 ? 0 : 1 }),
    });
    qc.invalidateQueries({ queryKey: ['admin-gallery'] });
    qc.invalidateQueries({ queryKey: ['public-gallery'] });
  };

  const removeMedia = async (id: number) => {
    await apiFetch(`/api/admin/gallery/${id}`, { method: 'DELETE' });
    qc.invalidateQueries({ queryKey: ['admin-gallery'] });
  };

  return (
    <div className="space-y-6">
      <form onSubmit={handleUpload} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 text-xs">
        <h2 className="text-sm font-bold text-[#0B1F3A]">Upload Photo or Video (Max 50 MB)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input required placeholder="Media Title" value={title} onChange={(e) => setTitle(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg" />
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg bg-white">
            <option>2 Seater Rooms</option>
            <option>3 Seater Rooms</option>
            <option>4 Seater Rooms</option>
            <option>5 Seater Rooms</option>
            <option>Common areas</option>
            <option>Washrooms</option>
            <option>Mess</option>
            <option>Other facilities</option>
          </select>
          <input type="file" required accept="image/*,video/mp4,video/webm" onChange={(e) => setFile(e.target.files?.[0] || null)} className="px-3 py-1.5 border border-slate-300 rounded-lg bg-white" />
        </div>
        <input placeholder="Description" value={desc} onChange={(e) => setDesc(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
        <button type="submit" disabled={uploading} className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0B1F3A] text-white font-semibold rounded-lg disabled:opacity-60">
          <Upload className="h-3.5 w-3.5" /> {uploading ? 'Uploading...' : 'Upload & Publish'}
        </button>
      </form>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {(data?.items || []).map((item) => (
          <div key={item.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col">
            <div className="aspect-[4/3] bg-slate-100">
              {item.media_type === 'video' ? (
                <video src={item.url} controls muted className="w-full h-full object-cover" />
              ) : (
                <img src={item.url} alt={item.title} className="w-full h-full object-cover" />
              )}
            </div>
            <div className="p-4 flex items-center justify-between gap-2 text-xs">
              <div className="min-w-0">
                <div className="font-bold text-[#0B1F3A] truncate">{item.title}</div>
                <div className="text-slate-500">{item.category}</div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button type="button" onClick={() => togglePublish(item)} className="px-2.5 py-1 border border-slate-200 rounded-md font-medium">
                  {item.is_published === 1 ? 'Published' : 'Hidden'}
                </button>
                <button type="button" onClick={() => removeMedia(item.id)} aria-label={`Delete ${item.title}`} className="p-1.5 text-red-600 hover:bg-red-50 rounded-md">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AnnouncementsAdminModule() {
  const qc = useQueryClient();
  const { data } = useQuery<{ items: AnnouncementItem[] }>({
    queryKey: ['admin-announcements'],
    queryFn: () => apiFetch('/api/admin/announcements'),
  });
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [expiry, setExpiry] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  const createAnn = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/api/admin/announcements', {
      method: 'POST',
      body: JSON.stringify({ title, description: desc, expiry_date: expiry || null }),
    });
    setTitle('');
    setDesc('');
    setExpiry('');
    qc.invalidateQueries({ queryKey: ['admin-announcements'] });
    qc.invalidateQueries({ queryKey: ['public-home'] });
  };

  const broadcastAnn = async (id: number) => {
    const res = await apiFetch<{ total: number; accepted: number; failed: number }>(
      `/api/admin/announcements/${id}/broadcast`,
      { method: 'POST' }
    );
    setFeedback(`WhatsApp broadcast queued to ${res.total} opted-in residents (${res.accepted} accepted, ${res.failed} failed).`);
  };

  return (
    <div className="space-y-6">
      {feedback && <div className="p-3 bg-slate-900 text-white rounded-lg text-xs">{feedback}</div>}
      <form onSubmit={createAnn} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 text-xs">
        <h2 className="text-sm font-bold text-[#0B1F3A]">Publish Hostel Announcement</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input required placeholder="Announcement Title" value={title} onChange={(e) => setTitle(e.target.value)} className="sm:col-span-2 px-3 py-2 border border-slate-300 rounded-lg" />
          <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} aria-label="Expiry date" className="px-3 py-2 border border-slate-300 rounded-lg" />
        </div>
        <textarea required rows={2} placeholder="Details for residents & website visitors..." value={desc} onChange={(e) => setDesc(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg" />
        <button type="submit" className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0B1F3A] text-white font-semibold rounded-lg">
          <Plus className="h-3.5 w-3.5" /> Publish Announcement
        </button>
      </form>

      <div className="bg-white border border-slate-200 rounded-xl divide-y divide-slate-200">
        {(data?.items || []).map((a) => (
          <div key={a.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div>
              <div className="font-bold text-[#0B1F3A] text-sm">{a.title}</div>
              <div className="text-slate-600 mt-0.5">{a.description}</div>
              <div className="text-slate-400 font-mono mt-1">Published {a.publish_date} · {a.status}</div>
            </div>
            <button
              type="button"
              onClick={() => broadcastAnn(a.id)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-700 text-white rounded-lg font-semibold shrink-0"
            >
              <Send className="h-3.5 w-3.5" /> Broadcast to Residents
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CmsAdminModule() {
  const qc = useQueryClient();
  const { data } = useQuery<{
    rows: Array<{ key: string; value: string; section: string }>;
    faqs: FaqItem[];
  }>({
    queryKey: ['admin-cms'],
    queryFn: () => apiFetch('/api/admin/cms'),
  });
  const [values, setValues] = useState<Record<string, string>>({});
  const [feedback, setFeedback] = useState<string | null>(null);
  const [faqQ, setFaqQ] = useState('');
  const [faqA, setFaqA] = useState('');

  useEffect(() => {
    if (data?.rows) {
      setValues(Object.fromEntries(data.rows.map((r) => [r.key, r.value])));
    }
  }, [data]);

  const saveCms = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/api/admin/cms', {
      method: 'PUT',
      body: JSON.stringify({ updates: values }),
    });
    setFeedback('Website content saved and live on public pages.');
    qc.invalidateQueries({ queryKey: ['admin-cms'] });
    qc.invalidateQueries({ queryKey: ['public-home'] });
  };

  const addFaq = async (e: React.FormEvent) => {
    e.preventDefault();
    await apiFetch('/api/admin/faqs', {
      method: 'POST',
      body: JSON.stringify({ question: faqQ, answer: faqA }),
    });
    setFaqQ('');
    setFaqA('');
    qc.invalidateQueries({ queryKey: ['admin-cms'] });
    qc.invalidateQueries({ queryKey: ['public-home'] });
  };

  const delFaq = async (id: number) => {
    await apiFetch(`/api/admin/faqs/${id}`, { method: 'DELETE' });
    qc.invalidateQueries({ queryKey: ['admin-cms'] });
  };

  return (
    <div className="space-y-6">
      {feedback && <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800">{feedback}</div>}
      <form onSubmit={saveCms} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 text-xs">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-[#0B1F3A]">Website Content Management (CMS)</h2>
          <button type="submit" className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#0B1F3A] text-white font-semibold rounded-lg">
            <Save className="h-3.5 w-3.5" /> Save All Content
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(data?.rows || []).map((row) => (
            <div key={row.key} className={row.value.length > 90 ? 'md:col-span-2' : ''}>
              <label className="block font-semibold text-slate-700 mb-1">
                {row.key.replace(/_/g, ' ')}
              </label>
              {row.value.length > 90 ? (
                <textarea
                  rows={3}
                  value={values[row.key] ?? row.value}
                  onChange={(e) => setValues({ ...values, [row.key]: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              ) : (
                <input
                  value={values[row.key] ?? row.value}
                  onChange={(e) => setValues({ ...values, [row.key]: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                />
              )}
            </div>
          ))}
        </div>
      </form>

      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4 text-xs">
        <h2 className="text-base font-bold text-[#0B1F3A]">Frequently Asked Questions</h2>
        <form onSubmit={addFaq} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input required placeholder="Question" value={faqQ} onChange={(e) => setFaqQ(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg" />
          <input required placeholder="Answer" value={faqA} onChange={(e) => setFaqA(e.target.value)} className="px-3 py-2 border border-slate-300 rounded-lg" />
          <button type="submit" className="px-4 py-2 bg-[#0B1F3A] text-white font-semibold rounded-lg">Add FAQ</button>
        </form>
        <div className="divide-y divide-slate-100">
          {(data?.faqs || []).map((f) => (
            <div key={f.id} className="py-3 flex items-start justify-between gap-4">
              <div>
                <div className="font-bold text-[#0B1F3A]">{f.question}</div>
                <div className="text-slate-600 mt-0.5">{f.answer}</div>
              </div>
              <button type="button" onClick={() => delFaq(f.id)} aria-label="Delete FAQ" className="p-1 text-red-600">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
