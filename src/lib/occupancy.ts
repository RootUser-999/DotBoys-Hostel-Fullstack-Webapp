export interface BedRecord {
  id: number;
  room_id: number;
  status: 'Available' | 'Occupied' | 'Reserved' | 'Maintenance';
}

export interface RoomRecord {
  id: number;
  category_id: number;
  max_occupancy: number;
  is_active: number;
}

export interface ActiveReservationHold {
  id: number;
  category_id: number;
  bed_id: number | null;
  status: string;
  hold_expires_at: string | null;
}

export interface CategoryAvailability {
  category_id: number;
  total_rooms: number;
  total_beds: number;
  occupied_beds: number;
  reserved_beds: number;
  maintenance_beds: number;
  available_beds: number;
  is_available: boolean;
}

const HOLD_STATUSES = new Set(['Approved', 'Awaiting Confirmation', 'Confirmed']);

/**
 * Calculates true category occupancy and available beds from live room/bed records
 * and active unexpired reservation holds (preventing overbooking).
 */
export function calculateCategoryAvailability(params: {
  categoryId: number;
  rooms: RoomRecord[];
  beds: BedRecord[];
  reservations: ActiveReservationHold[];
  nowIso: string;
}): CategoryAvailability {
  const activeRooms = params.rooms.filter(
    (r) => r.category_id === params.categoryId && r.is_active === 1
  );
  const activeRoomIds = new Set(activeRooms.map((r) => r.id));
  const categoryBeds = params.beds.filter((b) => activeRoomIds.has(b.room_id));

  let occupied = 0;
  let reservedByBed = 0;
  let maintenance = 0;
  let unallocatedAvailable = 0;

  for (const bed of categoryBeds) {
    if (bed.status === 'Occupied') occupied += 1;
    else if (bed.status === 'Reserved') reservedByBed += 1;
    else if (bed.status === 'Maintenance') maintenance += 1;
    else unallocatedAvailable += 1;
  }

  // Reservations that hold category capacity without yet assigning a specific bed_id
  const unlinkedHolds = params.reservations.filter(
    (res) =>
      res.category_id === params.categoryId &&
      res.bed_id === null &&
      HOLD_STATUSES.has(res.status) &&
      (!res.hold_expires_at || res.hold_expires_at > params.nowIso)
  ).length;

  const reserved = reservedByBed + unlinkedHolds;
  const available = Math.max(0, unallocatedAvailable - unlinkedHolds);

  return {
    category_id: params.categoryId,
    total_rooms: activeRooms.length,
    total_beds: categoryBeds.length,
    occupied_beds: occupied,
    reserved_beds: reserved,
    maintenance_beds: maintenance,
    available_beds: available,
    is_available: available > 0,
  };
}

/**
 * Checks if a specific bed can be allocated to a member or reserved.
 */
export function canClaimBed(bed: BedRecord | undefined, room: RoomRecord | undefined): {
  ok: boolean;
  reason?: string;
} {
  if (!room || room.is_active !== 1) {
    return { ok: false, reason: 'Room is inactive or does not exist.' };
  }
  if (!bed) {
    return { ok: false, reason: 'Selected bed does not exist.' };
  }
  if (bed.status !== 'Available') {
    return { ok: false, reason: `Bed is currently ${bed.status} and cannot be assigned.` };
  }
  return { ok: true };
}
