import React, { useState, useCallback, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import './TravelAuthority.css';

// Register Chart.js components
ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Title, Tooltip, Legend);

// Initial form state including sof
const initialFormState = {
  employeeID: '',
  initial: '',
  name: '',
  positiondesignation: '',
  station: '',
  purpose: '',
  host: '',
  fromDate: '',
  toDate: '',
  destination: '',
  area: '',
  sof: '', // Added Source of Funds
};

// Function to format date as MM/DD/YYYY
const formatDate = (dateStr) => {
  if (!dateStr) return 'N/A';
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? 'N/A' : `${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}/${date.getFullYear()}`;
};

// Month names for dropdown
const monthOptions = [
  { value: '', label: 'All Months' },
  { value: '01', label: 'January' },
  { value: '02', label: 'February' },
  { value: '03', label: 'March' },
  { value: '04', label: 'April' },
  { value: '05', label: 'May' },
  { value: '06', label: 'June' },
  { value: '07', label: 'July' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];

const TravelAuthority = () => {
  const [form, setForm] = useState(initialFormState);
  const [editingId, setEditingId] = useState(null);
  const [entries, setEntries] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState(''); // Search for table entries (name or sof)
  const [graphSearch, setGraphSearch] = useState(''); // Search for graph by employee
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [graphType, setGraphType] = useState('year');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [graphData, setGraphData] = useState({ labels: [], datasets: [] });
  const [notification, setNotification] = useState({ message: '', type: '' });
  const [preUploadEntries, setPreUploadEntries] = useState([]);
  const [showRollback, setShowRollback] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [filterYear, setFilterYear] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterSof, setFilterSof] = useState(''); // New filter for sof

  // Fetch graph data with employee_ID, year, month, and sof filter
  const fetchGraphData = useCallback(async () => {
    setLoading(true);
    try {
      let url = `http://localhost:3000/travels/graph?type=${graphType}`;
      if (selectedEmployeeId) url += `&employee_ID=${selectedEmployeeId}`;
      if (filterYear) url += `&year=${filterYear}`;
      if (filterMonth) url += `&month=${filterMonth}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch graph data');
      const data = await response.json();
      const processedData = {
        labels: data.labels || [],
        datasets: data.datasets || [
          {
            label: `Travel Entries by ${graphType}${filterYear ? ` in ${filterYear}` : ''}${filterMonth ? `, ${monthOptions.find(m => m.value === filterMonth).label}` : ''}${selectedEmployeeId ? ` for Employee ID ${selectedEmployeeId}` : ''}`,
            data: data.datasets[0]?.data || [],
            fill: false,
            backgroundColor: 'rgba(75, 192, 192, 0.6)',
            borderColor: 'rgba(75, 192, 192, 1)',
            borderWidth: 2,
            pointRadius: 5,
            pointHoverRadius: 7,
          },
        ],
      };
      setGraphData(processedData);
    } catch (err) {
      setError(err.message);
      setGraphData({ labels: [], datasets: [] });
    } finally {
      setLoading(false);
    }
  }, [graphType, selectedEmployeeId, filterYear, filterMonth]);

  // Fetch initial data
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [travelRes, empRes] = await Promise.all([
        fetch('http://localhost:3000/travels'),
        fetch('http://localhost:3000/employees'),
      ]);
      if (!travelRes.ok || !empRes.ok) throw new Error('Network response was not ok');
      const [travelData, empData] = await Promise.all([travelRes.json(), empRes.json()]);
      setEntries(travelData || []);
      setEmployees(empData || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Handle form input changes
  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  // Handle employee selection for form and graph
  const handleSelectEmployee = (e) => {
    const employeeId = e.target.value;
    setSelectedEmployeeId(employeeId);
    const emp = employees.find((e) => e.uid === parseInt(employeeId));
    if (emp) {
      setForm((prev) => ({
        ...prev,
        employeeID: emp.uid || '',
        name: emp.fullname || '',
        positiondesignation: emp.positionTitle || '',
        initial: emp.Initial || '',
        station: emp.office || '',
        sof: emp.sof || '', // Include sof from employee
      }));
    }
  };

  // Handle graph search to find employee_ID
  const handleGraphSearch = (e) => {
    const searchTerm = e.target.value.toLowerCase();
    setGraphSearch(searchTerm);
    const matchedEmployee = employees.find(
      (emp) =>
        emp.fullname.toLowerCase().includes(searchTerm) ||
        emp.uid.toString().includes(searchTerm)
    );
    setSelectedEmployeeId(matchedEmployee ? matchedEmployee.uid.toString() : '');
    fetchGraphData();
  };

  // Handle year, month, and sof filter changes
  const handleYearFilter = (e) => setFilterYear(e.target.value);
  const handleMonthFilter = (e) => setFilterMonth(e.target.value);
  const handleSofFilter = (e) => setFilterSof(e.target.value.toLowerCase());

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const requiredFields = ['employeeID', 'positiondesignation', 'station', 'purpose', 'host', 'fromDate', 'toDate', 'destination', 'area', 'sof'];
    const missingFields = requiredFields.filter((field) => !form[field]);
    if (missingFields.length > 0) {
      setError(`Missing required fields: ${missingFields.join(', ')}`);
      setLoading(false);
      return;
    }

    const method = editingId ? 'PUT' : 'POST';
    const url = editingId
      ? `http://localhost:3000/travels/${editingId}`
      : 'http://localhost:3000/travels';

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeID: form.employeeID,
          positiondesignation: form.positiondesignation,
          station: form.station,
          purpose: form.purpose,
          host: form.host,
          datesfrom: form.fromDate,
          datesto: form.toDate,
          destination: form.destination,
          area: form.area,
          sof: form.sof, // Include sof in submission
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to save entry');
      }
      const data = await res.json();

      if (method === 'PUT') {
        setEntries((prev) =>
          prev.map((e) =>
            e.id === editingId
              ? { ...form, id: editingId, DatesFrom: form.fromDate, DatesTo: form.toDate, sof: form.sof }
              : e
          )
        );
      } else {
        setEntries((prev) => [
          ...prev,
          { ...form, id: data.id, DatesFrom: form.fromDate, DatesTo: form.toDate, sof: form.sof },
        ]);
      }
      setForm(initialFormState);
      setEditingId(null);
      fetchGraphData();
      setNotification({ message: `Entry ${method === 'PUT' ? 'updated' : 'added'} successfully!`, type: 'success' });
    } catch (err) {
      setError(err.message);
      setNotification({ message: `Error: ${err.message}`, type: 'error' });
    } finally {
      setLoading(false);
      setTimeout(() => setNotification({ message: '', type: '' }), 3000);
    }
  };

  // Handle edit action
  const handleEdit = (entry) => {
    const formattedEntry = {
      ...entry,
      employeeID: entry.employee_ID || '',
      initial: entry.Initial || '',
      name: entry.fullname || '',
      positiondesignation: entry.PositionDesignation || '',
      station: entry.office || '',
      purpose: entry.Purpose || '',
      host: entry.Host || '',
      fromDate: entry.DatesFrom ? new Date(entry.DatesFrom).toISOString().split('T')[0] : '',
      toDate: entry.DatesTo ? new Date(entry.DatesTo).toISOString().split('T')[0] : '',
      destination: entry.Destination || '',
      area: entry.Area || '',
      sof: entry.sof || '', // Include sof in edit
    };
    setForm(formattedEntry);
    setEditingId(entry.id);
  };

  // Handle single delete action
  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this entry?')) return;
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:3000/travels/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete entry');
      setEntries((prev) => prev.filter((e) => e.id !== id));
      fetchGraphData();
      setNotification({ message: 'Entry deleted successfully!', type: 'success' });
    } catch (err) {
      setError(err.message);
      setNotification({ message: `Error: ${err.message}`, type: 'error' });
    } finally {
      setLoading(false);
      setTimeout(() => setNotification({ message: '', type: '' }), 3000);
    }
  };

  // Handle bulk delete action
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) {
      setError('No entries selected for deletion');
      return;
    }
    if (!window.confirm(`Are you sure you want to delete ${selectedIds.size} entries?`)) return;
    setLoading(true);
    try {
      const res = await fetch('http://localhost:3000/travels/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to delete entries');
      }
      const data = await res.json();
      setEntries((prev) => prev.filter((e) => !selectedIds.has(e.id)));
      setSelectedIds(new Set());
      fetchGraphData();
      setNotification({ message: data.message, type: 'success' });
    } catch (err) {
      setError(err.message);
      setNotification({ message: `Error: ${err.message}`, type: 'error' });
    } finally {
      setLoading(false);
      setTimeout(() => setNotification({ message: '', type: '' }), 3000);
    }
  };

  // Normalize key for Excel parsing
  const normalizeKey = (key) => key?.toLowerCase().trim();

  // Parse DMY to YMD for Excel dates
  const parseDMYtoYMD = (input) => {
    if (!input) return '';
    if (!isNaN(input)) {
      const excelSerial = Number(input);
      const excelEpoch = new Date('1899-12-30');
      const date = new Date(excelEpoch.getTime() + excelSerial * 24 * 60 * 60 * 1000);
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
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

  // Handle Excel file upload with confirmation, rollback, and notification
  const handleExcel = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!window.confirm('Are you sure you want to upload this Excel file? This will overwrite existing data.')) {
      e.target.value = '';
      return;
    }

    setPreUploadEntries([...entries]);
    setShowRollback(false);

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
            employeeID: keys['employee_id'] || '',
            positiondesignation: keys['positiondesignation'] || '',
            station: keys['station'] || '',
            purpose: keys['purpose'] || '',
            host: keys['host'] || '',
            fromDate: parseDMYtoYMD(keys['datesfrom']) || '',
            toDate: parseDMYtoYMD(keys['datesto']) || '',
            destination: keys['destination'] || '',
            area: keys['area'] || '',
            sof: keys['sof'] || '', // Include sof from Excel
          };
        });

        const res = await fetch('http://localhost:3000/travels/bulk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const text = await res.text();
        try {
          const result = JSON.parse(text);
          if (res.status === 201) {
            setNotification({ message: result.message || 'Excel file uploaded successfully! Rollback available.', type: 'success' });
            await fetchData();
            await fetchGraphData();
            setShowRollback(true);
          } else {
            throw new Error(result.error || 'Upload failed due to invalid data');
          }
        } catch (err) {
          setNotification({ message: `Upload failed: ${err.message}. All uploaded data has been removed.`, type: 'error' });
          setError(err.message);
          setEntries(preUploadEntries);
          await fetchGraphData();
        }
      } catch (err) {
        setNotification({ message: `Failed to parse Excel file: ${err.message}. No data was uploaded.`, type: 'error' });
        setError(err.message);
        setEntries(preUploadEntries);
        await fetchGraphData();
      } finally {
        setLoading(false);
        setTimeout(() => setNotification({ message: '', type: '' }), 3000);
        e.target.value = '';
      }
    };
    reader.readAsBinaryString(file);
  };

  // Handle rollback action
  const handleRollback = () => {
    if (window.confirm('Are you sure you want to rollback to the previous data?')) {
      setEntries(preUploadEntries);
      setNotification({ message: 'Data rolled back successfully! All uploaded data has been removed.', type: 'success' });
      fetchGraphData();
      setShowRollback(false);
      setTimeout(() => setNotification({ message: '', type: '' }), 3000);
    }
  };

  // Handle Excel export
  const handleExportExcel = () => {
    const worksheetData = filteredEntries.map((entry) => ({
      Name: entry.fullname || 'Unnamed',
      Position: entry.PositionDesignation || 'N/A',
      Initial: entry.Initial || 'N/A',
      Station: entry.office || 'N/A',
      Purpose: entry.Purpose || 'N/A',
      Host: entry.Host || 'N/A',
      Dates: `${formatDate(entry.DatesFrom)} to ${formatDate(entry.DatesTo)}`,
      Destination: entry.Destination || 'N/A',
      Area: entry.Area || 'N/A',
      'Source of Funds': entry.sof || 'N/A', // Include sof in export
      EmployeeID: entry.employee_ID || 'N/A',
    }));

    const worksheet = XLSX.utils.json_to_sheet(worksheetData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Travel Entries');
    XLSX.writeFile(workbook, `Travel_Entries_${new Date().toLocaleDateString()}.xlsx`);
  };

  // Graph options
  const graphOptions = {
    responsive: true,
    plugins: {
      legend: { position: 'top' },
      title: {
        display: true,
        text: `Travel Entries by ${graphType}${filterYear ? ` in ${filterYear}` : ''}${filterMonth ? `, ${monthOptions.find(m => m.value === filterMonth).label}` : ''}${selectedEmployeeId ? ` for Employee ID ${selectedEmployeeId}` : ''}`,
      },
    },
    scales: {
      x: { title: { display: true, text: graphType.charAt(0).toUpperCase() + graphType.slice(1) } },
      y: { beginAtZero: true, title: { display: true, text: 'Number of Entries' } },
    },
  };

  // Filtering logic for table with name, sof, year, and month filter
  const filteredEntries = entries.filter((entry) => {
    const matchesSearch =
      !search ||
      (entry.fullname && entry.fullname.toLowerCase().includes(search.toLowerCase())) ||
      (entry.sof && entry.sof.toLowerCase().includes(search.toLowerCase())); // Include sof in search
    const matchesYear =
      !filterYear ||
      (entry.DatesFrom && new Date(entry.DatesFrom).getFullYear().toString() === filterYear);
    const matchesMonth =
      !filterMonth ||
      (entry.DatesFrom && new Date(entry.DatesFrom).getMonth() + 1 === parseInt(filterMonth));
    const matchesSof =
      !filterSof ||
      (entry.sof && entry.sof.toLowerCase().includes(filterSof));
    return matchesSearch && matchesYear && matchesMonth && matchesSof;
  });

  // Toggle selection for bulk delete
  const handleToggleSelect = (id) => {
    setSelectedIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  };

  // Select all visible entries
  const handleSelectAll = () => {
    const allIds = new Set(filteredEntries.map((entry) => entry.id));
    setSelectedIds(allIds);
  };

  // Effect to fetch data on mount and when dependencies change
  useEffect(() => {
    fetchData();
    fetchGraphData();
  }, [fetchData, fetchGraphData]);

  return (
    <div className="travel-authority">
      <h1>Travel Authority Database</h1>

      <div className="controls">
        <input
          type="text"
          placeholder="Search by Name or Source of Funds..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="search-input"
        />
        <input
          type="text"
          placeholder="Search Graph by Employee..."
          value={graphSearch}
          onChange={handleGraphSearch}
          className="search-input graph-search"
        />
        <input
          type="file"
          onChange={handleExcel}
          className="excel-upload"
          accept=".xlsx,.xls"
        />
        <select
          value={selectedEmployeeId}
          onChange={handleSelectEmployee}
          className="employee-dropdown"
        >
          <option value="">All Employees</option>
          {employees.map((emp) => (
            <option key={emp.uid} value={emp.uid}>
              {emp.fullname} - {emp.Initial}
            </option>
          ))}
        </select>
        <select
          value={graphType}
          onChange={(e) => setGraphType(e.target.value)}
          className="graph-type-dropdown"
        >
          <option value="year">Year</option>
          <option value="month">Month</option>
          <option value="week">Week</option>
        </select>
        <select
          value={filterYear}
          onChange={handleYearFilter}
          className="year-filter-dropdown"
          style={{ marginLeft: '10px' }}
        >
          <option value="">All Years</option>
          {[...new Set(entries.map((entry) => entry.DatesFrom && new Date(entry.DatesFrom).getFullYear()).filter(Boolean))].sort().map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </select>
        <select
          value={filterMonth}
          onChange={handleMonthFilter}
          className="month-filter-dropdown"
          style={{ marginLeft: '10px' }}
        >
          {monthOptions.map((month) => (
            <option key={month.value} value={month.value}>
              {month.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Filter by Source of Funds..."
          value={filterSof}
          onChange={handleSofFilter}
          className="search-input sof-filter"
          style={{ marginLeft: '10px' }}
        />
        <button onClick={handleExportExcel} className="export-btn" style={{ marginLeft: '10px' }}>
          Export to Excel
        </button>
        {showRollback && (
          <button onClick={handleRollback} className="rollback-btn">
            Rollback
          </button>
        )}
        <button onClick={handleBulkDelete} disabled={loading || selectedIds.size === 0} className="bulk-delete-btn">
          {loading ? 'Processing...' : `Delete Selected (${selectedIds.size})`}
        </button>
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
            readOnly
          />
          <input
            type="text"
            name="positiondesignation"
            value={form.positiondesignation}
            onChange={handleChange}
            placeholder="Position/Designation"
            className="form-input large-text"
            required
            readOnly
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
            readOnly
          />
          <input
            type="text"
            name="station"
            value={form.station}
            onChange={handleChange}
            placeholder="Station"
            className="form-input"
            required
            readOnly
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
        <div className="form-row">
          <input
            type="text"
            name="sof"
            value={form.sof}
            onChange={handleChange}
            placeholder="Source of Funds"
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
      {notification.message && (
        <div className={`notification ${notification.type}`}>
          {notification.message}
        </div>
      )}

      <div className="graph-container">
        <h2>Travel Entries Distribution</h2>
        {graphData.labels.length > 0 && graphData.datasets.length > 0 ? (
          <Line data={graphData} options={graphOptions} />
        ) : (
          <p className="no-data">No graph data available. Please check the data or filters.</p>
        )}
      </div>

      <table className="travel-table">
        <thead>
          <tr>
            <th>
              <input
                type="checkbox"
                onChange={handleSelectAll}
                checked={filteredEntries.length > 0 && filteredEntries.every((entry) => selectedIds.has(entry.id))}
              />
            </th>
            <th>Name</th>
            <th>Position</th>
            <th>Initial</th>
            <th>Station</th>
            <th>Purpose</th>
            <th>Host</th>
            <th>Dates</th>
            <th>Destination</th>
            <th>Area</th>
            <th>Source of Funds</th> {/* New column */}
            <th>Employee ID</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filteredEntries.map((entry) => (
            <tr key={entry.id} className="travel-row">
              <td>
                <input
                  type="checkbox"
                  checked={selectedIds.has(entry.id)}
                  onChange={() => handleToggleSelect(entry.id)}
                />
              </td>
              <td>{entry.fullname || 'Unnamed'}</td>
              <td>{entry.PositionDesignation || 'N/A'}</td>
              <td>{entry.Initial || 'N/A'}</td>
              <td>{entry.office || 'N/A'}</td>
              <td>{entry.Purpose || 'N/A'}</td>
              <td>{entry.Host || 'N/A'}</td>
              <td>
                {formatDate(entry.DatesFrom)} to {formatDate(entry.DatesTo)}
              </td>
              <td>{entry.Destination || 'N/A'}</td>
              <td>{entry.Area || 'N/A'}</td>
              <td>{entry.sof || 'N/A'}</td> {/* New column */}
              <td>{entry.employee_ID || 'N/A'}</td>
              <td className="travel-actions">
                <button onClick={() => handleEdit(entry)} disabled={loading}>
                  Edit
                </button>
                <button
                  className="delete-btn"
                  onClick={() => handleDelete(entry.id)}
                  disabled={loading}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default TravelAuthority;