import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, UserPlus, Server, Lock, User, TerminalSquare, AlertCircle, CheckCircle2, Tags, X, Plus, FolderTree } from 'lucide-react';
import './index.css';

function App() {
  const [step, setStep] = useState('login'); // login | dashboard
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Form states
  const [loginForm, setLoginForm] = useState({ dcServer: import.meta.env.VITE_DEFAULT_DC || '10.0.0.10', username: '', password: '' });
  
  // Dynamic UI States
  const [usersForm, setUsersForm] = useState([{ id: Date.now(), firstName: '', lastName: '', groups: [], showGroups: false, groupSearch: '' }]);
  
  const [adGroups, setAdGroups] = useState([]);
  const [fetchingGroups, setFetchingGroups] = useState(false);
  
  const [selectedOu, setSelectedOu] = useState(import.meta.env.VITE_DEFAULT_OU || 'OU=Users,OU=Corp,DC=corp,DC=example,DC=com');

  const [createdList, setCreatedList] = useState([]);

  const fetchDomainData = async () => {
     setFetchingGroups(true);

     fetch('/api/groups', {
       method: 'POST',
       headers: { 'Content-Type': 'application/json' },
       body: JSON.stringify(loginForm)
     })
     .then(res => res.json())
     .then(data => { if(data.success) setAdGroups(data.groups) })
     .catch(e => console.error(e))
     .finally(() => setFetchingGroups(false));
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm)
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
    } catch (err) {
      setError('Failed to reach backend server. Ensure server is running.');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkCreate = async (e) => {
    e.preventDefault();
    
    const validUsers = usersForm.filter(u => u.firstName.trim() !== '' && u.lastName.trim() !== '');
    if (validUsers.length === 0) return;

    setLoading(true); setError(null); setSuccess(null);
    
    const processedUsers = validUsers.map(u => {
      const gUser = (u.firstName.trim().charAt(0) + u.lastName.trim()).toLowerCase().replace(/[^a-z0-9]/g, '');
      const dairyProducts = ['Cheddar', 'Gouda', 'Brie', 'Milk', 'Yogurt', 'Butter', 'Swiss', 'Provolone', 'Cream', 'Feta', 'Parmesan', 'Mozzarella', 'Ricotta', 'Havarti', 'PepperJack', 'Gruyere', 'Muenster', 'Colby'];
      const randomDairy = dairyProducts[Math.floor(Math.random() * dairyProducts.length)];
      const gPass = `${randomDairy}!${Math.floor(Math.random() * 9000) + 1000}`;
      return {
        originalId: u.id,
        firstName: u.firstName.trim(),
        lastName: u.lastName.trim(),
        username: gUser,
        password: gPass,
        groups: u.groups || [] // Pack individual groups natively
      };
    });

    const payload = {
      ...loginForm,
      users: processedUsers,
      targetOu: selectedOu
    };

    try {
      const res = await fetch('/api/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      
      if (res.ok && data.success) {
        const returnedUsers = data.createdUsers || processedUsers;

        const tracked = returnedUsers.map(u => ({
           name: `${u.firstName} ${u.lastName}`,
           username: u.username,
           password: u.password,
           groupsCount: u.groups === undefined ? (processedUsers.find(p => p.originalId == u.originalId)?.groups.length||0) : u.groups,
           groupList: processedUsers.find(p => p.originalId == u.originalId)?.groups || [],
           ou: selectedOu || 'Default (CN=Users)'
        }));
        
        setCreatedList(prev => [...tracked, ...prev]);
        setUsersForm([{ id: Date.now(), firstName: '', lastName: '', groups: [], showGroups: false, groupSearch: '' }]);
        setSuccess(`Provisioned ${processedUsers.length} user(s) smoothly!`);
        setTimeout(() => setSuccess(null), 5000);
      } else {
        let msg = data.error || 'Failed to provision users';
        setError(msg);
      }
    } catch (err) {
      setError('Failed to reach backend server.');
    } finally {
      setLoading(false);
    }
  };

  const addUserRow = () => {
     setUsersForm([...usersForm, { id: Date.now(), firstName: '', lastName: '', groups: [], showGroups: false, groupSearch: '' }]);
  };

  const removeUserRow = (id) => {
     if (usersForm.length > 1) {
        setUsersForm(usersForm.filter(u => u.id !== id));
     }
  };

  const updateRow = (id, field, value) => {
     setUsersForm(usersForm.map(u => u.id === id ? { ...u, [field]: value } : u));
  };


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
            style={{ maxWidth: '420px'}}
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
                <div style={{position: 'relative'}}>
                   <input type="text" className="input-field" value={loginForm.dcServer} onChange={e => setLoginForm({...loginForm, dcServer: e.target.value})} />
                   <Server className="input-icon" size={20} />
                </div>
              </div>
              
              <div className="input-container">
                <label className="input-label">Admin Username</label>
                <div style={{position: 'relative'}}>
                   <input type="text" className="input-field" placeholder="DOMAIN\admin" value={loginForm.username} onChange={e => setLoginForm({...loginForm, username: e.target.value})} required />
                   <User className="input-icon" size={20} />
                </div>
              </div>

              <div className="input-container">
                <label className="input-label">Admin Password</label>
                <div style={{position: 'relative'}}>
                   <input type="password" className="input-field" placeholder="•••••••••" value={loginForm.password} onChange={e => setLoginForm({...loginForm, password: e.target.value})} required />
                   <Lock className="input-icon" size={20} />
                </div>
              </div>

              {error && (
                <motion.div initial={{opacity:0, height:0}} animate={{opacity:1, height:'auto'}} className="input-container" style={{color: 'var(--error)', fontSize: '0.9rem', display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginTop: '-0.5rem'}}>
                  <AlertCircle size={16} style={{flexShrink:0, marginTop:'2px'}}/> 
                  <span style={{wordBreak: 'break-word', lineHeight: 1.4}}>{error}</span>
                </motion.div>
              )}

              <button type="submit" className="btn-primary" disabled={loading} style={{marginTop: '1.5rem'}}>
                {loading ? <motion.div animate={{rotate: 360}} transition={{repeat: Infinity, duration: 1}}><TerminalSquare size={20}/></motion.div> : 'Establish Connection'}
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--panel-border)', paddingBottom: '1.5rem', marginBottom: '1.5rem' }}>
              <div>
                <h1 style={{ fontSize: '1.65rem', fontWeight: 600 }}>Bulk Provisioning</h1>
                <p style={{ color: 'var(--success)', fontSize: '0.875rem', marginTop: '0.25rem', display: 'flex', alignItems:'center', gap:'0.3rem' }}>
                   <CheckCircle2 size={14}/> Connected & Target Scoped for DC: {loginForm.dcServer}
                </p>
              </div>
              <div style={{ background: 'rgba(56,189,248,0.1)', padding: '0.85rem', borderRadius: '16px' }}>
                <UserPlus size={28} color="var(--primary)" />
              </div>
            </div>

            <form onSubmit={handleBulkCreate}>

              <div className="input-container" style={{marginBottom: '2rem'}}>
                <label className="input-label">Locked Target Organizational Unit</label>
                  <div style={{position: 'relative', opacity: 0.75}}>
                     <input type="text" className="input-field" disabled={true} style={{background: 'rgba(15, 23, 42, 0.4)', paddingLeft: '2.5rem', cursor:'not-allowed'}} value={selectedOu} onChange={()=>{}} />
                     <FolderTree className="input-icon" size={18} style={{top: '50%', transform: 'translateY(-50%)', left: '1rem', color: 'var(--text-muted)'}} />
                  </div>
              </div>
              
              <div style={{marginBottom: '2rem'}}>
                 <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'1rem'}}>
                    <label className="input-label" style={{marginBottom:0}}>User Entry Queue</label>
                    <button type="button" onClick={addUserRow} style={{background: 'rgba(56,189,248,0.2)', border:'none', color:'var(--primary)', padding:'0.4rem 0.8rem', borderRadius:'8px', cursor:'pointer', fontSize:'0.85rem', fontWeight:600, display:'flex', alignItems:'center', gap:'0.3rem'}}>
                       <Plus size={14}/> Add User
                    </button>
                 </div>
                 
                 <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                   <AnimatePresence>
                   {usersForm.map((u, i) => (
                     <motion.div 
                       key={u.id}
                       initial={{ opacity: 0, y: -10 }}
                       animate={{ opacity: 1, y: 0 }}
                       exit={{ opacity: 0, scale: 0.95 }}
                       style={{ display: 'flex', flexDirection: 'column', background: 'rgba(15, 23, 42, 0.4)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}
                     >
                        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
                            <div style={{ flex: '1 1 auto', position: 'relative' }}>
                              <input type="text" className="input-field" placeholder="First Name" value={u.firstName} onChange={e=>updateRow(u.id, 'firstName', e.target.value)} required />
                              <User className="input-icon" size={20} style={{top:'0.85rem'}}/>
                            </div>
                            <div style={{ flex: '1 1 auto', position: 'relative' }}>
                               <input type="text" className="input-field" placeholder="Last Name" value={u.lastName} onChange={e=>updateRow(u.id, 'lastName', e.target.value)} required />
                               <User className="input-icon" size={20} style={{top:'0.85rem'}}/>
                            </div>
                            
                            <button type="button" onClick={() => updateRow(u.id, 'showGroups', !u.showGroups)} style={{background: u.groups.length > 0 ? 'rgba(56,189,248,0.2)' : 'rgba(255,255,255,0.05)', border: u.groups.length > 0 ? '1px solid rgba(56,189,248,0.3)' : '1px solid transparent', color: u.groups.length > 0 ? 'var(--primary)' : 'var(--text-main)', padding:'0.75rem 1rem', borderRadius:'10px', cursor:'pointer', display:'flex', alignItems:'center', gap:'0.4rem', flexShrink: 0, transition: 'all 0.2s'}}>
                                <Tags size={16} /> 
                                <span style={{fontWeight: 500, fontSize: '0.9rem'}}>{u.groups.length === 0 ? 'Assign Groups' : `${u.groups.length} Selected`}</span>
                            </button>

                            {usersForm.length > 1 && (
                              <button type="button" onClick={() => removeUserRow(u.id)} style={{background: 'rgba(239, 68, 68, 0.1)', border:'1px solid rgba(239,68,68,0.2)', color:'var(--error)', padding:'0.75rem', borderRadius:'10px', cursor:'pointer', flexShrink: 0}}>
                                 <X size={18} />
                              </button>
                            )}
                        </div>

                        {/* Dropdown Tray for Groups per Row */}
                        <AnimatePresence>
                        {u.showGroups && (
                          <motion.div 
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            style={{ overflow: 'hidden', marginTop: '1rem', borderTop: '1px solid rgba(255,255,255,0.05)' }}
                          >
                             <div style={{paddingTop: '1rem'}}>
                                {!fetchingGroups && adGroups.length > 0 && (
                                  <input 
                                     type="text" 
                                     className="input-field" 
                                     placeholder="Search AD Groups..." 
                                     value={u.groupSearch || ''} 
                                     onChange={e => updateRow(u.id, 'groupSearch', e.target.value)}
                                     style={{marginBottom: '0.75rem', background: 'rgba(15, 23, 42, 0.8)', padding: '0.65rem 1rem', fontSize: '0.9rem'}} 
                                  />
                                )}

                                {fetchingGroups ? (
                                   <div style={{padding:'1rem', textAlign:'center', color:'var(--text-muted)'}}><TerminalSquare size={16}/> Loading active groups...</div>
                                ) : (
                                   <div style={{ maxHeight:'150px', overflowY:'auto', background:'rgba(15, 23, 42, 0.6)', borderRadius:'12px', border:'1px solid var(--panel-border)', padding:'0.6rem'}}>
                                     {adGroups.length === 0 ? (
                                        <div style={{padding:'1rem', textAlign:'center', color:'var(--text-muted)', fontSize:'0.9rem'}}>No groups discovered on your server.</div>
                                     ) : (
                                        adGroups.filter(g => g.toLowerCase().includes((u.groupSearch||'').toLowerCase())).map(g => {
                                            const isSelected = u.groups.includes(g);
                                            return (
                                                <label key={g} style={{display:'flex', alignItems:'center', padding:'0.5rem 0.8rem', cursor:'pointer', background: isSelected ? 'rgba(56,189,248,0.15)' : 'transparent', borderRadius:'8px', transition:'all 0.2s ease', border: isSelected ? '1px solid rgba(56,189,248,0.3)' : '1px solid transparent', marginBottom:'4px'}}>
                                                    <input type="checkbox" checked={isSelected} onChange={(e) => {
                                                        let newGroups = [...u.groups];
                                                        if(e.target.checked) newGroups.push(g);
                                                        else newGroups = newGroups.filter(x => x !== g);
                                                        updateRow(u.id, 'groups', newGroups);
                                                    }} style={{marginRight:'0.75rem', accentColor: 'var(--primary)', width:'16px', height:'16px'}}/>
                                                    <span style={{color: isSelected ? '#fff' : 'var(--text-main)', fontSize:'0.9rem', fontWeight: isSelected ? 500 : 400}}>{g}</span>
                                                </label>
                                            )
                                        })
                                     )}
                                   </div>
                                )}
                             </div>
                          </motion.div>
                        )}
                        </AnimatePresence>

                     </motion.div>
                   ))}
                   </AnimatePresence>
                 </div>
              </div>

              {error && (
                <motion.div initial={{opacity:0, y:-10}} animate={{opacity:1, y:0}} style={{width: '100%', color: 'var(--error)', fontSize: '0.9rem', display: 'flex', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '1.5rem', background:'rgba(239, 68, 68, 0.1)', padding:'1rem', borderRadius:'10px', border:'1px solid rgba(239, 68, 68, 0.2)'}}>
                  <AlertCircle size={18} style={{flexShrink:0, marginTop:'1px'}}/> 
                  <span style={{wordBreak: 'break-word', lineHeight: 1.4}}>{error}</span>
                </motion.div>
              )}

              {success && (
                <motion.div initial={{opacity:0, y:-10}} animate={{opacity:1, y:0}} style={{width: '100%', color: 'var(--success)', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', background:'rgba(16, 185, 129, 0.1)', padding:'1rem', borderRadius:'10px', border:'1px solid rgba(16, 185, 129, 0.2)'}}>
                  <CheckCircle2 size={18}/> {success}
                </motion.div>
              )}

              <button type="submit" className="btn-primary" disabled={loading} style={{ width: '100%' }}>
                {loading ? <motion.div animate={{rotate: 360}} transition={{repeat: Infinity, duration: 1}}><TerminalSquare size={20}/></motion.div> : `Provision ${usersForm.filter(u=>u.firstName).length} Active Directory User${usersForm.filter(u=>u.firstName).length!==1?'s':''} in Batch`}
              </button>
            </form>

            <AnimatePresence>
            {createdList.length > 0 && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} style={{ marginTop: '2.5rem' }}>
                <h3 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '1rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Active Directory Transaction Log</h3>
                <div style={{ background: 'none' }}>
                   {createdList.map((u, i) => (
                      <motion.div initial={{opacity:0, y:-10}} animate={{opacity:1, y:0}} transition={{delay: 0.1, type: 'spring'}} key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '1.25rem', background: 'rgba(15, 23, 42, 0.4)', borderRadius: '16px', border: '1px solid var(--panel-border)', marginBottom: '0.75rem', alignItems: 'flex-start' }}>
                        <div>
                           <div style={{fontWeight: 600, fontSize: '1.05rem'}}>{u.name}</div>
                           <div style={{color: 'var(--primary)', fontSize: '0.85rem', marginTop: '0.15rem'}}>{u.username}</div>
                           <div style={{color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.5rem', display:'flex', alignItems:'center', gap:'0.4rem'}}><FolderTree size={12}/> {u.ou}</div>
                           <div style={{display:'flex', flexWrap:'wrap', gap:'0.4rem', marginTop: '0.6rem'}}>
                               <div style={{background: 'rgba(56, 189, 248, 0.1)', border: '1px solid rgba(56, 189, 248, 0.2)', color: 'var(--primary)', fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '6px', fontWeight: 500}}>Domain Users</div>
                               {u.groupList.map(gName => (
                                 <div key={gName} style={{background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', color: 'var(--text-main)', fontSize: '0.75rem', padding: '0.2rem 0.5rem', borderRadius: '6px'}}>
                                    {gName}
                                 </div>
                               ))}
                           </div>
                        </div>
                        <div style={{ background: 'rgba(16, 185, 129, 0.1)', padding: '0.65rem 1rem', borderRadius: '10px', border: '1px solid rgba(16,185,129,0.2)', alignSelf:'center'}}>
                           <code style={{ color: 'var(--success)', fontWeight: 600, fontFamily: 'monospace', fontSize: '0.95rem' }}>{u.password}</code>
                        </div>
                      </motion.div>
                   ))}
                </div>
              </motion.div>
            )}
            </AnimatePresence>

          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

export default App;
