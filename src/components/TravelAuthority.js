import React, { useEffect, useState } from 'react';
import * as XLSX from 'xlsx';
import './TravelAuthority.css';

const emptyForm = {
  initial: '',
  name: '',
  positiondesignation: '',
  station: '',
  purpose: '',
  host: '',
  fromDate: '', // Consistent key for date picker
  toDate: '',   // Consistent key for date picker
  destination: '',
  area: ''
};

const TravelAuthority = () => {
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [entries, setEntries] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [travelRes, empRes] = await Promise.all([
        fetch('http://localhost:3000/travels'),
        fetch('http://localhost:3000/employees')
      ]);
      if (!travelRes.ok || !empRes.ok) throw new Error('Network response was not ok');
      const [travelData, empData] = await Promise.all([
        travelRes.json(),
        empRes.json()
      ]);
      setEntries(travelData || []);
      setEmployees(empData || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const handleSelectEmployee = (e) => {
    const selectedId = parseInt(e.target.value);
    const emp = employees.find(emp => emp.uid === selectedId);
    if (emp) {
      setForm(prev => ({
        ...prev,
        name: emp.fullname || '',
        positiondesignation: emp.positionTitle || '',
        initial: emp.Initial || '',
        station: emp.office || ''
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const method = editingId ? 'PUT' : 'POST';
    const url = editingId
      ? `http://localhost:3000/travels/${editingId}`
      : 'http://localhost:3000/travels';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          datesfrom: form.fromDate,
          datesto: form.toDate
        })
      });

      if (!res.ok) throw new Error('Failed to save entry');
      const data = await res.json();

      if (editingId) {
        setEntries(prev =>
          prev.map(e => (e.id === editingId ? { ...form, id: editingId, DatesFrom: form.fromDate, DatesTo: form.toDate } : e))
        );
      } else {
        setEntries(prev => [...prev, { ...form, id: data.id, DatesFrom: form.fromDate, DatesTo: form.toDate }]);
      }

      setForm(emptyForm);
      setEditingId(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (entry) => {
    // Ensure dates are properly mapped and formatted
    const formattedEntry = {
      ...entry,
      fromDate: entry.DatesFrom ? new Date(entry.DatesFrom).toISOString().split('T')[0] : '',
      toDate: entry.DatesTo ? new Date(entry.DatesTo).toISOString().split('T')[0] : ''
    };
    setForm(formattedEntry);
    setEditingId(entry.id);
    console.log('Editing entry:', formattedEntry); // Debug log
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this entry?')) return;
    setLoading(true);
    try {
      await fetch(`http://localhost:3000/travels/${id}`, { method: 'DELETE' });
      setEntries(prev => prev.filter(e => e.id !== id));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const normalizeKey = (key) => key?.toLowerCase().trim();

  const parseDMYtoYMD = (input) => {
    if (!input) return '';

    if (!isNaN(input)) {
      const excelSerial = Number(input);
      const excelEpoch = new Date('1899-12-30');
      const date = new Date(excelEpoch.getTime() + (excelSerial * 24 * 60 * 60 * 1000));
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    const cleaned = input.toString().replace(/["'\r\n]/g, '').trim();
    const parts = cleaned.split(/[/\-.]/);
    if (parts.length === 3) {
      let [d, m, y] = parts;
      if (y.length === 2) y = '20' + y;
      return `${y.padStart(4, '0')}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    return '';
  };

  const handleExcel = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      setLoading(true);
      try {
        const workbook = XLSX.read(evt.target.result, { type: 'binary' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(sheet);

        const payload = data.map((row) => {
          const keys = Object.keys(row).reduce((acc, key) => {
            acc[normalizeKey(key)] = row[key];
            return acc;
          }, {});

          return {
            initial: keys['initial'] || '',
            name: keys['name'] || '',
            positiondesignation: keys['position /designation'] || keys['positiondesignation'] || '',
            station: keys['official station'] || keys['station'] || '',
            purpose: keys['purpose of travel'] || keys['purpose'] || '',
            host: keys['host of activity'] || keys['host'] || '',
            fromDate: parseDMYtoYMD(keys['datesfrom']) || '',
            toDate: parseDMYtoYMD(keys['datesto']) || '',
            destination: keys['destination'] || '',
            area: keys['area'] || ''
          };
        });

        const res = await fetch('http://localhost:3000/travels/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const text = await res.text();
        try {
          const result = JSON.parse(text);
          alert(result.message);
          fetchData();
        } catch (err) {
          setError('Server returned an invalid response.');
        }
      } catch (err) {
        setError('Failed to parse Excel file.');
      } finally {
        setLoading(false);
      }
    };

    reader.readAsBinaryString(file);
  };

  const filtered = entries.filter(entry =>
    Object.values(entry).some(val =>
      typeof val === 'string' &&
      val.toLowerCase().includes(search.toLowerCase())
    )
  );

  return (
    <div className="travel-authority">
      <h1>Travel Authority Database</h1>

      <div className="controls">
        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="search-input"
        />
        <input
          type="file"
          onChange={handleExcel}
          className="excel-upload"
          accept=".xlsx,.xls"
        />
        <select onChange={handleSelectEmployee} className="employee-dropdown">
          <option value="">Select Employee</option>
          {employees.map(emp => (
            <option key={emp.uid} value={emp.uid}>
              {emp.fullname} - {emp.Initial}
            </option>
          ))}
        </select>
      </div>

      <form onSubmit={handleSubmit} className="travel-form">
        <div className="form-row">
          <input
            type="text"
            name="name"
            value={form.name}
            onChange={handleChange}
            placeholder="Name"
            className="form-input large-text"
            required
          />
          <input
            type="text"
            name="positiondesignation"
            value={form.positiondesignation}
            onChange={handleChange}
            placeholder="Position/Designation"
            className="form-input large-text"
            required
          />
        </div>
        <div className="form-row">
          <input
            type="text"
            name="initial"
            value={form.initial}
            onChange={handleChange}
            placeholder="Initial"
            className="form-input"
            required
          />
          <input
            type="text"
            name="station"
            value={form.station}
            onChange={handleChange}
            placeholder="Station"
            className="form-input"
            required
          />
        </div>
        <div className="form-row">
          <input
            type="text"
            name="purpose"
            value={form.purpose}
            onChange={handleChange}
            placeholder="Purpose"
            className="form-input"
            required
          />
          <input
            type="text"
            name="host"
            value={form.host}
            onChange={handleChange}
            placeholder="Host"
            className="form-input"
            required
          />
        </div>
        <div className="form-row">
          <input
            type="date"
            name="fromDate"
            value={form.fromDate}
            onChange={handleChange}
            className="form-input"
            required
          />
          <input
            type="date"
            name="toDate"
            value={form.toDate}
            onChange={handleChange}
            className="form-input"
            required
          />
        </div>
        <div className="form-row">
          <input
            type="text"
            name="destination"
            value={form.destination}
            onChange={handleChange}
            placeholder="Destination"
            className="form-input"
            required
          />
          <input
            type="text"
            name="area"
            value={form.area}
            onChange={handleChange}
            placeholder="Area"
            className="form-input"
            required
          />
        </div>
        <button type="submit" disabled={loading}>
          {loading ? 'Processing...' : (editingId ? 'Update' : 'Add') + ' Entry'}
        </button>
      </form>

      {loading && <p className="loading">Loading...</p>}
      {error && <p className="error">Error: {error}</p>}

      <ul className="travel-list">
        {filtered.map(entry => (
          <li key={entry.id} className="travel-item">
            <div className="travel-details">
              <div className="travel-header">
                <h3 className="travel-name">{entry.Name || 'Unnamed'}</h3>
                <p className="travel-position"><strong>Position:</strong> {entry.PositionDesignation || 'N/A'}</p>
              </div>
              <p><strong>Initial:</strong> {entry.Initial || 'N/A'} | <strong>Station:</strong> {entry.Station || 'N/A'}</p>
              <p><em>Purpose:</em> {entry.Purpose || 'N/A'} hosted by <strong>{entry.Host || 'N/A'}</strong></p>
              <p><strong>Dates:</strong> {entry.DatesFrom || 'N/A'} to {entry.DatesTo || 'N/A'} | <strong>Destination:</strong> {entry.Destination || 'N/A'} ({entry.Area || 'N/A'})</p>
            </div>
            <div className="travel-actions">
              <button onClick={() => handleEdit(entry)} disabled={loading}>Edit</button>
              <button className="delete-btn" onClick={() => handleDelete(entry.id)} disabled={loading}>Delete</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default TravelAuthority;