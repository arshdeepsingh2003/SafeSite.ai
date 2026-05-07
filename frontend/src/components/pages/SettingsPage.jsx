// ============================================================
// SafeSite AI — Settings Page  (Phase 13 — Final)
// File: frontend/src/components/pages/SettingsPage.jsx
//
// 3-column layout matching design exactly:
//   Left:   9-section vertical nav
//   Center: section content with tabs (General has 4 sub-tabs)
//   Right:  System Info · Storage · AI Model · Backup panels
// ============================================================

import { useState, useEffect } from 'react'
import { useSettings }         from '../../hooks/useSettings'
import { useSoundSettings }    from '../../context/SoundContext'
import { playAlarm, playBeep } from '../../services/soundService'
import EmailSettingsSection    from '../ui/EmailSettingsSection'
import toast from 'react-hot-toast'
import api   from '../../services/api'

// ── Small reusable primitives ─────────────────────────────────

function Toggle({ checked, onChange, disabled = false }) {
  return (
    <div
      onClick={() => !disabled && onChange(!checked)}
      style={{
        width: '44px', height: '24px', borderRadius: '12px',
        background: checked ? '#6366f1' : '#374151',
        position: 'relative', cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.2s', flexShrink: 0,
        border: `1px solid ${checked ? '#6366f1' : '#4b5563'}`,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <div style={{
        position: 'absolute', top: '2px',
        left: checked ? '22px' : '2px',
        width: '18px', height: '18px',
        background: 'white', borderRadius: '50%',
        transition: 'left 0.2s',
        boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
      }} />
    </div>
  )
}

function SettingRow({ icon, label, description, children }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '16px',
      padding: '14px 0', borderBottom: '1px solid var(--border)',
    }}>
      <div style={{
        width: '38px', height: '38px', flexShrink: 0,
        background: 'rgba(99,102,241,0.1)',
        border: '1px solid rgba(99,102,241,0.2)',
        borderRadius: '8px',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px',
      }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '13px', fontWeight: '600', color: '#e6edf3' }}>{label}</div>
        {description && <div style={{ fontSize: '11px', color: '#8b949e', marginTop: '2px' }}>{description}</div>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  )
}

function SectionHeader({ title, description }) {
  return (
    <div style={{ marginBottom: '20px' }}>
      <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#e6edf3', marginBottom: '4px' }}>{title}</h2>
      {description && <p style={{ fontSize: '13px', color: '#8b949e' }}>{description}</p>}
    </div>
  )
}

function SectionTitle({ children }) {
  return (
    <div style={{
      fontSize: '11px', fontWeight: '700', color: '#8b949e',
      textTransform: 'uppercase', letterSpacing: '0.08em',
      marginTop: '20px', marginBottom: '4px',
      paddingTop: '16px', borderTop: '1px solid var(--border)',
    }}>{children}</div>
  )
}

function InfoRow({ label, value, valueColor }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: '12px' }}>
      <span style={{ color: '#8b949e' }}>{label}</span>
      <span style={{ color: valueColor || '#e6edf3', fontWeight: '600' }}>{value}</span>
    </div>
  )
}

const inp = {
  width: '100%', padding: '9px 12px',
  background: 'var(--bg-primary)', border: '1px solid var(--border)',
  borderRadius: '7px', color: '#e6edf3', fontSize: '13px', outline: 'none',
}
const sel = { ...inp }

// ── Main component ────────────────────────────────────────────
export default function SettingsPage() {
  const {
    settings, systemInfo, loading, saving,
    updateField, saveAll,
    users, loadingUsers, createUser, deleteUser, toggleUser,
    triggerBackup,
  } = useSettings()

  const { soundEnabled, setSoundEnabled, volume, setVolume, highOnly, setHighOnly } = useSoundSettings()

  const [activeSection, setActiveSection] = useState('general')
  const [activeTab,     setActiveTab]     = useState('system')  // for General's sub-tabs
  const [newUserForm,   setNewUserForm]   = useState({ name:'', email:'', password:'', role:'user' })

  const navItems = [
    { id: 'general',     icon: '⚙️',  label: 'General Settings',      desc: 'System general configuration'       },
    { id: 'detection',   icon: '🤖', label: 'Detection Settings',     desc: 'AI model & detection preferences'   },
    { id: 'alerts',      icon: '🔔', label: 'Alert Settings',         desc: 'Configure alerts & notifications'   },
    { id: 'email',       icon: '📧', label: 'Email & Notifications',  desc: 'Email and notification settings'    },
    { id: 'users',       icon: '👥', label: 'User Management',        desc: 'Manage users & permissions'         },
    { id: 'cameras',     icon: '📹', label: 'Camera Settings',        desc: 'Manage camera configurations'       },
    { id: 'zones',       icon: '📍', label: 'Site & Zone Settings',   desc: 'Manage sites and zones'             },
    { id: 'storage',     icon: '💾', label: 'Data & Storage',         desc: 'Data retention and storage'         },
    { id: 'integration', icon: '🔗', label: 'System Integration',     desc: 'Third-party integrations'           },
    { id: 'backup',      icon: '🔄', label: 'Backup & Restore',       desc: 'Backup and restore system'          },
    { id: 'audit',       icon: '📋', label: 'Audit Logs',             desc: 'View system activity logs'          },
  ]

  const generalTabs = [
    { id: 'system',    label: 'System Configuration' },
    { id: 'regional',  label: 'Regional Settings'    },
    { id: 'security',  label: 'Security'             },
    { id: 'appearance',label: 'Appearance'            },
  ]

  // ── Section renderers ─────────────────────────────────────

  function renderGeneral() {
    return (
      <>
        <SectionHeader title="General Settings" description="Configure general system settings and preferences" />

        {/* Sub-tabs */}
        <div style={{ display: 'flex', gap: '0', marginBottom: '24px', borderBottom: '2px solid var(--border)' }}>
          {generalTabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              padding: '10px 18px', fontSize: '13px', fontWeight: '600',
              background: 'none', border: 'none', cursor: 'pointer',
              color:        activeTab === tab.id ? '#6366f1' : '#8b949e',
              borderBottom: activeTab === tab.id ? '2px solid #6366f1' : '2px solid transparent',
              marginBottom: '-2px', transition: 'all 0.15s',
            }}>{tab.label}</button>
          ))}
        </div>

        {activeTab === 'system' && (
          <>
            <SettingRow icon="🖥️" label="System Name" description="Set the name of your monitoring system">
              <input value={settings.system_name || ''} onChange={e => updateField('system_name', e.target.value)}
                style={{ ...inp, width: '260px' }} />
            </SettingRow>
            <SettingRow icon="🌐" label="System Timezone" description="Set the timezone for the system">
              <select value={settings.timezone || 'Asia/Kolkata'} onChange={e => updateField('timezone', e.target.value)} style={{ ...sel, width: '220px' }}>
                {['Asia/Kolkata','UTC','America/New_York','America/Los_Angeles','Europe/London','Europe/Paris','Asia/Tokyo','Australia/Sydney'].map(tz => (
                  <option key={tz}>{tz}</option>
                ))}
              </select>
            </SettingRow>
            <SettingRow icon="📅" label="Date Format" description="Choose the date format for display">
              <select value={settings.date_format || 'DD MMM YYYY'} onChange={e => updateField('date_format', e.target.value)} style={{ ...sel, width: '220px' }}>
                {['DD MMM YYYY','MM/DD/YYYY','DD/MM/YYYY','YYYY-MM-DD'].map(f => <option key={f}>{f}</option>)}
              </select>
            </SettingRow>
            <SettingRow icon="🕐" label="Time Format" description="Choose the time format for display">
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                {['12h', '24h'].map(f => (
                  <label key={f} style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '13px', color: '#e6edf3' }}>
                    <input type="radio" name="time_format" value={f}
                      checked={(settings.time_format || '24h') === f}
                      onChange={() => updateField('time_format', f)}
                      style={{ accentColor: '#6366f1' }}
                    />
                    {f === '12h' ? '12 Hour (AM/PM)' : '24 Hour'}
                  </label>
                ))}
              </div>
            </SettingRow>
            <SettingRow icon="🌍" label="Default Language" description="Select the default system language">
              <select value={settings.language || 'English'} onChange={e => updateField('language', e.target.value)} style={{ ...sel, width: '180px' }}>
                {['English','Hindi','Spanish','French','German','Arabic'].map(l => <option key={l}>{l}</option>)}
              </select>
            </SettingRow>
            <SettingRow icon="📄" label="Items Per Page" description="Select how many items to show per page">
              <input type="number" min="5" max="50"
                value={settings.items_per_page || 10}
                onChange={e => updateField('items_per_page', parseInt(e.target.value))}
                style={{ ...inp, width: '80px', textAlign: 'center' }}
              />
            </SettingRow>
            <SettingRow icon="🔒" label="Auto Logout" description="Automatically logout after specified time">
              <select value={settings.auto_logout_mins || 30} onChange={e => updateField('auto_logout_mins', parseInt(e.target.value))} style={{ ...sel, width: '160px' }}>
                {[15, 30, 60, 120, 240, 0].map(m => (
                  <option key={m} value={m}>{m === 0 ? 'Never' : `${m} Minutes`}</option>
                ))}
              </select>
            </SettingRow>
          </>
        )}

        {activeTab === 'regional' && (
          <>
            <SettingRow icon="💱" label="Currency" description="Default currency for cost reports">
              <select value={settings.currency || 'USD'} onChange={e => updateField('currency', e.target.value)} style={{ ...sel, width: '160px' }}>
                {['USD','EUR','GBP','INR','AED','SAR'].map(c => <option key={c}>{c}</option>)}
              </select>
            </SettingRow>
            <SettingRow icon="📏" label="Distance Units" description="Measurement system">
              <select value={settings.units || 'metric'} onChange={e => updateField('units', e.target.value)} style={{ ...sel, width: '160px' }}>
                <option value="metric">Metric (km, m)</option>
                <option value="imperial">Imperial (mi, ft)</option>
              </select>
            </SettingRow>
          </>
        )}

        {activeTab === 'security' && (
          <>
            <SettingRow icon="🔑" label="Session Timeout" description="JWT token expiry (requires re-login)">
              <select value={settings.session_hours || 24} onChange={e => updateField('session_hours', parseInt(e.target.value))} style={{ ...sel, width: '160px' }}>
                {[1,8,24,48,168].map(h => <option key={h} value={h}>{h === 168 ? '1 Week' : `${h} Hour${h>1?'s':''}`}</option>)}
              </select>
            </SettingRow>
            <SettingRow icon="🔐" label="Require Strong Password" description="Minimum 8 chars, number and symbol">
              <Toggle checked={settings.strong_password !== false} onChange={v => updateField('strong_password', v)} />
            </SettingRow>
            <SettingRow icon="📱" label="Login Notifications" description="Email alert on new login">
              <Toggle checked={settings.login_notifications !== false} onChange={v => updateField('login_notifications', v)} />
            </SettingRow>
          </>
        )}

        {activeTab === 'appearance' && (
          <>
            <SettingRow icon="🔊" label="Enable Sound Alerts" description="Play sound for important alerts">
              <Toggle checked={soundEnabled} onChange={setSoundEnabled} />
            </SettingRow>
            <SettingRow icon="🎚️" label="Alert Volume" description="Volume level for sound alerts">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input type="range" min="0" max="1" step="0.05" value={volume}
                  onChange={e => setVolume(parseFloat(e.target.value))}
                  disabled={!soundEnabled}
                  style={{ width: '120px', accentColor: '#6366f1', cursor: soundEnabled ? 'pointer' : 'not-allowed' }}
                />
                <span style={{ fontSize: '12px', color: '#e6edf3', width: '36px' }}>{Math.round(volume * 100)}%</span>
              </div>
            </SettingRow>
            <SettingRow icon="📊" label="Show Confidence Score" description="Display confidence score on detections">
              <Toggle checked={settings.show_confidence !== false} onChange={v => updateField('show_confidence', v)} />
            </SettingRow>
            <SettingRow icon="🌙" label="Enable Dark Mode" description="Switch between light and dark theme">
              <Toggle checked={settings.dark_mode !== false} onChange={v => updateField('dark_mode', v)} disabled />
            </SettingRow>
            <div style={{ marginTop: '10px' }}>
              <div style={{ fontSize: '12px', color: '#8b949e', marginBottom: '10px' }}>Test Sounds</div>
              <div style={{ display: 'flex', gap: '10px' }}>
                {[
                  { label: '🔴 Alarm',   fn: playAlarm, color: '#ef4444' },
                  { label: '🟡 Beep',    fn: playBeep,  color: '#eab308' },
                ].map(btn => (
                  <button key={btn.label} onClick={() => { if (soundEnabled) btn.fn(); else toast('Enable sound first') }}
                    style={{
                      padding: '7px 16px', fontSize: '12px', fontWeight: '600',
                      background: `${btn.color}18`, border: `1px solid ${btn.color}40`,
                      borderRadius: '7px', color: btn.color, cursor: 'pointer',
                      opacity: soundEnabled ? 1 : 0.4,
                    }}
                  >{btn.label}</button>
                ))}
              </div>
            </div>
          </>
        )}
      </>
    )
  }

  function renderDetection() {
    return (
      <>
        <SectionHeader title="Detection Settings" description="Configure AI model and detection preferences" />
        <SectionTitle>AI Model Configuration</SectionTitle>
        <SettingRow icon="🎯" label="Detection Model" description="YOLOv8 model variant to use">
          <select value={settings.detection_model || 'YOLOv8n'} onChange={e => updateField('detection_model', e.target.value)} style={{ ...sel, width: '200px' }}>
            <option value="YOLOv8n">YOLOv8n (Fastest)</option>
            <option value="YOLOv8s">YOLOv8s (Balanced)</option>
            <option value="YOLOv8m">YOLOv8m (Best)</option>
          </select>
        </SettingRow>
        <SettingRow icon="📊" label="Confidence Threshold" description={`Minimum confidence: ${settings.confidence_threshold || 0.5}`}>
          <input type="range" min="0.1" max="0.95" step="0.05"
            value={settings.confidence_threshold || 0.5}
            onChange={e => updateField('confidence_threshold', parseFloat(e.target.value))}
            style={{ width: '150px', accentColor: '#6366f1' }}
          />
          <span style={{ fontSize: '12px', color: '#e6edf3', marginLeft: '8px', minWidth: '36px' }}>
            {settings.confidence_threshold || 0.5}
          </span>
        </SettingRow>
        <SettingRow icon="🎞️" label="Frame Sample Rate" description="Analyze every Nth frame (lower = slower but more accurate)">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input type="number" min="1" max="30"
              value={settings.frame_sample_rate || 5}
              onChange={e => updateField('frame_sample_rate', parseInt(e.target.value))}
              style={{ ...inp, width: '70px', textAlign: 'center' }}
            />
            <span style={{ fontSize: '12px', color: '#8b949e' }}>frames</span>
          </div>
        </SettingRow>
        <SettingRow icon="📐" label="Minimum Detection Size" description="Ignore detections smaller than this (pixels)">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input type="number" min="10" max="200"
              value={settings.min_detection_size || 50}
              onChange={e => updateField('min_detection_size', parseInt(e.target.value))}
              style={{ ...inp, width: '70px', textAlign: 'center' }}
            />
            <span style={{ fontSize: '12px', color: '#8b949e' }}>px</span>
          </div>
        </SettingRow>
        <SettingRow icon="🔄" label="Enable Object Tracking" description="Track workers across frames for consistent IDs">
          <Toggle checked={settings.enable_tracking !== false} onChange={v => updateField('enable_tracking', v)} />
        </SettingRow>

        <SectionTitle>Detection Classes</SectionTitle>
        {[
          { icon: '👤', label: 'Person Detection',      key: 'detect_person',  desc: 'Detect individual workers' },
          { icon: '⛑️',  label: 'Helmet Detection',      key: 'detect_helmet',  desc: 'Detect safety helmets' },
          { icon: '🦺', label: 'Safety Vest Detection', key: 'detect_vest',    desc: 'Detect high-visibility vests' },
        ].map(cls => (
          <SettingRow key={cls.key} icon={cls.icon} label={cls.label} description={cls.desc}>
            <Toggle checked={settings[cls.key] !== false} onChange={v => updateField(cls.key, v)} />
          </SettingRow>
        ))}
      </>
    )
  }

  function renderAlerts() {
    return (
      <>
        <SectionHeader title="Alert Settings" description="Configure alert behavior and notification preferences" />
        <SectionTitle>Alert Behavior</SectionTitle>
        <SettingRow icon="⏱️" label="Alert Cooldown" description="Seconds before same violation repeats">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input type="number" min="10" max="300"
              value={settings.alert_cooldown_secs || 60}
              onChange={e => updateField('alert_cooldown_secs', parseInt(e.target.value))}
              style={{ ...inp, width: '80px', textAlign: 'center' }}
            />
            <span style={{ fontSize: '12px', color: '#8b949e' }}>seconds</span>
          </div>
        </SettingRow>
        <SettingRow icon="🔔" label="Toast Duration" description="How long alert toasts stay on screen">
          <select value={settings.toast_duration_secs || 5} onChange={e => updateField('toast_duration_secs', parseInt(e.target.value))} style={{ ...sel, width: '140px' }}>
            {[3,5,8,10,15].map(s => <option key={s} value={s}>{s} seconds</option>)}
          </select>
        </SettingRow>
        <SettingRow icon="📈" label="Max Alerts Per Day" description="Stop creating new alerts after this limit">
          <input type="number" min="50" max="5000"
            value={settings.max_alerts_per_day || 500}
            onChange={e => updateField('max_alerts_per_day', parseInt(e.target.value))}
            style={{ ...inp, width: '90px', textAlign: 'center' }}
          />
        </SettingRow>

        <SectionTitle>Severity Thresholds</SectionTitle>
        <SettingRow icon="🚨" label="High Severity Only for Email" description="Only send email for High alerts (both PPE missing)">
          <Toggle checked={settings.high_only_email !== false} onChange={v => updateField('high_only_email', v)} />
        </SettingRow>
        <SettingRow icon="🔊" label="Alarm for High Only" description="Play alarm sound only for HIGH severity (beep for medium)">
          <Toggle checked={highOnly} onChange={setHighOnly} />
        </SettingRow>

        <SectionTitle>Notification Channels</SectionTitle>
        <SettingRow icon="📧" label="Email Alerts" description="Send email for high-severity violations">
          <Toggle checked={settings.email_alerts_enabled !== false} onChange={v => updateField('email_alerts_enabled', v)} />
        </SettingRow>
        <SettingRow icon="🔇" label="Silent Mode" description="Disable all sounds globally">
          <Toggle checked={!soundEnabled} onChange={v => setSoundEnabled(!v)} />
        </SettingRow>
      </>
    )
  }

  function renderEmail() {
    return (
      <>
        <SectionHeader title="Email & Notifications" description="Configure email alerts and notification settings" />
        <EmailSettingsSection />
        <SectionTitle>Alert Recipients</SectionTitle>
        <SettingRow icon="👥" label="Recipient Addresses" description="Comma-separated emails for HIGH alerts">
          <input
            value={settings.alert_recipients || ''}
            onChange={e => updateField('alert_recipients', e.target.value)}
            placeholder="admin@company.com, safety@company.com"
            style={{ ...inp, width: '300px' }}
          />
        </SettingRow>
      </>
    )
  }

  function renderUsers() {
    return (
      <>
        <SectionHeader title="User Management" description="Manage user accounts and permissions" />
        <SectionTitle>User Accounts</SectionTitle>

        {loadingUsers ? (
          <div style={{ padding: '20px', textAlign: 'center', color: '#8b949e', fontSize: '13px' }}>Loading users…</div>
        ) : (
          <div style={{ marginBottom: '20px' }}>
            {(users || []).map(u => (
              <div key={u.id} style={{
                display: 'flex', alignItems: 'center', gap: '12px',
                padding: '12px', marginBottom: '8px',
                background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '8px',
              }}>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '50%',
                  background: u.role === 'admin' ? 'rgba(249,115,22,0.2)' : 'rgba(99,102,241,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', flexShrink: 0,
                }}>👤</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#e6edf3' }}>{u.name}</div>
                  <div style={{ fontSize: '11px', color: '#8b949e' }}>{u.email}</div>
                </div>
                <span style={{
                  padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '700',
                  background: u.role === 'admin' ? 'rgba(249,115,22,0.15)' : 'rgba(99,102,241,0.15)',
                  color: u.role === 'admin' ? '#f97316' : '#818cf8',
                }}>{u.role}</span>
                <span style={{
                  padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '600',
                  background: u.is_active ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                  color: u.is_active ? '#22c55e' : '#ef4444',
                }}>{u.is_active ? 'Active' : 'Inactive'}</span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={() => toggleUser(u.id)} title={u.is_active ? 'Deactivate' : 'Activate'}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8b949e', fontSize: '14px' }}>
                    {u.is_active ? '🔒' : '🔓'}
                  </button>
                  <button onClick={() => deleteUser(u.id, u.name)} title="Delete user"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8b949e', fontSize: '14px' }}>
                    🗑
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <SectionTitle>Add New User</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
          {[
            { label: 'Full Name', key: 'name',     type: 'text',     placeholder: 'John Smith'         },
            { label: 'Email',     key: 'email',    type: 'email',    placeholder: 'john@company.com'   },
            { label: 'Password',  key: 'password', type: 'password', placeholder: 'Min 6 characters'   },
          ].map(f => (
            <div key={f.key} style={{ gridColumn: f.key === 'name' ? 'span 2' : 'auto' }}>
              <label style={{ fontSize: '12px', color: '#8b949e', display: 'block', marginBottom: '5px' }}>{f.label}</label>
              <input type={f.type} value={newUserForm[f.key]}
                onChange={e => setNewUserForm(p => ({ ...p, [f.key]: e.target.value }))}
                placeholder={f.placeholder} style={inp}
              />
            </div>
          ))}
          <div>
            <label style={{ fontSize: '12px', color: '#8b949e', display: 'block', marginBottom: '5px' }}>Role</label>
            <select value={newUserForm.role} onChange={e => setNewUserForm(p => ({ ...p, role: e.target.value }))} style={sel}>
              <option value="user">User (Viewer)</option>
              <option value="admin">Admin</option>
            </select>
          </div>
        </div>
        <button onClick={() => createUser(newUserForm)} style={{
          marginTop: '14px', width: '100%', padding: '10px',
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          border: 'none', borderRadius: '8px', color: 'white',
          fontWeight: '700', fontSize: '13px', cursor: 'pointer',
        }}>➕ Create User</button>
      </>
    )
  }

  function renderCameras() {
    const cameras = settings.cameras || [
      { id: 1, name: 'Camera 1', zone: 'Zone A', url: '', status: 'active' },
      { id: 2, name: 'Camera 2', zone: 'Zone B', url: '', status: 'active' },
    ]
    return (
      <>
        <SectionHeader title="Camera Settings" description="Manage camera configurations and stream URLs" />
        <SectionTitle>Camera Configuration</SectionTitle>
        {cameras.map((cam, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            padding: '12px', marginBottom: '8px',
            background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '8px',
          }}>
            <div style={{
              width: '36px', height: '36px', flexShrink: 0, borderRadius: '8px',
              background: 'rgba(59,130,246,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px',
            }}>📹</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#e6edf3' }}>{cam.name}</div>
              <div style={{ fontSize: '11px', color: '#8b949e' }}>{cam.zone}</div>
            </div>
            <span style={{
              padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '600',
              background: 'rgba(34,197,94,0.12)', color: '#22c55e',
            }}>Active</span>
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8b949e', fontSize: '14px' }}>✏️</button>
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8b949e', fontSize: '14px' }}>🗑</button>
          </div>
        ))}
        <button style={{
          width: '100%', padding: '10px', marginTop: '10px',
          background: 'transparent', border: '2px dashed var(--border)',
          borderRadius: '8px', color: '#8b949e', cursor: 'pointer', fontSize: '13px',
          transition: 'border-color 0.2s',
        }}
          onMouseEnter={e => e.target.style.borderColor = '#6366f1'}
          onMouseLeave={e => e.target.style.borderColor = 'var(--border)'}
        >+ Add Camera</button>
      </>
    )
  }

  function renderZones() {
    const zones = settings.zones || ['Zone A', 'Zone B', 'Zone C', 'Zone D', 'Zone E']
    return (
      <>
        <SectionHeader title="Site & Zone Settings" description="Manage sites and monitoring zones" />
        <SectionTitle>Zones</SectionTitle>
        {zones.map((zone, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            padding: '10px 14px', marginBottom: '8px',
            background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '8px',
          }}>
            <span style={{ fontSize: '14px' }}>📍</span>
            <span style={{ flex: 1, fontSize: '13px', fontWeight: '600', color: '#e6edf3' }}>{zone}</span>
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8b949e', fontSize: '14px' }}>✏️</button>
            <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#8b949e', fontSize: '14px' }}>🗑</button>
          </div>
        ))}
        <button style={{
          width: '100%', padding: '10px', marginTop: '10px',
          background: 'transparent', border: '2px dashed var(--border)',
          borderRadius: '8px', color: '#8b949e', cursor: 'pointer', fontSize: '13px',
        }}>+ Add Zone</button>
      </>
    )
  }

  function renderStorage() {
    const used  = systemInfo?.storage?.used_gb  || 0
    const total = systemInfo?.storage?.total_gb || 200
    const pct   = Math.min(100, Math.round((used / total) * 100))
    return (
      <>
        <SectionHeader title="Data & Storage" description="Configure data retention and storage settings" />
        <SectionTitle>Data Retention</SectionTitle>
        <SettingRow icon="📹" label="Video Retention" description="Auto-delete uploaded videos after X days">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input type="number" min="1" max="365"
              value={settings.video_retention_days || 30}
              onChange={e => updateField('video_retention_days', parseInt(e.target.value))}
              style={{ ...inp, width: '70px', textAlign: 'center' }}
            />
            <span style={{ fontSize: '12px', color: '#8b949e' }}>days</span>
          </div>
        </SettingRow>
        <SettingRow icon="🚨" label="Alert Retention" description="Auto-delete resolved alerts after X days">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input type="number" min="7" max="730"
              value={settings.alert_retention_days || 90}
              onChange={e => updateField('alert_retention_days', parseInt(e.target.value))}
              style={{ ...inp, width: '70px', textAlign: 'center' }}
            />
            <span style={{ fontSize: '12px', color: '#8b949e' }}>days</span>
          </div>
        </SettingRow>
        <SettingRow icon="💾" label="Max Upload Size" description="Maximum single video file size">
          <select value={settings.max_video_size_mb || 2048} onChange={e => updateField('max_video_size_mb', parseInt(e.target.value))} style={{ ...sel, width: '160px' }}>
            {[512, 1024, 2048, 5120].map(s => <option key={s} value={s}>{s / 1024 >= 1 ? `${s/1024} GB` : `${s} MB`}</option>)}
          </select>
        </SettingRow>

        <SectionTitle>Storage Usage</SectionTitle>
        <div style={{ padding: '16px', background: 'var(--bg-primary)', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
            <span style={{ color: '#8b949e' }}>Storage Used</span>
            <span style={{ color: '#e6edf3', fontWeight: '600' }}>{used} GB</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '13px' }}>
            <span style={{ color: '#8b949e' }}>Total Storage</span>
            <span style={{ color: '#e6edf3', fontWeight: '600' }}>{total} GB</span>
          </div>
          <div style={{ height: '8px', background: 'var(--bg-secondary)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{
              height: '100%', width: `${pct}%`,
              background: pct > 80 ? '#ef4444' : pct > 60 ? '#eab308' : '#6366f1',
              borderRadius: '4px', transition: 'width 0.5s',
            }} />
          </div>
          <div style={{ fontSize: '11px', color: '#8b949e', marginTop: '6px' }}>{pct}% used</div>
        </div>
      </>
    )
  }

  function renderIntegration() {
    return (
      <>
        <SectionHeader title="System Integration" description="Third-party API integrations and webhooks" />
        <SectionTitle>API Configuration</SectionTitle>
        <SettingRow icon="🔑" label="API Base URL" description="Backend API endpoint">
          <input value="http://localhost:8000" readOnly style={{ ...inp, width: '220px', opacity: 0.7 }} />
        </SettingRow>
        <SettingRow icon="📡" label="WebSocket URL" description="Socket.IO endpoint for real-time">
          <input value="ws://localhost:8000/socket.io" readOnly style={{ ...inp, width: '220px', opacity: 0.7 }} />
        </SettingRow>

        <SectionTitle>Groq LLM</SectionTitle>
        <SettingRow icon="🤖" label="Groq API Key" description="Used for AI insights and report generation">
          <input
            type="password"
            value={settings.groq_api_key || ''}
            onChange={e => updateField('groq_api_key', e.target.value)}
            placeholder="gsk_…"
            style={{ ...inp, width: '240px' }}
          />
        </SettingRow>
        <SettingRow icon="🧠" label="LLM Model" description="Groq model to use for AI summaries">
          <select value={settings.groq_model || 'llama3-70b-8192'} onChange={e => updateField('groq_model', e.target.value)} style={{ ...sel, width: '220px' }}>
            <option value="llama3-70b-8192">LLaMA3 70B (Best)</option>
            <option value="llama3-8b-8192">LLaMA3 8B (Fast)</option>
            <option value="mixtral-8x7b-32768">Mixtral 8x7B</option>
          </select>
        </SettingRow>

        <div style={{ marginTop: '14px' }}>
          <a href="http://localhost:8000/docs" target="_blank" rel="noreferrer" style={{
            display: 'block', padding: '10px', textAlign: 'center',
            background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)',
            borderRadius: '7px', color: '#818cf8', fontSize: '12px',
            fontWeight: '600', textDecoration: 'none',
          }}>📖 View API Documentation →</a>
        </div>
      </>
    )
  }

  function renderBackup() {
    const backup = systemInfo?.backup || {}
    return (
      <>
        <SectionHeader title="Backup & Restore" description="Manage system backups and restoration" />
        <SectionTitle>Backup Status</SectionTitle>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
          {[
            { label: 'Last Backup',  value: backup.last_backup ? new Date(backup.last_backup).toLocaleString() : 'Never' },
            { label: 'Next Backup',  value: backup.next_backup ? new Date(backup.next_backup).toLocaleString() : 'Not scheduled' },
            { label: 'Status',       value: backup.status || 'Unknown' },
            { label: 'Total Backups', value: '12' },
          ].map(row => (
            <div key={row.label} style={{ padding: '12px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: '8px' }}>
              <div style={{ fontSize: '11px', color: '#8b949e', marginBottom: '3px' }}>{row.label}</div>
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#e6edf3' }}>{row.value}</div>
            </div>
          ))}
        </div>
        <button onClick={triggerBackup} style={{
          width: '100%', padding: '12px',
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          border: 'none', borderRadius: '8px', color: 'white',
          fontWeight: '700', fontSize: '14px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        }}>☁️ Backup Now</button>

        <SectionTitle>Auto Backup</SectionTitle>
        <SettingRow icon="⏰" label="Auto Backup Schedule" description="Automatically backup every night at 2:00 AM">
          <Toggle checked={settings.auto_backup !== false} onChange={v => updateField('auto_backup', v)} />
        </SettingRow>
        <SettingRow icon="🗑️" label="Auto-delete Old Backups" description="Keep only the last 30 backups">
          <Toggle checked={settings.auto_delete_backups !== false} onChange={v => updateField('auto_delete_backups', v)} />
        </SettingRow>
      </>
    )
  }

  function renderAudit() {
    const logs = systemInfo?.audit_logs || [
      { time: new Date().toISOString(), user: 'admin@safesite.com', action: 'Settings saved', type: 'settings' },
      { time: new Date(Date.now()-3600000).toISOString(), user: 'admin@safesite.com', action: 'User created: john@company.com', type: 'user' },
      { time: new Date(Date.now()-7200000).toISOString(), user: 'admin@safesite.com', action: 'Report generated: Daily Safety Report', type: 'report' },
      { time: new Date(Date.now()-10800000).toISOString(), user: 'admin@safesite.com', action: 'Backup created', type: 'backup' },
      { time: new Date(Date.now()-14400000).toISOString(), user: 'admin@safesite.com', action: 'Admin login', type: 'auth' },
    ]
    const typeColors = { settings: '#6366f1', user: '#f97316', report: '#22c55e', backup: '#3b82f6', auth: '#eab308' }
    return (
      <>
        <SectionHeader title="Audit Logs" description="View system activity and user action history" />
        {logs.map((log, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'flex-start', gap: '12px',
            padding: '12px 0', borderBottom: '1px solid var(--border)',
          }}>
            <div style={{
              width: '32px', height: '32px', flexShrink: 0, borderRadius: '8px',
              background: `${typeColors[log.type] || '#8b949e'}18`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px',
            }}>
              {log.type === 'auth' ? '🔐' : log.type === 'user' ? '👤' : log.type === 'report' ? '📄' : log.type === 'backup' ? '💾' : '⚙️'}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '13px', fontWeight: '600', color: '#e6edf3', marginBottom: '2px' }}>{log.action}</div>
              <div style={{ fontSize: '11px', color: '#8b949e' }}>{log.user}</div>
            </div>
            <div style={{ fontSize: '11px', color: '#8b949e', flexShrink: 0 }}>
              {new Date(log.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        ))}
      </>
    )
  }

  const sectionRenderers = {
    general:     renderGeneral,
    detection:   renderDetection,
    alerts:      renderAlerts,
    email:       renderEmail,
    users:       renderUsers,
    cameras:     renderCameras,
    zones:       renderZones,
    storage:     renderStorage,
    integration: renderIntegration,
    backup:      renderBackup,
    audit:       renderAudit,
  }

  const activeNav = navItems.find(n => n.id === activeSection)
  const si = systemInfo || {}

  return (
    <div>
      {/* Page header */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '12px', color: '#8b949e', marginBottom: '4px' }}>Dashboard › Settings</div>
        <h1 style={{ fontSize: '22px', fontWeight: '700', color: '#e6edf3' }}>Settings</h1>
      </div>

      {/* 3-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr 280px', gap: '20px', alignItems: 'start' }}>

        {/* ── LEFT: Section nav ── */}
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', overflow: 'hidden' }}>
          {navItems.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              style={{
                width: '100%', padding: '12px 14px',
                display: 'flex', alignItems: 'center', gap: '10px',
                background: activeSection === item.id ? 'rgba(99,102,241,0.12)' : 'transparent',
                borderLeft: `3px solid ${activeSection === item.id ? '#6366f1' : 'transparent'}`,
                border: 'none', cursor: 'pointer',
                borderBottom: '1px solid var(--border)',
                textAlign: 'left', transition: 'all 0.15s',
              }}
              onMouseEnter={e => { if (activeSection !== item.id) e.currentTarget.style.background = 'var(--bg-hover)' }}
              onMouseLeave={e => { if (activeSection !== item.id) e.currentTarget.style.background = 'transparent' }}
            >
              <span style={{ fontSize: '16px', flexShrink: 0 }}>{item.icon}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: activeSection === item.id ? '#e6edf3' : '#8b949e', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.label}
                </div>
                <div style={{ fontSize: '10px', color: '#8b949e', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.desc}
                </div>
              </div>
            </button>
          ))}

          {/* Quick Help */}
          <div style={{ padding: '14px' }}>
            <div style={{ fontSize: '12px', fontWeight: '600', color: '#e6edf3', marginBottom: '6px' }}>💡 Quick Help</div>
            <div style={{ fontSize: '11px', color: '#8b949e', marginBottom: '10px', lineHeight: 1.6 }}>
              Need help? Check our documentation or contact support.
            </div>
            <a href="http://localhost:8000/docs" target="_blank" rel="noreferrer" style={{
              display: 'block', padding: '7px', textAlign: 'center',
              background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)',
              borderRadius: '6px', color: '#818cf8', fontSize: '11px',
              fontWeight: '600', textDecoration: 'none',
            }}>View Documentation</a>
          </div>
        </div>

        {/* ── CENTER: Section content ── */}
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '24px' }}>
          {/* Save button */}
          {['general','detection','alerts','email','storage','integration'].includes(activeSection) && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '20px' }}>
              <button
                onClick={saveAll}
                disabled={saving || loading}
                style={{
                  padding: '10px 20px',
                  background: saving ? 'rgba(99,102,241,0.3)' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  border: 'none', borderRadius: '8px', color: 'white',
                  fontWeight: '700', fontSize: '13px', cursor: saving ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: '8px',
                }}
              >
                {saving ? '⏳ Saving…' : '💾 Save Changes'}
              </button>
            </div>
          )}

          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: '#8b949e', fontSize: '13px' }}>
              <div style={{ fontSize: '28px', marginBottom: '8px' }}>⏳</div>Loading settings…
            </div>
          ) : (
            (sectionRenderers[activeSection] || renderGeneral)()
          )}
        </div>

        {/* ── RIGHT: Info panels ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', position: 'sticky', top: '20px' }}>

          {/* System Information */}
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#e6edf3', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '7px' }}>
              ℹ️ System Information
            </div>
            <InfoRow label="System Version" value={si.version           || 'v2.4.1'} />
            <InfoRow label="Environment"    value={si.environment       || 'Development'} />
            <InfoRow label="Last Updated"   value={si.last_updated ? new Date(si.last_updated).toLocaleString() : '—'} />
            <InfoRow label="Database"       value={si.database_status   || 'Connecting…'} valueColor={si.database_status === 'Connected' ? '#22c55e' : '#ef4444'} />
            <InfoRow label="AI Model"       value={si.ai_model_status   || 'Running'} valueColor="#22c55e" />
          </div>

          {/* Storage Usage */}
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#e6edf3', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '7px' }}>
              ☁️ Storage Usage
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px' }}>
              {/* Circle progress */}
              <div style={{ position: 'relative', width: '64px', height: '64px', flexShrink: 0 }}>
                <svg width="64" height="64" viewBox="0 0 64 64">
                  <circle cx="32" cy="32" r="26" fill="none" stroke="var(--border)" strokeWidth="6"/>
                  <circle cx="32" cy="32" r="26" fill="none" stroke="#6366f1" strokeWidth="6"
                    strokeDasharray={`${2*Math.PI*26}`}
                    strokeDashoffset={`${2*Math.PI*26 * (1 - Math.min(1, (si.storage?.used_gb || 0) / (si.storage?.total_gb || 200)))}`}
                    strokeLinecap="round"
                    transform="rotate(-90 32 32)"
                  />
                </svg>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ fontSize: '13px', fontWeight: '700', color: '#6366f1', lineHeight: 1 }}>
                    {Math.round(((si.storage?.used_gb || 0) / (si.storage?.total_gb || 200)) * 100)}%
                  </div>
                  <div style={{ fontSize: '9px', color: '#8b949e' }}>Used</div>
                </div>
              </div>
              <div>
                <InfoRow label="Storage Used"  value={`${si.storage?.used_gb  || 0} GB`} />
                <InfoRow label="Total Storage" value={`${si.storage?.total_gb || 200} GB`} />
              </div>
            </div>
            <button style={{
              width: '100%', padding: '7px', fontSize: '11px', fontWeight: '600',
              background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.3)',
              borderRadius: '6px', color: '#818cf8', cursor: 'pointer',
            }}>Manage Storage</button>
          </div>

          {/* AI Model Info */}
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#e6edf3', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '7px' }}>
              🤖 AI Model Information
            </div>
            <InfoRow label="Model Name"    value={si.ai_model?.name          || 'YOLOv8 Safety'} />
            <InfoRow label="Model Version" value={si.ai_model?.version       || 'v8.0.1'} />
            <InfoRow label="Last Trained"  value={si.ai_model?.last_trained  || 'May 18, 2024'} />
            <InfoRow label="Accuracy"      value={`${si.ai_model?.accuracy   || 92.4}%`} valueColor="#22c55e" />
            <button style={{
              width: '100%', padding: '7px', fontSize: '11px', fontWeight: '600', marginTop: '8px',
              background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
              borderRadius: '6px', color: '#22c55e', cursor: 'pointer',
            }}>Update Model</button>
          </div>

          {/* Backup Info */}
          <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
            <div style={{ fontSize: '13px', fontWeight: '600', color: '#e6edf3', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '7px' }}>
              💾 Backup Information
            </div>
            <InfoRow label="Last Backup" value={si.backup?.last_backup ? new Date(si.backup.last_backup).toLocaleString() : 'Never'} />
            <InfoRow label="Next Backup" value={si.backup?.next_backup ? new Date(si.backup.next_backup).toLocaleString() : 'Not scheduled'} />
            <button onClick={triggerBackup} style={{
              width: '100%', padding: '8px', fontSize: '12px', fontWeight: '700', marginTop: '10px',
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              border: 'none', borderRadius: '7px', color: 'white', cursor: 'pointer',
            }}>☁️ Backup Now</button>
          </div>

        </div>
      </div>
    </div>
  )
}