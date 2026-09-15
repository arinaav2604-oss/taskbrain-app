import React, { useState, useEffect } from 'react';

// Paste your deployed Google Apps Script Web App URL here:
const DRIVE_SYNC_API_URL = "https://script.google.com/macros/s/AKfycbz1YxBKGEYFIhBQYDgjnpboLWT83s2Me9xKieExGawzz-MxcKFdhQXzssVEc8kzd0y1xA/exec";

const CAMPAIGN_MILESTONES = [
  'Media Plan Approval',
  'Client Induction Call by AM',
  'Landing Page Approval',
  'Creative Approval',
  'Copy Approval',
  'Webhook Integration',
  'Finance Approval',
  'Credit Allocation',
  'Project Campaign Approval Ready Mockups',
  'Campaign Go-Live Notification'
];

export default function App() {
  const [db, setDb] = useState({ tasks: [], learnedTemplates: [] });
  const [syncStatus, setSyncStatus] = useState('☁️ Initializing Cloud Link...');
  const [activeView, setActiveView] = useState('WORKSPACE');

  const [form, setForm] = useState({
    title: '',
    clientName: '',
    deadline: '',
    assignedMembers: '',
    selectedMilestones: [],
    customGreetingTonality: '',
    clientEmailInput: ''
  });

  const [activeOutput, setActiveOutput] = useState(null);
  const [alarmActive, setAlarmActive] = useState(null);
  const [copiedType, setCopiedType] = useState('');

  const smartClientList = Array.from(new Set(db.tasks.map(t => t.clientName).filter(Boolean)));
  const smartDeliverableList = Array.from(new Set(db.tasks.map(t => t.title).filter(Boolean)));

  const totalActiveTasks = db.tasks.length;
  const criticalEscalations = db.tasks.filter(t => {
    const text = (t.clientEmailInput || '').toLowerCase();
    return text.includes('urgent') || text.includes('escalate');
  }).length;
  
  const tasksDue24h = db.tasks.filter(t => {
    if (!t.deadline) return false;
    const timeDiff = new Date(t.deadline).getTime() - Date.now();
    return timeDiff > 0 && timeDiff <= 86400000;
  }).length;

  // --- AUTOMATIC CLOUD FETCH ON APP BOOT ---
  const fetchCloudDatabase = async () => {
    if (!DRIVE_SYNC_API_URL || DRIVE_SYNC_API_URL.includes("YOUR_SCRIPT_ID")) {
      setSyncStatus('⚠️ Configure Script URL');
      return;
    }
    try {
      setSyncStatus('🔄 Fetching from Drive...');
      const response = await fetch(DRIVE_SYNC_API_URL);
      const data = await response.json();
      if (data && data.tasks) {
        setDb({
          tasks: data.tasks || [],
          learnedTemplates: data.learnedTemplates || []
        });
        setSyncStatus('☁️ Drive Auto-Synced');
      }
    } catch (err) {
      console.error('Fetch error:', err);
      setSyncStatus('⚠️ Sync Offline');
    }
  };

  useEffect(() => {
    fetchCloudDatabase();
  }, []);

  // --- BACKGROUND SYNC BACK TO GOOGLE DRIVE ---
  const syncToCloud = async (updatedDb) => {
    if (!DRIVE_SYNC_API_URL || DRIVE_SYNC_API_URL.includes("YOUR_SCRIPT_ID")) return;
    try {
      setSyncStatus('🔄 Saving to Drive...');
      await fetch(DRIVE_SYNC_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // avoids preflight CORS restrictions
        body: JSON.stringify(updatedDb)
      });
      setSyncStatus('☁️ Drive Auto-Synced');
    } catch (err) {
      console.error('Sync error:', err);
      setSyncStatus('⚠️ Cloud Sync Failed');
    }
  };

  // --- REAL-TIME ALARM ENGINE ---
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setDb(prevDb => {
        let alarmTriggered = false;
        const updatedTasks = prevDb.tasks.map(task => {
          if (task.status === 'COMPLETED' || task.notified) return task;
          const timeLeft = new Date(task.deadline).getTime() - now;
          if (timeLeft <= 600000 && timeLeft > -3600000) { 
            alarmTriggered = true;
            setAlarmActive(task);
            if ('Notification' in window && Notification.permission === 'granted') {
              new Notification(`⏰ ALARM: ${task.title}`, { body: `Client: ${task.clientName} deadline approaching!` });
            }
            playAlarmSound();
            return { ...task, notified: true };
          }
          return task;
        });

        if (alarmTriggered) {
          const newDb = { ...prevDb, tasks: updatedTasks };
          syncToCloud(newDb);
          return newDb;
        }
        return prevDb;
      });
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const playAlarmSound = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine'; 
      osc.frequency.setValueAtTime(659.25, ctx.currentTime);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      osc.connect(gain); 
      gain.connect(ctx.destination);
      osc.start(); 
      osc.stop(ctx.currentTime + 0.8);
    } catch (e) {}
  };

  const handleMilestoneToggle = (milestone) => {
    setForm(prev => ({
      ...prev,
      selectedMilestones: prev.selectedMilestones.includes(milestone) 
        ? prev.selectedMilestones.filter(m => m !== milestone) 
        : [...prev.selectedMilestones, milestone]
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    let updatedTemplates = [...db.learnedTemplates];
    if (form.customGreetingTonality && !updatedTemplates.includes(form.customGreetingTonality)) {
      updatedTemplates.push(form.customGreetingTonality);
    }

    const newTask = {
      id: `TB-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
      ...form,
      assignedMembers: form.assignedMembers.split(',').map(m => m.trim()),
      createdDate: new Date().toISOString(),
      status: 'PENDING', 
      notified: false
    };

    const updatedDb = { tasks: [newTask, ...db.tasks], learnedTemplates: updatedTemplates };
    setDb(updatedDb);
    syncToCloud(updatedDb);

    setForm(prev => ({ ...prev, title: '', clientName: '', selectedMilestones: [], clientEmailInput: '' }));
  };

  const generateComms = (task) => {
    const analysis = (task.clientEmailInput || '').toLowerCase().includes('urgent') ? 'ESCALATED' : 'STANDARD';
    const formatConfig = { dateStyle: 'medium', timeStyle: 'short' };
    const deadlineStr = task.deadline ? new Date(task.deadline).toLocaleString([], formatConfig) : 'TBD';
    const createdStr = new Date(task.createdDate).toLocaleString([], formatConfig);
    const modifiedStr = new Date().toLocaleString([], formatConfig);
    const milestoneText = task.selectedMilestones.map(m => `[✔] ${m}`).join('\n');

    const emailSubject = `[Update] Campaign Status: ${task.title} | ${task.clientName}`;
    const emailBody = `${task.customGreetingTonality || 'Hi Client Team,'}\n\nMilestone Checklist:\n${milestoneText || 'Pending'}\n\n---\n- Deliverable: ${task.title}\n- Assigned Team: ${task.assignedMembers.join(', ')}\n- Target Deadline: ${deadlineStr}\n- Priority: ${analysis}\n\n-- System Logs --\n- Task Created: ${createdStr}\n- Draft Generated: ${modifiedStr}\n\nBest regards,\nAccount Management Team`;
    const whatsapp = `✨ *TaskBrain Status* ✨\n\n📌 *Task:* ${task.title}\n🏢 *Client:* ${task.clientName}\n⏰ *Target:* ${deadlineStr}\n\n📋 *Milestones:*\n${task.selectedMilestones.length > 0 ? task.selectedMilestones.map(m => `• ${m}`).join('\n') : '• Pending'}\n\n_📅 Created: ${createdStr}_\n_🔄 Drafted: ${modifiedStr}_`;

    setActiveOutput({ task, emailSubject, emailBody, whatsapp });
  };

  const copyText = (text, type) => {
    navigator.clipboard.writeText(text);
    setCopiedType(type); 
    setTimeout(() => setCopiedType(''), 2000);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-200 font-sans p-6 pb-20 selection:bg-teal-500 selection:text-white">
      <datalist id="client-list">{smartClientList.map((c, i) => <option key={i} value={c} />)}</datalist>
      <datalist id="deliverable-list">{smartDeliverableList.map((d, i) => <option key={i} value={d} />)}</datalist>

      {alarmActive && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-800 border border-sky-500/30 p-8 rounded-3xl max-w-sm w-full text-center shadow-2xl shadow-sky-900/50">
            <div className="w-16 h-16 bg-sky-500/20 text-sky-400 rounded-full flex items-center justify-center mx-auto text-3xl font-bold mb-4">⏰</div>
            <h3 className="text-xl font-semibold text-white mb-2">Approaching Deadline</h3>
            <p className="text-sm text-slate-300 mb-6">Deliverable <strong className="text-teal-400">{alarmActive.title}</strong> is due shortly.</p>
            <button onClick={() => setAlarmActive(null)} className="w-full bg-gradient-to-r from-teal-500 to-sky-500 hover:from-teal-400 text-white py-3 rounded-xl font-medium shadow-lg">Acknowledge</button>
          </div>
        </div>
      )}

      <header className="max-w-7xl mx-auto mb-8 bg-slate-800/40 backdrop-blur-md border border-slate-700/50 p-4 rounded-2xl shadow-sm">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center space-x-3">
            <div className="h-2 w-2 rounded-full bg-teal-400 animate-pulse shadow-[0_0_10px_rgba(45,212,191,0.8)]"></div>
            <h1 className="text-xl font-medium tracking-tight text-white">Task<span className="text-teal-400 font-semibold">Brain</span></h1>
          </div>
          <div className="flex items-center space-x-3">
            <span className="text-xs font-mono text-slate-400">{syncStatus}</span>
            <button 
              onClick={fetchCloudDatabase} 
              className="text-xs px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 text-teal-300 hover:bg-slate-700 transition-all font-mono"
            >
              Force Pull
            </button>
          </div>
        </div>
        
        <div className="flex space-x-2 border-t border-slate-700/50 pt-4 mt-2">
          <button onClick={() => setActiveView('WORKSPACE')} className={`px-5 py-2 rounded-xl text-xs font-medium transition-all ${activeView === 'WORKSPACE' ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
            ⚡ Operative Workspace
          </button>
          <button onClick={() => setActiveView('NVK_MONITOR')} className={`px-5 py-2 rounded-xl text-xs font-medium transition-all ${activeView === 'NVK_MONITOR' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30' : 'bg-slate-800 text-slate-400 hover:text-white'}`}>
            👁️ AM Head Monitor (NVK)
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        {activeView === 'NVK_MONITOR' ? (
          <div className="lg:col-span-12 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-slate-800/60 border border-slate-700/50 p-6 rounded-3xl shadow-lg">
                <h3 className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1">Total Active Tasks</h3>
                <p className="text-4xl font-bold text-white">{totalActiveTasks}</p>
              </div>
              <div className="bg-rose-900/20 border border-rose-500/30 p-6 rounded-3xl shadow-lg">
                <h3 className="text-xs text-rose-400 uppercase tracking-wider font-semibold mb-1">Critical Escalations</h3>
                <p className="text-4xl font-bold text-rose-300">{criticalEscalations}</p>
              </div>
              <div className="bg-amber-900/20 border border-amber-500/30 p-6 rounded-3xl shadow-lg">
                <h3 className="text-xs text-amber-400 uppercase tracking-wider font-semibold mb-1">Deadlines &lt; 24 Hours</h3>
                <p className="text-4xl font-bold text-amber-300">{tasksDue24h}</p>
              </div>
            </div>

            <div className="bg-slate-800/40 backdrop-blur-sm border border-slate-700/50 p-6 rounded-3xl shadow-xl">
              <h3 className="text-sm font-medium text-sky-400 uppercase tracking-wider mb-4">Global Task Stream</h3>
              <div className="space-y-3 max-h-[500px] overflow-y-auto custom-scrollbar pr-2">
                {db.tasks.length === 0 ? (
                  <div className="text-center py-12 text-slate-500 text-sm">No tasks in current cloud database. Submit a deliverable to populate.</div>
                ) : (
                  db.tasks.map(task => {
                    const isUrgent = (task.clientEmailInput || '').toLowerCase().includes('urgent');
                    return (
                      <div key={task.id} className={`p-4 rounded-2xl flex justify-between items-center border ${isUrgent ? 'bg-rose-900/10 border-rose-500/30' : 'bg-slate-900/60 border-slate-700/50'}`}>
                        <div>
                          <div className="flex items-center space-x-3 mb-1">
                            {isUrgent && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">ESCALATED</span>}
                            <h4 className="font-medium text-sm text-white">{task.title}</h4>
                          </div>
                          <p className="text-xs text-slate-400">Client: <span className="text-slate-300">{task.clientName}</span> | Team: <span className="text-slate-300">{task.assignedMembers.join(', ')}</span></p>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-slate-500 uppercase">Deadline</p>
                          <p className="text-xs font-mono text-teal-300">{task.deadline ? new Date(task.deadline).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : 'TBD'}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="lg:col-span-6 bg-slate-800/40 backdrop-blur-sm border border-slate-700/50 rounded-3xl p-8 shadow-xl">
              <h2 className="text-base font-medium text-white mb-6 tracking-wide">Workspace Matrix</h2>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-1">
                  <label className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">Deliverable Module</label>
                  <input type="text" list="deliverable-list" required value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="w-full bg-slate-900/50 border border-slate-700 rounded-xl p-3 text-sm focus:ring-2 focus:ring-teal-500/50 focus:outline-none transition-all" placeholder="Select or type deliverable" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">Target Client</label>
                    <input type="text" list="client-list" required value={form.clientName} onChange={e => setForm({...form, clientName: e.target.value})} className="w-full bg-slate-900/50 border border-slate-700 rounded-xl p-3 text-sm focus:ring-2 focus:ring-teal-500/50 focus:outline-none transition-all" placeholder="Select or type entity" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">Hard Deadline</label>
                    <input type="datetime-local" required value={form.deadline} onChange={e => setForm({...form, deadline: e.target.value})} className="w-full bg-slate-900/50 border border-slate-700 rounded-xl p-3 text-sm text-slate-300 focus:ring-2 focus:ring-teal-500/50 focus:outline-none transition-all" />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">Assigned Operational Team</label>
                  <input type="text" required value={form.assignedMembers} onChange={e => setForm({...form, assignedMembers: e.target.value})} className="w-full bg-slate-900/50 border border-slate-700 rounded-xl p-3 text-sm text-slate-300 focus:ring-2 focus:ring-teal-500/50 focus:outline-none transition-all" placeholder="Enter operative members" />
                </div>
                <div className="bg-slate-900/30 p-5 rounded-2xl border border-slate-700/50">
                  <label className="text-[11px] uppercase tracking-wider text-slate-400 font-medium mb-3 block">Milestone Tracking Selection</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                    {CAMPAIGN_MILESTONES.map(m => (
                      <label key={m} className="flex items-start space-x-3 text-xs text-slate-300 cursor-pointer group">
                        <input type="checkbox" checked={form.selectedMilestones.includes(m)} onChange={() => handleMilestoneToggle(m)} className="mt-0.5 rounded bg-slate-800 border-slate-600 text-teal-500 focus:ring-teal-500/50" />
                        <span className="group-hover:text-white transition-colors leading-relaxed whitespace-normal break-words">{m}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">Client Input (Escalation Analyzer)</label>
                  <textarea rows="2" value={form.clientEmailInput} onChange={e => setForm({...form, clientEmailInput: e.target.value})} className="w-full bg-slate-900/50 border border-slate-700 rounded-xl p-3 text-sm focus:ring-2 focus:ring-rose-500/50 focus:outline-none placeholder:text-slate-600" placeholder="Type or paste client emails here..." />
                </div>
                <div className="space-y-2">
                  <label className="text-[11px] uppercase tracking-wider text-slate-400 font-medium">Tonality Memory System</label>
                  {db.learnedTemplates.length > 0 && (
                    <select onChange={(e) => setForm({...form, customGreetingTonality: e.target.value})} className="w-full bg-slate-900/50 border border-slate-700 rounded-lg p-2 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-teal-500/50 mb-2">
                      <option value="">-- Retrieve historically learned tonality --</option>
                      {db.learnedTemplates.map((t, i) => <option key={i} value={t}>{t.substring(0, 50)}...</option>)}
                    </select>
                  )}
                  <textarea rows="3" value={form.customGreetingTonality} onChange={e => setForm({...form, customGreetingTonality: e.target.value})} className="w-full bg-slate-900/50 border border-slate-700 rounded-xl p-3 text-sm focus:ring-2 focus:ring-teal-500/50 focus:outline-none whitespace-pre-wrap placeholder:text-slate-600" placeholder="Type custom greeting logic here..." />
                </div>
                <button type="submit" className="w-full font-medium py-3.5 rounded-xl text-sm transition-all shadow-lg bg-gradient-to-r from-teal-500 to-sky-500 hover:from-teal-400 text-white shadow-teal-500/20">
                  Commit Deliverable to Live Drive
                </button>
              </form>
            </div>

            <div className="lg:col-span-6 space-y-6">
              <div className="bg-slate-800/40 backdrop-blur-sm border border-slate-700/50 p-6 rounded-3xl shadow-xl max-h-[380px] overflow-y-auto custom-scrollbar space-y-3">
                {db.tasks.length === 0 ? (
                  <div className="text-center py-12 text-slate-500 text-sm">System idle. Database empty.</div>
                ) : (
                  db.tasks.map(task => (
                    <div key={task.id} className="bg-slate-900/60 border border-slate-700/50 p-4 rounded-2xl flex justify-between items-center hover:border-slate-600 transition-colors">
                      <div>
                        <h3 className="font-medium text-sm text-white mb-0.5">{task.title}</h3>
                        <p className="text-[11px] text-slate-400 tracking-wide uppercase">{task.clientName}</p>
                      </div>
                      <button onClick={() => generateComms(task)} className="bg-slate-700/50 hover:bg-slate-700 text-teal-300 px-4 py-2 rounded-xl text-xs font-medium transition-colors">
                        Execute Payload
                      </button>
                    </div>
                  ))
                )}
              </div>

              {activeOutput && (
                <div className="bg-gradient-to-br from-slate-800/80 to-slate-900/80 backdrop-blur-md border border-sky-500/20 p-6 rounded-3xl shadow-2xl space-y-4">
                  <h3 className="text-xs font-medium text-sky-400 uppercase tracking-wider">Communication Payload Initialized</h3>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="bg-slate-900/80 p-5 rounded-2xl border border-slate-700/50 group">
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-[11px] font-medium text-teal-400 tracking-wide uppercase">WhatsApp Output Module</span>
                        <button onClick={() => copyText(activeOutput.whatsapp, 'wa')} className="text-[10px] bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg text-slate-300 transition-colors group-hover:bg-teal-500/20 group-hover:text-teal-300">{copiedType === 'wa' ? 'Clipboard Secured' : 'Copy Output'}</button>
                      </div>
                      <pre className="text-xs text-slate-300 whitespace-pre-wrap break-words font-mono leading-relaxed">{activeOutput.whatsapp}</pre>
                    </div>
                    <div className="bg-slate-900/80 p-5 rounded-2xl border border-slate-700/50 group">
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-[11px] font-medium text-teal-400 tracking-wide uppercase">Formal Email Output Module</span>
                        <button onClick={() => copyText(`${activeOutput.emailSubject}\n\n${activeOutput.emailBody}`, 'email')} className="text-[10px] bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg text-slate-300 transition-colors group-hover:bg-teal-500/20 group-hover:text-teal-300">{copiedType === 'email' ? 'Clipboard Secured' : 'Copy Output'}</button>
                      </div>
                      <pre className="text-xs text-slate-300 whitespace-pre-wrap break-words font-mono leading-relaxed max-h-48 overflow-y-auto custom-scrollbar pr-2">{activeOutput.emailBody}</pre>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}