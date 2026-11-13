import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Use isolated temp DB for integration test
const testDbPath = path.join(process.cwd(), 'data', `test-${Date.now()}.db`);
process.env.SQLITE_DB_PATH = testDbPath;

const { db, initSchema, seedInitialData, verifyPassword, withTransaction } = await import('./db.ts');
const { generateBillingCycleForMonth, getRoomCategoriesWithAvailability } = await import('./services/hostelLogic.ts');
const { canClaimBed } = await import('../src/lib/occupancy.ts');

test.after(() => {
  try {
    db.close();
  } catch {
    // ignore
  }
  for (const suffix of ['', '-wal', '-shm']) {
    if (fs.existsSync(testDbPath + suffix)) fs.unlinkSync(testDbPath + suffix);
  }
});

test('database initializes schema, seeds initial pricing and hashed bootstrap user', () => {
  initSchema();
  seedInitialData();

  const user = db.prepare("SELECT username, password_hash, must_change_password FROM users WHERE username = 'dotboys'").get() as {
    username: string;
    password_hash: string;
    must_change_password: number;
  };
  assert.equal(user.username, 'dotboys');
  assert.equal(user.must_change_password, 1);
  assert.equal(verifyPassword('admin', user.password_hash), true);
  assert.equal(verifyPassword('wrong', user.password_hash), false);

  const cats = getRoomCategoriesWithAvailability(false) as unknown as Array<{ name: string; monthly_rent: number; available_beds: number }>;
  assert.equal(cats.length, 4);
  assert.equal(cats.find((c) => c.name === '2 Seater')?.monthly_rent, 23000);
  assert.equal(cats.find((c) => c.name === '3 Seater')?.monthly_rent, 18000);
  assert.equal(cats.find((c) => c.name === '4 Seater')?.monthly_rent, 16000);
  assert.equal(cats.find((c) => c.name === '5 Seater')?.monthly_rent, 15000);
});

test('transactional bed allocation prevents double claiming the same bed', () => {
  const freeBed = db.prepare("SELECT id, room_id, status FROM beds WHERE status = 'Available' LIMIT 1").get() as {
    id: number;
    room_id: number;
    status: 'Available' | 'Occupied' | 'Reserved' | 'Maintenance';
  };
  const room = db.prepare('SELECT id, category_id, max_occupancy, is_active FROM rooms WHERE id = ?').get(freeBed.room_id) as {
    id: number;
    category_id: number;
    max_occupancy: number;
    is_active: number;
  };

  assert.equal(canClaimBed(freeBed, room).ok, true);

  withTransaction(() => {
    db.prepare("UPDATE beds SET status = 'Occupied' WHERE id = ?").run(freeBed.id);
  });

  const claimedBed = db.prepare('SELECT id, room_id, status FROM beds WHERE id = ?').get(freeBed.id) as {
    id: number;
    room_id: number;
    status: 'Available' | 'Occupied' | 'Reserved' | 'Maintenance';
  };
  assert.equal(canClaimBed(claimedBed, room).ok, false);
});

test('generateBillingCycleForMonth is idempotent and prevents duplicate monthly invoices', () => {
  const first = generateBillingCycleForMonth('2027-01', 1);
  assert.ok(first.createdCount >= 1);

  const second = generateBillingCycleForMonth('2027-01', 1);
  assert.equal(second.createdCount, 0);
});
