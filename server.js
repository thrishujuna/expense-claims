import express from 'express';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

const db = new sqlite3.Database(path.join(__dirname, 'expenses.db'));

const ensureTables = () => {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL CHECK(role IN ('staff','manager','finance')),
        manager_id INTEGER,
        monthly_limit INTEGER DEFAULT 15000,
        FOREIGN KEY (manager_id) REFERENCES users(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS claims (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        submitted_by INTEGER NOT NULL,
        raw_text TEXT NOT NULL,
        vendor TEXT NOT NULL,
        amount REAL NOT NULL,
        category TEXT NOT NULL CHECK(category IN ('Travel','Meals','Supplies','Taxi','Other')),
        expense_date TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('submitted','approved','rejected','paid')),
        approved_by INTEGER,
        created_at TEXT NOT NULL,
        paid_at TEXT,
        FOREIGN KEY (submitted_by) REFERENCES users(id),
        FOREIGN KEY (approved_by) REFERENCES users(id)
      )
    `);
  });
};

const seedUsersAndClaims = () => {
  const seed = [
    { name: 'Aditi Sharma', email: 'aditi.sharma@company.com', role: 'manager', monthly_limit: 18000 },
    { name: 'Vikram Nair', email: 'vikram.nair@company.com', role: 'manager', monthly_limit: 18000 },
    { name: 'Meera Iyer', email: 'meera.iyer@company.com', role: 'staff', manager_id: 1, monthly_limit: 15000 },
    { name: 'Rahul Gupta', email: 'rahul.gupta@company.com', role: 'staff', manager_id: 1, monthly_limit: 15000 },
    { name: 'Priya Menon', email: 'priya.menon@company.com', role: 'staff', manager_id: 1, monthly_limit: 15000 },
    { name: 'Karan Patel', email: 'karan.patel@company.com', role: 'staff', manager_id: 2, monthly_limit: 15000 },
    { name: 'Neha Desai', email: 'neha.desai@company.com', role: 'staff', manager_id: 2, monthly_limit: 15000 },
    { name: 'Sanjay Rao', email: 'sanjay.rao@company.com', role: 'staff', manager_id: 2, monthly_limit: 15000 },
    { name: 'Finance Admin', email: 'finance@company.com', role: 'finance', monthly_limit: 50000 },
  ];

  db.serialize(() => {
    const insertUser = (userData) => new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO users (name, email, role, manager_id, monthly_limit) VALUES (?, ?, ?, ?, ?)',
        [userData.name, userData.email, userData.role, userData.manager_id || null, userData.monthly_limit || 15000],
        function runUser(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        },
      );
    });

    (async () => {
      try {
        const userIds = {};
        for (const user of seed) {
          userIds[user.email] = await insertUser(user);
        }

        const claimsSeed = [
          { submitted_by: userIds['meera.iyer@company.com'], raw_text: 'Uber ride to airport 340rs 14 aug', vendor: 'Uber', amount: 340, category: 'Travel', expense_date: '2026-08-14', description: 'Ride to airport', status: 'approved' },
          { submitted_by: userIds['meera.iyer@company.com'], raw_text: 'Swiggy team lunch ~1450', vendor: 'Swiggy', amount: 1450, category: 'Meals', expense_date: '2026-08-15', description: 'Team lunch', status: 'paid' },
          { submitted_by: userIds['rahul.gupta@company.com'], raw_text: 'Office supplies notebook and pen 680 17 aug', vendor: 'Office Depot', amount: 680, category: 'Supplies', expense_date: '2026-08-17', description: 'Stationery purchase', status: 'submitted' },
          { submitted_by: userIds['rahul.gupta@company.com'], raw_text: 'Taxi to client site 520rs 18 aug', vendor: 'Taxi', amount: 520, category: 'Taxi', expense_date: '2026-08-18', description: 'Cab to client site', status: 'approved' },
          { submitted_by: userIds['priya.menon@company.com'], raw_text: 'Zomato dinner 980 20 aug', vendor: 'Zomato', amount: 980, category: 'Meals', expense_date: '2026-08-20', description: 'Dinner with team', status: 'submitted' },
          { submitted_by: userIds['priya.menon@company.com'], raw_text: 'Train ticket to Pune 1425rs 9 aug', vendor: 'Indian Railways', amount: 1425, category: 'Travel', expense_date: '2026-08-09', description: 'Train to Pune', status: 'rejected' },
          { submitted_by: userIds['karan.patel@company.com'], raw_text: 'Ola ride to office 310rs 25 aug', vendor: 'Ola', amount: 310, category: 'Taxi', expense_date: '2026-08-25', description: 'Ride to office', status: 'submitted' },
          { submitted_by: userIds['karan.patel@company.com'], raw_text: 'Hotel stay for customer visit 5200 26 aug', vendor: 'Hotel Stay', amount: 5200, category: 'Travel', expense_date: '2026-08-26', description: 'Customer visit stay', status: 'approved' },
          { submitted_by: userIds['neha.desai@company.com'], raw_text: 'Office snacks and coffee 760 13 aug', vendor: 'Cafe', amount: 760, category: 'Meals', expense_date: '2026-08-13', description: 'Coffee and snacks', status: 'submitted' },
          { submitted_by: userIds['neha.desai@company.com'], raw_text: 'Cab from station 430rs 7 aug', vendor: 'Cab', amount: 430, category: 'Taxi', expense_date: '2026-08-07', description: 'Taxi from station', status: 'paid' },
          { submitted_by: userIds['sanjay.rao@company.com'], raw_text: 'Printer cartridge 1750 12 aug', vendor: 'Printer Cartridge', amount: 1750, category: 'Supplies', expense_date: '2026-08-12', description: 'Printer ink refill', status: 'submitted' },
          { submitted_by: userIds['sanjay.rao@company.com'], raw_text: 'Lunch with client 1450 22 aug', vendor: 'Client Lunch', amount: 1450, category: 'Meals', expense_date: '2026-08-22', description: 'Lunch with client', status: 'approved' },
          { submitted_by: userIds['meera.iyer@company.com'], raw_text: 'Uber airport return 330rs 30 aug', vendor: 'Uber', amount: 330, category: 'Travel', expense_date: '2026-08-30', description: 'Airport return trip', status: 'submitted' },
          { submitted_by: userIds['rahul.gupta@company.com'], raw_text: 'Swiggy lunch 1460 19 aug', vendor: 'Swiggy', amount: 1460, category: 'Meals', expense_date: '2026-08-19', description: 'Lunch order', status: 'submitted' },
          { submitted_by: userIds['priya.menon@company.com'], raw_text: 'Office marker set 640 4 aug', vendor: 'Stationery', amount: 640, category: 'Supplies', expense_date: '2026-08-04', description: 'Markers and labels', status: 'approved' },
          { submitted_by: userIds['karan.patel@company.com'], raw_text: 'Cab to airport 540rs 27 aug', vendor: 'Cab', amount: 540, category: 'Taxi', expense_date: '2026-08-27', description: 'Cab to airport', status: 'submitted' },
          { submitted_by: userIds['neha.desai@company.com'], raw_text: 'Train to Bengaluru 1890 11 aug', vendor: 'Railways', amount: 1890, category: 'Travel', expense_date: '2026-08-11', description: 'Travel to Bengaluru', status: 'approved' },
          { submitted_by: userIds['sanjay.rao@company.com'], raw_text: 'Paper ream 540 28 aug', vendor: 'Paper', amount: 540, category: 'Supplies', expense_date: '2026-08-28', description: 'Paper ream', status: 'submitted' },
          { submitted_by: userIds['meera.iyer@company.com'], raw_text: 'Uber ride to airport 340rs 14 aug', vendor: 'Uber', amount: 340, category: 'Travel', expense_date: '2026-08-14', description: 'Duplicate of prior ride', status: 'submitted' },
          { submitted_by: userIds['sanjay.rao@company.com'], raw_text: 'Client lunch 1450 22 aug', vendor: 'Client Lunch', amount: 1450, category: 'Meals', expense_date: '2026-08-22', description: 'Duplicate lunch claim', status: 'submitted' },
        ];

        for (const claim of claimsSeed) {
          db.run(
            `INSERT INTO claims (submitted_by, raw_text, vendor, amount, category, expense_date, description, status, approved_by, created_at, paid_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), NULL)`,
            [claim.submitted_by, claim.raw_text, claim.vendor, claim.amount, claim.category, claim.expense_date, claim.description, claim.status, null],
          );
        }
      } catch (error) {
        console.error('Seed failed:', error.message);
      }
    })();
  });
};

const initializeDatabase = () => {
  ensureTables();
  db.get('SELECT COUNT(*) AS count FROM users', (err, result) => {
    if (!err && Number(result.count) === 0) {
      seedUsersAndClaims();
    }
  });
};

const categories = ['Travel', 'Meals', 'Supplies', 'Taxi', 'Other'];

const normalizeString = (value) => (value || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();

const parseExpenseText = (rawText) => {
  const text = rawText || '';
  const lower = text.toLowerCase();
  const vendorCandidates = [];
  const amountMatch = text.match(/(rs\.?|inr|₹|rupees)?\s*\(?\d+(?:,\d{3})*(?:\.\d+)?\)?\s*(?:rs|inr|rupees)?/i);
  const amountValue = amountMatch ? Number(String(amountMatch[0]).replace(/[^\d.]/g, '')) : 0;

  const categoryMap = [
    { keywords: ['uber', 'ola', 'train', 'flight', 'airport', 'hotel', 'bus', 'metro', 'airfare', 'travel'], category: 'Travel' },
    { keywords: ['lunch', 'dinner', 'breakfast', 'swiggy', 'zomato', 'cafe', 'meal', 'food', 'snacks'], category: 'Meals' },
    { keywords: ['printer', 'paper', 'pen', 'notebook', 'stationery', 'office', 'supplies', 'marker', 'ink'], category: 'Supplies' },
    { keywords: ['taxi', 'cab', 'auto', 'rickshaw'], category: 'Taxi' },
  ];

  let category = 'Other';
  for (const item of categoryMap) {
    if (item.keywords.some((word) => lower.includes(word))) {
      category = item.category;
      break;
    }
  }

  const dateMatch = text.match(/\b(\d{1,2})\s*(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|may|june|july|august|september|october|november|december)\b/i);
  const dateAlt = text.match(/\b(\d{4}-\d{2}-\d{2}|\d{2}-\d{2}-\d{4}|\d{2}\/\d{2}\/\d{4})\b/);

  let expenseDate = new Date().toISOString().slice(0, 10);
  if (dateMatch) {
    const day = dateMatch[1].padStart(2, '0');
    const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const monthText = dateMatch[0].match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|january|february|march|april|june|july|august|september|october|november|december)/i)[0].toLowerCase();
    const monthIndex = monthNames.indexOf(monthText.slice(0, 3));
    const year = new Date().getFullYear();
    expenseDate = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${day}`;
  } else if (dateAlt) {
    const alt = dateAlt[0];
    if (alt.includes('-')) {
      expenseDate = alt;
    } else {
      const [d, m, y] = alt.split(/[\/]/);
      expenseDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }

  const textWithoutNumbersRefs = text.replace(/\b(?:rs|inr|rupees|₹)\b/gi, '').replace(/\d+(?:,\d{3})*(?:\.\d+)?/g, '');
  const words = textWithoutNumbersRefs.split(/\s+/).filter((w) => w.length > 2 && !['for', 'to', 'and', 'the', 'team', 'ride', 'lunch', 'dinner'].includes(w.toLowerCase()));
  const vendor = words.slice(0, 3).join(' ') || 'Unknown Vendor';

  const description = (() => {
    const cleaned = text.replace(/\b(?:rs|inr|rupees|₹)\b/gi, '').replace(/\d+(?:,\d{3})*(?:\.\d+)?/g, '').replace(/\s+/g, ' ').trim();
    return cleaned ? cleaned.slice(0, 120) : 'Expense claim';
  })();

  return {
    raw_text: text,
    vendor: vendor.charAt(0).toUpperCase() + vendor.slice(1),
    amount: Number(amountValue) || 0,
    category,
    expense_date: expenseDate,
    description: description || 'Expense claim',
  };
};

const isPaidOrLocked = (status) => status === 'paid';

const getUserById = (id) => new Promise((resolve, reject) => {
  db.get('SELECT * FROM users WHERE id = ?', [id], (err, row) => {
    if (err) reject(err);
    else resolve(row);
  });
});

const getCurrentMonthClaims = () => new Promise((resolve, reject) => {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthStartString = monthStart.toISOString().slice(0, 10);

  db.all(
    `SELECT c.*, u.name as submitted_by_name, u.role as submitted_by_role
     FROM claims c
     JOIN users u ON u.id = c.submitted_by
     WHERE c.expense_date >= ? AND c.status IN ('submitted','approved','paid')
     ORDER BY c.expense_date DESC`,
    [monthStartString],
    (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    },
  );
});

const isDuplicateClaim = (userId, candidate, callback) => {
  db.all('SELECT * FROM claims WHERE submitted_by = ? ORDER BY created_at DESC', [userId], (err, rows) => {
    if (err) return callback(err);

    for (const existing of rows) {
      const amountMatch = Number(existing.amount) === Number(candidate.amount);
      const vendorMatch = normalizeString(existing.vendor) === normalizeString(candidate.vendor) ||
        normalizeString(existing.vendor).includes(normalizeString(candidate.vendor)) ||
        normalizeString(candidate.vendor).includes(normalizeString(existing.vendor));
      const dateDelta = Math.abs(new Date(candidate.expense_date) - new Date(existing.expense_date));
      const within30Days = dateDelta <= 30 * 24 * 60 * 60 * 1000;

      if (amountMatch && vendorMatch && within30Days) {
        return callback(null, existing);
      }
    }

    callback(null, null);
  });
};

const requireUser = (req, res, next) => {
  const userId = Number(req.headers['x-user-id']);
  if (!userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  db.get('SELECT * FROM users WHERE id = ?', [userId], (err, user) => {
    if (err || !user) {
      return res.status(401).json({ error: 'Invalid user' });
    }
    req.user = user;
    next();
  });
};

const requireRole = (allowedRoles) => (req, res, next) => {
  if (!allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
};

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/api/users', requireUser, requireRole(['finance', 'manager', 'staff']), (req, res) => {
  db.all('SELECT * FROM users ORDER BY name ASC', (err, users) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(users);
  });
});

app.get('/api/me', requireUser, (req, res) => {
  res.json(req.user);
});

app.get('/api/dashboard/staff/:userId', requireUser, (req, res) => {
  const targetId = Number(req.params.userId);
  if (req.user.role !== 'staff' && req.user.role !== 'manager' && req.user.role !== 'finance') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  if ((req.user.role === 'staff' || req.user.role === 'manager') && req.user.id !== targetId && req.user.role !== 'finance') {
    return res.status(403).json({ error: 'You can only view your own staff dashboard' });
  }

  db.all(
    'SELECT * FROM claims WHERE submitted_by = ? ORDER BY created_at DESC',
    [targetId],
    (err, claims) => {
      if (err) return res.status(500).json({ error: err.message });
      db.get('SELECT * FROM users WHERE id = ?', [targetId], (userErr, user) => {
        if (userErr || !user) return res.status(404).json({ error: 'User not found' });
        const total = claims.filter((claim) => claim.status !== 'rejected').reduce((sum, claim) => sum + Number(claim.amount || 0), 0);
        res.json({ user, claims, total, monthly_limit: user.monthly_limit });
      });
    },
  );
});

app.get('/api/dashboard/manager/:userId', requireUser, (req, res) => {
  const targetId = Number(req.params.userId);
  if (req.user.role !== 'manager' && req.user.role !== 'finance') {
    return res.status(403).json({ error: 'Managers and finance only' });
  }
  if (req.user.role === 'manager' && req.user.id !== targetId && req.user.role !== 'finance') {
    return res.status(403).json({ error: 'Can only view your own dashboard' });
  }

  db.all(
    `SELECT c.*, u.name as submitted_by_name, u.manager_id, u.monthly_limit
     FROM claims c
     JOIN users u ON u.id = c.submitted_by
     WHERE u.manager_id = ? AND c.status IN ('submitted','approved','rejected') AND c.submitted_by != ?
     ORDER BY c.created_at DESC`,
    [targetId, targetId],
    (err, claims) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ claims });
    },
  );
});

app.get('/api/dashboard/finance', requireUser, requireRole(['finance']), (req, res) => {
  db.all(
    `SELECT c.*, u.name as user_name, u.monthly_limit, u.manager_id
     FROM claims c
     JOIN users u ON u.id = c.submitted_by
     WHERE c.expense_date >= date('now', 'start of month')
     ORDER BY c.expense_date DESC`,
    [],
    (err, claims) => {
      if (err) return res.status(500).json({ error: err.message });

      const totalsByPerson = {};
      for (const claim of claims) {
        totalsByPerson[claim.user_name] = (totalsByPerson[claim.user_name] || 0) + Number(claim.amount || 0);
      }

      const totalsByCategory = {};
      for (const claim of claims) {
        totalsByCategory[claim.category] = (totalsByCategory[claim.category] || 0) + Number(claim.amount || 0);
      }

      db.all('SELECT * FROM users ORDER BY name ASC', (userErr, users) => {
        if (userErr) return res.status(500).json({ error: userErr.message });
        const userTotals = users.map((user) => ({
          id: user.id,
          name: user.name,
          role: user.role,
          monthly_limit: user.monthly_limit,
          total: claims
            .filter((claim) => Number(claim.submitted_by) === Number(user.id))
            .reduce((sum, claim) => sum + Number(claim.amount || 0), 0),
        }));

        res.json({ claims, totalsByPerson, totalsByCategory, userTotals });
      });
    },
  );
});

app.post('/api/parse-claim', requireUser, (req, res) => {
  const { raw_text } = req.body || {};
  if (!raw_text || !String(raw_text).trim()) {
    return res.status(400).json({ error: 'Raw receipt text is required' });
  }

  const parsed = parseExpenseText(raw_text);
  res.json({ parsed });
});

app.post('/api/claims', requireUser, requireRole(['staff', 'manager']), async (req, res) => {
  const { raw_text, vendor, amount, category, expense_date, description, confirmDuplicate } = req.body || {};

  if (!raw_text || !vendor || !amount || !category || !expense_date || !description) {
    return res.status(400).json({ error: 'Missing required claim fields' });
  }

  if (!categories.includes(category)) {
    return res.status(400).json({ error: 'Invalid category' });
  }

  const parsedAmount = Number(amount);
  if (Number.isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: 'Amount must be greater than zero' });
  }

  isDuplicateClaim(req.user.id, { amount: parsedAmount, vendor, expense_date }, async (err, duplicate) => {
    if (err) return res.status(500).json({ error: err.message });

    if (!confirmDuplicate && duplicate) {
      return res.status(409).json({
        duplicate,
        warning: true,
        message: 'Possible duplicate claim detected. Please confirm this is a different expense.'
      });
    }

    const normalizedVendor = String(vendor).trim();
    db.run(
      `INSERT INTO claims (submitted_by, raw_text, vendor, amount, category, expense_date, description, status, approved_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'submitted', NULL, datetime('now'))`,
      [req.user.id, raw_text, normalizedVendor, parsedAmount, category, expense_date, description],
      function insertClaim(err) {
        if (err) return res.status(500).json({ error: err.message });

        db.get('SELECT * FROM claims WHERE id = ?', [this.lastID], (claimErr, claim) => {
          if (claimErr) return res.status(500).json({ error: claimErr.message });
          res.status(201).json({ claim, duplicateWarning: Boolean(duplicate) });
        });
      },
    );
  });
});

app.get('/api/claims/:id', requireUser, (req, res) => {
  db.get('SELECT c.*, u.name as submitted_by_name FROM claims c JOIN users u ON u.id = c.submitted_by WHERE c.id = ?', [req.params.id], (err, claim) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!claim) return res.status(404).json({ error: 'Claim not found' });

    if (req.user.role === 'staff' && claim.submitted_by !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (req.user.role === 'manager' && claim.submitted_by !== req.user.id && !req.user.manager_id) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    res.json({ claim });
  });
});

app.patch('/api/claims/:id/status', requireUser, (req, res) => {
  const { status } = req.body || {};
  const claimId = Number(req.params.id);
  if (!claimId) {
    return res.status(400).json({ error: 'Missing claim id' });
  }

  db.get('SELECT * FROM claims WHERE id = ?', [claimId], async (err, claim) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!claim) return res.status(404).json({ error: 'Claim not found' });

    if (claim.status === 'paid') {
      return res.status(409).json({ error: 'This claim is paid and locked' });
    }

    if (status === 'approved' || status === 'rejected') {
      if (req.user.role !== 'manager' && req.user.role !== 'finance') {
        return res.status(403).json({ error: 'Only managers or finance can approve or reject' });
      }

      const submitter = await getUserById(claim.submitted_by);
      if (submitter && req.user.id === submitter.id && req.user.role === 'manager') {
        return res.status(403).json({ error: 'Managers cannot approve or reject their own claims' });
      }

      const approverId = req.user.id;
      const finalStatus = status;
      const paidAt = finalStatus === 'paid' ? new Date().toISOString() : null;

      db.run(
        `UPDATE claims SET status = ?, approved_by = ?, paid_at = ? WHERE id = ?`,
        [finalStatus, approverId, paidAt, claimId],
        (updateErr) => {
          if (updateErr) return res.status(500).json({ error: updateErr.message });
          db.get('SELECT * FROM claims WHERE id = ?', [claimId], (readErr, updatedClaim) => {
            if (readErr) return res.status(500).json({ error: readErr.message });
            res.json({ claim: updatedClaim });
          });
        },
      );
    } else if (status === 'paid') {
      if (req.user.role !== 'finance') {
        return res.status(403).json({ error: 'Only finance can mark claims as paid' });
      }
      if (claim.status !== 'approved') {
        return res.status(409).json({ error: 'Only approved claims can be paid' });
      }

      db.run(
        `UPDATE claims SET status = 'paid', paid_at = ? WHERE id = ?`,
        [new Date().toISOString(), claimId],
        (updateErr) => {
          if (updateErr) return res.status(500).json({ error: updateErr.message });
          db.get('SELECT * FROM claims WHERE id = ?', [claimId], (readErr, updatedClaim) => {
            if (readErr) return res.status(500).json({ error: readErr.message });
            res.json({ claim: updatedClaim });
          });
        },
      );
    } else {
      return res.status(400).json({ error: 'Unsupported status update' });
    }
  });
});

app.patch('/api/claims/:id', requireUser, (req, res) => {
  const claimId = Number(req.params.id);
  const { vendor, amount, category, expense_date, description } = req.body || {};

  db.get('SELECT * FROM claims WHERE id = ?', [claimId], (err, claim) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!claim) return res.status(404).json({ error: 'Claim not found' });
    if (req.user.role !== 'staff' && req.user.role !== 'manager') {
      return res.status(403).json({ error: 'Only staff can edit claims' });
    }
    if (claim.submitted_by !== req.user.id) {
      return res.status(403).json({ error: 'You can only edit your own claims' });
    }
    if (claim.status === 'paid') {
      return res.status(409).json({ error: 'Paid claims are locked and cannot be edited' });
    }
    if (claim.status !== 'submitted') {
      return res.status(409).json({ error: 'Only submitted claims may be edited' });
    }

    const updates = {
      vendor: vendor || claim.vendor,
      amount: amount ? Number(amount) : claim.amount,
      category: category || claim.category,
      expense_date: expense_date || claim.expense_date,
      description: description || claim.description,
      raw_text: `${vendor || claim.vendor} ${amount || claim.amount} ${description || claim.description}`,
    };

    db.run(
      `UPDATE claims SET vendor = ?, amount = ?, category = ?, expense_date = ?, description = ?, raw_text = ? WHERE id = ?`,
      [updates.vendor, updates.amount, updates.category, updates.expense_date, updates.description, updates.raw_text, claimId],
      (updateErr) => {
        if (updateErr) return res.status(500).json({ error: updateErr.message });
        db.get('SELECT * FROM claims WHERE id = ?', [claimId], (readErr, updatedClaim) => {
          if (readErr) return res.status(500).json({ error: readErr.message });
          res.json({ claim: updatedClaim });
        });
      },
    );
  });
});

app.get('/api/seed', requireUser, requireRole(['finance']), async (req, res) => {
  const seed = [
    { name: 'Aditi Sharma', email: 'aditi.sharma@company.com', role: 'manager', monthly_limit: 18000 },
    { name: 'Vikram Nair', email: 'vikram.nair@company.com', role: 'manager', monthly_limit: 18000 },
    { name: 'Meera Iyer', email: 'meera.iyer@company.com', role: 'staff', manager_id: 1, monthly_limit: 15000 },
    { name: 'Rahul Gupta', email: 'rahul.gupta@company.com', role: 'staff', manager_id: 1, monthly_limit: 15000 },
    { name: 'Priya Menon', email: 'priya.menon@company.com', role: 'staff', manager_id: 1, monthly_limit: 15000 },
    { name: 'Karan Patel', email: 'karan.patel@company.com', role: 'staff', manager_id: 2, monthly_limit: 15000 },
    { name: 'Neha Desai', email: 'neha.desai@company.com', role: 'staff', manager_id: 2, monthly_limit: 15000 },
    { name: 'Sanjay Rao', email: 'sanjay.rao@company.com', role: 'staff', manager_id: 2, monthly_limit: 15000 },
    { name: 'Finance Admin', email: 'finance@company.com', role: 'finance', monthly_limit: 50000 },
  ];

  db.get('SELECT COUNT(*) as count FROM users', (countErr, result) => {
    if (countErr) return res.status(500).json({ error: countErr.message });
    if (Number(result.count) > 0) return res.json({ seeded: false, message: 'Database already initialized' });

    db.serialize(() => {
      const insertUser = (userData) => new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO users (name, email, role, manager_id, monthly_limit) VALUES (?, ?, ?, ?, ?)',
          [userData.name, userData.email, userData.role, userData.manager_id || null, userData.monthly_limit || 15000],
          function runUser(err) {
            if (err) reject(err);
            else resolve(this.lastID);
          },
        );
      });

      (async () => {
        try {
          const userIds = {};
          for (const user of seed) {
            userIds[user.email] = await insertUser(user);
          }

          const claimsSeed = [
            { submitted_by: userIds['meera.iyer@company.com'], raw_text: 'Uber ride to airport 340rs 14 aug', vendor: 'Uber', amount: 340, category: 'Travel', expense_date: '2026-08-14', description: 'Ride to airport', status: 'approved' },
            { submitted_by: userIds['meera.iyer@company.com'], raw_text: 'swiggy team lunch ~1450', vendor: 'Swiggy', amount: 1450, category: 'Meals', expense_date: '2026-08-15', description: 'Team lunch', status: 'paid' },
            { submitted_by: userIds['rahul.gupta@company.com'], raw_text: 'Office supplies notebook and pen 680 17 aug', vendor: 'Office Depot', amount: 680, category: 'Supplies', expense_date: '2026-08-17', description: 'Stationery purchase', status: 'submitted' },
            { submitted_by: userIds['rahul.gupta@company.com'], raw_text: 'Taxi to client site 520rs 18 aug', vendor: 'Taxi', amount: 520, category: 'Taxi', expense_date: '2026-08-18', description: 'Cab to client site', status: 'approved' },
            { submitted_by: userIds['priya.menon@company.com'], raw_text: 'Zomato dinner 980 20 aug', vendor: 'Zomato', amount: 980, category: 'Meals', expense_date: '2026-08-20', description: 'Dinner with team', status: 'submitted' },
            { submitted_by: userIds['priya.menon@company.com'], raw_text: 'Train ticket to Pune 1425rs 9 aug', vendor: 'Indian Railways', amount: 1425, category: 'Travel', expense_date: '2026-08-09', description: 'Train to Pune', status: 'rejected' },
            { submitted_by: userIds['karan.patel@company.com'], raw_text: 'Ola ride to office 310rs 25 aug', vendor: 'Ola', amount: 310, category: 'Taxi', expense_date: '2026-08-25', description: 'Ride to office', status: 'submitted' },
            { submitted_by: userIds['karan.patel@company.com'], raw_text: 'Hotel stay for customer visit 5200 26 aug', vendor: 'Hotel Stay', amount: 5200, category: 'Travel', expense_date: '2026-08-26', description: 'Customer visit stay', status: 'approved' },
            { submitted_by: userIds['neha.desai@company.com'], raw_text: 'Office snacks and coffee 760 13 aug', vendor: 'Cafe', amount: 760, category: 'Meals', expense_date: '2026-08-13', description: 'Coffee and snacks', status: 'submitted' },
            { submitted_by: userIds['neha.desai@company.com'], raw_text: 'Cab from station 430rs 7 aug', vendor: 'Cab', amount: 430, category: 'Taxi', expense_date: '2026-08-07', description: 'Taxi from station', status: 'paid' },
            { submitted_by: userIds['sanjay.rao@company.com'], raw_text: 'Printer cartridge 1750 12 aug', vendor: 'Printer Cartridge', amount: 1750, category: 'Supplies', expense_date: '2026-08-12', description: 'Printer ink refill', status: 'submitted' },
            { submitted_by: userIds['sanjay.rao@company.com'], raw_text: 'Lunch with client 1450 22 aug', vendor: 'Client Lunch', amount: 1450, category: 'Meals', expense_date: '2026-08-22', description: 'Lunch with client', status: 'approved' },
            { submitted_by: userIds['meera.iyer@company.com'], raw_text: 'Uber airport return 330rs 30 aug', vendor: 'Uber', amount: 330, category: 'Travel', expense_date: '2026-08-30', description: 'Airport return trip', status: 'submitted' },
            { submitted_by: userIds['rahul.gupta@company.com'], raw_text: 'Swiggy lunch 1460 19 aug', vendor: 'Swiggy', amount: 1460, category: 'Meals', expense_date: '2026-08-19', description: 'Lunch order', status: 'submitted' },
            { submitted_by: userIds['priya.menon@company.com'], raw_text: 'Office marker set 640 4 aug', vendor: 'Stationery', amount: 640, category: 'Supplies', expense_date: '2026-08-04', description: 'Markers and labels', status: 'approved' },
            { submitted_by: userIds['karan.patel@company.com'], raw_text: 'Cab to airport 540rs 27 aug', vendor: 'Cab', amount: 540, category: 'Taxi', expense_date: '2026-08-27', description: 'Cab to airport', status: 'submitted' },
            { submitted_by: userIds['neha.desai@company.com'], raw_text: 'Train to Bengaluru 1890 11 aug', vendor: 'Railways', amount: 1890, category: 'Travel', expense_date: '2026-08-11', description: 'Travel to Bengaluru', status: 'approved' },
            { submitted_by: userIds['sanjay.rao@company.com'], raw_text: 'Paper ream 540 28 aug', vendor: 'Paper', amount: 540, category: 'Supplies', expense_date: '2026-08-28', description: 'Paper ream', status: 'submitted' },
            { submitted_by: userIds['meera.iyer@company.com'], raw_text: 'Uber ride to airport 340rs 14 aug', vendor: 'Uber', amount: 340, category: 'Travel', expense_date: '2026-08-14', description: 'Duplicate of prior ride', status: 'submitted' },
            { submitted_by: userIds['sanjay.rao@company.com'], raw_text: 'Client lunch 1450 22 aug', vendor: 'Client Lunch', amount: 1450, category: 'Meals', expense_date: '2026-08-22', description: 'Duplicate lunch claim', status: 'submitted' },
          ];

          for (const claim of claimsSeed) {
            db.run(
              `INSERT INTO claims (submitted_by, raw_text, vendor, amount, category, expense_date, description, status, approved_by, created_at, paid_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), NULL)`,
              [claim.submitted_by, claim.raw_text, claim.vendor, claim.amount, claim.category, claim.expense_date, claim.description, claim.status, null],
            );
          }

          res.json({ seeded: true, message: 'Seed data created' });
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      })();
    });
  });
});

initializeDatabase();

app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(port, () => {
  console.log(`Expense claims app listening on http://localhost:${port}`);
});
