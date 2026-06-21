/**
 * src/components/SearchBar.tsx
 * Client-side React island — filters the gallery grid without a full page reload.
 * Works by toggling `.art-card.hidden` on cards rendered server-side by ArtifactCard.astro.
 *
 * Usage in any .astro page:
 *   import SearchBar from '@components/SearchBar';
 *   <SearchBar client:load langs={['html','jsx','py']} />
 */

import { useState, useEffect, useCallback } from 'react';

interface Props {
  langs:        string[];
  tags?:        string[];
  totalItems?:  number;
}

export default function SearchBar({ langs, tags = [], totalItems = 0 }: Props) {
  const [query,       setQuery]       = useState('');
  const [activeLang,  setActiveLang]  = useState('');
  const [activeTag,   setActiveTag]   = useState('');
  const [onlyRender,  setOnlyRender]  = useState(false);
  const [onlyArtifact,setOnlyArtifact]= useState(false);
  const [visible,     setVisible]     = useState(totalItems);

  const filter = useCallback(() => {
    const q   = query.toLowerCase().trim();
    const cards = document.querySelectorAll<HTMLElement>('.art-card');
    let count = 0;

    cards.forEach(card => {
      const lang       = card.dataset['lang']      ?? '';
      const renderable = card.dataset['renderable'] === 'true';
      const artSource  = card.dataset['source']    ?? '';
      const tagsStr    = card.dataset['tags']       ?? '';
      const titleEl    = card.querySelector('.card-title');
      const title      = titleEl?.textContent?.toLowerCase() ?? '';

      const matchQ    = !q         || title.includes(q) || lang.includes(q) || tagsStr.includes(q);
      const matchLang = !activeLang || lang === activeLang;
      const matchTag  = !activeTag  || tagsStr.includes(activeTag);
      const matchR    = !onlyRender || renderable;
      const matchA    = !onlyArtifact || artSource === 'antArtifact';

      const show = matchQ && matchLang && matchTag && matchR && matchA;
      card.classList.toggle('hidden', !show);
      if (show) count++;
    });

    setVisible(count);
  }, [query, activeLang, activeTag, onlyRender, onlyArtifact]);

  useEffect(() => { filter(); }, [filter]);

  const toggleLang = (l: string) => setActiveLang(prev => prev === l ? '' : l);
  const toggleTag  = (t: string) => setActiveTag(prev  => prev === t ? '' : t);

  const LANG_COLORS: Record<string, string> = {
    html:'#c94a2f', jsx:'#5c3dbf', tsx:'#5c3dbf',
    js:'#b8860b', ts:'#3a5fcd', py:'#0f7a68',
    sql:'#d4820a', css:'#e91e8c', md:'#666', sh:'#444',
  };

  return (
    <div style={{
      background: 'var(--pit)',
      borderBottom: '1px solid var(--rim)',
      padding: '10px 2rem',
      display: 'flex',
      flexDirection: 'column',
      gap: '8px',
    }}>
      {/* Search + count */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search title, tag, language…"
          style={{
            flex: 1,
            padding: '6px 12px',
            background: 'var(--well)',
            border: '1px solid var(--rim)',
            borderRadius: '2px',
            color: 'var(--chalk)',
            fontFamily: 'var(--mono)',
            fontSize: '12px',
            outline: 'none',
          }}
        />
        <span style={{ fontSize: '10px', color: 'var(--mist)', whiteSpace: 'nowrap', letterSpacing: '0.06em' }}>
          {visible.toLocaleString()} shown
        </span>
      </div>

      {/* Lang filters */}
      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '9px', color: 'var(--mist)', letterSpacing: '0.12em', marginRight: '4px', textTransform: 'uppercase' }}>
          LANG
        </span>
        {langs.map(l => {
          const c = LANG_COLORS[l] ?? '#888';
          const active = activeLang === l;
          return (
            <button
              key={l}
              onClick={() => toggleLang(l)}
              style={{
                padding: '3px 9px',
                border: `1px solid ${active ? c : 'var(--rim)'}`,
                borderRadius: '2px',
                background: active ? `${c}22` : 'transparent',
                color: active ? c : 'var(--ash)',
                fontSize: '10px',
                fontFamily: 'var(--mono)',
                fontWeight: active ? '700' : '400',
                cursor: 'pointer',
                letterSpacing: '0.06em',
                transition: 'all 0.1s',
              }}
            >{l}</button>
          );
        })}
      </div>

      {/* Checkboxes + top tags */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ fontSize: '10px', color: 'var(--ash)', cursor: 'pointer', display: 'flex', gap: '5px', alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={onlyRender}
            onChange={e => setOnlyRender(e.target.checked)}
            style={{ accentColor: 'var(--teal)' }}
          />
          renderable only
        </label>
        <label style={{ fontSize: '10px', color: 'var(--ash)', cursor: 'pointer', display: 'flex', gap: '5px', alignItems: 'center' }}>
          <input
            type="checkbox"
            checked={onlyArtifact}
            onChange={e => setOnlyArtifact(e.target.checked)}
            style={{ accentColor: 'var(--purple)' }}
          />
          antArtifact only
        </label>

        {tags.length > 0 && (
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '9px', color: 'var(--mist)', letterSpacing: '0.12em', marginRight: '2px', alignSelf: 'center', textTransform: 'uppercase' }}>
              TAG
            </span>
            {tags.slice(0, 12).map(t => (
              <button
                key={t}
                onClick={() => toggleTag(t)}
                style={{
                  padding: '2px 7px',
                  border: `1px solid ${activeTag === t ? 'var(--amber)' : 'var(--rim)'}`,
                  borderRadius: '2px',
                  background: activeTag === t ? 'var(--amber-dim)' : 'transparent',
                  color: activeTag === t ? 'var(--amber)' : 'var(--mist)',
                  fontSize: '10px',
                  fontFamily: 'var(--mono)',
                  cursor: 'pointer',
                  transition: 'all 0.1s',
                }}
              >{t}</button>
            ))}
          </div>
        )}

        {(query || activeLang || activeTag || onlyRender || onlyArtifact) && (
          <button
            onClick={() => {
              setQuery(''); setActiveLang(''); setActiveTag('');
              setOnlyRender(false); setOnlyArtifact(false);
            }}
            style={{
              padding: '2px 8px', border: '1px solid var(--rim)',
              borderRadius: '2px', background: 'transparent',
              color: 'var(--coral)', fontSize: '10px',
              fontFamily: 'var(--mono)', cursor: 'pointer',
            }}
          >✕ clear</button>
        )}
      </div>
    </div>
  );
}
