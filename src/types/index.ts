export type AdminRoleSlug =
  | 'super_admin'
  | 'hostel_manager'
  | 'accounts_manager'
  | 'content_manager';

export type BookingStatus =
  | 'Pending'
  | 'Under Review'
  | 'Approved'
  | 'Awaiting Confirmation'
  | 'Confirmed'
  | 'Rejected'
  | 'Cancelled'
  | 'Expired';

export type MemberStatus =
  | 'Active'
  | 'Pending Registration'
  | 'Notice Given'
  | 'Leaving'
  | 'Checked Out'
  | 'Suspended';

export type BedStatus = 'Available' | 'Occupied' | 'Reserved' | 'Maintenance';

export type InvoiceStatus =
  | 'Paid'
  | 'Unpaid'
  | 'Pending Verification'
  | 'Partially Paid'
  | 'Overdue'
  | 'Waived';

export type PaymentMethod =
  | 'Cash'
  | 'Bank Transfer'
  | 'JazzCash'
  | 'Easypaisa'
  | 'Other';

export interface RoomCategorySummary {
  id: number;
  name: string;
  slug: string;
  capacity: number;
  monthly_rent: number;
  promo_rent: number | null;
  promo_active: number;
  description: string;
  facilities_list: string[];
  cover_image: string;
  video_url: string | null;
  is_active: number;
  display_order: number;
  total_rooms: number;
  total_beds: number;
  occupied_beds: number;
  reserved_beds: number;
  maintenance_beds: number;
  available_beds: number;
}

export interface RoomItem {
  id: number;
  category_id: number;
  category_name: string;
  room_number: string;
  floor: string;
  max_occupancy: number;
  monthly_rent_override: number | null;
  effective_rent: number;
  description: string;
  is_active: number;
  beds: BedItem[];
}

export interface BedItem {
  id: number;
  room_id: number;
  bed_number: string;
  status: BedStatus;
  member_id: number | null;
  member_name: string | null;
  member_code: string | null;
  reservation_id: number | null;
  reservation_ref: string | null;
}

export interface FacilityItem {
  id: number;
  name: string;
  description: string;
  icon_name: string;
  image_url: string | null;
  is_active: number;
  display_order: number;
}

export interface MessMenuItem {
  id: number;
  day_of_week: string;
  effective_date: string | null;
  is_special: number;
  special_title: string | null;
  breakfast: string;
  lunch: string;
  dinner: string;
  image_url: string | null;
  is_published: number;
}

export interface GalleryMediaItem {
  id: number;
  title: string;
  description: string;
  category: string;
  media_type: 'image' | 'video';
  url: string;
  thumbnail_url: string | null;
  room_category_id: number | null;
  is_published: number;
  display_order: number;
  created_at: string;
}

export interface AnnouncementItem {
  id: number;
  title: string;
  description: string;
  image_url: string | null;
  publish_date: string;
  expiry_date: string | null;
  status: 'Published' | 'Draft' | 'Expired';
}

export interface WebsiteContentMap {
  hero_title: string;
  hero_subtitle: string;
  hero_image: string;
  hero_primary_cta_label: string;
  hero_primary_cta_url: string;
  hero_secondary_cta_label: string;
  hero_secondary_cta_url: string;
  promo_banner_enabled: string;
  promo_banner_text: string;
  about_title: string;
  about_body: string;
  about_mission: string;
  business_name: string;
  address: string;
  primary_phone: string;
  secondary_phone: string;
  whatsapp_number: string;
  contact_person: string;
  instagram_handle: string;
  instagram_url: string;
  map_embed_query: string;
  booking_instructions: string;
  footer_note: string;
  seo_title: string;
  seo_description: string;
  privacy_policy: string;
  terms_conditions: string;
}

export interface FaqItem {
  id: number;
  question: string;
  answer: string;
  display_order: number;
  is_published: number;
}
