import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Server, Lock, User, TerminalSquare, AlertCircle, CheckCircle2, Tags, X, Plus, FolderTree, LogOut, Download, ClipboardCopy, Search, UserCog, KeyRound, Trash2, UserX, UserCheck, Users, Layers, ChevronDown } from 'lucide-react';
import './index.css';

function App() {
  const [step, setStep] = useState('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [activeTab, setActiveTab] = useState('provision');

  // Provision state
  const [loginForm, setLoginForm] = useState({ dcServer: import.meta.env.VITE_DEFAULT_DC || '10.0.0.10', username: '', password: '' });
  const [usersForm, setUsersForm] = useState([{ id: Date.now(), firstName: '', lastName: '', groups: [], showGroups: false, groupSearch: '' }]);
  const [adGroups, setAdGroups] = useState([]);
  const [fetchingGroups, setFetchingGroups] = useState(false);
  const [selectedOu, setSelectedOu] = useState(import.meta.env.VITE_DEFAULT_OU || 'OU=Users,OU=Corp,DC=corp,DC=example,DC=com');
  const [createdList, setCreatedList] = useState([]);
  const [copiedIndex, setCopiedIndex] = useState(null);

  // Manage users state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [userEdits, setUserEdits] = useState({}); // { [dn]: { showPicker, groupSearch, pending } }
  const [savingDn, setSavingDn] = useState(null);
  const [savedDn, setSavedDn] = useState(null);
  const [confirmDeleteDn, setConfirmDeleteDn] = useState(null);
  const [resettingDn, setResettingDn] = useState(null);
  const [disablingDn, setDisablingDn] = useState(null);
  const [listTruncated, setListTruncated] = useState(false);

  // All Users tab
  const ALL_USERS_PAGE_SIZE = 200;
  const [allUsers, setAllUsers] = useState([]);
  const [allUsersPage, setAllUsersPage] = useState(0);
  const [allUsersLoading, setAllUsersLoading] = useState(false);
  const [allUsersLoaded, setAllUsersLoaded] = useState(false);

  // Groups tab
  const [groupList, setGroupList] = useState([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  const [expandedGroupDn, setExpandedGroupDn] = useState(null);
  const [groupMembers, setGroupMembers] = useState({});
  const [groupSearch, setGroupSearch] = useState('');

  const dairyProducts = ['Cheddar', 'Gouda', 'Brie', 'Milk', 'Yogurt', 'Butter', 'Swiss', 'Provolone', 'Cream', 'Feta', 'Parmesan', 'Mozzarella', 'Ricotta', 'Havarti', 'PepperJack', 'Gruyere', 'Muenster', 'Colby'];
  const generatePassword = () => `${dairyProducts[Math.floor(Math.random() * dairyProducts.length)]}!${Math.floor(Math.random() * 9000) + 1000}`;

  const getUserEdit = (dn) => userEdits[dn] || { showPicker: false, groupSearch: '', selected: null, showReset: false, resetInput: '', resetPassword: null, resetCopied: false };
  const updateUserEdit = (dn, updates) =>
    setUserEdits(prev => ({ ...prev, [dn]: { ...getUserEdit(dn), ...updates } }));

  const togglePicker = (user) => {
    const edit = getUserEdit(user.dn);
    // Initialise selected from current memberships on first open
    const next = !edit.showPicker;
    updateUserEdit(user.dn, {
      showPicker: next,
      selected: next && edit.selected === null ? [...user.groups] : edit.selected,
    });
  };

  const fetchDomainData = async () => {
    setFetchingGroups(true);
    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm),
      });
      const data = await res.json();
      if (data.success) setAdGroups(data.groups);
      else setError(data.error || 'Failed to fetch AD groups');
    } catch {
      setError('Failed to fetch AD groups from server.');
    } finally {
      setFetchingGroups(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStep('dashboard');
        setSuccess('Connected to domain successfully');
        setTimeout(() => setSuccess(null), 3000);
        fetchDomainData();
      } else {
        setError(data.error || 'Invalid credentials or DC unreachable');
      }
    } catch {
      setError('Failed to reach backend server. Ensure server is running.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setStep('login');
    setLoginForm(prev => ({ ...prev, username: '', password: '' }));
    setUsersForm([{ id: Date.now(), firstName: '', lastName: '', groups: [], showGroups: false, groupSearch: '' }]);
    setAdGroups([]);
    setCreatedList([]);
    setError(null);
    setSuccess(null);
    setActiveTab('provision');
    setSearchQuery('');
    setSearchResults([]);
    setUserEdits({});
    setConfirmDeleteDn(null);
    setAllUsers([]);
    setAllUsersPage(0);
    setAllUsersLoaded(false);
    setGroupList([]);
    setGroupsLoaded(false);
    setExpandedGroupDn(null);
    setGroupMembers({});
    setGroupSearch('');
    setListTruncated(false);
  };

  const handleBulkCreate = async (e) => {
    e.preventDefault();
    const validUsers = usersForm.filter(u => u.firstName.trim() !== '' && u.lastName.trim() !== '');
    if (validUsers.length === 0) return;

    setLoading(true); setError(null); setSuccess(null);

    const processedUsers = validUsers.map(u => ({
      originalId: u.id,
      firstName: u.firstName.trim(),
      lastName: u.lastName.trim(),
      username: (u.firstName.trim().charAt(0) + u.lastName.trim()).toLowerCase().replace(/[^a-z0-9]/g, ''),
      password: generatePassword(),
      groups: u.groups || [],
    }));

    try {
      const res = await fetch('/api/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...loginForm, users: processedUsers, targetOu: selectedOu }),
      });
      const data = await res.json();

      if (res.ok && data.success) {
        const createdUsers = data.createdUsers || [];
        const failedUsers  = data.failedUsers  || [];

        const tracked = createdUsers.map(u => ({
          name: `${u.firstName} ${u.lastName}`,
          username: u.username,
          password: u.password,
          groupList: processedUsers.find(p => p.originalId === u.originalId)?.groups || [],
          ou: selectedOu || 'Default (CN=Users)',
          failed: false,
        }));

        const failedTracked = failedUsers.map(u => ({
          name: `${u.firstName} ${u.lastName}`,
          username: null,
          password: null,
          groupList: [],
          ou: selectedOu || 'Default (CN=Users)',
          failed: true,
          error: u.error,
        }));

        setCreatedList(prev => [...tracked, ...failedTracked, ...prev]);
        setUsersForm([{ id: Date.now(), firstName: '', lastName: '', groups: [], showGroups: false, groupSearch: '' }]);

        if (failedUsers.length > 0 && createdUsers.length === 0) {
          setError(`All ${failedUsers.length} user(s) failed to provision. Check the log below.`);
        } else if (failedUsers.length > 0) {
          setError(`${createdUsers.length} provisioned, ${failedUsers.length} failed. Check the log below.`);
        } else {
          setSuccess(`Provisioned ${createdUsers.length} user(s) successfully!`);
          setTimeout(() => setSuccess(null), 5000);
        }
      } else {
        setError(data.error || 'Failed to provision users');
      }
    } catch {
      setError('Failed to reach backend server.');
    } finally {
      setLoading(false);
    }
  };

  const handleListAllUsers = async () => {
    setSearchLoading(true); setError(null); setSearchQuery(''); setListTruncated(false);
    try {
      const res = await fetch('/api/users/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...loginForm, query: '' }),
      });
      const data = await res.json();
      if (data.success) {
        setSearchResults(data.users);
        setUserEdits({});
        setListTruncated(data.truncated || false);
        if (data.users.length === 0) setError('No users found in the directory.');
      } else {
        setError(data.error || 'Failed to list users');
      }
    } catch {
      setError('Failed to reach backend server.');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleUserSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearchLoading(true); setError(null);
    try {
      const res = await fetch('/api/users/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...loginForm, query: searchQuery }),
      });
      const data = await res.json();
      if (data.success) {
        setSearchResults(data.users);
        setUserEdits({});
        if (data.users.length === 0) setError('No users found matching that query.');
      } else {
        setError(data.error || 'Search failed');
      }
    } catch {
      setError('Failed to reach backend server.');
    } finally {
      setSearchLoading(false);
    }
  };

  const handleToggleDisable = async (user) => {
    setDisablingDn(user.dn); setError(null);
    try {
      const res = await fetch('/api/users/setstatus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...loginForm, userDn: user.dn, disabled: !user.disabled }),
      });
      const data = await res.json();
      if (data.success) {
        setSearchResults(prev => prev.map(u => u.dn === user.dn ? { ...u, disabled: !user.disabled } : u));
      } else {
        setError(data.error || 'Failed to update user status');
      }
    } catch {
      setError('Failed to reach backend server.');
    } finally {
      setDisablingDn(null);
    }
  };

  const handleLoadAllUsers = async () => {
    setAllUsersLoading(true); setError(null);
    try {
      const res = await fetch('/api/users/all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm),
      });
      const data = await res.json();
      if (data.success) {
        setAllUsers(data.users);
        setAllUsersPage(0);
        setAllUsersLoaded(true);
      } else {
        setError(data.error || 'Failed to load users');
      }
    } catch {
      setError('Failed to reach backend server.');
    } finally {
      setAllUsersLoading(false);
    }
  };

  const handleLoadGroups = async () => {
    setGroupsLoading(true); setError(null);
    try {
      const res = await fetch('/api/groups/list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm),
      });
      const data = await res.json();
      if (data.success) {
        setGroupList(data.groups);
        setGroupsLoaded(true);
      } else {
        setError(data.error || 'Failed to load groups');
      }
    } catch {
      setError('Failed to reach backend server.');
    } finally {
      setGroupsLoading(false);
    }
  };

  const handleExpandGroup = async (group) => {
    if (expandedGroupDn === group.dn) { setExpandedGroupDn(null); return; }
    setExpandedGroupDn(group.dn);
    if (groupMembers[group.dn]) return;
    setGroupMembers(prev => ({ ...prev, [group.dn]: { loading: true, members: [] } }));
    try {
      const res = await fetch('/api/groups/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...loginForm, groupDn: group.dn }),
      });
      const data = await res.json();
      setGroupMembers(prev => ({
        ...prev,
        [group.dn]: data.success
          ? { loading: false, members: data.members }
          : { loading: false, members: [], error: data.error || 'Failed to load members' },
      }));
    } catch {
      setGroupMembers(prev => ({ ...prev, [group.dn]: { loading: false, members: [], error: 'Failed to reach backend server.' } }));
    }
  };

  const handleSaveGroups = async (user) => {
    const edit = getUserEdit(user.dn);
    if (!edit.selected) return;

    const toAdd    = edit.selected.filter(g => !user.groups.includes(g));
    const toRemove = user.groups.filter(g => !edit.selected.includes(g));
    if (!toAdd.length && !toRemove.length) return;

    setSavingDn(user.dn); setError(null);
    try {
      let added = [], removed = [], errors = [];

      if (toAdd.length) {
        const res = await fetch('/api/users/addgroups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...loginForm, userDn: user.dn, groups: toAdd }),
        });
        const data = await res.json();
        if (data.success) added = data.added;
        else errors.push(data.error || 'Failed to add groups');
      }

      if (toRemove.length) {
        const res = await fetch('/api/users/removegroups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...loginForm, userDn: user.dn, groups: toRemove }),
        });
        const data = await res.json();
        if (data.success) removed = data.removed;
        else errors.push(data.error || 'Failed to remove groups');
      }

      const newGroups = [...new Set([...user.groups, ...added])]
        .filter(g => !removed.includes(g)).sort();

      setSearchResults(prev => prev.map(u =>
        u.dn === user.dn ? { ...u, groups: newGroups } : u
      ));
      updateUserEdit(user.dn, { selected: newGroups, showPicker: false });
      setSavedDn(user.dn);
      setTimeout(() => setSavedDn(null), 2000);
      if (errors.length) setError(errors.join(' — '));
    } catch {
      setError('Failed to reach backend server.');
    } finally {
      setSavingDn(null);
    }
  };

  const handleResetPassword = async (user) => {
    const edit = getUserEdit(user.dn);
    if (!edit.resetInput.trim()) return;
    setResettingDn(user.dn); setError(null);
    try {
      const res = await fetch('/api/users/resetpassword', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...loginForm, userDn: user.dn, newPassword: edit.resetInput.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        updateUserEdit(user.dn, { showReset: false, resetPassword: edit.resetInput.trim(), resetInput: '', resetCopied: false });
      } else {
        setError(data.error || 'Failed to reset password');
      }
    } catch {
      setError('Failed to reach backend server.');
    } finally {
      setResettingDn(null);
    }
  };

  const handleDeleteUser = async (user) => {
    setError(null);
    try {
      const res = await fetch('/api/users/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...loginForm, userDn: user.dn }),
      });
      const data = await res.json();
      if (data.success) {
        setSearchResults(prev => prev.filter(u => u.dn !== user.dn));
        setConfirmDeleteDn(null);
      } else {
        setError(data.error || 'Failed to delete user');
        setConfirmDeleteDn(null);
      }
    } catch {
      setError('Failed to reach backend server.');
      setConfirmDeleteDn(null);
    }
  };

  const exportCSV = () => {
    const header = ['Name', 'Username', 'Password', 'Groups', 'OU'];
    const rows = createdList
      .filter(u => !u.failed)
      .map(u => [u.name, u.username, u.password, u.groupList.join('; '), u.ou]);
    const csv = [header, ...rows]
      .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `ad-provision-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyCredentials = (u, i) => {
    navigator.clipboard.writeText(`Username: ${u.username}\nPassword: ${u.password}`);
    setCopiedIndex(i);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const addUserRow = () =>
    setUsersForm([...usersForm, { id: Date.now(), firstName: '', lastName: '', groups: [], showGroups: false, groupSearch: '' }]);

  const removeUserRow = (id) => {
    if (usersForm.length > 1) setUsersForm(usersForm.filter(u => u.id !== id));
  };

  const updateRow = (id, field, value) =>
    setUsersForm(usersForm.map(u => u.id === id ? { ...u, [field]: value } : u));

  const copyGroupsFrom = (targetId, sourceId) => {
    const source = usersForm.find(u => u.id === sourceId);
    if (source) updateRow(targetId, 'groups', [...source.groups]);
  };

  const tabBtn = (tab, label, Icon, onSwitch) => (
    <button
      type="button"
      onClick={() => { setActiveTab(tab); setError(null); setSuccess(null); if (onSwitch) onSwitch(); }}
      style={{ flex: 1, padding: '0.55rem 0.4rem', borderRadius: '10px', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', transition: 'all 0.2s', background: activeTab === tab ? 'rgba(56,189,248,0.15)' : 'transparent', color: activeTab === tab ? 'var(--primary)' : 'var(--text-muted)', boxShadow: activeTab === tab ? 'inset 0 0 0 1px rgba(56,189,248,0.3)' : 'none' }}
    >
      <Icon size={14} /> {label}
    </button>
  );

  return (
    <>
      <div className="glow-circle" />
      <AnimatePresence mode="wait">

        {step === 'login' && (
          <motion.div
            key="login"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="glass-panel"
            style={{ maxWidth: '420px' }}
          >
            <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
              <motion.div
                initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: 'spring' }}
                style={{ background: 'rgba(56,189,248,0.1)', display: 'inline-flex', padding: '1.25rem', borderRadius: '24px', marginBottom: '1rem', boxShadow: '0 0 20px rgba(56,189,248,0.2)' }}
              >
                <Shield size={44} color="var(--primary)" />
              </motion.div>
              <h1 style={{ fontSize: '1.85rem', fontWeight: 600 }}>Active Directory</h1>
              <p style={{ color: 'var(--text-muted)', marginTop: '0.25rem' }}>Secure domain user provisioning</p>
            </div>

            <form onSubmit={handleLogin}>
              <div className="input-container">
                <label className="input-label">DC Server IP</label>
                <div style={{ position: 'relative' }}>
                  <input type="text" className="input-field" value={loginForm.dcServer} onChange={e => setLoginForm({ ...loginForm, dcServer: e.target.value })} />
                  <Server className="input-icon" size={20} />
                </div>
              </div>

              <div className="input-container">
                <label className="input-label">Admin Username</label>
                <div style={{ position: 'relative' }}>
                  <input type="text" className="input-field" placeholder="admin" value={loginForm.username} onChange={e => setLoginForm({ ...loginForm, username: e.target.value })} required />
                  <User className="input-icon" size={20} />
                </div>
              </div>

              <div className="input-container">
                <label className="input-label">Admin Password</label>
                <div style={{ position: 'relative' }}>
                  <input type="password" className="input-field" placeholder="•••••••••" value={loginForm.password} onChange={e => setLoginForm({ ...loginForm, password: e.target.value })} required />
                  <Lock className="input-icon" size={20} />
                </div>
              </div>

              {error && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="input-container" style={{ color: 'var(--error)', fontSize: '0.9rem', display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginTop: '-0.5rem' }}>
                  <AlertCircle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                  <span style={{ wordBreak: 'break-word', lineHeight: 1.4 }}>{error}</span>
                </motion.div>
              )}

              <button type="submit" className="btn-primary" disabled={loading} style={{ marginTop: '1.5rem' }}>
                {loading ? <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}><TerminalSquare size={20} /></motion.div> : 'Establish Connection'}
              </button>
            </form>
          </motion.div>
        )}

        {step === 'dashboard' && (
          <motion.div
            key="dash"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="glass-panel"
            style={{ maxWidth: '750px', width: '90vw', padding: '2rem' }}
          >
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--panel-border)', paddingBottom: '1.5rem', marginBottom: '1.5rem' }}>
              <div>
                <h1 style={{ fontSize: '1.65rem', fontWeight: 600 }}>Active Directory</h1>
                <p style={{ color: 'var(--success)', fontSize: '0.875rem', marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                  <CheckCircle2 size={14} /> Connected — DC: {loginForm.dcServer}
                </p>
              </div>
              <button type="button" onClick={handleLogout} title="Disconnect" style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--error)', padding: '0.85rem', borderRadius: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                <LogOut size={22} />
              </button>
            </div>

            {/* Tab switcher */}
            <div style={{ display: 'flex', gap: '0.4rem', background: 'rgba(15,23,42,0.4)', padding: '0.35rem', borderRadius: '12px', marginBottom: '1.75rem' }}>
              {tabBtn('provision', 'Provisioning', Plus)}
              {tabBtn('manage', 'Manage', UserCog)}
              {tabBtn('users', 'All Users', Users, () => { if (!allUsersLoaded && !allUsersLoading) handleLoadAllUsers(); })}
              {tabBtn('groups', 'Groups', Layers, () => { if (!groupsLoaded && !groupsLoading) handleLoadGroups(); })}
            </div>

            {/* ── Provision tab ── */}
            {activeTab === 'provision' && (
              <>
                <form onSubmit={handleBulkCreate}>
                  <div className="input-container" style={{ marginBottom: '2rem' }}>
                    <label className="input-label">Target Organizational Unit</label>
                    <div style={{ position: 'relative' }}>
                      <input type="text" className="input-field" value={selectedOu} onChange={e => setSelectedOu(e.target.value)} />
                      <FolderTree className="input-icon" size={18} style={{ top: '50%', transform: 'translateY(-50%)', left: '1rem' }} />
                    </div>
                  </div>

                  <div style={{ marginBottom: '2rem' }}>
                    <label className="input-label" style={{ marginBottom: '1rem', display: 'block' }}>User Entry Queue</label>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <AnimatePresence>
                      {usersForm.map((u) => (
                        <motion.div
                          key={u.id}
                          initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                          style={{ display: 'flex', flexDirection: 'column', background: 'rgba(15, 23, 42, 0.4)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}
                        >
                          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                            <div style={{ flex: '1 1 auto', position: 'relative' }}>
                              <input type="text" className="input-field" placeholder="First Name" value={u.firstName} onChange={e => updateRow(u.id, 'firstName', e.target.value)} required />
                              <User className="input-icon" size={20} style={{ top: '0.85rem' }} />
                            </div>
                            <div style={{ flex: '1 1 auto', position: 'relative' }}>
                              <input type="text" className="input-field" placeholder="Last Name" value={u.lastName} onChange={e => updateRow(u.id, 'lastName', e.target.value)} required />
                              <User className="input-icon" size={20} style={{ top: '0.85rem' }} />
                            </div>
                            <button type="button" onClick={() => updateRow(u.id, 'showGroups', !u.showGroups)} style={{ background: u.groups.length > 0 ? 'rgba(56,189,248,0.2)' : 'rgba(255,255,255,0.05)', border: u.groups.length > 0 ? '1px solid rgba(56,189,248,0.3)' : '1px solid transparent', color: u.groups.length > 0 ? 'var(--primary)' : 'var(--text-main)', padding: '0.75rem 1rem', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0, transition: 'all 0.2s' }}>
                              <Tags size={16} />
                              <span style={{ fontWeight: 500, fontSize: '0.9rem' }}>{u.groups.length === 0 ? 'Assign Groups' : `${u.groups.length} Selected`}</span>
                            </button>
                            {usersForm.length > 1 && (
                              <button type="button" onClick={() => removeUserRow(u.id)} style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--error)', padding: '0.75rem', borderRadius: '10px', cursor: 'pointer', flexShrink: 0 }}>
                                <X size={18} />
                              </button>
                            )}
                          </div>

                          <AnimatePresence>
                          {u.showGroups && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                              style={{ overflow: 'hidden', marginTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}
                            >
                              <div style={{ paddingTop: '1rem' }}>
                                {!fetchingGroups && adGroups.length > 0 && (
                                  <input type="text" className="input-field" placeholder="Search AD Groups..." value={u.groupSearch || ''} onChange={e => updateRow(u.id, 'groupSearch', e.target.value)} style={{ marginBottom: '0.75rem', background: 'rgba(15, 23, 42, 0.8)', padding: '0.65rem 1rem', fontSize: '0.9rem' }} />
                                )}
                                {fetchingGroups ? (
                                  <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}><TerminalSquare size={16} /> Loading active groups...</div>
                                ) : (
                                  <>
                                  <div style={{ maxHeight: '150px', overflowY: 'auto', background: 'rgba(15, 23, 42, 0.6)', borderRadius: '12px', border: '1px solid var(--panel-border)', padding: '0.6rem' }}>
                                    {adGroups.length === 0 ? (
                                      <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>No groups discovered on your server.</div>
                                    ) : (
                                      adGroups.filter(g => g.toLowerCase().includes((u.groupSearch || '').toLowerCase())).map(g => {
                                        const isSelected = u.groups.includes(g);
                                        return (
                                          <label key={g} style={{ display: 'flex', alignItems: 'center', padding: '0.5rem 0.8rem', cursor: 'pointer', background: isSelected ? 'rgba(56,189,248,0.15)' : 'transparent', borderRadius: '8px', transition: 'all 0.2s ease', border: isSelected ? '1px solid rgba(56,189,248,0.3)' : '1px solid transparent', marginBottom: '4px' }}>
                                            <input type="checkbox" checked={isSelected} onChange={(e) => {
                                              let newGroups = [...u.groups];
                                              if (e.target.checked) newGroups.push(g);
                                              else newGroups = newGroups.filter(x => x !== g);
                                              updateRow(u.id, 'groups', newGroups);
                                            }} style={{ marginRight: '0.75rem', accentColor: 'var(--primary)', width: '16px', height: '16px' }} />
                                            <span style={{ color: isSelected ? '#fff' : 'var(--text-main)', fontSize: '0.9rem', fontWeight: isSelected ? 500 : 400 }}>{g}</span>
                                          </label>
                                        );
                                      })
                                    )}
                                  </div>
                                  {usersForm.some(other => other.id !== u.id && other.groups.length > 0) && (
                                    <div style={{ marginTop: '0.6rem', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '0.4rem' }}>
                                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 500, flexShrink: 0 }}>Copy from:</span>
                                      {usersForm.filter(other => other.id !== u.id && other.groups.length > 0).map(other => (
                                        <button key={other.id} type="button" onClick={() => copyGroupsFrom(u.id, other.id)} style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.25)', color: 'var(--primary)', padding: '0.25rem 0.6rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600, transition: 'all 0.2s' }}>
                                          {other.firstName || 'User'}{other.lastName ? ' ' + other.lastName[0] + '.' : ''} <span style={{ opacity: 0.7 }}>({other.groups.length})</span>
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                  </>
                                )}
                              </div>
                            </motion.div>
                          )}
                          </AnimatePresence>
                        </motion.div>
                      ))}
                      </AnimatePresence>
                    </div>

                    <button type="button" onClick={addUserRow} style={{ marginTop: '1rem', width: '100%', background: 'rgba(56,189,248,0.1)', border: '1px dashed rgba(56,189,248,0.3)', color: 'var(--primary)', padding: '0.65rem', borderRadius: '12px', cursor: 'pointer', fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', transition: 'all 0.2s' }}>
                      <Plus size={15} /> Add User
                    </button>
                  </div>

                  {error && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} style={{ width: '100%', color: 'var(--error)', fontSize: '0.9rem', display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '1.5rem', background: 'rgba(239, 68, 68, 0.1)', padding: '1rem', borderRadius: '10px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                      <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '1px' }} />
                      <span style={{ wordBreak: 'break-word', lineHeight: 1.4 }}>{error}</span>
                    </motion.div>
                  )}
                  {success && (
                    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} style={{ width: '100%', color: 'var(--success)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', background: 'rgba(16, 185, 129, 0.1)', padding: '1rem', borderRadius: '10px', border: '1px solid rgba(16, 185, 129, 0.2)' }}>
                      <CheckCircle2 size={18} /> {success}
                    </motion.div>
                  )}

                  <button type="submit" className="btn-primary" disabled={loading} style={{ width: '100%' }}>
                    {loading ? <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}><TerminalSquare size={20} /></motion.div> : `Provision ${usersForm.filter(u => u.firstName).length} Active Directory User${usersForm.filter(u => u.firstName).length !== 1 ? 's' : ''} in Batch`}
                  </button>
                </form>

                {/* Transaction log */}
                <AnimatePresence>
                {createdList.length > 0 && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} style={{ marginTop: '2.5rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                      <h3 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Transaction Log</h3>
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {createdList.some(u => !u.failed) && (
                          <button type="button" onClick={exportCSV} style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.25)', color: 'var(--primary)', padding: '0.35rem 0.75rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <Download size={13} /> Export CSV
                          </button>
                        )}
                        <button type="button" onClick={() => setCreatedList([])} style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--error)', padding: '0.35rem 0.75rem', borderRadius: '8px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                          <X size={13} /> Clear
                        </button>
                      </div>
                    </div>
                    <div>
                      {createdList.map((u, i) => (
                        <motion.div
                          initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, type: 'spring' }}
                          key={`${u.username ?? u.name}-${i}`}
                          style={{ display: 'flex', justifyContent: 'space-between', padding: '1.25rem', background: u.failed ? 'rgba(239, 68, 68, 0.05)' : 'rgba(15, 23, 42, 0.4)', borderRadius: '16px', border: `1px solid ${u.failed ? 'rgba(239,68,68,0.25)' : 'var(--panel-border)'}`, marginBottom: '0.75rem', alignItems: 'flex-start' }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: '1.05rem' }}>{u.name}</div>
                            {u.failed ? (
                              <div style={{ color: 'var(--error)', fontSize: '0.85rem', marginTop: '0.35rem', display: 'flex', alignItems: 'flex-start', gap: '0.4rem' }}>
                                <AlertCircle size={14} style={{ flexShrink: 0, marginTop: '2px' }} /> {u.error}
                              </div>
                            ) : (
                              <>
                                <div style={{ color: 'var(--primary)', fontSize: '0.85rem', marginTop: '0.15rem' }}>{u.username}</div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}><FolderTree size={12} /> {u.ou}</div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.6rem' }}>
                                  <div style={{ background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.2)', color: 'var(--primary)', fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '6px', fontWeight: 500 }}>Domain Users</div>
                                  {u.groupList.map(gName => (
                                    <div key={gName} style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', color: 'var(--text-main)', fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '6px' }}>{gName}</div>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                          {!u.failed && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: '1rem', flexShrink: 0, alignSelf: 'center' }}>
                              <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '0.65rem 1rem', borderRadius: '10px', border: '1px solid rgba(16,185,129,0.2)' }}>
                                <code style={{ color: 'var(--success)', fontWeight: 600, fontFamily: 'monospace', fontSize: '0.95rem' }}>{u.password}</code>
                              </div>
                              <button type="button" onClick={() => copyCredentials(u, i)} title="Copy credentials" style={{ background: copiedIndex === i ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.05)', border: copiedIndex === i ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(255,255,255,0.1)', color: copiedIndex === i ? 'var(--success)' : 'var(--text-muted)', padding: '0.5rem 0.7rem', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', transition: 'all 0.2s', fontSize: '0.75rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                {copiedIndex === i ? <><CheckCircle2 size={14} /> Copied!</> : <ClipboardCopy size={15} />}
                              </button>
                            </div>
                          )}
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}
                </AnimatePresence>
              </>
            )}

            {/* ── Manage Users tab ── */}
            {activeTab === 'manage' && (
              <div>
                <form onSubmit={handleUserSearch} style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
                  <div style={{ flex: 1, position: 'relative' }}>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="Search by name or username..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                    />
                    <Search className="input-icon" size={18} style={{ top: '50%', transform: 'translateY(-50%)' }} />
                  </div>
                  <button type="submit" className="btn-primary" disabled={searchLoading} style={{ width: 'auto', padding: '0 1.25rem', flexShrink: 0 }}>
                    {searchLoading ? <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}><TerminalSquare size={18} /></motion.div> : 'Search'}
                  </button>
                </form>

                {error && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} style={{ color: 'var(--error)', fontSize: '0.9rem', display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '1.5rem', background: 'rgba(239, 68, 68, 0.1)', padding: '1rem', borderRadius: '10px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                    <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '1px' }} />
                    <span style={{ wordBreak: 'break-word', lineHeight: 1.4 }}>{error}</span>
                  </motion.div>
                )}

                <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: '0.2rem' }}>
                <AnimatePresence>
                {searchResults.map(user => {
                  const edit = getUserEdit(user.dn);
                  const isSaving = savingDn === user.dn;
                  const isSaved  = savedDn  === user.dn;
                  return (
                    <motion.div
                      key={user.dn}
                      initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
                      style={{ background: user.disabled ? 'rgba(30,20,5,0.45)' : 'rgba(15,23,42,0.4)', borderRadius: '16px', border: user.disabled ? '1px solid rgba(251,191,36,0.2)' : '1px solid var(--panel-border)', padding: '1.25rem', marginBottom: '0.75rem', opacity: user.disabled ? 0.82 : 1, transition: 'border-color 0.3s, background 0.3s' }}
                    >
                      {/* User info row */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '1.05rem' }}>{user.displayName}</div>
                          <div style={{ color: 'var(--primary)', fontSize: '0.85rem', marginTop: '0.15rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            {user.username}
                            {user.disabled && <span style={{ background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24', fontSize: '0.67rem', padding: '0.1rem 0.4rem', borderRadius: '4px', fontWeight: 700, letterSpacing: '0.05em' }}>DISABLED</span>}
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.65rem' }}>
                            {user.groups.length === 0
                              ? <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>No group memberships found</span>
                              : user.groups.map(g => (
                                  <div key={g} style={{ background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.2)', color: 'var(--primary)', fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '6px', fontWeight: 500 }}>{g}</div>
                                ))
                            }
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => togglePicker(user)}
                          style={{ background: edit.showPicker ? 'rgba(56,189,248,0.2)' : 'rgba(255,255,255,0.05)', border: edit.showPicker ? '1px solid rgba(56,189,248,0.3)' : '1px solid rgba(255,255,255,0.08)', color: edit.showPicker ? 'var(--primary)' : 'var(--text-muted)', padding: '0.6rem 0.9rem', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0, marginLeft: '1rem', fontSize: '0.85rem', fontWeight: 600, transition: 'all 0.2s' }}
                        >
                          <Tags size={15} /> Edit Groups
                        </button>
                      </div>

                      {/* Action row */}
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.85rem', paddingTop: '0.85rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        <button type="button" onClick={() => togglePicker(user)} style={{ background: edit.showPicker ? 'rgba(56,189,248,0.2)' : 'rgba(255,255,255,0.05)', border: edit.showPicker ? '1px solid rgba(56,189,248,0.3)' : '1px solid rgba(255,255,255,0.08)', color: edit.showPicker ? 'var(--primary)' : 'var(--text-muted)', padding: '0.5rem 0.85rem', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', fontWeight: 600, transition: 'all 0.2s' }}>
                          <Tags size={13} /> Edit Groups
                        </button>
                        <button type="button" onClick={() => {
                          const isOpen = getUserEdit(user.dn).showReset;
                          updateUserEdit(user.dn, { showReset: !isOpen, resetInput: !isOpen ? generatePassword() : '' });
                        }} style={{ background: edit.showReset ? 'rgba(251,191,36,0.15)' : 'rgba(255,255,255,0.05)', border: edit.showReset ? '1px solid rgba(251,191,36,0.3)' : '1px solid rgba(255,255,255,0.08)', color: edit.showReset ? '#fbbf24' : 'var(--text-muted)', padding: '0.5rem 0.85rem', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', fontWeight: 600, transition: 'all 0.2s' }}>
                          <KeyRound size={13} /> Reset Password
                        </button>
                        <button type="button" onClick={() => handleToggleDisable(user)} disabled={disablingDn === user.dn}
                          style={{ background: user.disabled ? 'rgba(16,185,129,0.12)' : 'rgba(251,191,36,0.1)', border: user.disabled ? '1px solid rgba(16,185,129,0.25)' : '1px solid rgba(251,191,36,0.25)', color: user.disabled ? 'var(--success)' : '#fbbf24', padding: '0.5rem 0.85rem', borderRadius: '8px', cursor: disablingDn === user.dn ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', fontWeight: 600, transition: 'all 0.2s', opacity: disablingDn === user.dn ? 0.6 : 1 }}>
                          {disablingDn === user.dn
                            ? <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}><TerminalSquare size={13} /></motion.div>
                            : user.disabled ? <><UserCheck size={13} /> Enable</> : <><UserX size={13} /> Disable</>
                          }
                        </button>
                        <button type="button" onClick={() => {
                          if (confirmDeleteDn === user.dn) handleDeleteUser(user);
                          else { setConfirmDeleteDn(user.dn); setTimeout(() => setConfirmDeleteDn(d => d === user.dn ? null : d), 4000); }
                        }} style={{ marginLeft: 'auto', background: confirmDeleteDn === user.dn ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.05)', border: confirmDeleteDn === user.dn ? '1px solid rgba(239,68,68,0.4)' : '1px solid rgba(255,255,255,0.08)', color: 'var(--error)', padding: '0.5rem 0.85rem', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.82rem', fontWeight: 600, transition: 'all 0.2s' }}>
                          <Trash2 size={13} /> {confirmDeleteDn === user.dn ? 'Confirm Delete?' : 'Delete User'}
                        </button>
                      </div>

                      {/* Reset password panel */}
                      <AnimatePresence>
                      {edit.showReset && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}>
                          <div style={{ paddingTop: '0.85rem' }}>
                            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                              <input
                                type="text"
                                className="input-field"
                                value={edit.resetInput}
                                onChange={e => updateUserEdit(user.dn, { resetInput: e.target.value })}
                                placeholder="New password"
                                style={{ padding: '0.65rem 1rem', fontSize: '0.9rem', fontFamily: 'monospace' }}
                              />
                              <button type="button" onClick={() => updateUserEdit(user.dn, { resetInput: generatePassword() })} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: 'var(--text-muted)', padding: '0.65rem 0.85rem', borderRadius: '12px', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600, whiteSpace: 'nowrap', transition: 'all 0.2s' }}>
                                Regenerate
                              </button>
                              <button type="button" onClick={() => handleResetPassword(user)} disabled={resettingDn === user.dn || !edit.resetInput.trim()} style={{ background: 'linear-gradient(135deg,#fbbf24,#f59e0b)', border: 'none', color: '#000', padding: '0.65rem 1rem', borderRadius: '12px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 700, whiteSpace: 'nowrap', opacity: resettingDn === user.dn ? 0.7 : 1, transition: 'all 0.2s' }}>
                                {resettingDn === user.dn ? <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}><TerminalSquare size={16} /></motion.div> : 'Set Password'}
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                      </AnimatePresence>

                      {/* Last reset password display */}
                      {edit.resetPassword && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.75rem', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.2)', padding: '0.65rem 1rem', borderRadius: '10px' }}>
                          <KeyRound size={14} color="#fbbf24" style={{ flexShrink: 0 }} />
                          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', flexShrink: 0 }}>New password:</span>
                          <code style={{ color: '#fbbf24', fontWeight: 600, fontSize: '0.9rem', flex: 1 }}>{edit.resetPassword}</code>
                          <button type="button" onClick={() => {
                            navigator.clipboard.writeText(edit.resetPassword);
                            updateUserEdit(user.dn, { resetCopied: true });
                            setTimeout(() => updateUserEdit(user.dn, { resetCopied: false }), 2000);
                          }} style={{ background: edit.resetCopied ? 'rgba(16,185,129,0.15)' : 'rgba(255,255,255,0.05)', border: edit.resetCopied ? '1px solid rgba(16,185,129,0.3)' : '1px solid rgba(255,255,255,0.1)', color: edit.resetCopied ? 'var(--success)' : 'var(--text-muted)', padding: '0.35rem 0.6rem', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', fontWeight: 600, transition: 'all 0.2s', whiteSpace: 'nowrap' }}>
                            {edit.resetCopied ? <><CheckCircle2 size={13} /> Copied!</> : <ClipboardCopy size={13} />}
                          </button>
                        </div>
                      )}

                      {/* Group picker */}
                      <AnimatePresence>
                      {edit.showPicker && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                          style={{ overflow: 'hidden', marginTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}
                        >
                          <div style={{ paddingTop: '1rem' }}>
                            {adGroups.length > 0 && (
                              <input type="text" className="input-field" placeholder="Search groups..." value={edit.groupSearch} onChange={e => updateUserEdit(user.dn, { groupSearch: e.target.value })} style={{ marginBottom: '0.75rem', background: 'rgba(15,23,42,0.8)', padding: '0.65rem 1rem', fontSize: '0.9rem' }} />
                            )}
                            <div style={{ maxHeight: '180px', overflowY: 'auto', background: 'rgba(15,23,42,0.6)', borderRadius: '12px', border: '1px solid var(--panel-border)', padding: '0.6rem' }}>
                              {adGroups.length === 0 ? (
                                <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>No groups discovered.</div>
                              ) : (
                                adGroups.filter(g => g.toLowerCase().includes(edit.groupSearch.toLowerCase())).map(g => {
                                  const wasMember = user.groups.includes(g);
                                  const isSelected = (edit.selected ?? user.groups).includes(g);
                                  const isToAdd    = !wasMember && isSelected;
                                  const isToRemove = wasMember && !isSelected;
                                  return (
                                    <label key={g} style={{ display: 'flex', alignItems: 'center', padding: '0.5rem 0.8rem', cursor: 'pointer', background: isToRemove ? 'rgba(239,68,68,0.08)' : isToAdd ? 'rgba(56,189,248,0.15)' : isSelected ? 'rgba(56,189,248,0.08)' : 'transparent', borderRadius: '8px', transition: 'all 0.2s', border: isToRemove ? '1px solid rgba(239,68,68,0.25)' : isToAdd ? '1px solid rgba(56,189,248,0.3)' : '1px solid transparent', marginBottom: '4px' }}>
                                      <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={(e) => {
                                          const cur = edit.selected ?? [...user.groups];
                                          const next = e.target.checked
                                            ? [...cur, g]
                                            : cur.filter(x => x !== g);
                                          updateUserEdit(user.dn, { selected: next });
                                        }}
                                        style={{ marginRight: '0.75rem', accentColor: 'var(--primary)', width: '16px', height: '16px' }}
                                      />
                                      <span style={{ fontSize: '0.9rem', color: isSelected || isToAdd ? '#fff' : 'var(--text-main)', fontWeight: isSelected ? 500 : 400 }}>{g}</span>
                                      {isToAdd    && <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 700 }}>ADD</span>}
                                      {isToRemove && <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--error)',   fontWeight: 700 }}>REMOVE</span>}
                                    </label>
                                  );
                                })
                              )}
                            </div>

                            {(() => {
                              const sel = edit.selected ?? user.groups;
                              const toAdd    = sel.filter(g => !user.groups.includes(g));
                              const toRemove = user.groups.filter(g => !sel.includes(g));
                              const hasChanges = toAdd.length > 0 || toRemove.length > 0;
                              const label = [
                                toAdd.length    ? `Add ${toAdd.length}`    : null,
                                toRemove.length ? `Remove ${toRemove.length}` : null,
                              ].filter(Boolean).join(', ');
                              return hasChanges ? (
                                <button
                                  type="button"
                                  onClick={() => handleSaveGroups(user)}
                                  disabled={isSaving}
                                  style={{ marginTop: '0.75rem', width: '100%', background: isSaved ? 'rgba(16,185,129,0.15)' : 'linear-gradient(135deg,#38bdf8,#0ea5e9)', border: isSaved ? '1px solid rgba(16,185,129,0.3)' : 'none', color: isSaved ? 'var(--success)' : '#fff', padding: '0.75rem', borderRadius: '10px', cursor: isSaving ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', transition: 'all 0.2s', opacity: isSaving ? 0.7 : 1 }}
                                >
                                  {isSaving
                                    ? <><motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}><TerminalSquare size={16} /></motion.div> Saving...</>
                                    : isSaved
                                      ? <><CheckCircle2 size={16} /> Saved!</>
                                      : `Save changes — ${label}`
                                  }
                                </button>
                              ) : null;
                            })()}
                          </div>
                        </motion.div>
                      )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
                </AnimatePresence>
                </div>
              </div>
            )}

            {/* ── All Users tab ── */}
            {activeTab === 'users' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    {allUsersLoaded ? `${allUsers.length} users` : 'Browse every account in the directory'}
                  </span>
                  <button type="button" onClick={handleLoadAllUsers} disabled={allUsersLoading}
                    style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.25)', color: 'var(--primary)', padding: '0.4rem 0.85rem', borderRadius: '8px', cursor: allUsersLoading ? 'not-allowed' : 'pointer', fontSize: '0.82rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem', opacity: allUsersLoading ? 0.7 : 1 }}>
                    {allUsersLoading ? <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}><TerminalSquare size={14} /></motion.div> : <><Search size={13} /> {allUsersLoaded ? 'Refresh' : 'Load All'}</>}
                  </button>
                </div>

                {error && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} style={{ color: 'var(--error)', fontSize: '0.9rem', display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '1rem', background: 'rgba(239,68,68,0.1)', padding: '1rem', borderRadius: '10px', border: '1px solid rgba(239,68,68,0.2)' }}>
                    <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '1px' }} /><span style={{ wordBreak: 'break-word', lineHeight: 1.4 }}>{error}</span>
                  </motion.div>
                )}

                {allUsersLoading && !allUsersLoaded && (
                  <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }} style={{ display: 'inline-block', marginBottom: '0.75rem' }}><TerminalSquare size={28} /></motion.div>
                    <div style={{ fontSize: '0.9rem' }}>Loading all directory users...</div>
                  </div>
                )}

                {allUsersLoaded && (
                  <>
                    <div style={{ maxHeight: '58vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.4rem', paddingRight: '0.25rem' }}>
                      {allUsers.slice(allUsersPage * ALL_USERS_PAGE_SIZE, (allUsersPage + 1) * ALL_USERS_PAGE_SIZE).map(user => (
                        <div key={user.dn} style={{ display: 'flex', alignItems: 'center', padding: '0.7rem 1rem', background: user.disabled ? 'rgba(30,20,5,0.4)' : 'rgba(15,23,42,0.4)', borderRadius: '10px', border: user.disabled ? '1px solid rgba(251,191,36,0.15)' : '1px solid var(--panel-border)', opacity: user.disabled ? 0.8 : 1 }}>
                          <User size={14} style={{ color: 'var(--text-muted)', flexShrink: 0, marginRight: '0.75rem' }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 500, fontSize: '0.92rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.displayName}</div>
                            <div style={{ color: 'var(--primary)', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              {user.username}
                              {user.disabled && <span style={{ background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24', fontSize: '0.65rem', padding: '0.05rem 0.35rem', borderRadius: '3px', fontWeight: 700 }}>DISABLED</span>}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {allUsers.length > ALL_USERS_PAGE_SIZE && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid var(--panel-border)' }}>
                        <button type="button" onClick={() => setAllUsersPage(p => Math.max(0, p - 1))} disabled={allUsersPage === 0}
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-main)', padding: '0.5rem 1rem', borderRadius: '8px', cursor: allUsersPage === 0 ? 'not-allowed' : 'pointer', fontSize: '0.85rem', fontWeight: 600, opacity: allUsersPage === 0 ? 0.35 : 1, transition: 'opacity 0.2s' }}>
                          ← Previous
                        </button>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          Page {allUsersPage + 1} of {Math.ceil(allUsers.length / ALL_USERS_PAGE_SIZE)} · {allUsers.length} total
                        </span>
                        <button type="button" onClick={() => setAllUsersPage(p => Math.min(Math.ceil(allUsers.length / ALL_USERS_PAGE_SIZE) - 1, p + 1))} disabled={allUsersPage >= Math.ceil(allUsers.length / ALL_USERS_PAGE_SIZE) - 1}
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-main)', padding: '0.5rem 1rem', borderRadius: '8px', cursor: allUsersPage >= Math.ceil(allUsers.length / ALL_USERS_PAGE_SIZE) - 1 ? 'not-allowed' : 'pointer', fontSize: '0.85rem', fontWeight: 600, opacity: allUsersPage >= Math.ceil(allUsers.length / ALL_USERS_PAGE_SIZE) - 1 ? 0.35 : 1, transition: 'opacity 0.2s' }}>
                          Next →
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── Groups tab ── */}
            {activeTab === 'groups' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                    {groupsLoaded ? `${groupList.length} groups` : 'Browse AD groups and their members'}
                  </span>
                  <button type="button" onClick={() => { handleLoadGroups(); setExpandedGroupDn(null); setGroupMembers({}); setGroupSearch(''); }} disabled={groupsLoading}
                    style={{ background: 'rgba(56,189,248,0.1)', border: '1px solid rgba(56,189,248,0.25)', color: 'var(--primary)', padding: '0.4rem 0.85rem', borderRadius: '8px', cursor: groupsLoading ? 'not-allowed' : 'pointer', fontSize: '0.82rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.35rem', opacity: groupsLoading ? 0.7 : 1 }}>
                    {groupsLoading ? <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }}><TerminalSquare size={14} /></motion.div> : <><Search size={13} /> {groupsLoaded ? 'Refresh' : 'Load Groups'}</>}
                  </button>
                </div>

                {groupsLoaded && (
                  <div style={{ position: 'relative', marginBottom: '0.85rem' }}>
                    <input type="text" className="input-field" placeholder="Filter groups..." value={groupSearch} onChange={e => setGroupSearch(e.target.value)}
                      style={{ padding: '0.6rem 1rem 0.6rem 2.4rem', fontSize: '0.88rem' }} />
                    <Search style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} size={15} />
                  </div>
                )}

                {error && (
                  <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} style={{ color: 'var(--error)', fontSize: '0.9rem', display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '1rem', background: 'rgba(239,68,68,0.1)', padding: '1rem', borderRadius: '10px', border: '1px solid rgba(239,68,68,0.2)' }}>
                    <AlertCircle size={18} style={{ flexShrink: 0, marginTop: '1px' }} /><span style={{ wordBreak: 'break-word', lineHeight: 1.4 }}>{error}</span>
                  </motion.div>
                )}

                {groupsLoading && !groupsLoaded && (
                  <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                    <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1 }} style={{ display: 'inline-block', marginBottom: '0.75rem' }}><TerminalSquare size={28} /></motion.div>
                    <div style={{ fontSize: '0.9rem' }}>Loading groups...</div>
                  </div>
                )}

                {groupsLoaded && (
                  <div style={{ maxHeight: '58vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingRight: '0.25rem' }}>
                    {groupList.filter(g => !groupSearch || g.cn.toLowerCase().includes(groupSearch.toLowerCase()) || g.description.toLowerCase().includes(groupSearch.toLowerCase())).map(group => {
                      const isExpanded = expandedGroupDn === group.dn;
                      const mData = groupMembers[group.dn];
                      return (
                        <div key={group.dn} style={{ background: 'rgba(15,23,42,0.4)', borderRadius: '12px', border: '1px solid var(--panel-border)' }}>
                          {/* clickable header row — div instead of button to avoid UA stylesheet issues */}
                          <div role="button" tabIndex={0} onClick={() => handleExpandGroup(group)} onKeyDown={e => e.key === 'Enter' && handleExpandGroup(group)}
                            style={{ padding: '0.85rem 1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.75rem', borderRadius: isExpanded ? '12px 12px 0 0' : '12px', userSelect: 'none' }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', color: 'var(--text-main)' }}>
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.cn}</span>
                                <span style={{ background: group.isSecurity ? 'rgba(56,189,248,0.12)' : 'rgba(16,185,129,0.12)', border: group.isSecurity ? '1px solid rgba(56,189,248,0.25)' : '1px solid rgba(16,185,129,0.25)', color: group.isSecurity ? 'var(--primary)' : 'var(--success)', fontSize: '0.66rem', padding: '0.1rem 0.4rem', borderRadius: '4px', fontWeight: 700, flexShrink: 0 }}>
                                  {group.isSecurity ? 'Security' : 'Distribution'}
                                </span>
                                {group.scope && <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem', fontWeight: 500, flexShrink: 0 }}>{group.scope}</span>}
                              </div>
                              {group.description && <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.2rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{group.description}</div>}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
                              <span style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', padding: '0.2rem 0.6rem', borderRadius: '6px', fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                {group.memberCount} {group.memberCount === 1 ? 'member' : 'members'}
                              </span>
                              <ChevronDown size={15} style={{ color: 'var(--text-muted)', transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }} />
                            </div>
                          </div>

                          <AnimatePresence>
                          {isExpanded && (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                              style={{ overflow: 'hidden', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                              <div style={{ padding: '0.75rem 1rem' }}>
                                {mData?.loading ? (
                                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '0.75rem', fontSize: '0.85rem' }}>Loading members...</div>
                                ) : mData?.error ? (
                                  <div style={{ color: 'var(--error)', fontSize: '0.85rem' }}>{mData.error}</div>
                                ) : !mData || mData.members.length === 0 ? (
                                  <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>No members found.</div>
                                ) : (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', maxHeight: '220px', overflowY: 'auto' }}>
                                    {mData.members.map((m, i) => (
                                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', padding: '0.4rem 0.6rem', background: m.disabled ? 'rgba(30,20,5,0.4)' : 'rgba(255,255,255,0.03)', borderRadius: '8px', border: m.disabled ? '1px solid rgba(251,191,36,0.1)' : '1px solid transparent' }}>
                                        <User size={13} style={{ flexShrink: 0, color: 'var(--text-muted)' }} />
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                          <span style={{ fontSize: '0.88rem', fontWeight: 500, color: 'var(--text-main)' }}>{m.displayName}</span>
                                          <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem', marginLeft: '0.5rem' }}>{m.username}</span>
                                        </div>
                                        {m.disabled && <span style={{ background: 'rgba(251,191,36,0.15)', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24', fontSize: '0.65rem', padding: '0.05rem 0.35rem', borderRadius: '3px', fontWeight: 700, flexShrink: 0 }}>DISABLED</span>}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default App;
