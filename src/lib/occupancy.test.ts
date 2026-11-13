import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateCategoryAvailability, canClaimBed } from './occupancy';

test('calculateCategoryAvailability computes accurate beds from active allocations and unexpired holds', () => {
  const result = calculateCategoryAvailability({
    categoryId: 1,
    rooms: [
      { id: 101, category_id: 1, max_occupancy: 2, is_active: 1 },
      { id: 102, category_id: 1, max_occupancy: 2, is_active: 1 },
      { id: 103, category_id: 1, max_occupancy: 2, is_active: 0 }, // archived
    ],
    beds: [
      { id: 1, room_id: 101, status: 'Occupied' },
      { id: 2, room_id: 101, status: 'Available' },
      { id: 3, room_id: 102, status: 'Occupied' },
      { id: 4, room_id: 102, status: 'Maintenance' },
      { id: 5, room_id: 103, status: 'Available' }, // ignored because room inactive
    ],
    reservations: [
      {
        id: 1,
        category_id: 1,
        bed_id: null,
        status: 'Approved',
        hold_expires_at: '2026-11-20T00:00:00Z',
      },
      {
        id: 2,
        category_id: 1,
        bed_id: null,
        status: 'Approved',
        hold_expires_at: '2026-11-10T00:00:00Z', // expired hold
      },
    ],
    nowIso: '2026-11-13T12:00:00Z',
  });

  assert.equal(result.total_rooms, 2);
  assert.equal(result.total_beds, 4);
  assert.equal(result.occupied_beds, 2);
  assert.equal(result.maintenance_beds, 1);
  assert.equal(result.reserved_beds, 1);
  assert.equal(result.available_beds, 0);
  assert.equal(result.is_available, false);
});

test('canClaimBed prevents double allocation of non-available beds', () => {
  assert.equal(
    canClaimBed(
      { id: 1, room_id: 101, status: 'Available' },
      { id: 101, category_id: 1, max_occupancy: 2, is_active: 1 }
    ).ok,
    true
  );
  assert.equal(
    canClaimBed(
      { id: 1, room_id: 101, status: 'Occupied' },
      { id: 101, category_id: 1, max_occupancy: 2, is_active: 1 }
    ).ok,
    false
  );
});
