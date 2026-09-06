import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';

const API = '/api';

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const error = new Error(data.error || 'Request failed');
    error.data = data;
    throw error;
  }
  return data;
}

function getStatusBadge(status) {
  const map = {
    submitted: { label: 'Submitted', className: 'badge gray' },
    approved: { label: 'Approved', className: 'badge blue' },
    rejected: { label: 'Rejected', className: 'badge red' },
    paid: { label: 'Paid', className: 'badge green' },
  };
  return map[status] || { label: status, className: 'badge gray' };
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number(value || 0));
}

function formatDate(date) {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function App() {
  const [users, setUsers] = React.useState([]);
  const [currentUser, setCurrentUser] = React.useState(null);
  const [selectedUserId, setSelectedUserId] = React.useState(1);
  const [staffClaims, setStaffClaims] = React.useState([]);
  const [managerClaims, setManagerClaims] = React.useState([]);
  const [financeData, setFinanceData] = React.useState({ claims: [], totalsByPerson: {}, totalsByCategory: {}, userTotals: [] });
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');

  React.useEffect(() => {
    const bootstrap = async () => {
      try {
        const userList = await fetchJson(`${API}/users`, { headers: { 'x-user-id': '1' } });
        setUsers(userList);
        const first = userList[0];
        setSelectedUserId(first?.id || 1);
        setCurrentUser(first || null);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    bootstrap();
  }, []);

  React.useEffect(() => {
    if (!selectedUserId) return;
    loadUserData(selectedUserId);
  }, [selectedUserId]);

  const loadUserData = async (userId) => {
    try {
      const user = await fetchJson(`${API}/users`, { headers: { 'x-user-id': userId } });
      setCurrentUser(user.find((u) => u.id === Number(userId)) || null);

      const me = await fetchJson(`${API}/me`, { headers: { 'x-user-id': userId } });
      setCurrentUser(me);

      if (me.role === 'staff') {
        const staffData = await fetchJson(`${API}/dashboard/staff/${userId}`, { headers: { 'x-user-id': userId } });
        setStaffClaims(staffData.claims || []);
      }

      if (me.role === 'manager') {
        const staffData = await fetchJson(`${API}/dashboard/staff/${userId}`, { headers: { 'x-user-id': userId } });
        setStaffClaims(staffData.claims || []);

        const managerData = await fetchJson(`${API}/dashboard/manager/${userId}`, { headers: { 'x-user-id': userId } });
        setManagerClaims(managerData.claims || []);
      }

      if (me.role === 'finance') {
        const financeDataResponse = await fetchJson(`${API}/dashboard/finance`, { headers: { 'x-user-id': userId } });
        setFinanceData(financeDataResponse);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const switchUser = async (userId) => {
    setSelectedUserId(Number(userId));
    setError('');
    await loadUserData(Number(userId));
  };

  if (loading) return <div className="loading">Loading app...</div>;

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <h1>Expense Claims</h1>
          <p>Company reimbursement tracker</p>
        </div>
        <div className="user-switcher">
          <label htmlFor="userSelect">Switch user</label>
          <select id="userSelect" value={selectedUserId} onChange={(e) => switchUser(e.target.value)}>
            {users.map((user) => (
              <option key={user.id} value={user.id}>{user.name} ({user.role})</option>
            ))}
          </select>
        </div>
      </header>

      {error && <div className="error-banner">{error}</div>}

      {currentUser && (
        <>
          {(currentUser.role === 'staff' || currentUser.role === 'manager') && (
            <>
              <StaffDashboard user={currentUser} claims={staffClaims} refresh={() => loadUserData(currentUser.id)} />
              {currentUser.role === 'manager' && <ManagerDashboard user={currentUser} claims={managerClaims} refresh={() => loadUserData(currentUser.id)} />}
            </>
          )}
          {currentUser.role === 'finance' && <FinanceDashboard user={currentUser} data={financeData} refresh={() => loadUserData(currentUser.id)} />}
        </>
      )}
    </div>
  );
}

function StaffDashboard({ user, claims, refresh }) {
  const [showForm, setShowForm] = React.useState(false);
  const [rawText, setRawText] = React.useState('');
  const [parsed, setParsed] = React.useState(null);
  const [duplicateWarning, setDuplicateWarning] = React.useState(null);
  const [formState, setFormState] = React.useState({ vendor: '', amount: '', category: 'Travel', expense_date: '', description: '' });
  const [saving, setSaving] = React.useState(false);

  const monthlyTotal = claims.filter((claim) => claim.status !== 'rejected').reduce((sum, claim) => sum + Number(claim.amount || 0), 0);

  const parseClaim = async () => {
    try {
      const data = await fetchJson(`${API}/parse-claim`, {
        method: 'POST',
        headers: { 'x-user-id': String(user.id) },
        body: JSON.stringify({ raw_text: rawText }),
      });
      setParsed(data.parsed);
      setFormState({
        vendor: data.parsed.vendor,
        amount: data.parsed.amount,
        category: data.parsed.category,
        expense_date: data.parsed.expense_date,
        description: data.parsed.description,
      });
    } catch (err) {
      alert(err.message);
    }
  };

  const submitClaim = async (confirmDuplicate = false) => {
    setSaving(true);
    try {
      const payload = {
        raw_text: rawText,
        ...formState,
        amount: Number(formState.amount),
        confirmDuplicate,
      };
      await fetchJson(`${API}/claims`, {
        method: 'POST',
        headers: { 'x-user-id': String(user.id) },
        body: JSON.stringify(payload),
      });
      setShowForm(false);
      setParsed(null);
      setRawText('');
      setDuplicateWarning(null);
      await refresh();
    } catch (err) {
      if (err.data && err.data.warning && err.data.duplicate) {
        setDuplicateWarning({
          existing: err.data.duplicate,
          newClaim: {
            vendor: formState.vendor,
            amount: Number(formState.amount),
            expense_date: formState.expense_date,
            category: formState.category,
            description: formState.description,
          },
        });
      } else {
        alert(err.message || 'Unable to submit claim');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="dashboard">
      <section className="summary-row">
        <div className="card">
          <h3>My Claims</h3>
          <p>{claims.length}</p>
        </div>
        <div className="card">
          <h3>Monthly Spend</h3>
          <p>{formatCurrency(monthlyTotal)}</p>
        </div>
        <div className="card">
          <h3>Monthly Limit</h3>
          <p>{formatCurrency(user.monthly_limit || 15000)}</p>
        </div>
      </section>

      <div className="toolbar">
        <button className="primary" onClick={() => setShowForm(true)}>New Claim</button>
      </div>

      {showForm && (
        <div className="modal">
          <div className="modal-card">
            <h3>Submit a new claim</h3>
            <label>Raw receipt text</label>
            <textarea value={rawText} onChange={(e) => setRawText(e.target.value)} rows={4} />
            <button className="secondary" onClick={parseClaim}>Parse</button>

            {parsed && (
              <div className="form-grid">
                <div><label>Vendor</label><input value={formState.vendor} onChange={(e) => setFormState({ ...formState, vendor: e.target.value })} /></div>
                <div><label>Amount</label><input type="number" value={formState.amount} onChange={(e) => setFormState({ ...formState, amount: e.target.value })} /></div>
                <div><label>Category</label>
                  <select value={formState.category} onChange={(e) => setFormState({ ...formState, category: e.target.value })}>
                    {['Travel', 'Meals', 'Supplies', 'Taxi', 'Other'].map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </div>
                <div><label>Expense Date</label><input type="date" value={formState.expense_date} onChange={(e) => setFormState({ ...formState, expense_date: e.target.value })} /></div>
                <div className="full-span"><label>Description</label><input value={formState.description} onChange={(e) => setFormState({ ...formState, description: e.target.value })} /></div>
              </div>
            )}

            {parsed && (
              <div className="button-row">
                <button className="primary" onClick={() => submitClaim(false)} disabled={saving}>{saving ? 'Saving...' : 'Submit Claim'}</button>
                <button className="ghost" onClick={() => { setShowForm(false); setParsed(null); setRawText(''); setDuplicateWarning(null); }}>Cancel</button>
              </div>
            )}

            {duplicateWarning && (
              <div className="duplicate-warning">
                <h4>Possible duplicate detected</h4>
                <div className="duplicate-grid">
                  <div>
                    <h5>New claim</h5>
                    <p><strong>Vendor:</strong> {duplicateWarning.newClaim.vendor}</p>
                    <p><strong>Amount:</strong> {formatCurrency(duplicateWarning.newClaim.amount)}</p>
                    <p><strong>Date:</strong> {formatDate(duplicateWarning.newClaim.expense_date)}</p>
                  </div>
                  <div>
                    <h5>Earlier claim</h5>
                    <p><strong>Vendor:</strong> {duplicateWarning.existing.vendor}</p>
                    <p><strong>Amount:</strong> {formatCurrency(duplicateWarning.existing.amount)}</p>
                    <p><strong>Date:</strong> {formatDate(duplicateWarning.existing.expense_date)}</p>
                  </div>
                </div>
                <div className="button-row">
                  <button className="primary" onClick={() => submitClaim(true)}>This is a different expense</button>
                  <button className="ghost" onClick={() => setDuplicateWarning(null)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <table>
        <thead>
          <tr>
            <th>Vendor</th>
            <th>Category</th>
            <th>Amount</th>
            <th>Date</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {claims.map((claim) => (
            <tr key={claim.id}>
              <td>{claim.vendor}</td>
              <td>{claim.category}</td>
              <td>{formatCurrency(claim.amount)}</td>
              <td>{formatDate(claim.expense_date)}</td>
              <td><span className={getStatusBadge(claim.status).className}>{getStatusBadge(claim.status).label}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ManagerDashboard({ user, claims, refresh }) {
  const updateClaimStatus = async (claimId, status) => {
    try {
      await fetchJson(`${API}/claims/${claimId}/status`, {
        method: 'PATCH',
        headers: { 'x-user-id': String(user.id) },
        body: JSON.stringify({ status }),
      });
      await refresh();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="dashboard">
      <h2>Manager Dashboard</h2>
      <table>
        <thead>
          <tr>
            <th>Employee</th>
            <th>Vendor</th>
            <th>Category</th>
            <th>Amount</th>
            <th>Date</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {claims.map((claim) => (
            <tr key={claim.id}>
              <td>{claim.submitted_by_name}</td>
              <td>{claim.vendor}</td>
              <td>{claim.category}</td>
              <td>{formatCurrency(claim.amount)}</td>
              <td>{formatDate(claim.expense_date)}</td>
              <td><span className={getStatusBadge(claim.status).className}>{getStatusBadge(claim.status).label}</span></td>
              <td>
                {claim.status === 'submitted' && (
                  <div className="button-row compact">
                    <button className="primary small" onClick={() => updateClaimStatus(claim.id, 'approved')}>Approve</button>
                    <button className="danger small" onClick={() => updateClaimStatus(claim.id, 'rejected')}>Reject</button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FinanceDashboard({ user, data, refresh }) {
  const payClaim = async (claimId) => {
    try {
      await fetchJson(`${API}/claims/${claimId}/status`, {
        method: 'PATCH',
        headers: { 'x-user-id': String(user.id) },
        body: JSON.stringify({ status: 'paid' }),
      });
      await refresh();
    } catch (err) {
      alert(err.message);
    }
  };

  return (
    <div className="dashboard">
      <h2>Finance Dashboard</h2>
      <section className="summary-row">
        <div className="card">
          <h3>Total Claims</h3>
          <p>{data.claims.length}</p>
        </div>
        <div className="card">
          <h3>Monthly Spend</h3>
          <p>{formatCurrency(Object.values(data.totalsByPerson || {}).reduce((sum, v) => sum + Number(v || 0), 0))}</p>
        </div>
      </section>

      <div className="finance-grid">
        <div className="panel">
          <h3>Totals by person</h3>
          <ul>
            {data.userTotals.map((row) => (
              <li key={row.id}>
                <span>{row.name}</span>
                <span>{formatCurrency(row.total)}</span>
                {row.total > row.monthly_limit && <strong> Over limit</strong>}
              </li>
            ))}
          </ul>
        </div>
        <div className="panel">
          <h3>Totals by category</h3>
          <ul>
            {Object.entries(data.totalsByCategory || {}).map(([key, value]) => (
              <li key={key}><span>{key}</span><span>{formatCurrency(value)}</span></li>
            ))}
          </ul>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>User</th>
            <th>Vendor</th>
            <th>Category</th>
            <th>Amount</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {data.claims.map((claim) => (
            <tr key={claim.id}>
              <td>{claim.user_name}</td>
              <td>{claim.vendor}</td>
              <td>{claim.category}</td>
              <td>{formatCurrency(claim.amount)}</td>
              <td><span className={getStatusBadge(claim.status).className}>{getStatusBadge(claim.status).label}</span></td>
              <td>
                {claim.status === 'approved' && <button className="primary small" onClick={() => payClaim(claim.id)}>Mark as Paid</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
