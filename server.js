import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenerativeAI } from '@google/generative-ai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 5000;
const geminiApiKey = process.env.GEMINI_API_KEY || '';

if (geminiApiKey) {
  console.log(`Gemini API key loaded from env: ${geminiApiKey.slice(0, 6)}...`);
} else {
  console.log('Gemini API key loaded from env: MISSING');
}

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

    db.run(`
      CREATE TABLE IF NOT EXISTS claim_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        claim_id INTEGER NOT NULL,
        action TEXT NOT NULL CHECK(action IN ('submitted','approved','rejected','paid')),
        performed_by INTEGER,
        timestamp TEXT NOT NULL,
        FOREIGN KEY (claim_id) REFERENCES claims(id),
        FOREIGN KEY (performed_by) REFERENCES users(id)
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
            function insertSeedClaim(err) {
              if (err) return console.error('Seed claim failed:', err.message);

              const actorId = claim.status === 'paid'
                ? userIds['finance@company.com']
                : claim.status === 'submitted'
                  ? claim.submitted_by
                  : userIds['aditi.sharma@company.com'];

              logClaimHistory(this.lastID, claim.status, actorId).catch((historyErr) => {
                console.error('Seed history failed:', historyErr.message);
              });
            },
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

const parseExpenseTextFallback = (rawText) => {
  const text = String(rawText || '').trim();
  const amountMatch = text.match(/\d+(?:\.\d+)?/);
  const amount = Number(amountMatch ? amountMatch[0] : 0);

  const vendorMatches = [
    /\buber\b/i,
    /\bola\b/i,
    /\bswiggy\b/i,
    /\bzomato\b/i,
    /\boffice depot\b/i,
    /\bprinter cartridge\b/i,
    /\bindian railways\b/i,
    /\bhotel stay\b/i,
    /\bcafe\b/i,
    /\bclient lunch\b/i,
    /\btrain\b/i,
    /\bcab\b/i,
    /\btaxi\b/i,
    /\boffice\b/i,
    /\bpaper\b/i,
    /\bstationery\b/i,
    /\bmarket\b/i,
    /\bshop\b/i,
  ];

  let vendor = 'Unknown Vendor';
  for (const pattern of vendorMatches) {
    const match = text.match(pattern);
    if (match) {
      vendor = match[0].replace(/\s+/g, ' ').trim();
      break;
    }
  }

  if (vendor === 'Unknown Vendor') {
    const beforeAmount = text.slice(0, text.search(/\d/)).trim();
    vendor = beforeAmount.replace(/\b(?:to|from|for|on|at|with|and)\b.*$/gi, '').replace(/\s+/g, ' ').trim() || 'Unknown Vendor';
  }

  const monthMap = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  };

  let expenseDate = new Date().toISOString().slice(0, 10);
  const dateMatch = text.match(/(\d{1,2})\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*/i);
  if (dateMatch) {
    const day = String(dateMatch[1]).padStart(2, '0');
    const month = monthMap[dateMatch[2].toLowerCase()];
    const year = new Date().getFullYear();
    expenseDate = `${year}-${month}-${day}`;
  }

  const category = (() => {
    const lower = text.toLowerCase();
    if (/uber|ola|taxi|cab|ride|train|flight|hotel|airport|travel|rail/.test(lower)) return 'Travel';
    if (/taxi|cab|uber|ola/.test(lower)) return 'Taxi';
    if (/lunch|dinner|coffee|snacks|meal|food|swiggy|zomato|cafe/.test(lower)) return 'Meals';
    if (/notebook|pen|printer|marker|paper|stationery|office|supplies|ink|cartridge/.test(lower)) return 'Supplies';
    return 'Other';
  })();

  const description = text.replace(/\s+/g, ' ').trim();

  return {
    raw_text: text,
    vendor: vendor || 'Unknown Vendor',
    amount,
    category,
    expense_date: expenseDate,
    description: description || 'Expense claim',
  };
};

const resolveGeminiModelName = async (apiKey, preferredModel) => {
  const candidateNames = [];
  if (preferredModel) {
    candidateNames.push(String(preferredModel).replace(/^models\//, ''));
  }
  candidateNames.push('gemini-2.5-flash', 'gemini-3.1-flash-lite', 'gemini-3.1-flash', 'gemini-3.6-flash');

  const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
  const listResponse = await fetch(listUrl, { method: 'GET' });
  const listBody = await listResponse.text();

  if (!listResponse.ok) {
    throw new Error(`Gemini model list request failed (${listResponse.status}): ${listBody}`);
  }

  let models = [];
  try {
    const payload = JSON.parse(listBody);
    models = Array.isArray(payload.models) ? payload.models : [];
  } catch (error) {
    throw new Error('Gemini model list returned invalid JSON.');
  }

  const supported = models.filter((model) => Array.isArray(model.supportedGenerationMethods) && model.supportedGenerationMethods.includes('generateContent'));
  const availableNames = supported.map((model) => String(model.name || '').replace(/^models\//, ''));

  const selected = candidateNames.find((name) => availableNames.includes(name)) || availableNames[0];
  if (!selected) {
    throw new Error(`No Gemini model supports generateContent for this API key. Available models: ${availableNames.join(', ') || 'none'}`);
  }

  console.log('--- Gemini model list checked ---');
  console.log(`Using Gemini model: ${selected}`);
  console.log(`Available generateContent models: ${availableNames.join(', ')}`);

  return selected;
};

const parseExpenseText = async (rawText) => {
  const text = String(rawText || '').trim();
  const apiKey = geminiApiKey;

  if (!text) {
    throw new Error('Raw receipt text is required');
  }

  if (!apiKey) {
    console.log('--- Gemini fallback used ---');
    console.log('No GEMINI_API_KEY configured. Using rule-based parser instead.');
    return parseExpenseTextFallback(text);
  }

  try {
    const modelName = await resolveGeminiModelName(apiKey, process.env.GEMINI_MODEL);
    const prompt = `Extract structured expense claim data from the receipt text below. Return valid JSON only with exactly these keys: vendor, amount, category, expense_date, description.
Rules:
- vendor: merchant name only
- amount: number without currency symbols or commas
- category: must be one of "Travel", "Meals", "Supplies", "Taxi", "Other"
- expense_date: valid date in YYYY-MM-DD format; use today's date if the receipt does not include a date
- description: short summary of the expense
- Do not include markdown fences or explanatory text
Receipt text:
${text}`;

    console.log('--- Gemini prompt sent ---');
    console.log(prompt);

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    });

    const result = await model.generateContent(prompt);
    const rawResponseText = JSON.stringify(result?.response, null, 2);

    console.log('--- Gemini raw response ---');
    console.log(rawResponseText);

    const responseText = await result.response.text();
    const cleaned = String(responseText).replace(/```json|```/gi, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (error) {
      throw new Error('Gemini returned invalid JSON for the receipt parser.');
    }

    const normalized = {
      raw_text: text,
      vendor: String(parsed.vendor || 'Unknown Vendor').trim() || 'Unknown Vendor',
      amount: Number(parsed.amount || 0),
      category: categories.includes(parsed.category) ? parsed.category : 'Other',
      expense_date: parsed.expense_date || new Date().toISOString().slice(0, 10),
      description: String(parsed.description || 'Expense claim').trim() || 'Expense claim',
    };

    if (!Number.isFinite(normalized.amount) || normalized.amount <= 0) {
      throw new Error('Gemini did not return a valid positive amount.');
    }

    return normalized;
  } catch (error) {
    const message = error && error.message ? error.message : String(error);
    console.log('--- Gemini fallback used ---');
    console.log(`Gemini failed: ${message}. Using rule-based parser instead.`);
    return parseExpenseTextFallback(text);
  }
};

const isPaidOrLocked = (status) => status === 'paid';

const getUserById = (id) => new Promise((resolve, reject) => {
  db.get('SELECT * FROM users WHERE id = ?', [id], (err, row) => {
    if (err) reject(err);
    else resolve(row);
  });
});

const logClaimHistory = (claimId, action, performedBy) => new Promise((resolve, reject) => {
  if (!claimId) return reject(new Error('Claim id is required'));
  if (!['submitted', 'approved', 'rejected', 'paid'].includes(action)) {
    return reject(new Error('Unsupported claim action'));
  }

  db.run(
    `INSERT INTO claim_history (claim_id, action, performed_by, timestamp) VALUES (?, ?, ?, datetime('now'))`,
    [claimId, action, performedBy || null],
    function insertHistory(err) {
      if (err) reject(err);
      else resolve(this.lastID);
    },
  );
});

const getClaimById = (claimId) => new Promise((resolve, reject) => {
  db.get('SELECT * FROM claims WHERE id = ?', [claimId], (err, row) => {
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

app.post('/api/parse-claim', requireUser, async (req, res) => {
  const { raw_text } = req.body || {};
  if (!raw_text || !String(raw_text).trim()) {
    return res.status(400).json({ error: 'Raw receipt text is required' });
  }

  try {
    const parsed = await parseExpenseText(raw_text);
    res.json({ parsed });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to parse claim with Gemini.' });
  }
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
      async function insertClaim(err) {
        if (err) return res.status(500).json({ error: err.message });

        try {
          await logClaimHistory(this.lastID, 'submitted', req.user.id);
          const claim = await getClaimById(this.lastID);
          res.status(201).json({ claim, duplicateWarning: Boolean(duplicate) });
        } catch (historyErr) {
          return res.status(500).json({ error: historyErr.message });
        }
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

    db.all(
      `SELECT h.*, u.name as performer_name
       FROM claim_history h
       LEFT JOIN users u ON u.id = h.performed_by
       WHERE h.claim_id = ?
       ORDER BY h.timestamp ASC`,
      [req.params.id],
      (historyErr, history) => {
        if (historyErr) return res.status(500).json({ error: historyErr.message });
        res.json({ claim, history });
      },
    );
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
        async (updateErr) => {
          if (updateErr) return res.status(500).json({ error: updateErr.message });

          try {
            await logClaimHistory(claimId, finalStatus, approverId);
            const updatedClaim = await getClaimById(claimId);
            res.json({ claim: updatedClaim });
          } catch (historyErr) {
            return res.status(500).json({ error: historyErr.message });
          }
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
        async (updateErr) => {
          if (updateErr) return res.status(500).json({ error: updateErr.message });

          try {
            await logClaimHistory(claimId, 'paid', req.user.id);
            const updatedClaim = await getClaimById(claimId);
            res.json({ claim: updatedClaim });
          } catch (historyErr) {
            return res.status(500).json({ error: historyErr.message });
          }
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
