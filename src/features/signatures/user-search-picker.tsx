import { useState, useRef, useEffect, useMemo } from 'react';
import { Search, X } from 'lucide-react';
import { initials, ROLE_COLORS } from '@/features/signatures/constants';
import { TONE_HEX } from '@/lib/theme-colors';
import type { UserDirectoryEntry, Site, Department } from '@/types/api';

interface UserSearchPickerProps {
  users: UserDirectoryEntry[];
  departments: Department[];
  sites?: Site[];
  allowedRoles: string[];
  homeSiteId?: string | null;
  excludeUsernames?: string[];
  value: string;
  onChange: (username: string) => void;
  label?: string;
  accentColor?: string;
}

// Department pills → instant search within dept → select user. Handles
// 1000+ users comfortably (all filtering is in-memory).
export function UserSearchPicker({
  users,
  departments,
  sites = [],
  allowedRoles,
  homeSiteId = null,
  excludeUsernames = [],
  value,
  onChange,
  label = '— Search and select —',
  accentColor = 'var(--color-seal)',
}: UserSearchPickerProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [dept, setDept] = useState('');
  const [query, setQuery] = useState('');
  // 'home' = author's site only (default); 'all' = every site (cross-site).
  const [siteScope, setSiteScope] = useState<'home' | 'all'>('home');

  function siteCode(id: string | null | undefined) {
    return sites.find((x) => x.id === String(id))?.code || null;
  }

  const eligible = useMemo(
    () =>
      users.filter((u) => {
        // Multi-role users appear under EVERY role they hold: someone
        // assigned Approver + IT Admin shows in the Approver picker even
        // while acting as IT Admin. Signing still requires them to sign in
        // acting as the step's role (enforced by role privileges server-side).
        const roleSet = u.roles && u.roles.length ? u.roles : [u.role];
        return (
          u.status === 'Active' &&
          allowedRoles.some((r) => roleSet.includes(r)) &&
          !excludeUsernames.includes(u.username) &&
          (siteScope === 'all' || !homeSiteId || String(u.siteId) === String(homeSiteId))
        );
      }),
    [users, allowedRoles, excludeUsernames, siteScope, homeSiteId],
  );

  const deptList = useMemo(() => {
    const set = new Set(eligible.map((u) => u.department || '(No dept)'));
    const masterOrder = departments.map((d) => d.name);
    return [...set].sort((a, b) => {
      const ia = masterOrder.indexOf(a);
      const ib = masterOrder.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
  }, [eligible, departments]);

  const selectedUser = useMemo(() => users.find((u) => u.username === value), [users, value]);

  const [prevSelectedUser, setPrevSelectedUser] = useState(selectedUser);
  if (selectedUser !== prevSelectedUser) {
    setPrevSelectedUser(selectedUser);
    if (selectedUser) setDept(selectedUser.department || '(No dept)');
  }

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = useMemo(() => {
    const pool = dept ? eligible.filter((u) => (u.department || '(No dept)') === dept) : eligible;
    if (!query.trim()) return pool.slice(0, 60);
    const q = query.toLowerCase();
    return pool
      .filter(
        (u) =>
          (u.fullName || '').toLowerCase().includes(q) ||
          (u.username || '').toLowerCase().includes(q) ||
          (u.email || '').toLowerCase().includes(q) ||
          (u.department || '').toLowerCase().includes(q),
      )
      .slice(0, 60);
  }, [eligible, dept, query]);

  function openPicker() {
    setOpen(true);
    setTimeout(() => {
      inputRef.current?.focus();
      wrapRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 30);
  }
  function selectUser(u: UserDirectoryEntry) {
    onChange(u.username);
    setDept(u.department || '(No dept)');
    setQuery('');
    setOpen(false);
  }
  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange('');
    setQuery('');
    setOpen(false);
  }

  if (selectedUser && !open) {
    return (
      <div
        ref={wrapRef}
        onClick={openPicker}
        className="flex min-h-[38px] cursor-pointer items-center gap-2 rounded-md border-[1.5px] bg-paper-raised px-2.5"
        style={{ borderColor: accentColor }}
      >
        <div
          className="flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
          style={{ background: accentColor }}
        >
          {initials(selectedUser.fullName || selectedUser.username)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[13px] font-semibold text-ink">{selectedUser.fullName || selectedUser.username}</div>
          <div className="truncate text-[11px] text-slate">
            @{selectedUser.username}
            {selectedUser.department ? ` · ${selectedUser.department}` : ''}
          </div>
        </div>
        <span
          className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold"
          style={{ background: `${ROLE_COLORS[selectedUser.role] || TONE_HEX.default}22`, color: ROLE_COLORS[selectedUser.role] || TONE_HEX.default }}
        >
          {selectedUser.role}
        </span>
        <button onClick={clear} title="Clear selection" className="shrink-0 leading-none text-slate hover:text-ink">
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="relative">
      <div
        className="flex min-h-[38px] items-center gap-2 rounded-md border-[1.5px] bg-paper-raised px-2.5 transition-colors"
        style={{ borderColor: open ? accentColor : 'var(--color-line-strong)' }}
      >
        <Search size={14} className="shrink-0 text-slate" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false);
              setQuery('');
            }
          }}
          placeholder={open ? 'Type name, username, email…' : label}
          className="flex-1 bg-transparent py-2 text-[13px] text-ink outline-none placeholder:text-slate"
        />
        {open && query && (
          <button onClick={() => setQuery('')} className="shrink-0 text-[13px] text-slate hover:text-ink">
            ×
          </button>
        )}
        <span className="shrink-0 text-[11px] text-slate">{dept || `${deptList.length} depts`}</span>
      </div>

      {open && (
        <div
          className="mt-1 flex max-h-[360px] flex-col overflow-hidden rounded-md border-[1.5px] bg-paper-raised shadow-popover"
          style={{ borderColor: accentColor }}
        >
          {homeSiteId && sites.length > 1 && (
            <div className="flex items-center gap-2 border-b border-line bg-paper px-2.5 py-1.5">
              <span className="text-[11px] font-semibold text-slate">SHOW:</span>
              <button
                onClick={() => setSiteScope('home')}
                className="rounded-full border px-2.5 py-0.5 text-[11px] font-semibold"
                style={
                  siteScope === 'home'
                    ? { borderColor: accentColor, background: accentColor, color: '#fff' }
                    : { borderColor: 'var(--color-line-strong)', color: 'var(--color-ink-soft)' }
                }
              >
                This site ({siteCode(homeSiteId) || 'home'})
              </button>
              <button
                onClick={() => setSiteScope('all')}
                className="rounded-full border px-2.5 py-0.5 text-[11px] font-semibold"
                style={
                  siteScope === 'all'
                    ? { borderColor: accentColor, background: accentColor, color: '#fff' }
                    : { borderColor: 'var(--color-line-strong)', color: 'var(--color-ink-soft)' }
                }
              >
                All sites (cross-site)
              </button>
            </div>
          )}

          <div className="flex flex-wrap gap-1.5 border-b border-line bg-paper px-2.5 py-2">
            <button
              onClick={() => {
                setDept('');
                setQuery('');
              }}
              className="rounded-full border px-2.5 py-0.5 text-[11px] font-semibold"
              style={
                !dept
                  ? { borderColor: accentColor, background: accentColor, color: '#fff' }
                  : { borderColor: 'var(--color-line-strong)', color: 'var(--color-ink-soft)' }
              }
            >
              All ({eligible.length})
            </button>
            {deptList.map((d) => {
              const count = eligible.filter((u) => (u.department || '(No dept)') === d).length;
              const active = dept === d;
              return (
                <button
                  key={d}
                  onClick={() => {
                    setDept(d);
                    setQuery('');
                    setTimeout(() => inputRef.current?.focus(), 30);
                  }}
                  className="rounded-full border px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap"
                  style={
                    active
                      ? { borderColor: accentColor, background: accentColor, color: '#fff' }
                      : { borderColor: 'var(--color-line-strong)', color: 'var(--color-ink-soft)' }
                  }
                >
                  {d} <span className="opacity-75">({count})</span>
                </button>
              );
            })}
          </div>

          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3.5 py-4 text-center text-[13px] text-slate">
                {query ? `No match for "${query}"` : 'No eligible users in this department'}
              </div>
            ) : (
              filtered.map((u) => {
                const roleSet = u.roles && u.roles.length ? u.roles : [u.role];
                const shown = roleSet.find((r) => allowedRoles.includes(r)) || u.role;
                const extra = roleSet.length - 1;
                return (
                  <div
                    key={u.id}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      selectUser(u);
                    }}
                    className="flex cursor-pointer items-center gap-2.5 border-b border-line px-3 py-1.5 hover:bg-paper"
                  >
                    <div
                      className="flex size-[30px] shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
                      style={{ background: `${ROLE_COLORS[u.role] || TONE_HEX.default}22`, color: ROLE_COLORS[u.role] || TONE_HEX.default }}
                    >
                      {initials(u.fullName || u.username)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold text-ink">{u.fullName || u.username}</div>
                      <div className="truncate text-[11px] text-slate">
                        @{u.username}
                        {u.email ? ` · ${u.email}` : ''}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div
                        title={roleSet.length > 1 ? `Roles: ${roleSet.join(', ')}` : undefined}
                        className="mb-0.5 rounded px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{ background: `${ROLE_COLORS[shown] || TONE_HEX.default}22`, color: ROLE_COLORS[shown] || TONE_HEX.default }}
                      >
                        {shown}
                        {extra > 0 ? ` +${extra}` : ''}
                      </div>
                      <div className="text-[10px] whitespace-nowrap text-slate">
                        {siteCode(u.siteId) ? <span className="font-bold">{siteCode(u.siteId)}</span> : null}
                        {siteCode(u.siteId) && u.department ? ' · ' : ''}
                        {u.department || '—'}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
