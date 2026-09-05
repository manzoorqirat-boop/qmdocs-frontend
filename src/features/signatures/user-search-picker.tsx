import { useState, useRef, useEffect, useMemo } from 'react';
import { Search, X } from 'lucide-react';
import { initials, ROLE_COLORS } from '@/features/signatures/constants';
import { TONE_HEX } from '@/lib/theme-colors';
import type { UserDirectoryEntry, Site, Department } from '@/types/api';
import { cn } from '@/lib/utils';

// Rows rendered at once. The DOM cost of several hundred avatar rows is real,
// and nobody scans past the first few dozen anyway — they narrow the search
// instead, which is what the result count above the list nudges toward. A
// deliberate cap rather than virtualisation: far less machinery, and the
// count line keeps the truncation honest rather than hidden.
const VISIBLE_LIMIT = 50;

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
  const activeRowRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [dept, setDept] = useState('');
  const [query, setQuery] = useState('');
  // 'home' = author's site only (default); 'all' = every site (cross-site).
  const [siteScope, setSiteScope] = useState<'home' | 'all'>('home');

  // Highlighted row for keyboard selection. Reset whenever the result set
  // changes, so the highlight never points at a row that has scrolled out of
  // the filtered list.
  const [activeIndex, setActiveIndex] = useState(0);

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

  // Follow the keyboard highlight with the scroll position — arrowing to a
  // row below the fold is useless if the list does not move with it.
  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  // Keep the highlight inside the current result set. Adjusted during render
  // rather than in an effect — React's documented pattern for state derived
  // from a change in props/state, and the same one prevSelectedUser above
  // already uses in this file. An effect here would render one frame with a
  // stale highlight before correcting it.
  const resetKey = `${query}|${dept}|${siteScope}`;
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (resetKey !== prevResetKey) {
    setPrevResetKey(resetKey);
    setActiveIndex(0);
  }

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
              return;
            }
            // Keyboard selection. With hundreds of people, reaching for the
            // mouse for every pick is the slowest part of building a routing
            // chain — and the list was previously mouse-only.
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              setOpen(true);
              setActiveIndex((i) => {
                const max = Math.min(filtered.length, VISIBLE_LIMIT) - 1;
                if (max < 0) return 0;
                return e.key === 'ArrowDown' ? Math.min(i + 1, max) : Math.max(i - 1, 0);
              });
              return;
            }
            if (e.key === 'Enter') {
              const pick = filtered.slice(0, VISIBLE_LIMIT)[activeIndex];
              if (pick) {
                e.preventDefault();
                selectUser(pick);
              }
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
          // Escapes the narrow right rail rather than being confined to it.
          // At a few dozen users the in-rail width was fine; at several hundred
          // it leaves almost no room for the name/email/role/site columns that
          // are exactly what you need to tell two similar people apart. It
          // anchors to the input's left edge and grows rightward over the
          // document canvas, which is inert while the picker is open.
          className="absolute top-full right-0 left-0 z-50 mt-1 flex max-h-[420px] w-[max(100%,420px)] flex-col overflow-hidden rounded-md border-[1.5px] bg-paper-raised shadow-popover"
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

          {/* One scrollable row, not a wrapping block. With a few departments
              wrapping was fine; with dozens it grew tall enough to push the
              actual results out of view — the opposite of what a filter is for. */}
          <div className="flex gap-1.5 overflow-x-auto border-b border-line bg-paper px-2.5 py-2">
            <button
              onClick={() => {
                setDept('');
                setQuery('');
              }}
              className="shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold"
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
                  className="shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap"
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

          {/* How many matched, and whether the list is truncated. Without this a
              search that matches 200 people looks identical to one that matches
              the 40 you can scroll — you cannot tell whether narrowing further
              is worth it. */}
          <div className="flex items-center justify-between border-b border-line bg-paper px-3 py-1 text-[10.5px] text-slate">
            <span>
              {filtered.length === 0
                ? 'No matches'
                : `${filtered.length} ${filtered.length === 1 ? 'person' : 'people'}${
                    filtered.length > VISIBLE_LIMIT ? ` · showing first ${VISIBLE_LIMIT}` : ''
                  }`}
            </span>
            <span className="hidden sm:inline">↑↓ to move · ↵ to select</span>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-3.5 py-4 text-center text-[13px] text-slate">
                {query ? `No match for "${query}"` : 'No eligible users in this department'}
              </div>
            ) : (
              filtered.slice(0, VISIBLE_LIMIT).map((u, index) => {
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
                    ref={index === activeIndex ? activeRowRef : undefined}
                    className={cn(
                      'flex cursor-pointer items-center gap-2.5 border-b border-line px-3 py-1.5 hover:bg-paper',
                      index === activeIndex && 'bg-paper',
                    )}
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
